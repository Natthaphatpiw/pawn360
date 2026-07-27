import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { Client } from '@line/bot-sdk';

const getPawnerLineClient = () => {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return null;

  return new Client({
    channelAccessToken,
    channelSecret: process.env.LINE_CHANNEL_SECRET || ''
  });
};

const normalizeRelation = <T,>(value: T | T[] | null | undefined): T | null => (
  Array.isArray(value) ? value[0] || null : value || null
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, action, reason, investorLineId } = body;

    if (!requestId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (action === 'REJECT' && !normalizedReason) {
      return NextResponse.json(
        { error: 'กรุณาระบุเหตุผลที่ปฏิเสธคำขอ' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get action request
    const { data: actionRequest, error: requestError } = await supabase
      .from('contract_action_requests')
      .select(`
        *,
        contract:contract_id (
          *,
          items:item_id (*),
          pawners:customer_id (*),
          investors:investor_id (*)
        )
      `)
      .eq('request_id', requestId)
      .single();

    if (requestError || !actionRequest) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    const contract = actionRequest.contract;
    const pawner = normalizeRelation<any>(contract?.pawners);
    const investor = normalizeRelation<any>(contract?.investors);

    if (!investorLineId || investor?.line_id !== investorLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (action === 'REJECT') {
      if (!['PENDING_INVESTOR_APPROVAL', 'AWAITING_INVESTOR_APPROVAL'].includes(actionRequest.request_status)) {
        return NextResponse.json(
          { error: 'คำขอนี้ไม่ได้อยู่ในสถานะที่สามารถปฏิเสธได้' },
          { status: 409 }
        );
      }

      // Update request status
      const { error: updateError } = await supabase
        .from('contract_action_requests')
        .update({
          request_status: 'INVESTOR_REJECTED',
          investor_rejection_reason: normalizedReason,
          investor_rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('request_id', requestId);

      if (updateError) {
        throw updateError;
      }

      // Log rejection
      await logContractAction(
        actionRequest.contract_id,
        'INVESTOR_REJECTED',
        'COMPLETED',
        'INVESTOR',
        investorLineId,
        {
          actionRequestId: requestId,
          rejectionReason: normalizedReason,
          description: `Investor rejected principal increase request. Reason: ${normalizedReason}`,
          metadata: {
            actionType: 'PRINCIPAL_INCREASE',
          },
        }
      );

      // Notify pawner
      if (pawner?.line_id) {
        try {
          const pawnerLineClient = getPawnerLineClient();
          if (!pawnerLineClient) {
            throw new Error('Seller LINE OA is not configured');
          }

          await pawnerLineClient.pushMessage(pawner.line_id, {
            type: 'text',
            text: `คำขอเพิ่มเงินต้นถูกปฏิเสธ\n\nจำนวนที่ขอ: ${actionRequest.increase_amount?.toLocaleString()} บาท\n\nเหตุผล: ${normalizedReason}\n\nหากมีข้อสงสัย กรุณาติดต่อฝ่ายสนับสนุน`
          });
        } catch (err) {
          console.error('Error sending message to pawner:', err);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Request rejected',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error processing investor response:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
