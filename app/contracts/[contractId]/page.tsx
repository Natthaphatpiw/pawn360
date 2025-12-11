'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import axios from 'axios';

interface Customer {
  customer_id: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  national_id: string;
}

interface Investor {
  investor_id: string;
  firstname: string;
  lastname: string;
  phone_number: string;
}

interface Item {
  item_id: string;
  item_type: string;
  brand: string;
  model: string;
  capacity: string | null;
  serial_number: string | null;
  estimated_value: number;
  item_condition: number;
  accessories: string | null;
  defects: string | null;
  notes: string | null;
  image_urls: string[];
}

interface DropPoint {
  drop_point_id: string;
  drop_point_name: string;
  drop_point_code: string;
  phone_number: string;
  addr_house_no: string;
  addr_street: string;
  addr_sub_district: string;
  addr_district: string;
  addr_province: string;
  addr_postcode: string;
  google_map_url: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface ContractDetail {
  contract_id: string;
  contract_number: string;
  contract_start_date: string;
  contract_end_date: string;
  contract_duration_days: number;
  loan_principal_amount: number;
  interest_rate: number;
  interest_amount: number;
  total_amount: number;
  amount_paid: number;
  interest_paid: number;
  principal_paid: number;
  contract_status: string;
  funding_status: string;
  contract_file_url: string | null;
  customer: Customer;
  investor: Investor | null;
  item: Item;
  drop_point: DropPoint | null;
  remainingDays: number;
  displayStatus: string;
  remainingAmount: number;
  remainingPrincipal: number;
  remainingInterest: number;
}

type ModalType = 'redeem' | 'interest' | 'decrease' | 'increase' | null;

export default function PawnContractDetail() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.contractId as string;

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalStep, setModalStep] = useState(1);
  const [decreaseAmount, setDecreaseAmount] = useState('');
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [payInterestSeparately, setPayInterestSeparately] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState('delivery');

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
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      setError('ไม่พบข้อมูลสัญญา');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear() + 543;
    return `${day}/${month}/${year}`;
  };

  const formatNationalId = (id: string) => {
    if (!id || id.length !== 13) return id;
    return `${id[0]}-${id.substring(1, 5)}-${id.substring(5, 10)}-${id.substring(10, 12)}-${id[12]}`;
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return phone;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }
    return phone;
  };

  const openModal = (modalType: ModalType) => {
    setActiveModal(modalType);
    setModalStep(1);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalStep(1);
    setDecreaseAmount('');
    setIncreaseAmount('');
    setPayInterestSeparately(false);
    setDeliveryMethod('delivery');
  };

  const nextStep = () => {
    setModalStep(2);
  };

  const InfoRow = ({ label, value, valueColor = 'text-gray-600', isBoldValue = false }: {
    label: string;
    value: string | number;
    valueColor?: string;
    isBoldValue?: boolean;
  }) => (
    <div className="flex justify-between items-start mb-2">
      <div className="font-bold text-gray-800 text-sm w-1/3">{label}</div>
      <div className={`text-right w-2/3 text-sm ${valueColor} ${isBoldValue ? 'font-medium' : ''}`}>{value}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C0562F]"></div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error || 'ไม่พบข้อมูลสัญญา'}</p>
        </div>
      </div>
    );
  }

  const getItemName = () => {
    if (contract.item.capacity) {
      return `${contract.item.brand} ${contract.item.model} ${contract.item.capacity}`;
    }
    return `${contract.item.brand} ${contract.item.model}`;
  };

  return (
    <div className="min-h-screen bg-[#F2F2F2] font-sans relative flex flex-col">

      {/* ================= HEADER ================= */}
      <div className="bg-white px-4 py-3 flex justify-between items-center shadow-sm z-10 sticky top-0">
        <ChevronLeft
          className="w-6 h-6 text-gray-800 cursor-pointer"
          onClick={() => router.back()}
        />
        <div className="text-center">
          <h1 className="font-bold text-lg text-gray-800">รายการจำนำ</h1>
          <p className="text-xs text-gray-400">pawn360.com</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border border-gray-400 rounded flex items-center justify-center text-[10px] font-bold text-gray-600">
            1
          </div>
          <X
            className="w-6 h-6 text-gray-800 cursor-pointer"
            onClick={() => router.push('/contracts')}
          />
        </div>
      </div>

      <div className="p-4 pb-20 overflow-y-auto">

        {/* ================= MODALS ================= */}

        {/* 1. Modal: ต่อดอกเบี้ย (Pay Interest) */}
        {activeModal === 'interest' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-fade-in shadow-xl relative">

              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                  <span className="text-4xl text-[#C0562F] font-bold">!</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-800">ยืนยันรายการต่อดอกเบี้ย</h3>
              <p className="text-xs text-gray-500 mb-2 font-light">Confirm Interest rate extension</p>

              <p className="text-[#C0562F] font-bold text-sm mb-4">
                ยอดชำระรวม {contract.remainingInterest.toLocaleString()} Baht
              </p>

              <p className="text-[10px] text-red-500 mb-6 px-4 leading-relaxed font-light">
                เมื่อกดยืนยันแล้วกรุณารอการยืนยันจากร้าน<br />
                เมื่อร้านยืนยันแล้วข้อมูลการชำระเงินจะอยู่หน้าแรก
              </p>

              <div className="space-y-3">
                <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                  ยืนยัน
                </button>
                <button
                  onClick={closeModal}
                  className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Modal: ลดเงินต้น (Decrease Loan) */}
        {activeModal === 'decrease' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-fade-in shadow-xl relative">

              {modalStep === 1 && (
                <>
                  <div className="flex items-center gap-2 mb-6 text-left">
                    <h3 className="text-lg font-bold text-gray-800">ลดเงินต้น</h3>
                    <span className="bg-gray-200 text-gray-500 text-[10px] px-2 py-0.5 rounded-md font-medium">Decrease loan</span>
                  </div>

                  <div className="mb-6 text-left">
                    <label className="text-xs font-bold text-gray-800 block mb-2">
                      ระบุจำนวนเงินต้นที่ต้องการลด(บาท)
                    </label>
                    <input
                      type="text"
                      value={decreaseAmount}
                      onChange={(e) => setDecreaseAmount(e.target.value)}
                      placeholder="0"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800 font-medium text-sm"
                    />
                    <p className="text-[10px] text-gray-500 mt-1 font-light">
                      เงินต้นปัจจุบัน {contract.remainingPrincipal.toLocaleString()} บาท
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={nextStep}
                      className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors"
                    >
                      ถัดไป
                    </button>
                    <button
                      onClick={closeModal}
                      className="w-full bg-white border border-[#C0562F] text-[#C0562F] rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </>
              )}

              {modalStep === 2 && (
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                      <span className="text-4xl text-[#C0562F] font-bold">!</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-800">ยืนยันการลดเงินต้น</h3>
                  <p className="text-xs text-gray-500 mb-2 font-light">Confirm principal reduction</p>

                  <p className="text-[#C0562F] font-bold text-sm mb-4">
                    ยอดชำระรวม {(parseFloat(decreaseAmount.replace(/,/g, '')) || 0).toLocaleString()} Baht
                  </p>

                  <p className="text-[10px] text-red-500 mb-6 px-4 leading-relaxed font-light">
                    เมื่อกดยืนยันแล้วกรุณารอการร้านยืนยัน<br />
                    เมื่อร้านยืนยันแล้วข้อมูลการชำระเงินจะอยู่หน้าแรก
                  </p>

                  <div className="space-y-3">
                    <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                      ยืนยัน
                    </button>
                    <button
                      onClick={closeModal}
                      className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Modal: ไถ่ถอน (Redeem) */}
        {activeModal === 'redeem' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 text-center animate-fade-in shadow-xl relative">

              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full border-4 border-[#B85C38] flex items-center justify-center">
                  <span className="text-4xl text-[#B85C38] font-bold">!</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-800">ยืนยันการไถ่ถอน</h3>
              <p className="text-xs text-gray-500 mb-2 font-light">Confirm redemption</p>
              <p className="text-[#B85C38] font-bold text-sm mb-4">
                ยอดชำระรวม {contract.remainingAmount.toLocaleString()} Baht
              </p>

              <p className="text-[10px] text-gray-500 mb-6 px-4 leading-relaxed font-light">
                เมื่อกดยืนยันคุณจะเข้าสู่หน้ารายละเอียดการโอนเงิน<br />
                กรุณาตรวจสอบยอดให้ถูกต้องก่อนทำรายการ
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => router.push(`/contracts/${contractId}/redeem?type=FULL_REDEMPTION`)}
                  className="w-full bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors"
                >
                  ดำเนินการต่อ
                </button>
                <button
                  onClick={closeModal}
                  className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Modal: เพิ่มเงินต้น (Increase Loan) */}
        {activeModal === 'increase' && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-fade-in shadow-xl relative">

              {modalStep === 1 && (
                <>
                  <div className="flex items-center gap-2 mb-6 text-left">
                    <h3 className="text-lg font-bold text-gray-800">เพิ่มเงินต้น</h3>
                    <span className="bg-gray-200 text-gray-500 text-[10px] px-2 py-0.5 rounded-md font-medium">Increase loan</span>
                  </div>

                  <div className="mb-4 text-left">
                    <label className="text-xs font-bold text-gray-800 block mb-2">
                      ระบุจำนวนเงินต้นที่ต้องการเพิ่ม(บาท)
                    </label>
                    <input
                      type="text"
                      value={increaseAmount}
                      onChange={(e) => setIncreaseAmount(e.target.value)}
                      placeholder="0"
                      className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#C0562F] text-gray-800 font-medium text-sm"
                    />
                    <p className="text-[10px] text-gray-500 mt-1 font-light">
                      ยอดสูงสุดไม่เกิน {(contract.item.estimated_value - contract.loan_principal_amount).toLocaleString()} บาท
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mb-6 text-left">
                    <input
                      type="checkbox"
                      id="pay-interest"
                      checked={payInterestSeparately}
                      onChange={(e) => setPayInterestSeparately(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 accent-[#C0562F] cursor-pointer"
                    />
                    <label htmlFor="pay-interest" className="text-xs text-gray-600 cursor-pointer">
                      ต้องการชำระดอกเบี้ยแยกต่างหาก
                    </label>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={nextStep}
                      className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors"
                    >
                      ถัดไป
                    </button>
                    <button
                      onClick={closeModal}
                      className="w-full bg-white border border-[#C0562F] text-[#C0562F] rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </>
              )}

              {modalStep === 2 && (
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full border-4 border-[#C0562F] flex items-center justify-center">
                      <span className="text-4xl text-[#C0562F] font-bold">!</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-gray-800">ยืนยันการเพิ่มเงินต้น</h3>
                  <p className="text-xs text-gray-500 mb-2 font-light">Confirm principal increase</p>

                  <div className="my-4">
                    <p className="text-gray-700 text-sm font-medium">
                      ยอดที่ขอเพิ่มไป {(parseFloat(increaseAmount.replace(/,/g, '')) || 0).toLocaleString()} Baht
                    </p>
                    {payInterestSeparately && (
                      <p className="text-[#C0562F] font-bold text-sm">
                        ยอดชำระดอกเบี้ย {contract.remainingInterest.toLocaleString()} Baht
                      </p>
                    )}
                  </div>

                  <p className="text-[10px] text-red-500 mb-6 px-4 leading-relaxed font-light">
                    เมื่อกดยืนยันแล้วกรุณารอการร้านยืนยัน<br />
                    เมื่อร้านยืนยันแล้วโปรดเข้าไปทำรายการต่อที่หน้าร้าน
                  </p>

                  <div className="space-y-3">
                    <button className="w-full bg-[#C0562F] hover:bg-[#A04D2D] text-white rounded-full py-3 font-bold text-sm shadow-sm transition-colors">
                      ยืนยัน
                    </button>
                    <button
                      onClick={closeModal}
                      className="w-full bg-white border border-gray-300 text-gray-500 rounded-full py-3 font-bold text-sm hover:bg-gray-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= MAIN CONTENT ================= */}

        {/* 1. Customer Info Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-3">ข้อมูลลูกค้า</h2>
          <div className="space-y-2">
            <InfoRow
              label="ชื่อ"
              value={`${contract.customer.firstname} ${contract.customer.lastname}`}
            />
            <InfoRow
              label="เลขบัตรประชาชน"
              value={formatNationalId(contract.customer.national_id)}
            />
            <InfoRow
              label="เบอร์มือถือ"
              value={formatPhoneNumber(contract.customer.phone_number)}
            />
          </div>
          <div className="h-px bg-gray-200 my-4"></div>
        </div>

        {/* 2. Contract Details Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-3">รายละเอียดสัญญา</h2>
          <div className="space-y-2">
            <InfoRow label="หมายเลขสัญญา" value={contract.contract_number} />
            <InfoRow label="สินค้า" value={getItemName()} />
            <InfoRow
              label="สถานะ"
              value={contract.displayStatus}
              valueColor="text-[#7CAB4A]"
              isBoldValue
            />
            <InfoRow label="มูลค่า" value={`${contract.loan_principal_amount.toLocaleString()} บาท`} />
            <InfoRow
              label="ดอกเบี้ย"
              value={`${contract.interest_amount.toLocaleString()} บาท (${(contract.interest_rate * 100).toFixed(2)}%)`}
            />
            <InfoRow label="ระยะเวลา" value={`${contract.contract_duration_days} วัน`} />
            <InfoRow label="วันเริ่มต้น" value={formatDate(contract.contract_start_date)} />
            <InfoRow label="วันสิ้นสุด" value={formatDate(contract.contract_end_date)} />
            {contract.investor && (
              <InfoRow
                label="ชื่อคู่สัญญา"
                value={`${contract.investor.firstname} ${contract.investor.lastname}`}
              />
            )}
          </div>
          <div className="h-px bg-gray-200 my-4"></div>
        </div>

        {/* 3. Remarks */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-1">หมายเหตุ</h2>
          <p className="text-gray-600 text-sm">
            {contract.item.notes || contract.item.defects || 'ไม่มี'}
          </p>
        </div>

        {/* 4. Remaining Days Card */}
        <div className="bg-[#EBCDBF] rounded-2xl p-6 mb-6 flex justify-between items-center text-[#B85C38] relative overflow-hidden shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-[#EBCDBF] via-[#EBCDBF] to-[#E6C2B0]"></div>

          <div className="relative z-10">
            <div className="font-bold text-lg mb-1">ระยะเวลาคงเหลือ</div>
            <div className="text-xs opacity-80 font-light">Remaining days</div>
          </div>

          <div className="relative z-10 text-right flex flex-col items-end">
            <div className="text-xs opacity-80 mb-0 font-light">วัน</div>
            <div className="text-5xl font-bold leading-none tracking-tight">
              {contract.remainingDays > 0 ? contract.remainingDays : 0}
            </div>
          </div>
        </div>

        {/* 5. Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => openModal('redeem')}
            className="bg-[#7CAB4A] hover:bg-[#689F38] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ไถ่ถอน</span>
            <span className="text-[10px] font-light opacity-90">Redeem</span>
          </button>

          <button
            onClick={() => openModal('interest')}
            className="bg-[#B85C38] hover:bg-[#A04D2D] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ต่อดอกเบี้ย</span>
            <span className="text-[10px] font-light opacity-90">Pay interest</span>
          </button>

          <button
            onClick={() => openModal('decrease')}
            className="bg-[#F4B95F] hover:bg-[#E0A850] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">ลดเงินต้น</span>
            <span className="text-[10px] font-light opacity-90">Decrease loan</span>
          </button>

          <button
            onClick={() => openModal('increase')}
            className="bg-[#E56363] hover:bg-[#D35252] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-sm font-bold">เพิ่มเงินต้น</span>
            <span className="text-[10px] font-light opacity-90">Increase loan</span>
          </button>
        </div>

        {/* 6. Bottom Outline Buttons */}
        <div className="space-y-3">
          {contract.drop_point && contract.drop_point.google_map_url && (
            <button
              onClick={() => window.open(contract.drop_point!.google_map_url!, '_blank')}
              className="w-full bg-white border border-[#B85C38] hover:bg-gray-50 text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98]"
            >
              <span className="text-sm font-bold">ที่ตั้ง Drop point</span>
            </button>
          )}

          {contract.contract_file_url && (
            <button
              onClick={() => window.open(contract.contract_file_url!, '_blank')}
              className="w-full bg-white border border-[#B85C38] hover:bg-gray-50 text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center transition-transform active:scale-[0.98]"
            >
              <span className="text-sm font-bold">ดูสัญญา</span>
              <span className="text-[10px] opacity-80 font-light">See contract</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
