import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getCompanyBankAccount } from '@/lib/services/slip-verification';
import { Client, FlexMessage } from '@line/bot-sdk';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import { acquireTransactionLock, transactionLockErrorResponse } from '@/lib/security/transaction-lock';
import {
  boundedText,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const createLineClient = (channelAccessToken?: string, channelSecret?: string) => {
  if (!channelAccessToken) {
    return null;
  }
  return new Client({
    channelAccessToken,
    channelSecret: channelSecret || '',
  });
};

const pawnerLineClient = createLineClient(
  process.env.LINE_CHANNEL_ACCESS_TOKEN,
  process.env.LINE_CHANNEL_SECRET
);
const dropPointLineClient = createLineClient(
  process.env.LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT,
  process.env.LINE_CHANNEL_SECRET_DROPPOINT
);

const getDropPointUrl = (deliveryRequestId: string) => {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DROPPOINT_PICKUP || '2008651088-cx00A4cZ';
  return `https://liff.line.me/${liffId}?deliveryRequestId=${encodeURIComponent(deliveryRequestId)}`;
};

const buildDropPointPickupCard = (payload: {
  deliveryRequestId: string;
  contractNumber: string;
  itemName: string;
  addressFull: string;
  contactPhone?: string | null;
  feeAmount: number;
}) => {
  const { deliveryRequestId, contractNumber, itemName, addressFull, contactPhone, feeAmount } = payload;
  return {
    type: 'flex',
    altText: 'รับงานไปรับสินค้า',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'รับงานไปรับสินค้า',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
            align: 'center',
          },
          {
            type: 'text',
            text: 'พร้อมให้เข้ารับสินค้าแล้ว',
            size: 'sm',
            color: '#ffffff',
            align: 'center',
            margin: 'sm',
          },
        ],
        backgroundColor: '#365314',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สัญญา:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: contractNumber, color: '#333333', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: itemName, color: '#333333', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'ค่าจัดส่ง:', color: '#666666', size: 'sm', flex: 2 },
              { type: 'text', text: `${feeAmount.toLocaleString()} บาท (บริษัทรับผิดชอบ)`, color: '#C0562F', size: 'sm', flex: 5, weight: 'bold' },
            ],
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          {
            type: 'text',
            text: 'ที่อยู่รับสินค้า',
            size: 'sm',
            weight: 'bold',
            color: '#333333',
            margin: 'md',
          },
          {
            type: 'text',
            text: addressFull || '-',
            size: 'sm',
            color: '#555555',
            wrap: true,
          },
          {
            type: 'text',
            text: contactPhone ? `โทร: ${contactPhone}` : 'โทร: -',
            size: 'sm',
            color: '#555555',
            margin: 'sm',
          },
        ],
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
              label: 'อัปเดตสถานะรับของ',
              uri: getDropPointUrl(deliveryRequestId),
            },
            style: 'primary',
            color: '#365314',
          },
        ],
      },
    },
  } as FlexMessage;
};

const buildPawnerStatusCard = (payload: {
  contractNumber: string;
  itemName: string;
}) => {
  const { contractNumber, itemName } = payload;
  return {
    type: 'flex',
    altText: 'แจ้งการเข้ารับสินค้า',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'รับข้อมูลเรียบร้อย',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
            align: 'center',
          },
          {
            type: 'text',
            text: 'Drop Point กำลังประสานรถเข้ารับสินค้า',
            size: 'sm',
            color: '#ffffff',
            align: 'center',
            margin: 'sm',
            wrap: true,
          },
        ],
        backgroundColor: '#C0562F',
        paddingAll: 'lg',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: 'กรุณาเตรียมสินค้าไว้ให้พร้อม รถจะเข้ารับภายใน 2 ชั่วโมง',
            size: 'sm',
            color: '#444444',
            wrap: true,
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              { type: 'text', text: 'สัญญา:', size: 'sm', color: '#666666', flex: 2 },
              { type: 'text', text: contractNumber, size: 'sm', color: '#333333', weight: 'bold', flex: 5, wrap: true },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'สินค้า:', size: 'sm', color: '#666666', flex: 2 },
              { type: 'text', text: itemName || '-', size: 'sm', color: '#333333', weight: 'bold', flex: 5, wrap: true },
            ],
          },
        ],
      },
    },
  } as FlexMessage;
};

const buildAddressFull = (address: Record<string, string | undefined>) => {
  const parts = [
    address.houseNo,
    address.village,
    address.street,
    address.subDistrict,
    address.district,
    address.province,
    address.postcode,
  ].filter(Boolean);
  return parts.join(' ');
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = requireUuid(searchParams.get('contractId'));
    const claimedLineId = boundedText(searchParams.get('lineId'), 128, true) || '';
    const lineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);


    const supabase = supabaseAdmin();

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        loan_request_id,
        customer_id,
        drop_point_id,
        items:item_id (brand, model),
        pawners:customer_id (
          line_id,
          firstname,
          lastname,
          phone_number,
          addr_house_no,
          addr_village,
          addr_street,
          addr_sub_district,
          addr_district,
          addr_province,
          addr_postcode
        ),
        drop_points:drop_point_id (drop_point_name, phone_number, line_id)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const pawner = Array.isArray(contract.pawners)
      ? contract.pawners[0]
      : contract.pawners;
    const dropPoint = Array.isArray(contract.drop_points)
      ? contract.drop_points[0]
      : contract.drop_points;

    if (pawner?.line_id !== lineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: loanRequest } = await supabase
      .from('loan_requests')
      .select('delivery_method, delivery_fee')
      .eq('request_id', contract.loan_request_id)
      .single();

    const { data: deliveryRequest } = await supabase
      .from('pawn_delivery_requests')
      .select('delivery_request_id, contract_id, delivery_fee, status, address_full, contact_phone, notes, slip_attempt_count, created_at, updated_at')
      .eq('contract_id', contractId)
      .maybeSingle();

    const bankAccount = await getCompanyBankAccount();

    return NextResponse.json({
      success: true,
      contract: {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item: contract.items,
        pawner,
        drop_point: dropPoint,
      },
      loanRequest: loanRequest || null,
      deliveryRequest: deliveryRequest || null,
      bankAccount,
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error fetching pawn delivery request');
    return sanitizedServerError('ไม่สามารถโหลดข้อมูลจัดส่งได้ กรุณาลองใหม่');
  }
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const body = await readBoundedJsonObject(request) as any;
    const {
      contractId,
      lineId,
      address,
      contactPhone,
      notes,
    } = body || {};

    const safeContractId = requireUuid(contractId);
    const claimedLineId = boundedText(lineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    const safeAddress = {
      houseNo: boundedText(address.houseNo, 100, true) || '',
      village: boundedText(address.village, 100) || undefined,
      street: boundedText(address.street, 180) || undefined,
      subDistrict: boundedText(address.subDistrict, 100) || undefined,
      district: boundedText(address.district, 100) || undefined,
      province: boundedText(address.province, 100) || undefined,
      postcode: boundedText(address.postcode, 10) || undefined,
    };
    const safeContactPhone = boundedText(contactPhone, 20);
    const safeNotes = boundedText(notes, 500);
    releaseLock = await acquireTransactionLock('pawn-delivery-create', safeContractId, 90);

    const supabase = supabaseAdmin();

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id,
        contract_number,
        loan_request_id,
        customer_id,
        drop_point_id,
        items:item_id (brand, model),
        pawners:customer_id (line_id),
        drop_points:drop_point_id (line_id)
      `)
      .eq('contract_id', safeContractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const pawner = Array.isArray(contract.pawners)
      ? contract.pawners[0]
      : contract.pawners;
    const dropPoint = Array.isArray(contract.drop_points)
      ? contract.drop_points[0]
      : contract.drop_points;

    if (pawner?.line_id !== verifiedLineId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const { data: loanRequest } = await supabase
      .from('loan_requests')
      .select('delivery_method, delivery_fee')
      .eq('request_id', contract.loan_request_id)
      .single();

    if (loanRequest?.delivery_method !== 'DELIVERY') {
      return NextResponse.json(
        { error: 'Delivery option not available for this contract' },
        { status: 400 }
      );
    }

    const { data: existingRequest } = await supabase
      .from('pawn_delivery_requests')
      .select('delivery_request_id, status, slip_attempt_count')
      .eq('contract_id', safeContractId)
      .maybeSingle();

    if (
      existingRequest &&
      ['PAYMENT_VERIFIED', 'DRIVER_SEARCH', 'DRIVER_ASSIGNED', 'ITEM_PICKED', 'ARRIVED'].includes(existingRequest.status)
    ) {
      return NextResponse.json(
        { error: 'Delivery request already in progress' },
        { status: 409 }
      );
    }

    const addressFull = buildAddressFull(safeAddress);
    const now = new Date().toISOString();
    const inProgressStatuses = ['DRIVER_SEARCH', 'DRIVER_ASSIGNED', 'ITEM_PICKED', 'ARRIVED'];
    const shouldNotify = !existingRequest || !inProgressStatuses.includes(existingRequest.status);
    const nextStatus = shouldNotify ? 'DRIVER_SEARCH' : existingRequest?.status;

    const payload: any = {
      contract_id: contract.contract_id,
      loan_request_id: contract.loan_request_id,
      customer_id: contract.customer_id,
      drop_point_id: contract.drop_point_id,
      pawner_line_id: verifiedLineId,
      drop_point_line_id: dropPoint?.line_id || null,
      delivery_fee: loanRequest?.delivery_fee ?? 40,
      status: nextStatus,
      address_house_no: safeAddress.houseNo,
      address_village: safeAddress.village || null,
      address_street: safeAddress.street || null,
      address_sub_district: safeAddress.subDistrict || null,
      address_district: safeAddress.district || null,
      address_province: safeAddress.province || null,
      address_postcode: safeAddress.postcode || null,
      address_full: addressFull || null,
      contact_phone: safeContactPhone,
      notes: safeNotes,
      updated_at: now,
    };
    if (shouldNotify) {
      payload.payment_verified_at = now;
    }

    let result;

    if (existingRequest?.delivery_request_id) {
      result = await supabase
        .from('pawn_delivery_requests')
        .update(payload)
        .eq('delivery_request_id', existingRequest.delivery_request_id)
        .select('delivery_request_id')
        .single();
    } else {
      result = await supabase
        .from('pawn_delivery_requests')
        .insert({ ...payload, created_at: now })
        .select('delivery_request_id')
        .single();
    }

    if (result.error || !result.data) {
      console.error('Error saving delivery request');
      return NextResponse.json(
        { error: 'Failed to save delivery request' },
        { status: 500 }
      );
    }

    if (shouldNotify) {
      try {
        await supabase
          .from('contracts')
          .update({
            item_delivery_status: 'PENDING',
            updated_at: now,
          })
          .eq('contract_id', contract.contract_id);
      } catch {
        console.error('Failed to update contract delivery status');
      }

      const item = Array.isArray(contract.items)
        ? contract.items[0]
        : contract.items;
      const itemName = `${[item?.brand, item?.model].filter(Boolean).join(' ') || '-'}`.trim() || '-';

      if (pawnerLineClient) {
        try {
          const card = buildPawnerStatusCard({
            contractNumber: contract.contract_number,
            itemName,
          });
          await pawnerLineClient.pushMessage(verifiedLineId, card);
        } catch {
          console.error('Error sending delivery status to pawner');
        }
      }

      if (dropPoint?.line_id && dropPointLineClient) {
        try {
          const card = buildDropPointPickupCard({
            deliveryRequestId: result.data.delivery_request_id,
            contractNumber: contract.contract_number,
            itemName,
            addressFull: addressFull || '',
            contactPhone: safeContactPhone,
            feeAmount: Number(loanRequest?.delivery_fee ?? 40),
          });
          await dropPointLineClient.pushMessage(dropPoint.line_id, card);
        } catch {
          console.error('Error sending delivery pickup to drop point');
        }
      }
    }

    return NextResponse.json({
      success: true,
      deliveryRequestId: result.data.delivery_request_id,
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = transactionLockErrorResponse(error);
    if (lockError) return lockError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Error creating delivery request');
    return sanitizedServerError('ไม่สามารถสร้างคำขอจัดส่งได้ กรุณาลองใหม่');
  } finally {
    if (releaseLock) await releaseLock();
  }
}
