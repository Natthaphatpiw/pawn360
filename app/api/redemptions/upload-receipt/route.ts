import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, TextMessage } from '@line/bot-sdk';

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redemptionId, receiptPhotos, pawnerLineId } = body;

    if (!redemptionId || !receiptPhotos || receiptPhotos.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get redemption details
    const { data: redemption, error: redemptionError } = await supabase
      .from('redemption_requests')
      .select(`
        *,
        contract:contract_id (
          contract_id,
          contract_number,
          loan_principal_amount,
          interest_amount,
          total_amount,
          contract_start_date,
          contract_end_date,
          contract_duration_days,
          platform_fee_rate,
          platform_fee_amount,
          investor_rate,
          investor_id,
          items:item_id (
            brand,
            model,
            capacity
          ),
          pawners:customer_id (
            customer_id,
            firstname,
            lastname
          )
        )
      `)
      .eq('redemption_id', redemptionId)
      .single();

    if (redemptionError || !redemption) {
      return NextResponse.json(
        { error: 'Redemption not found' },
        { status: 404 }
      );
    }

    // Update redemption with receipt photos
    await supabase
      .from('redemption_requests')
      .update({
        pawner_receipt_photos: receiptPhotos,
        pawner_receipt_uploaded_at: new Date().toISOString(),
        pawner_receipt_verified: true,
        item_return_confirmed_at: new Date().toISOString(),
        request_status: 'COMPLETED',
        final_completion_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('redemption_id', redemptionId);

    // Update contract status
    await supabase
      .from('contracts')
      .update({
        contract_status: 'COMPLETED',
        redemption_status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', redemption.contract_id);

    // Calculate investor earnings based on actual days (tier-based rate)
    const msPerDay = 1000 * 60 * 60 * 24;
    const startDate = new Date(redemption.contract?.contract_start_date || new Date().toISOString());
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(redemption.contract?.contract_end_date || new Date().toISOString());
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rawDaysInContract = Number(redemption.contract?.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDaysInContract);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));

    const investorRate = Number(redemption.contract?.investor_rate || 0.015);
    const principal = Number(redemption.contract?.loan_principal_amount || 0);
    const interestEarned = round2(principal * investorRate * (daysElapsed / 30));
    const platformFee = Number(redemption.contract?.platform_fee_amount) || 0;
    const investorNetProfit = interestEarned;

    // Update redemption with earnings info
    await supabase
      .from('redemption_requests')
      .update({
        investor_interest_earned: interestEarned,
        platform_fee_deducted: platformFee,
        investor_net_profit: investorNetProfit,
      })
      .eq('redemption_id', redemptionId);

    // Send thank you message to pawner
    if (pawnerLineId) {
      const thankYouMessage = `ขอบคุณที่ใช้บริการ Pawnly\n\nการไถ่ถอนสัญญา ${redemption.contract?.contract_number} เสร็จสิ้นเรียบร้อยแล้ว\n\nหากมีปัญหาหรือคำถามใดๆ สามารถติดต่อฝ่ายสนับสนุนได้ที่ 062-6092941\n\nขอบคุณที่ไว้วางใจ Pawnly`;

      try {
        await pawnerLineClient.pushMessage(pawnerLineId, {
          type: 'text',
          text: thankYouMessage
        } as TextMessage);
      } catch (msgError) {
        console.error('Error sending thank you message to pawner:', msgError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Receipt photos uploaded and redemption completed successfully',
    });

  } catch (error: any) {
    console.error('Error uploading receipt:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
