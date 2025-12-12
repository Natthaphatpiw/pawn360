import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPaymentSlip, saveSlipVerification, logContractAction } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, slipUrl, investorLineId } = body;

    if (!requestId || !slipUrl) {
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

    // Check if request is still active and available
    const validStatuses = ['AWAITING_INVESTOR_APPROVAL', 'INVESTOR_APPROVED', 'AWAITING_INVESTOR_PAYMENT', 'INVESTOR_SLIP_REJECTED', 'PENDING_INVESTOR_APPROVAL'];
    if (!validStatuses.includes(actionRequest.request_status)) {
      if (actionRequest.request_status === 'INVESTOR_TRANSFERRED' || actionRequest.request_status === 'COMPLETED') {
        return NextResponse.json(
          { error: 'คำขอนี้ได้รับการดำเนินการแล้ว', alreadyProcessed: true },
          { status: 400 }
        );
      }
      if (actionRequest.request_status === 'INVESTOR_SLIP_REJECTED_FINAL' || actionRequest.request_status === 'VOIDED') {
        return NextResponse.json(
          { error: 'คำขอนี้ถูกยกเลิกแล้ว กรุณาติดต่อฝ่าย Support โทร 0626092941' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'คำขอนี้ไม่สามารถดำเนินการได้ สถานะไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // Check attempt count (investor side)
    const attemptCount = (actionRequest.investor_slip_attempt_count || 0) + 1;

    if (attemptCount > 2) {
      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support ที่เบอร์ 062-6092941' },
        { status: 400 }
      );
    }

    // Verify slip with AI
    const expectedAmount = actionRequest.increase_amount;
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount);

    // Save verification result
    await saveSlipVerification(
      requestId,
      null,
      slipUrl,
      expectedAmount,
      verificationResult,
      attemptCount
    );

    // Update action request
    const updateData: any = {
      investor_slip_url: slipUrl,
      investor_slip_uploaded_at: new Date().toISOString(),
      investor_slip_amount_detected: verificationResult.detectedAmount,
      investor_slip_verification_result: verificationResult.result,
      investor_slip_attempt_count: attemptCount,
    };

    const contract = actionRequest.contract;
    const pawner = contract?.pawners;

    // Handle verification result
    if (verificationResult.result === 'MATCHED' || verificationResult.result === 'OVERPAID') {
      // Success - notify pawner to confirm
      updateData.request_status = 'INVESTOR_TRANSFERRED';
      updateData.investor_transferred_at = new Date().toISOString();

      await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId);

      // Log success
      await logContractAction(
        actionRequest.contract_id,
        'INVESTOR_SLIP_VERIFIED',
        'COMPLETED',
        'INVESTOR',
        investorLineId,
        {
          actionRequestId: requestId,
          slipUrl,
          slipAmountDetected: verificationResult.detectedAmount,
          description: `Investor slip verified. Detected: ${verificationResult.detectedAmount}, Expected: ${expectedAmount}`,
        }
      );

      // Notify pawner to confirm receipt
      if (pawner?.line_id) {
        try {
          const confirmCard = createPawnerConfirmCard(actionRequest);
          await pawnerLineClient.pushMessage(pawner.line_id, confirmCard);
        } catch (err) {
          console.error('Error sending message to pawner:', err);
        }
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        message: 'ตรวจสอบสลิปสำเร็จ รอผู้จำนำยืนยันการรับเงิน',
        detectedAmount: verificationResult.detectedAmount,
      });

    } else if (verificationResult.result === 'UNDERPAID') {
      // Underpaid
      if (attemptCount >= 2) {
        // Second attempt failed - void the request
        updateData.request_status = 'INVESTOR_SLIP_REJECTED_FINAL';
        updateData.voided_at = new Date().toISOString();
        updateData.void_reason = 'นักลงทุนโอนเงินไม่ครบจำนวน 2 ครั้ง';

        await supabase
          .from('contract_action_requests')
          .update(updateData)
          .eq('request_id', requestId);

        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากโอนเงินไม่ครบจำนวน 2 ครั้ง',
          supportPhone: '0626092941',
        });
      }

      // First attempt failed - allow retry
      updateData.request_status = 'INVESTOR_SLIP_REJECTED';

      await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId);

      const shortAmount = Math.abs(verificationResult.difference || 0);

      return NextResponse.json({
        success: false,
        result: 'UNDERPAID',
        message: `ยอดโอนเงินไม่ตรงกับยอดที่ต้องโอน\n\nกรุณาโอนเพิ่มจำนวน ${shortAmount.toLocaleString()} บาท`,
        shortAmount,
        detectedAmount: verificationResult.detectedAmount,
        expectedAmount,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
      });

    } else {
      // Unreadable or Invalid
      if (attemptCount >= 2) {
        updateData.request_status = 'INVESTOR_SLIP_REJECTED_FINAL';
        updateData.voided_at = new Date().toISOString();
        updateData.void_reason = 'ไม่สามารถอ่านสลิปได้ 2 ครั้ง';

        await supabase
          .from('contract_action_requests')
          .update(updateData)
          .eq('request_id', requestId);

        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากไม่สามารถตรวจสอบสลิปได้',
          supportPhone: '0626092941',
        });
      }

      updateData.request_status = 'INVESTOR_SLIP_REJECTED';

      await supabase
        .from('contract_action_requests')
        .update(updateData)
        .eq('request_id', requestId);

      return NextResponse.json({
        success: false,
        result: verificationResult.result,
        message: verificationResult.message,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
      });
    }

  } catch (error: any) {
    console.error('Error verifying investor slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createPawnerConfirmCard(actionRequest: any): FlexMessage {
  const contract = actionRequest.contract;
  const item = contract?.items;

  return {
    type: 'flex',
    altText: 'ยืนยันการรับเงินเพิ่มเงินต้น',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'นักลงทุนโอนเงินแล้ว',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }],
        backgroundColor: '#B85C38',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${item?.brand || ''} ${item?.model || ''}`,
            weight: 'bold',
            size: 'md',
            color: '#333333'
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'lg',
            contents: [
              { type: 'text', text: 'จำนวนเงิน:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${actionRequest.increase_amount?.toLocaleString()} บาท`, color: '#B85C38', size: 'lg', flex: 3, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'โอนเข้าบัญชี:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: actionRequest.pawner_bank_name || '', color: '#333333', size: 'sm', flex: 3, weight: 'bold' }
            ]
          },
          {
            type: 'text',
            text: 'กรุณาตรวจสอบบัญชีของคุณและยืนยันการรับเงิน',
            wrap: true,
            color: '#666666',
            size: 'xs',
            margin: 'lg'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ยืนยันได้รับเงิน',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/contracts/${actionRequest.contract_id}/principal-increase/waiting?requestId=${actionRequest.request_id}`
          },
          style: 'primary',
          color: '#B85C38'
        }]
      }
    }
  };
}
