import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { Client } from '@line/bot-sdk';

// Pawner LINE OA client
const pawnerLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN ? new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
}) : null;

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
    const pawner = contract?.pawners;

    if (action === 'REJECT') {
      // Update request status
      await supabase
        .from('contract_action_requests')
        .update({
          request_status: 'INVESTOR_REJECTED',
          rejection_reason: reason,
          rejected_at: new Date().toISOString(),
        })
        .eq('request_id', requestId);

      // Log rejection
      await logContractAction(
        actionRequest.contract_id,
        'INVESTOR_REJECTED',
        'COMPLETED',
        'INVESTOR',
        investorLineId,
        {
          actionRequestId: requestId,
          rejectionReason: reason,
          description: `Investor rejected principal increase request. Reason: ${reason}`,
          metadata: {
            actionType: 'PRINCIPAL_INCREASE',
          },
        }
      );

      // Notify pawner
      if (pawner?.line_id && pawnerLineClient) {
        try {
          await pawnerLineClient.pushMessage(pawner.line_id, {
            type: 'text',
            text: `คำขอเพิ่มเงินต้นถูกปฏิเสธ\n\nจำนวนที่ขอ: ${actionRequest.increase_amount?.toLocaleString()} บาท\n\nเหตุผล: ${reason}\n\nหากมีข้อสงสัย กรุณาติดต่อฝ่ายสนับสนุน`
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
