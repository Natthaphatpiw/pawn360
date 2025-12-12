import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { logContractAction } from '@/lib/services/slip-verification';
import { Client } from '@line/bot-sdk';

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing request ID' },
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

    // Check if already completed (idempotency)
    if (actionRequest.request_status === 'COMPLETED') {
      return NextResponse.json({
        success: true,
        message: 'ยืนยันรับเงินเรียบร้อยแล้ว',
        alreadyCompleted: true,
        newPrincipal: actionRequest.new_principal_amount,
      });
    }

    if (actionRequest.request_status !== 'INVESTOR_TRANSFERRED') {
      if (actionRequest.request_status === 'AWAITING_INVESTOR_PAYMENT' || actionRequest.request_status === 'INVESTOR_APPROVED') {
        return NextResponse.json(
          { error: 'กรุณารอนักลงทุนโอนเงินก่อน' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'สถานะคำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' },
        { status: 400 }
      );
    }

    const contract = actionRequest.contract;
    const investor = contract?.investors;
    const newPrincipal = actionRequest.new_principal_amount;

    // Update contract principal
    await supabase
      .from('contracts')
      .update({
        current_principal_amount: newPrincipal,
        principal_amount: newPrincipal,
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', actionRequest.contract_id);

    // Update action request
    await supabase
      .from('contract_action_requests')
      .update({
        request_status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        pawner_confirmed_at: new Date().toISOString(),
      })
      .eq('request_id', requestId);

    // Log completion
    await logContractAction(
      actionRequest.contract_id,
      'PRINCIPAL_INCREASE_COMPLETED',
      'COMPLETED',
      'PAWNER',
      null,
      {
        actionRequestId: requestId,
        principalBefore: contract?.current_principal_amount || contract?.principal_amount,
        principalAfter: newPrincipal,
        amount: actionRequest.increase_amount,
        description: `Principal increased from ${contract?.current_principal_amount || contract?.principal_amount} to ${newPrincipal}`,
      }
    );

    // Notify investor
    if (investor?.line_id) {
      try {
        await investorLineClient.pushMessage(investor.line_id, {
          type: 'text',
          text: `ผู้จำนำยืนยันรับเงินแล้ว\n\nสัญญาเลขที่: ${contract?.contract_number}\nเงินต้นใหม่: ${newPrincipal?.toLocaleString()} บาท\nเพิ่มขึ้น: ${actionRequest.increase_amount?.toLocaleString()} บาท\n\nดอกเบี้ยจะคำนวณตามเงินต้นใหม่ตั้งแต่วันนี้`
        });
      } catch (err) {
        console.error('Error sending message to investor:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Principal increase completed',
      newPrincipal,
    });

  } catch (error: any) {
    console.error('Error confirming received:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
