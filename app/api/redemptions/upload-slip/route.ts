import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getCompanyBankAccount, saveSlipVerification, verifyPaymentSlip } from '@/lib/services/slip-verification';
import { getPenaltyRequirement, markPenaltyPaymentVerified, roundCurrency } from '@/lib/services/penalty';
import { Client, FlexMessage } from '@line/bot-sdk';

// Drop Point LINE OA client
const dropPointLineClient = process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT ? new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
  channelSecret: process.env.LINE_CHANNEL_SECRET_DROPPOINT || ''
}) : null;

const getDropPointReturnUrl = (redemptionId: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_RETURN || '2008651088-fsjSpdo9';
  return `https://liff.line.me/${liffId}?redemptionId=${encodeURIComponent(redemptionId)}`;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redemptionId, slipUrl, pawnerLineId } = body;

    if (!redemptionId || !slipUrl) {
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
          contract_start_date,
          contract_end_date,
          customer_id,
          investor_id,
          loan_principal_amount,
          interest_amount,
          total_amount,
          items:item_id (
            item_id,
            brand,
            model,
            capacity,
            image_urls
          ),
          pawners:customer_id (
            customer_id,
            firstname,
            lastname,
            line_id,
            phone_number
          ),
          investors:investor_id (
            investor_id,
            firstname,
            lastname,
            line_id,
            bank_name,
            bank_account_no,
            bank_account_name
          ),
          drop_points:drop_point_id (
            drop_point_id,
            drop_point_name,
            phone_number,
            line_id
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

    const contract = redemption.contract;
    const pawner = contract?.pawners;

    if (pawnerLineId && pawner?.line_id && pawner.line_id !== pawnerLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const penaltyRequirement = await getPenaltyRequirement(supabase, contract);
    const baseAmount = Number(redemption.principal_amount || 0)
      + Number(redemption.interest_amount || 0)
      + Number(redemption.delivery_fee || 0);
    const penaltyAmount = penaltyRequirement.required ? Number(penaltyRequirement.penaltyAmount || 0) : 0;
    const expectedAmount = roundCurrency(baseAmount + penaltyAmount);

    if (expectedAmount !== Number(redemption.total_amount || 0)) {
      await supabase
        .from('redemption_requests')
        .update({
          total_amount: expectedAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('redemption_id', redemptionId);
    }

    const companyBank = await getCompanyBankAccount();
    const verificationResult = await verifyPaymentSlip(slipUrl, expectedAmount, {
      receiverAccountNo: companyBank.account_number || companyBank.bank_account_no || null,
      receiverPromptpay: companyBank.promptpay_number || null,
      receiverName: companyBank.account_name || companyBank.bank_account_name || null,
      useSlipOkLogCheck: true,
    });

    const { count: previousAttempts } = await supabase
      .from('slip_verifications')
      .select('verification_id', { count: 'exact', head: true })
      .eq('redemption_id', redemptionId);

    await saveSlipVerification(
      null,
      redemptionId,
      slipUrl,
      expectedAmount,
      verificationResult,
      (previousAttempts || 0) + 1,
    );

    const baseUpdateData: any = {
      payment_slip_url: slipUrl,
      payment_slip_uploaded_at: new Date().toISOString(),
      actual_amount_received: verificationResult.detectedAmount,
      amount_difference: verificationResult.difference,
      mismatch_type: verificationResult.result === 'UNDERPAID'
        ? 'UNDERPAID'
        : (verificationResult.result === 'OVERPAID' ? 'OVERPAID' : null),
      verification_notes: verificationResult.message,
      updated_at: new Date().toISOString(),
    };

    if (verificationResult.result !== 'MATCHED' && verificationResult.result !== 'OVERPAID') {
      await supabase
        .from('redemption_requests')
        .update({
          ...baseUpdateData,
          request_status: 'PENDING',
        })
        .eq('redemption_id', redemptionId);

      return NextResponse.json(
        {
          error: verificationResult.message,
          result: verificationResult.result,
          detectedAmount: verificationResult.detectedAmount,
          expectedAmount,
        },
        { status: 400 }
      );
    }

    // Update redemption after successful slip verification
    const { error: updateError } = await supabase
      .from('redemption_requests')
      .update({
        ...baseUpdateData,
        request_status: 'AMOUNT_VERIFIED',
        verified_at: new Date().toISOString(),
      })
      .eq('redemption_id', redemptionId);

    if (updateError) {
      console.error('Error updating redemption:', updateError);
      return NextResponse.json(
        { error: 'Failed to update redemption' },
        { status: 500 }
      );
    }

    if (penaltyRequirement.required) {
      await markPenaltyPaymentVerified(supabase, contract, penaltyRequirement, {
        slipUrl,
        detectedAmount: verificationResult.detectedAmount,
        verificationResult: verificationResult.result,
        verificationDetails: verificationResult.rawResponse,
        attemptCount: (previousAttempts || 0) + 1,
      });
    }

    // Update contract redemption status
    await supabase
      .from('contracts')
      .update({
        redemption_status: 'IN_PROGRESS',
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', redemption.contract_id);

    // Send notification to Drop Point
    const dropPointLineId = redemption.contract?.drop_points?.line_id;
    if (dropPointLineId && dropPointLineClient) {
      try {
        const { data: storageBox, error: storageBoxError } = await supabase
          .from('drop_point_storage_boxes')
          .select('box_code')
          .eq('contract_id', redemption.contract_id)
          .order('last_updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (storageBoxError && storageBoxError.code !== 'PGRST205') {
          console.error('Error fetching storage box for redemption card:', storageBoxError);
        }

        const { data: bagAssignment, error: bagAssignmentError } = await supabase
          .from('drop_point_bag_assignments')
          .select('bag_number')
          .eq('contract_id', redemption.contract_id)
          .order('assigned_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bagAssignmentError) {
          console.error('Error fetching bag assignment for redemption card:', bagAssignmentError);
        }

        const notificationCard = createDropPointRedemptionCard(redemption, getDropPointReturnUrl(redemptionId));
        if (storageBox?.box_code) {
          (notificationCard.contents as any).body.contents.splice(3, 0, {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'กล่อง:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: storageBox.box_code, color: '#365314', size: 'sm', flex: 5, weight: 'bold' }
            ]
          });
        }
        if (bagAssignment?.bag_number) {
          (notificationCard.contents as any).body.contents.splice(2, 0, {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'หมายเลขถุง:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: bagAssignment.bag_number, color: '#365314', size: 'sm', flex: 5, weight: 'bold' }
            ]
          });
        }
        await dropPointLineClient.pushMessage(dropPointLineId, notificationCard);
        console.log(`Sent redemption notification to drop point: ${dropPointLineId}`);
      } catch (msgError) {
        console.error('Error sending to drop point:', msgError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Slip uploaded successfully',
      result: verificationResult.result,
    });

  } catch (error: any) {
    console.error('Error uploading slip:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function createDropPointRedemptionCard(redemption: any, returnUrl: string): FlexMessage {
  const contract = redemption.contract;
  const item = contract?.items;
  const pawner = contract?.pawners;

  const deliveryMethodText = {
    'SELF_PICKUP': 'ลูกค้ามารับเอง',
    'SELF_ARRANGE': 'ลูกค้าเรียกขนส่งเอง',
    'PLATFORM_ARRANGE': 'ให้ Pawnly เรียกขนส่ง',
  }[redemption.delivery_method as string] || redemption.delivery_method;

  return {
    type: 'flex',
    altText: 'มีคำขอไถ่ถอนใหม่',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{
          type: 'text',
          text: 'คำขอไถ่ถอนใหม่',
          weight: 'bold',
          size: 'lg',
          color: '#ffffff',
          align: 'center'
        }, {
          type: 'text',
          text: 'ระบบตรวจสอบสลิปเรียบร้อยแล้ว',
          size: 'sm',
          color: '#ffffff',
          align: 'center',
          margin: 'sm'
        }],
        backgroundColor: '#365314',
        paddingAll: 'lg'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${item?.brand || ''} ${item?.model || ''}`, color: '#333333', size: 'sm', flex: 5, weight: 'bold' }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สัญญา:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contract?.contract_number || '', color: '#333333', size: 'sm', flex: 5 }
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
            margin: 'md',
            contents: [
              { type: 'text', text: 'การรับของ:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: deliveryMethodText, color: '#333333', size: 'sm', flex: 5 }
            ]
          },
          {
            type: 'separator',
            margin: 'lg'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              { type: 'text', text: 'ข้อมูลผู้ขอสินเชื่อ:', color: '#666666', size: 'xs', margin: 'none' },
              { type: 'text', text: `${pawner?.firstname || ''} ${pawner?.lastname || ''}`, color: '#333333', size: 'sm', weight: 'bold', margin: 'sm' },
              { type: 'text', text: `โทร: ${pawner?.phone_number || '-'}`, color: '#666666', size: 'xs', margin: 'sm' }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดรายการส่งคืน',
              uri: returnUrl,
            },
            style: 'primary',
            color: '#365314'
          }
        ]
      }
    }
  };
}
