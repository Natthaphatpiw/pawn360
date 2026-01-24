import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { verifyPaymentSlip } from '@/lib/services/slip-verification';
import { toDateString } from '@/lib/services/penalty';
import { Client } from '@line/bot-sdk';

const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const penaltyId = typeof body?.penaltyId === 'string' ? body.penaltyId.trim() : '';
    const slipUrl = typeof body?.slipUrl === 'string' ? body.slipUrl.trim() : '';
    const pawnerLineId = typeof body?.pawnerLineId === 'string' ? body.pawnerLineId.trim() : '';

    if (!penaltyId || !slipUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();
    const { data: payment, error: paymentError } = await supabase
      .from('penalty_payments')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          customer_id,
          investor_id,
          pawners:customer_id (
            line_id
          ),
          investors:investor_id (
            line_id
          )
        )
      `)
      .eq('penalty_id', penaltyId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Penalty payment not found' },
        { status: 404 }
      );
    }

    const contract = payment.contract;
    const pawner = Array.isArray(contract?.pawners) ? contract.pawners[0] : contract?.pawners;
    const investor = Array.isArray(contract?.investors) ? contract.investors[0] : contract?.investors;

    if (pawnerLineId && pawner?.line_id && pawner.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (payment.status === 'VERIFIED') {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        message: 'Penalty already verified',
      });
    }

    if (['REJECTED_FINAL', 'CANCELLED'].includes(payment.status)) {
      return NextResponse.json(
        { error: 'Penalty payment is no longer valid' },
        { status: 400 }
      );
    }

    const attemptCount = (payment.slip_attempt_count || 0) + 1;
    if (attemptCount > 2) {
      return NextResponse.json(
        { error: 'เกินจำนวนครั้งที่อนุญาต กรุณาติดต่อฝ่าย Support' },
        { status: 400 }
      );
    }

    const expectedAmount = Number(payment.penalty_amount || 0);
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount);

    const updateData: any = {
      slip_url: slipUrl,
      slip_uploaded_at: new Date().toISOString(),
      slip_amount_detected: verificationResult.detectedAmount,
      slip_verification_result: verificationResult.result,
      slip_verification_details: verificationResult.rawResponse,
      slip_attempt_count: attemptCount,
      updated_at: new Date().toISOString(),
    };

    if (verificationResult.result === 'MATCHED' || verificationResult.result === 'OVERPAID') {
      updateData.status = 'VERIFIED';
      updateData.verified_at = new Date().toISOString();
      updateData.paid_through_date = toDateString(new Date());

      await supabase
        .from('penalty_payments')
        .update(updateData)
        .eq('penalty_id', penaltyId);

      if (investor?.line_id) {
        try {
          await investorLineClient.pushMessage(investor.line_id, {
            type: 'text',
            text: `ผู้จำนำได้ชำระค่าปรับแล้ว\nสัญญาเลขที่ ${contract?.contract_number || ''}`.trim(),
          });
        } catch (lineError) {
          console.error('Error sending penalty notification to investor:', lineError);
        }
      }

      return NextResponse.json({
        success: true,
        result: verificationResult.result,
        message: 'ตรวจสอบสลิปค่าปรับสำเร็จ',
        detectedAmount: verificationResult.detectedAmount,
      });
    }

    if (verificationResult.result === 'UNDERPAID') {
      if (attemptCount >= 2) {
        updateData.status = 'REJECTED_FINAL';
      } else {
        updateData.status = 'REJECTED';
      }

      await supabase
        .from('penalty_payments')
        .update(updateData)
        .eq('penalty_id', penaltyId);

      if (attemptCount >= 2) {
        return NextResponse.json({
          success: false,
          result: 'VOIDED',
          message: 'การดำเนินการเป็นโมฆะเนื่องจากโอนเงินไม่ครบจำนวน 2 ครั้ง',
          supportPhone: '0626092941',
        });
      }

      return NextResponse.json({
        success: false,
        result: 'UNDERPAID',
        message: `ยอดเงินที่โอนขาดไป ${Math.abs(verificationResult.difference || 0).toLocaleString()} บาท`,
        detectedAmount: verificationResult.detectedAmount,
        expectedAmount,
        attemptCount,
        remainingAttempts: 2 - attemptCount,
        supportPhone: '0626092941',
      });
    }

    if (attemptCount >= 2) {
      updateData.status = 'REJECTED_FINAL';

      await supabase
        .from('penalty_payments')
        .update(updateData)
        .eq('penalty_id', penaltyId);

      return NextResponse.json({
        success: false,
        result: 'VOIDED',
        message: 'การดำเนินการเป็นโมฆะเนื่องจากไม่สามารถตรวจสอบสลิปได้',
        supportPhone: '0626092941',
      });
    }

    updateData.status = 'REJECTED';
    await supabase
      .from('penalty_payments')
      .update(updateData)
      .eq('penalty_id', penaltyId);

    return NextResponse.json({
      success: false,
      result: verificationResult.result,
      message: verificationResult.message,
      attemptCount,
      remainingAttempts: 2 - attemptCount,
    });
  } catch (error: any) {
    console.error('Error verifying penalty slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
