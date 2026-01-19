import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { Client, FlexMessage } from '@line/bot-sdk';

// Investor LINE OA client
const investorLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_INVEST || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET_INVEST || ''
});

// Pawner LINE OA client
const pawnerLineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || ''
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, lineId, verificationResult, verificationData, bagNumber } = body;

    if (!contractId || !lineId || !verificationResult) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get drop point by LINE ID
    const { data: dropPoint, error: dpError } = await supabase
      .from('drop_points')
      .select('drop_point_id, drop_point_name, phone_number')
      .eq('line_id', lineId)
      .single();

    if (dpError || !dropPoint) {
      return NextResponse.json(
        { error: 'Drop point not found' },
        { status: 404 }
      );
    }

    // Get contract with all related data
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        investors:investor_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    if (contract.drop_point_id !== dropPoint.drop_point_id) {
      return NextResponse.json(
        { error: 'Unauthorized drop point' },
        { status: 403 }
      );
    }

    const resolvedBagNumber = String(bagNumber || verificationData?.bag_number || '').trim();

    if (verificationResult === 'APPROVED' && !resolvedBagNumber) {
      return NextResponse.json(
        { error: 'Bag number is required for approval' },
        { status: 400 }
      );
    }

    if (['VERIFIED', 'RETURNED'].includes(contract.item_delivery_status)) {
      return NextResponse.json(
        { error: 'Item already verified or returned' },
        { status: 409 }
      );
    }

    // Save verification record
    await supabase
      .from('drop_point_verifications')
      .insert({
        contract_id: contractId,
        drop_point_id: dropPoint.drop_point_id,
        item_id: contract.item_id,
        brand_correct: verificationData.brand_correct,
        model_correct: verificationData.model_correct,
        capacity_correct: verificationData.capacity_correct,
        color_match: verificationData.color_match,
        functionality_ok: verificationData.functionality_ok,
        mdm_lock_status: verificationData.mdm_lock_status,
        condition_score: verificationData.condition_score,
        verification_photos: verificationData.verification_photos,
        notes: verificationData.notes,
        verification_result: verificationResult,
        verified_by_line_id: lineId
      });

    if (verificationResult === 'APPROVED') {
      const { error: bagError } = await supabase
        .from('drop_point_bag_assignments')
        .upsert({
          drop_point_id: dropPoint.drop_point_id,
          contract_id: contractId,
          item_id: contract.item_id,
          bag_number: resolvedBagNumber,
          assigned_by_line_id: lineId,
          assigned_at: new Date().toISOString(),
        }, { onConflict: 'contract_id' });

      if (bagError) {
        console.error('Error saving bag assignment:', bagError);
        return NextResponse.json(
          { error: 'Failed to save bag assignment' },
          { status: 500 }
        );
      }

      // Update contract status
      await supabase
        .from('contracts')
        .update({
          item_delivery_status: 'VERIFIED',
          item_received_at: new Date().toISOString(),
          item_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('contract_id', contractId);

      // Update item status
      await supabase
        .from('items')
        .update({
          verified_by_drop_point: true,
          drop_point_verified_at: new Date().toISOString(),
          drop_point_photos: verificationData.verification_photos,
          drop_point_condition_score: verificationData.condition_score,
          drop_point_verification_notes: verificationData.notes
        })
        .eq('item_id', contract.item_id);

      // Send notification to investor with payment instructions
      if (contract.investors?.line_id) {
        const paymentCard = createPaymentInstructionCard(contract);
        try {
          await investorLineClient.pushMessage(contract.investors.line_id, paymentCard);
          console.log(`Sent payment instruction to investor ${contract.investors.line_id}`);
        } catch (invError) {
          console.error('Error sending to investor:', invError);
        }
      }

    } else if (verificationResult === 'REJECTED') {
      // Update contract status
      await supabase
        .from('contracts')
        .update({
          item_delivery_status: 'RETURNED',
          contract_status: 'TERMINATED',
          updated_at: new Date().toISOString()
        })
        .eq('contract_id', contractId);

      // Notify pawner about rejection
      if (contract.pawners?.line_id) {
        await pawnerLineClient.pushMessage(contract.pawners.line_id, {
          type: 'text',
          text: `สินค้าของคุณถูกปฏิเสธจาก Drop Point\n\nเหตุผล: ${verificationData.notes || 'สินค้าไม่ตรงตามข้อมูลที่ระบุ'}\n\nกรุณาติดต่อ Drop Point เพื่อรับสินค้าคืนหรือจัดส่งกลับ\nจุดรับฝาก: ${dropPoint.drop_point_name}\nเบอร์ติดต่อ: ${dropPoint.phone_number || 'ไม่ระบุ'}`
        });
      }

      // Notify investor
      if (contract.investors?.line_id) {
        await investorLineClient.pushMessage(contract.investors.line_id, {
          type: 'text',
          text: `สินค้าถูกปฏิเสธจาก Drop Point\n\nหมายเลขสัญญา: ${contract.contract_number}\nเหตุผล: ${verificationData.notes || 'สินค้าไม่ตรงตามข้อมูลที่ระบุ'}\n\nสัญญานี้ถูกยกเลิก`
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: verificationResult === 'APPROVED' ? 'Verification approved' : 'Verification rejected'
    });

  } catch (error: any) {
    console.error('Error in verification:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createPaymentInstructionCard(contract: any): FlexMessage {
  return {
    type: 'flex',
    altText: 'สินค้าผ่านการตรวจสอบแล้ว - กรุณาโอนเงิน',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'สินค้าผ่านการตรวจสอบแล้ว',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'กรุณาโอนเงินให้ผู้จำนำ',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#1E3A8A',
        paddingAll: 'lg'
      },
      hero: {
        type: 'image',
        url: contract.items?.image_urls?.[0] || 'https://via.placeholder.com/300x200?text=No+Image',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: `${contract.items?.brand} ${contract.items?.model}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'text',
              text: 'ข้อมูลบัญชีผู้รับเงิน',
              weight: 'bold',
              margin: 'lg',
              color: '#1E3A8A'
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ธนาคาร:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.pawners?.bank_name || 'ไม่ระบุ', color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'ชื่อบัญชี:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.pawners?.bank_account_name || `${contract.pawners?.firstname} ${contract.pawners?.lastname}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              contents: [
                { type: 'text', text: 'เลขบัญชี:', color: '#666666', size: 'sm', flex: 2 },
                { type: 'text', text: contract.pawners?.bank_account_no || 'ไม่ระบุ', color: '#1E3A8A', size: 'md', flex: 5, weight: 'bold' }
              ]
            },
            {
              type: 'separator',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'baseline',
              spacing: 'sm',
              margin: 'lg',
              contents: [
                { type: 'text', text: 'ยอดโอน:', color: '#666666', size: 'md', flex: 2 },
                { type: 'text', text: `${contract.loan_principal_amount?.toLocaleString()} บาท`, color: '#1E3A8A', size: 'xl', flex: 5, weight: 'bold' }
              ]
            }
          ]
        }]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [{
          type: 'button',
          action: {
            type: 'uri',
            label: 'ส่งหลักฐานการชำระเงิน',
            uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_INVEST_PAYMENT || '2008641671-MPKmDQ1y'}?contractId=${contract.contract_id}`
          },
          style: 'primary',
          color: '#1E3A8A'
        }]
      }
    }
  };
}
