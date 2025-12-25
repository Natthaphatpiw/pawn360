import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, TextMessage } from '@line/bot-sdk';

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redemptionId, action, additionalAmount, reason } = body;

    if (!redemptionId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get redemption with contract details
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
          items:item_id (
            item_id,
            brand,
            model,
            capacity
          ),
          pawners:customer_id (
            customer_id,
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number
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

    const pawnerLineId = redemption.contract?.pawners?.line_id;
    const dropPointName = redemption.contract?.drop_points?.drop_point_name || 'จุดรับฝาก';

    if (action === 'amount_correct') {
      // Update redemption status to amount verified
      await supabase
        .from('redemption_requests')
        .update({
          request_status: 'AMOUNT_VERIFIED',
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('redemption_id', redemptionId);

      // Send message to pawner based on delivery method
      if (pawnerLineId) {
        let message = '';

        if (redemption.delivery_method === 'SELF_PICKUP') {
          message = `✅ ยอดเงินถูกต้องแล้ว\n\nสัญญา: ${redemption.contract?.contract_number}\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nกรุณามารับสินค้าที่ ${dropPointName} พร้อมแสดงหลักฐานการโอนเงิน\n\nหลังได้รับสินค้าแล้ว กรุณาส่งรูปภาพการได้รับสินค้าคืนมาที่ไลน์นี้ เพื่อยืนยันการเสร็จสิ้นการไถ่ถอน`;
        } else if (redemption.delivery_method === 'SELF_ARRANGE') {
          message = `✅ ยอดเงินถูกต้องแล้ว\n\nสัญญา: ${redemption.contract?.contract_number}\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nกรุณานัดหมายกับ ${dropPointName} เพื่อมารับสินค้า\n\nหลังได้รับสินค้าแล้ว กรุณาส่งรูปภาพการได้รับสินค้าคืนมาที่ไลน์นี้ เพื่อยืนยันการเสร็จสิ้นการไถ่ถอน`;
        } else if (redemption.delivery_method === 'PLATFORM_ARRANGE') {
          message = `✅ ยอดเงินถูกต้องแล้ว\n\nสัญญา: ${redemption.contract?.contract_number}\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nทาง ${dropPointName} จะเตรียมสินค้าไว้ให้ พร้อมให้บริการขนส่งตามที่อยู่ที่คุณระบุ\n\nเมื่อได้รับสินค้าแล้ว กรุณาส่งรูปภาพการได้รับสินค้าคืนมาที่ไลน์นี้ เพื่อยืนยันการเสร็จสิ้นการไถ่ถอน`;
        }

        try {
          await pawnerLineClient.pushMessage(pawnerLineId, {
            type: 'text',
            text: message
          } as TextMessage);
        } catch (msgError) {
          console.error('Error sending message to pawner:', msgError);
        }
      }

    } else if (action === 'amount_incorrect') {
      // Update redemption status
      await supabase
        .from('redemption_requests')
        .update({
          request_status: 'AMOUNT_MISMATCH',
          actual_amount_received: redemption.total_amount - (additionalAmount || 0),
          amount_difference: additionalAmount || 0,
          mismatch_type: additionalAmount > 0 ? 'OVERPAID' : 'UNDERPAID',
          updated_at: new Date().toISOString(),
        })
        .eq('redemption_id', redemptionId);

      // Send message to pawner
      if (pawnerLineId) {
        let message = '';

        if (additionalAmount > 0) {
          // Overpaid
          message = `❌ ยอดเงินที่โอนเกิน\n\nสัญญา: ${redemption.contract?.contract_number}\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nยอดที่โอนเกินไป ${additionalAmount.toLocaleString()} บาท\n\nกรุณาติดต่อ ${dropPointName} ที่เบอร์ ${redemption.contract?.drop_points?.phone_number || 'ไม่ระบุ'} เพื่อรับเงินคืน หรือโทรไปยังฝ่ายสนับสนุนที่ 062-6092941`;
        } else {
          // Underpaid
          message = `❌ ยอดเงินที่โอนขาด\n\nสัญญา: ${redemption.contract?.contract_number}\nสินค้า: ${redemption.contract?.items?.brand} ${redemption.contract?.items?.model}\n\nยอดที่ขาดไป ${Math.abs(additionalAmount).toLocaleString()} บาท\n\nกรุณาโอนเงินเพิ่มเติมไปยังบัญชี:\nพร้อมเพย์: 0626092941\nชื่อบัญชี: ณัฐภัทร ต้อยจัตุรัส\n\nหรือติดต่อฝ่ายสนับสนุนที่ 062-6092941 เพื่อขอรายละเอียดเพิ่มเติม`;
        }

        try {
          await pawnerLineClient.pushMessage(pawnerLineId, {
            type: 'text',
            text: message
          } as TextMessage);
        } catch (msgError) {
          console.error('Error sending message to pawner:', msgError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verification processed successfully',
    });

  } catch (error: any) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}