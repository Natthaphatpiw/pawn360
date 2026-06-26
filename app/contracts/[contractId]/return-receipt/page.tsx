'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, PackageCheck, QrCode } from 'lucide-react';
import { isPreviewMode, withPreview } from '../_lib/preview';

interface ReturnReceipt {
  contract: {
    contract_number: string;
    contract_start_date: string | null;
    contract_end_date: string | null;
    customer: {
      firstname: string | null;
      lastname: string | null;
      phone_number: string | null;
      national_id: string | null;
      addr_house_no?: string | null;
      addr_village?: string | null;
      addr_street?: string | null;
      addr_sub_district?: string | null;
      addr_district?: string | null;
      addr_province?: string | null;
      addr_postcode?: string | null;
    } | null;
    item: {
      brand: string | null;
      model: string | null;
      capacity: string | null;
      serial_number: string | null;
      estimated_value: number | null;
    } | null;
    drop_point: {
      drop_point_name: string | null;
      phone_number: string | null;
      addr_house_no?: string | null;
      addr_street?: string | null;
      addr_sub_district?: string | null;
      addr_district?: string | null;
      addr_province?: string | null;
      addr_postcode?: string | null;
    } | null;
  };
  redemption: {
    redemption_id: string;
    delivery_method: string | null;
    delivery_fee: number | null;
    request_status: string | null;
    created_at: string | null;
    updated_at: string | null;
  } | null;
  qrCodeDataUrl: string;
  returnUrl: string;
  returnMethodLabel: string;
  bagNumber: string | null;
  bagAssignedAt: string | null;
  storageBoxCode: string | null;
}

export default function ReturnReceiptPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const previewMode = isPreviewMode(searchParams);
  const queryRedemptionId = searchParams.get('redemptionId');
  const queryDeliveryMethod = searchParams.get('deliveryMethod');

  const [receipt, setReceipt] = useState<ReturnReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        const receiptParams = new URLSearchParams();
        if (queryDeliveryMethod) receiptParams.set('deliveryMethod', queryDeliveryMethod);
        const queryString = receiptParams.toString();
        const response = await axios.get(`/api/return-receipts/${contractId}${queryString ? `?${queryString}` : ''}`);
        if (!response.data.success) {
          throw new Error('Return receipt unavailable');
        }
        setReceipt(response.data.receipt);
      } catch (err: any) {
        console.error('Error loading return receipt:', err);
        setError(err.response?.data?.error || 'ไม่สามารถโหลดใบรับของได้');
      } finally {
        setLoading(false);
      }
    };

    if (contractId) {
      fetchReceipt();
    }
  }, [contractId, queryDeliveryMethod]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAddress = (parts: Array<string | null | undefined>) => {
    const address = parts.filter(Boolean).join(' ');
    return address || '-';
  };

  const itemName = receipt?.contract.item
    ? [receipt.contract.item.brand, receipt.contract.item.model, receipt.contract.item.capacity].filter(Boolean).join(' ')
    : '-';
  const customerName = receipt?.contract.customer
    ? [receipt.contract.customer.firstname, receipt.contract.customer.lastname].filter(Boolean).join(' ')
    : '-';
  const isSelfPickup = ['DROPPOINT_SELF_PICKUP', 'CENTRAL_SCHEDULE_7D', 'CENTRAL_SELF_PICKUP_TODAY', 'SELF_PICKUP']
    .includes(String(receipt?.redemption?.delivery_method || ''));
  const isCentralPickup = receipt?.redemption?.delivery_method === 'CENTRAL_SELF_PICKUP_TODAY';
  const evidenceRedemptionId = queryRedemptionId || receipt?.redemption?.redemption_id || `preview-redeem-${contractId}`;
  const evidenceUploadUrl = previewMode
    ? withPreview(`/contracts/${contractId}/redeem/receipt`, 'redemptionId', evidenceRedemptionId)
    : `/contracts/${contractId}/redeem/receipt?redemptionId=${encodeURIComponent(evidenceRedemptionId)}`;

  const InfoRow = ({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) => (
    <div className={`flex min-w-0 justify-between gap-3 border-b border-primary-border/60 py-2 last:border-b-0 ${wrap ? 'items-start' : 'items-center'}`}>
      <span className="shrink-0 text-sm text-foreground-muted">{label}</span>
      <span className={`min-w-0 text-right text-sm font-semibold text-foreground ${wrap ? 'whitespace-normal break-words' : 'truncate whitespace-nowrap'}`}>
        {value}
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-background-white px-4 py-8">
        <div className="mx-auto max-w-md rounded-2xl border border-error-border bg-error-soft p-6 text-center text-error">
          <p className="font-bold">โหลดใบรับของไม่สำเร็จ</p>
          <p className="mt-2 text-sm">{error || 'ไม่พบข้อมูลใบรับของ'}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-5 rounded-full border border-error px-5 py-2 text-sm font-semibold"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const dropPointAddress = formatAddress([
    receipt.contract.drop_point?.addr_house_no,
    receipt.contract.drop_point?.addr_street,
    receipt.contract.drop_point?.addr_sub_district,
    receipt.contract.drop_point?.addr_district,
    receipt.contract.drop_point?.addr_province,
    receipt.contract.drop_point?.addr_postcode,
  ]);
  const customerAddress = formatAddress([
    receipt.contract.customer?.addr_house_no,
    receipt.contract.customer?.addr_village,
    receipt.contract.customer?.addr_street,
    receipt.contract.customer?.addr_sub_district,
    receipt.contract.customer?.addr_district,
    receipt.contract.customer?.addr_province,
    receipt.contract.customer?.addr_postcode,
  ]);

  return (
    <div className="min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto max-w-md">

        {/* <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-border bg-background-white px-4 py-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </button> */}

        <div className="overflow-hidden rounded-[28px] border border-primary-border bg-primary-soft shadow-soft">
          <div className="bg-primary px-5 py-6 text-primary-fg">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-background-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]">
              Return Receipt
            </div>
            <h1 className="text-3xl font-bold">รับของคืน</h1>
            <p className="mt-1 text-sm opacity-90">ใบรับของสำหรับสัญญา {receipt.contract.contract_number}</p>
          </div>

          <div className="space-y-4 p-4">
            <div className="rounded-lg bg-background-white p-4 pt-6 text-center">
              {/* <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <QrCode className="h-5 w-5" />
              </div> */}
              <img
                src={receipt.qrCodeDataUrl}
                alt="Return receipt QR code"
                className="mx-auto h-48 w-48 rounded-2xl border border-primary-border bg-white p-2"
              />
              <p className="mt-3 text-xs leading-relaxed text-foreground-subtle">
                แสดง QR นี้ให้เจ้าหน้าที่เมื่อต้องรับสินค้าคืน
              </p>
              {!isSelfPickup && (
                <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                  วิธีนี้ไม่ใช่การรับด้วยตัวเอง QR ใช้สำหรับอ้างอิงรายการเท่านั้น
                </p>
              )}
            </div>

            <div className="rounded-2xl bg-background-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-primary" />
                <h2 className="font-bold text-foreground">รายละเอียดการรับคืน</h2>
              </div>
              <InfoRow label="วิธีรับของ" value={receipt.returnMethodLabel} />
              <InfoRow label="หมายเลขถุง/กล่อง" value={receipt.bagNumber || '-'} />
              <InfoRow label="ช่องเก็บของ" value={receipt.storageBoxCode || '-'} />
              <InfoRow label="ค่าบริการรับคืน" value={`${Number(receipt.redemption?.delivery_fee || 0).toLocaleString()} บาท`} />
              <InfoRow label="วันที่สร้างคำขอ" value={formatDate(receipt.redemption?.created_at)} />
            </div>

            <div className="rounded-2xl bg-background-white p-4">
              <h2 className="mb-3 font-bold text-foreground">ข้อมูลผู้ขอสินเชื่อ</h2>
              <InfoRow label="ชื่อ" value={customerName || '-'} />
              <InfoRow label="เลขบัตรประชาชน" value={receipt.contract.customer?.national_id || '-'} />
              <InfoRow label="เบอร์โทร" value={receipt.contract.customer?.phone_number || '-'} />
              <InfoRow label="ที่อยู่" value={customerAddress} wrap />
            </div>

            <div className="rounded-2xl bg-background-white p-4">
              <h2 className="mb-3 font-bold text-foreground">ข้อมูลสินค้า</h2>
              <InfoRow label="สินค้า" value={itemName || '-'} />
              <InfoRow label="Serial No." value={receipt.contract.item?.serial_number || '-'} />
              <InfoRow label="มูลค่าประเมิน" value={`${Number(receipt.contract.item?.estimated_value || 0).toLocaleString()} บาท`} />
              <InfoRow label="วันเริ่มสัญญา" value={formatDate(receipt.contract.contract_start_date)} />
              <InfoRow label="วันสิ้นสุดสัญญา" value={formatDate(receipt.contract.contract_end_date)} />
            </div>

            <div className="rounded-2xl bg-background-white p-4">
              <h2 className="mb-3 font-bold text-foreground">สถานที่รับของ</h2>
              {isCentralPickup ? (
                <>
                  <InfoRow label="สถานที่" value="คลังกลาง Astly" />
                  <InfoRow label="รายละเอียด" value="เจ้าหน้าที่ Astly จะแจ้งจุดรับและเวลานัดหมาย" />
                </>
              ) : (
                <>
                  <InfoRow label="Drop Point" value={receipt.contract.drop_point?.drop_point_name || '-'} />
                  <InfoRow label="เบอร์โทร" value={receipt.contract.drop_point?.phone_number || '-'} />
                  <InfoRow label="ที่อยู่" value={dropPointAddress} wrap />
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push(evidenceUploadUrl)}
              className="btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] flex w-full min-h-14 flex-col items-center justify-center rounded-full px-4 py-3 text-primary-fg"
            >
              <span className="text-sm font-medium">ส่งหลักฐานเมื่อได้รับสินค้าแล้ว</span>
              <span className="text-xs font-light opacity-90">Upload received evidence</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
