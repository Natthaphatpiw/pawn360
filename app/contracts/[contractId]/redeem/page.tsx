'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ChevronLeft, AlertTriangle, Truck, MapPin, Phone, Info } from 'lucide-react';
import axios from 'axios';
import { useLiff } from '@/lib/liff/liff-provider';

interface ContractDetail {
  contract_id: string;
  contract_number: string;
  loan_principal_amount: number;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  remainingAmount: number;
  remainingPrincipal: number;
  remainingInterest: number;
  item: {
    brand: string;
    model: string;
    capacity: string | null;
  };
  investor: {
    investor_id: string;
    firstname: string;
    lastname: string;
    bank_name: string | null;
    bank_account_no: string | null;
    bank_account_name: string | null;
    promptpay_number: string | null;
  } | null;
  drop_point: {
    drop_point_id: string;
    drop_point_name: string;
    phone_number: string;
  } | null;
}

type DeliveryMethod = 'SELF_PICKUP' | 'SELF_ARRANGE' | 'PLATFORM_ARRANGE';

export default function RedemptionPaymentPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const contractId = params.contractId as string;
  const requestType = searchParams.get('type') || 'FULL_REDEMPTION';

  const { profile } = useLiff();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Delivery Options
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('SELF_PICKUP');

  // Address fields (for SELF_ARRANGE or PLATFORM_ARRANGE)
  const [addressHouseNo, setAddressHouseNo] = useState('');
  const [addressVillage, setAddressVillage] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressSubDistrict, setAddressSubDistrict] = useState('');
  const [addressDistrict, setAddressDistrict] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostcode, setAddressPostcode] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Delivery fee
  const DELIVERY_FEE = 40;

  useEffect(() => {
    if (contractId) {
      fetchContractDetail();
    }
  }, [contractId]);

  const fetchContractDetail = async () => {
    try {
      const response = await axios.get(`/api/contracts/detail/${contractId}`);
      if (response.data.success) {
        setContract(response.data.contract);
      }
    } catch (error) {
      console.error('Error fetching contract:', error);
    } finally {
      setLoading(false);
    }
  };

  const getItemName = () => {
    if (!contract) return '';
    if (contract.item.capacity) {
      return `${contract.item.brand} ${contract.item.model} ${contract.item.capacity}`;
    }
    return `${contract.item.brand} ${contract.item.model}`;
  };

  const getTotalAmount = () => {
    if (!contract) return 0;
    let total = contract.remainingAmount;
    if (deliveryMethod === 'PLATFORM_ARRANGE') {
      total += DELIVERY_FEE;
    }
    return total;
  };

  const handleProceedToUpload = async () => {
    if (!acceptedTerms) {
      alert('กรุณายอมรับข้อตกลงก่อนดำเนินการต่อ');
      return;
    }

    if (deliveryMethod !== 'SELF_PICKUP' && !addressHouseNo) {
      alert('กรุณากรอกที่อยู่จัดส่ง');
      return;
    }

    setSubmitting(true);

    try {
      // Create redemption request
      const response = await axios.post('/api/redemptions/create', {
        contractId,
        requestType,
        deliveryMethod,
        deliveryAddress: deliveryMethod !== 'SELF_PICKUP' ? {
          houseNo: addressHouseNo,
          village: addressVillage,
          street: addressStreet,
          subDistrict: addressSubDistrict,
          district: addressDistrict,
          province: addressProvince,
          postcode: addressPostcode,
          contactPhone,
          notes: deliveryNotes,
        } : null,
        principalAmount: contract?.remainingPrincipal || 0,
        interestAmount: contract?.remainingInterest || 0,
        deliveryFee: deliveryMethod === 'PLATFORM_ARRANGE' ? DELIVERY_FEE : 0,
        totalAmount: getTotalAmount(),
        pawnerLineId: profile?.userId,
      });

      if (response.data.success) {
        // Navigate to upload page with redemption ID
        router.push(`/contracts/${contractId}/redeem/upload?redemptionId=${response.data.redemptionId}`);
      }
    } catch (error: any) {
      console.error('Error creating redemption:', error);
      alert(error.response?.data?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const DetailRow = ({ label, value, isTotal = false, highlight = false }: {
    label: string;
    value: string;
    isTotal?: boolean;
    highlight?: boolean;
  }) => (
    <div className="flex justify-between items-center mb-2">
      <div className={`text-gray-700 ${isTotal ? 'font-bold text-base' : 'font-bold text-sm'}`}>
        {label}:
      </div>
      <div className={`text-right ${isTotal ? 'text-[#B85C38] font-bold text-lg' : highlight ? 'text-[#B85C38] font-medium text-sm' : 'text-gray-600 text-sm'}`}>
        {value}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#B85C38]"></div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600">ไม่พบข้อมูลสัญญา</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans flex flex-col">

      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm sticky top-0 z-10">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="flex-1 text-center">
          <h1 className="font-bold text-lg text-gray-800">ไถ่ถอนสินค้า</h1>
          <p className="text-xs text-gray-400">Redemption Payment</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          aria-label="ข้อมูลการไถ่ถอน"
        >
          <Info className="w-5 h-5 text-[#B85C38]" />
        </button>
      </div>

      {showInfoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-xl">
            <h2 className="text-lg font-bold text-gray-800 mb-2">รายละเอียดการไถ่ถอน</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              การไถ่ถอนคือการชำระคืนเงินต้นและดอกเบี้ยทั้งหมดเพื่อปิดสัญญา
              หลังชำระแล้วคุณจะสามารถรับสินค้าคืนได้ตามวิธีที่เลือก
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full bg-[#B85C38] text-white rounded-xl py-3 font-bold hover:bg-[#A04D2D] transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 py-6 pb-36 overflow-y-auto">

        {/* Company Bank Details Section */}
        <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-4">รายละเอียดการโอนเงิน</h2>

            <div className="bg-[#FFF8F5] rounded-2xl p-4 border border-[#F0D4C8]">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600 text-sm">ธนาคาร:</span>
                <span className="font-bold text-gray-800 text-sm">พร้อมเพย์</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 text-sm">เลขบัญชี:</span>
                <span className="font-bold text-[#B85C38] text-sm">0626092941</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 text-sm">ชื่อบัญชี:</span>
                <span className="font-medium text-gray-800 text-sm">ณัฐภัทร ต้อยจัตุรัส</span>
                </div>
                  <div className="flex justify-between pt-2 border-t border-[#F0D4C8]">
                    <span className="text-gray-600 text-sm">PromptPay:</span>
                <span className="font-bold text-[#B85C38] text-sm">0626092941</span>
              </div>
            </div>
            </div>
        </div>

        {/* Payment Details */}
        <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm">
          <h2 className="text-gray-700 font-normal text-sm mb-4">คำขอการไถ่ถอน</h2>

          <DetailRow label="สินค้า" value={getItemName()} />
          <DetailRow label="หมายเลขสัญญา" value={contract.contract_number} />

          <div className="h-px bg-gray-200 my-4"></div>

          <DetailRow label="เงินต้น" value={`${contract.remainingPrincipal.toLocaleString()} บาท`} />
          <DetailRow label="ดอกเบี้ย" value={`${contract.remainingInterest.toLocaleString()} บาท`} />
          {deliveryMethod === 'PLATFORM_ARRANGE' && (
            <DetailRow label="ค่าจัดส่ง" value={`${DELIVERY_FEE.toLocaleString()} บาท`} />
          )}

          <div className="mt-2">
            <DetailRow label="ยอดชำระรวม" value={`${getTotalAmount().toLocaleString()} บาท`} isTotal />
          </div>
        </div>

        {/* Delivery Options */}
        <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm">
          <h2 className="text-base font-bold text-gray-800 mb-4">วิธีการรับสินค้า</h2>

          <div className="space-y-3">
            {/* Option 1: Self Pickup */}
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${deliveryMethod === 'SELF_PICKUP' ? 'border-[#B85C38] bg-[#FFF8F5]' : 'border-gray-200 bg-white'}`}>
              <input
                type="radio"
                name="deliveryMethod"
                value="SELF_PICKUP"
                checked={deliveryMethod === 'SELF_PICKUP'}
                onChange={() => setDeliveryMethod('SELF_PICKUP')}
                className="mt-1 accent-[#B85C38]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#B85C38]" />
                  <span className="font-bold text-gray-800">รับของด้วยตัวเอง</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">ไปรับสินค้าที่ Drop Point ด้วยตนเอง</p>
                {contract.drop_point && (
                  <p className="text-xs text-[#B85C38] mt-2">
                    {contract.drop_point.drop_point_name} - {contract.drop_point.phone_number}
                  </p>
                )}
              </div>
            </label>

            {/* Option 2: Self Arrange Delivery */}
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${deliveryMethod === 'SELF_ARRANGE' ? 'border-[#B85C38] bg-[#FFF8F5]' : 'border-gray-200 bg-white'}`}>
              <input
                type="radio"
                name="deliveryMethod"
                value="SELF_ARRANGE"
                checked={deliveryMethod === 'SELF_ARRANGE'}
                onChange={() => setDeliveryMethod('SELF_ARRANGE')}
                className="mt-1 accent-[#B85C38]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#B85C38]" />
                  <span className="font-bold text-gray-800">เรียกขนส่งเอง</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">เรียกบริการขนส่งไปรับของที่ Drop Point ด้วยตนเอง</p>
              </div>
            </label>

            {/* Option 3: Platform Arrange Delivery */}
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${deliveryMethod === 'PLATFORM_ARRANGE' ? 'border-[#B85C38] bg-[#FFF8F5]' : 'border-gray-200 bg-white'}`}>
              <input
                type="radio"
                name="deliveryMethod"
                value="PLATFORM_ARRANGE"
                checked={deliveryMethod === 'PLATFORM_ARRANGE'}
                onChange={() => setDeliveryMethod('PLATFORM_ARRANGE')}
                className="mt-1 accent-[#B85C38]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#B85C38]" />
                  <span className="font-bold text-gray-800">ให้ Pawnly เรียกขนส่งให้</span>
                  <span className="bg-[#B85C38] text-white text-[10px] px-2 py-0.5 rounded-full">+{DELIVERY_FEE} บาท</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">เราจะเรียกบริการขนส่งไปส่งให้ถึงที่</p>
              </div>
            </label>
          </div>

          {/* Address Form (for delivery options) */}
          {deliveryMethod !== 'SELF_PICKUP' && (
            <div className="mt-6 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm">ที่อยู่จัดส่ง</h3>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="บ้านเลขที่ *"
                  value={addressHouseNo}
                  onChange={(e) => setAddressHouseNo(e.target.value)}
                  className="p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
                />
                <input
                  type="text"
                  placeholder="หมู่บ้าน/คอนโด"
                  value={addressVillage}
                  onChange={(e) => setAddressVillage(e.target.value)}
                  className="p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
                />
              </div>

              <input
                type="text"
                placeholder="ถนน/ซอย"
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="ตำบล/แขวง *"
                  value={addressSubDistrict}
                  onChange={(e) => setAddressSubDistrict(e.target.value)}
                  className="p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
                />
                <input
                  type="text"
                  placeholder="อำเภอ/เขต *"
                  value={addressDistrict}
                  onChange={(e) => setAddressDistrict(e.target.value)}
                  className="p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="จังหวัด *"
                  value={addressProvince}
                  onChange={(e) => setAddressProvince(e.target.value)}
                  className="p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
                />
                <input
                  type="text"
                  placeholder="รหัสไปรษณีย์ *"
                  value={addressPostcode}
                  onChange={(e) => setAddressPostcode(e.target.value)}
                  className="p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
                />
              </div>

              <input
                type="tel"
                placeholder="เบอร์โทรติดต่อ *"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38]"
              />

              <textarea
                placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                rows={2}
                className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#B85C38] resize-none"
              />
            </div>
          )}
        </div>

        {/* Warning Section */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-700 text-sm mb-2">ข้อควรระวัง</h3>
              <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                <li>กรุณาตรวจสอบยอดเงินให้ถูกต้องก่อนโอน</li>
                <li>หากโอนเงิน<strong>เกิน</strong>ยอดที่กำหนด ทางเราจะไม่รับผิดชอบ</li>
                <li>หากโอนเงิน<strong>ขาด</strong>ไม่ตรงตามจำนวน การไถ่ถอนจะเป็นโมฆะ</li>
                <li>ทางเรามีสิทธิ์ปฏิเสธการไถ่ถอนหากยอดไม่ตรง</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Terms Acceptance */}
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 w-5 h-5 accent-[#B85C38] cursor-pointer"
            />
            <span className="text-sm text-gray-700">
              ข้าพเจ้ารับทราบและยอมรับว่าหากโอนเงินเกินหรือขาดไม่ตรงตามจำนวน ทาง Pawnly จะไม่รับผิดชอบใดๆ ทั้งสิ้น และการไถ่ถอนอาจถูกปฏิเสธ
            </span>
          </label>
        </div>

      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F2] border-t border-gray-200">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleProceedToUpload}
            disabled={!acceptedTerms || submitting}
            className={`w-full py-4 rounded-2xl flex flex-col items-center justify-center shadow-lg transition-all active:scale-[0.98] ${
              acceptedTerms && !submitting
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <span className="text-base font-bold">ดำเนินการต่อ</span>
                <span className="text-xs font-light opacity-80">Proceed to upload slip</span>
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}
