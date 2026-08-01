import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { lineRetryKeyFromMaterial, pushLineTextMessage } from '@/lib/line/push-text';
import {
  internalAuthErrorResponse,
  requireInternalRequest,
} from '@/lib/security/request-auth';

/**
 * API to process loan contract generation queue
 * This should be called by a cron job or scheduled function
 *
 * Since we can't use Puppeteer on Vercel, this API will:
 * 1. Check for pending contracts in queue
 * 2. Send LINE messages to both pawner and investor with links to view/save tickets
 * 3. Mark as processed
 */
export async function POST(request: NextRequest) {
  try {
    requireInternalRequest(request, ['CRON_SECRET']);
  } catch (error) {
    return internalAuthErrorResponse(error);
  }

  try {
    const supabase = supabaseAdmin();
    const staleBefore = new Date(Date.now() - 10 * 60 * 1_000).toISOString();

    // Rows claimed by the legacy implementation have no lease timestamp.
    const { error: legacyRecoveryError } = await supabase
      .from('pawn_ticket_generation_queue')
      .update({ status: 'PENDING', error_message: 'RECOVERED_STALE_PROCESSING' })
      .eq('status', 'PROCESSING')
      .is('processed_at', null)
      .lt('created_at', staleBefore);
    if (legacyRecoveryError) throw new Error('QUEUE_RECOVERY_FAILED');

    // Get pending work plus abandoned PROCESSING leases from a prior crash.
    const { data: queueItems, error: queueError } = await supabase
      .from('pawn_ticket_generation_queue')
      .select(`
        id,
        contract_id,
        status,
        attempts,
        processed_at,
        contracts (
          contract_id,
          contract_number,
          contract_file_url,
          customer_id,
          investor_id,
          pawners!customer_id (
            line_id,
            firstname,
            lastname
          ),
          investors!investor_id (
            line_id,
            firstname,
            lastname
          )
        )
      `)
      .or(`status.eq.PENDING,and(status.eq.PROCESSING,processed_at.lt.${staleBefore})`)
      .lt('attempts', 3) // Max 3 attempts
      .order('created_at', { ascending: true })
      .limit(10);

    if (queueError) {
      throw queueError;
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending items in queue',
        processed: 0
      });
    }

    const results = [];
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pawnly.io';

    for (const item of queueItems) {
      const attempts = Number.isInteger(Number(item.attempts))
        ? Math.max(0, Number(item.attempts))
        : 0;
      try {
        // Atomically claim the row. A second overlapping cron invocation skips
        // it instead of sending duplicate LINE notifications.
        let claimQuery = supabase
          .from('pawn_ticket_generation_queue')
          .update({
            status: 'PROCESSING',
            attempts: attempts + 1,
            processed_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .eq('status', item.status);
        claimQuery = item.status === 'PROCESSING'
          ? claimQuery.lt('processed_at', staleBefore)
          : claimQuery;
        const { data: claimed, error: claimError } = await claimQuery
          .select('id')
          .maybeSingle();
        if (claimError) throw new Error('QUEUE_CLAIM_FAILED');
        if (!claimed) continue;

        const contract = Array.isArray(item.contracts) ? item.contracts[0] : item.contracts;
        if (!contract) throw new Error('QUEUE_CONTRACT_NOT_FOUND');

        // Skip if ticket already generated
        if (contract.contract_file_url) {
          const { error: completeExistingError } = await supabase
            .from('pawn_ticket_generation_queue')
            .update({
              status: 'COMPLETED',
              processed_at: new Date().toISOString()
            })
            .eq('id', item.id);
          if (completeExistingError) throw new Error('QUEUE_COMPLETE_FAILED');

          results.push({
            contractId: contract.contract_id,
            status: 'skipped',
            reason: 'Ticket already exists'
          });
          continue;
        }

        // Generate URLs
        const pawnerTicketUrl = `${baseUrl}/pawn-ticket/${contract.contract_id}`;
        const investorTicketUrl = `${baseUrl}/investor-pawn-ticket/${contract.contract_id}`;

        // Send LINE messages (if LINE tokens are configured)
        const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        const investorLineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST;

        if (contract.pawners?.[0]?.line_id) {
          if (!lineToken) throw new Error('PAWNER_LINE_CHANNEL_NOT_CONFIGURED');
          // Send message to pawner
          try {
            await pushLineTextMessage({
              channelAccessToken: lineToken,
              to: contract.pawners[0].line_id,
              text: `สัญญาสินเชื่อของคุณเสร็จสมบูรณ์แล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nคลิกเพื่อดูสัญญาสินเชื่อ:\n${pawnerTicketUrl}\n\nกรุณาบันทึกสัญญาสินเชื่อไว้เพื่อใช้อ้างอิง`,
              retryKey: lineRetryKeyFromMaterial(`pawn-ticket:${item.id}:pawner`),
              signal: AbortSignal.timeout(10_000),
            });
          } catch (lineError) {
            console.error('[ticket-queue] pawner LINE delivery failed', {
              type: lineError instanceof Error ? lineError.name : 'unknown',
            });
            throw lineError;
          }
        }

        if (contract.investors?.[0]?.line_id) {
          if (!investorLineToken) throw new Error('INVESTOR_LINE_CHANNEL_NOT_CONFIGURED');
          // Send message to investor
          try {
            await pushLineTextMessage({
              channelAccessToken: investorLineToken,
              to: contract.investors[0].line_id,
              text: `สัญญาลงทุนของคุณเสร็จสมบูรณ์แล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nคลิกเพื่อดูสัญญา:\n${investorTicketUrl}\n\nกรุณาบันทึกสัญญาไว้เพื่อใช้อ้างอิง`,
              retryKey: lineRetryKeyFromMaterial(`pawn-ticket:${item.id}:investor`),
              signal: AbortSignal.timeout(10_000),
            });
          } catch (lineError) {
            console.error('[ticket-queue] investor LINE delivery failed', {
              type: lineError instanceof Error ? lineError.name : 'unknown',
            });
            throw lineError;
          }
        }

        // Mark as completed
        const { error: completeError } = await supabase
          .from('pawn_ticket_generation_queue')
          .update({
            status: 'COMPLETED',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id);
        if (completeError) throw new Error('QUEUE_COMPLETE_FAILED');

        results.push({
          contractId: contract.contract_id,
          status: 'success',
          pawnerTicketUrl,
          investorTicketUrl
        });

      } catch (itemError: any) {
        console.error('[ticket-queue] item processing failed', {
          type: itemError instanceof Error ? itemError.name : 'unknown',
        });

        // Mark as failed if max attempts reached
        const newStatus = attempts + 1 >= 3 ? 'FAILED' : 'PENDING';

        await supabase
          .from('pawn_ticket_generation_queue')
          .update({
            status: newStatus,
            error_message: 'TICKET_PROCESSING_FAILED',
            processed_at: newStatus === 'PENDING' ? null : new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({
          contractId: item.contract_id,
          status: 'error',
          error: 'TICKET_PROCESSING_FAILED'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} items`,
      processed: results.length,
      results
    });

  } catch (error) {
    console.error('[ticket-queue] processing failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Failed to process queue', code: 'TICKET_QUEUE_FAILED' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// Vercel Cron invokes routes with GET. POST remains available for an
// authenticated manual replay using the same CRON_SECRET.
export async function GET(request: NextRequest) {
  return POST(request);
}
