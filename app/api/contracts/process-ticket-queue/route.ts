import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * API to process pawn ticket generation queue
 * This should be called by a cron job or scheduled function
 *
 * Since we can't use Puppeteer on Vercel, this API will:
 * 1. Check for pending contracts in queue
 * 2. Send LINE messages to both pawner and investor with links to view/save tickets
 * 3. Mark as processed
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    // Get pending queue items
    const { data: queueItems, error: queueError } = await supabase
      .from('pawn_ticket_generation_queue')
      .select(`
        id,
        contract_id,
        attempts,
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
      .eq('status', 'PENDING')
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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pawn360.vercel.app';

    for (const item of queueItems) {
      try {
        // Update status to PROCESSING
        await supabase
          .from('pawn_ticket_generation_queue')
          .update({
            status: 'PROCESSING',
            attempts: item.attempts + 1
          })
          .eq('id', item.id);

        const contract = item.contracts[0];

        // Skip if ticket already generated
        if (contract.contract_file_url) {
          await supabase
            .from('pawn_ticket_generation_queue')
            .update({
              status: 'COMPLETED',
              processed_at: new Date().toISOString()
            })
            .eq('id', item.id);

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

        if (lineToken && contract.pawners?.[0]?.line_id) {
          // Send message to pawner
          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineToken}`
              },
              body: JSON.stringify({
                to: contract.pawners[0].line_id,
                messages: [
                  {
                    type: 'text',
                    text: `สัญญาจำนำของคุณเสร็จสมบูรณ์แล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nคลิกเพื่อดูตั๋วจำนำ:\n${pawnerTicketUrl}\n\nกรุณาบันทึกตั๋วจำนำไว้เพื่อใช้อ้างอิง`
                  }
                ]
              })
            });
          } catch (lineError) {
            console.error('Error sending LINE message to pawner:', lineError);
          }
        }

        if (lineToken && contract.investors?.[0]?.line_id) {
          // Send message to investor
          try {
            await fetch('https://api.line.me/v2/bot/message/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST}`
              },
              body: JSON.stringify({
                to: contract.investors[0].line_id,
                messages: [
                  {
                    type: 'text',
                    text: `สัญญาลงทุนของคุณเสร็จสมบูรณ์แล้ว\n\nหมายเลขสัญญา: ${contract.contract_number}\n\nคลิกเพื่อดูสัญญา:\n${investorTicketUrl}\n\nกรุณาบันทึกสัญญาไว้เพื่อใช้อ้างอิง`
                  }
                ]
              })
            });
          } catch (lineError) {
            console.error('Error sending LINE message to investor:', lineError);
          }
        }

        // Mark as completed
        await supabase
          .from('pawn_ticket_generation_queue')
          .update({
            status: 'COMPLETED',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id);

        results.push({
          contractId: contract.contract_id,
          status: 'success',
          pawnerTicketUrl,
          investorTicketUrl
        });

      } catch (itemError: any) {
        console.error(`Error processing queue item ${item.id}:`, itemError);

        // Mark as failed if max attempts reached
        const newStatus = item.attempts + 1 >= 3 ? 'FAILED' : 'PENDING';

        await supabase
          .from('pawn_ticket_generation_queue')
          .update({
            status: newStatus,
            error_message: itemError.message
          })
          .eq('id', item.id);

        results.push({
          contractId: item.contract_id,
          status: 'error',
          error: itemError.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} items`,
      processed: results.length,
      results
    });

  } catch (error: any) {
    console.error('Error processing queue:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process queue' },
      { status: 500 }
    );
  }
}

// GET method to check queue status
export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin();

    const { data: stats, error } = await supabase
      .from('pawn_ticket_generation_queue')
      .select('status')
      .then(({ data, error }) => {
        if (error) throw error;

        const counts = {
          PENDING: 0,
          PROCESSING: 0,
          COMPLETED: 0,
          FAILED: 0
        };

        data?.forEach(item => {
          counts[item.status as keyof typeof counts]++;
        });

        return { data: counts, error: null };
      });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error: any) {
    console.error('Error fetching queue stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch queue stats' },
      { status: 500 }
    );
  }
}
