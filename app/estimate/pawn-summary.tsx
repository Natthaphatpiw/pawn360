'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, MapPin, Phone, ExternalLink } from 'lucide-react';
import axios from 'axios';

interface Branch {
  branch_id: string;
  branch_name: string;
  address: string;
  district: string;
  province: string;
  postal_code: string;
  phone_number: string;
  google_maps_link: string;
  operating_hours: string;
}

interface PawnSummaryProps {
  itemData: {
    itemType: string;
    brand: string;
    model: string;
    capacity?: string;
    condition: number;
    images: string[];
    estimatedPrice: number;
    appleAccessories?: string[];
    processor?: string;
    ram?: string;
    storage?: string;
    gpu?: string;
    lenses?: Array<{ brand: string; model: string }>;
  };
  lineId: string;
  onBack: () => void;
  onSuccess: (loanRequestId: string, itemId: string) => void;
}

export default function PawnSummary({ itemData, lineId, onBack, onSuccess }: PawnSummaryProps) {
  console.log('🎯 PawnSummary component rendered with:', { itemData, lineId });

  const [loanAmount, setLoanAmount] = useState<string>('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('pickup');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [duration, setDuration] = useState<string>('30');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const maxLoanAmount = itemData.estimatedPrice;
  const loanAmountNum = parseFloat(loanAmount.replace(/,/g, '')) || 0;
  const deliveryFee = deliveryMethod === 'delivery' ? 40 : 0;
  const interestRate = 0.04; // 4% per month
  const durationMonths = parseInt(duration) / 30;
  const monthlyInterest = loanAmountNum * interestRate;
  const totalInterest = monthlyInterest * durationMonths;
  const totalRepayment = loanAmountNum + totalInterest + deliveryFee;

  const currentBranch = branches.find(b => b.branch_id === selectedBranchId);

  useEffect(() => {
    checkRegistration();
    fetchBranches();
  }, []);

  const checkRegistration = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/pawners/check?lineId=${lineId}`);

      if (response.data.exists) {
        const status = response.data.pawner.kyc_status;
        setKycStatus(status);
        setIsRegistered(status === 'VERIFIED');
      } else {
        setIsRegistered(false);
        setKycStatus(null);
      }
    } catch (error) {
      console.error('Error checking registration:', error);
      setIsRegistered(false);
      setKycStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await axios.get('/api/drop-points');
      setBranches(response.data.branches || []);
      if (response.data.branches && response.data.branches.length > 0) {
        setSelectedBranchId(response.data.branches[0].branch_id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleLoanAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Remove all non-numeric characters except digits
    const numericValue = value.replace(/[^\d]/g, '');

    if (numericValue === '') {
      setLoanAmount('');
      return;
    }

    const amount = parseInt(numericValue);
    if (amount <= maxLoanAmount) {
      setLoanAmount(numericValue);
    }
  };

  const handleSubmit = async () => {
    console.log('🚀 handleSubmit called in pawn-summary');
    if (!isRegistered || loanAmountNum === 0) {
      console.log('❌ Validation failed:', { isRegistered, loanAmountNum });
      return;
    }

    try {
      setIsSubmitting(true);
      const submissionData = {
        lineId,
        itemData,
        loanAmount: loanAmountNum,
        deliveryMethod,
        deliveryFee,
        branchId: selectedBranchId,
        duration: parseInt(duration),
        interestRate,
        totalInterest,
        totalRepayment,
      };

      const response = await axios.post('/api/loan-request/create', submissionData);

      console.log('📡 API Response:', response.data);

      if (!response.data.loanRequestId || !response.data.itemId) {
        console.error('❌ Missing loanRequestId or itemId in response:', response.data);
        alert('เกิดข้อผิดพลาดในการสร้างคำขอ กรุณาลองใหม่อีกครั้ง');
        return;
      }

      // Call onSuccess callback instead of redirecting directly
      console.log('✅ Calling onSuccess with:', response.data.loanRequestId, response.data.itemId);
      onSuccess(response.data.loanRequestId, response.data.itemId);
    } catch (error) {
      console.error('Error submitting loan request:', error);
      alert('เกิดข้อผิดพลาดในการส่งคำขอ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const draftData = {
        lineId,
        itemData,
        loanAmount: loanAmountNum,
        deliveryMethod,
        branchId: selectedBranchId,
        duration: parseInt(duration),
        status: 'draft',
      };

      await axios.post('/api/loan-request/save-draft', draftData);
      alert('บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleRegister = () => {
    if (kycStatus && kycStatus !== 'VERIFIED') {
      window.location.href = '/ekyc';
    } else {
      window.location.href = '/register';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-white">
        <div className="text-xl text-gray-600">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-8 font-sans">
      {/* 1. Header Section */}
      <div className="bg-[#E5E5E5] px-4 py-3 flex justify-between items-center text-gray-600 text-sm">
        <div>
          <span className="font-bold text-gray-800">สินค้า</span>
          <div className="text-xs text-gray-500">item</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-800">{itemData.brand} {itemData.model}</div>
          <div className="text-xs text-gray-500">สภาพ {Math.round(itemData.condition)}%</div>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto">
        {/* 2. Product Image */}
        <div className="mt-4 mb-6 flex justify-center">
          <div className="relative w-full h-48 bg-gray-100 rounded-2xl overflow-hidden shadow-sm">
            {itemData.images[0] && (
              <img
                src={itemData.images[0]}
                alt={`${itemData.brand} ${itemData.model}`}
                className="w-full h-full object-cover"
              />
            )}
          </div>
        </div>

        {/* 3. AI Estimated Price Card */}
        <div className="bg-[#EBCDBF] rounded-2xl p-6 text-center mb-8 shadow-sm relative overflow-hidden">
          {/* Decorative background circle */}
          <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>

          <h2 className="text-[#C0562F] font-bold text-lg mb-1 relative z-10">ราคาประเมินจาก AI</h2>
          <p className="text-[#C0562F] text-xs mb-4 opacity-80 relative z-10">AI-estimated price</p>

          <div className="text-[#C0562F] text-4xl font-bold mb-4 relative z-10">
            {formatNumber(itemData.estimatedPrice)}
          </div>

          <div className="text-[#C0562F] text-sm opacity-80 relative z-10">บาท</div>
        </div>

        {/* 4. Loan Amount Input */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={loanAmount ? parseInt(loanAmount).toLocaleString('en-US') : ''}
              onChange={handleLoanAmountChange}
              placeholder={maxLoanAmount.toLocaleString('en-US')}
              className="w-full p-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C0562F] text-gray-800 font-bold"
            />
            <span className="absolute right-4 top-4.5 text-gray-400 text-sm">THB</span>
          </div>
          <p className="text-gray-500 text-xs mt-2 text-right">วงเงินสูงสุด {maxLoanAmount.toLocaleString('en-US')} บาท</p>
        </div>

        <div className="h-px bg-gray-200 my-6"></div>

        {/* 5. Delivery Section */}
        <div className="mb-4">
          <label className="block font-bold text-gray-800 mb-2">
            การจัดส่ง*
          </label>
          <div className="relative">
            <select
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value as 'delivery' | 'pickup')}
              className="w-full p-4 pr-10 bg-white border border-gray-300 rounded-xl text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-[#C0562F]"
            >
              <option value="delivery">บริการจัดส่ง (+40บาท)</option>
              <option value="pickup">รับด้วยตัวเอง (Walk-in)</option>
            </select>
            <ChevronDown className="absolute right-4 top-4.5 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>

          <p className="text-[10px] text-gray-500 mt-2 leading-tight">
            *ถ้าอยู่นอกพื้นที่การจัดส่งสามารถเลือก &quot;รับด้วยตัวเอง&quot;<br/>
            แล้วเรียกบริการส่งของด้วยตัวเองได้ หรือติดต่อ &quot;ช่วยเหลือ/Support&quot;
          </p>
        </div>

        {/* Branch Selection & Info Card */}
        <div className="mb-6">
          {/* Branch Dropdown Selector */}
          <div className="mb-2">
            <label className="text-sm font-bold text-gray-700 mb-1 block">เลือกสาขาที่สะดวก</label>
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full p-3 pr-10 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#C0562F]"
              >
                {branches.map(branch => (
                  <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Branch Details Card */}
          {currentBranch && (
            <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-4 text-gray-700 text-sm shadow-sm transition-all duration-300">
              <div className="flex gap-3 mb-2 items-start">
                <MapPin className="w-4 h-4 text-[#C0562F] mt-1 shrink-0" />
                <div>
                  <span className="font-bold block mb-1 text-gray-800">{currentBranch.branch_name}</span>
                  <p className="text-gray-600 leading-relaxed text-xs">
                    {currentBranch.address}, {currentBranch.district}, {currentBranch.province} {currentBranch.postal_code}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mb-3 items-center">
                <Phone className="w-4 h-4 text-[#C0562F] shrink-0" />
                <span className="text-xs text-gray-600">{currentBranch.phone_number}</span>
              </div>

              {/* Google Maps Button */}
              {currentBranch.google_maps_link && (
                <a
                  href={currentBranch.google_maps_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  ดูแผนที่ Google Maps
                </a>
              )}
            </div>
          )}
        </div>

        {/* 6. Pawn Duration */}
        <div className="mb-4 flex items-center gap-2">
          <label className="font-bold text-gray-800 whitespace-nowrap">
            ระยะเวลา*
          </label>
          <span className="bg-[#EAEAEA] text-gray-600 text-[10px] px-2 py-0.5 rounded-full">Duration</span>
          <span className="ml-auto text-gray-500 text-xs">วัน</span>
        </div>
        <div className="relative mb-4">
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full p-4 pr-10 bg-white border border-gray-300 rounded-xl text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-[#C0562F]"
          >
            <option value="15">15 วัน</option>
            <option value="30">30 วัน</option>
            <option value="60">60 วัน</option>
          </select>
          <ChevronDown className="absolute right-4 top-4.5 w-5 h-5 text-gray-400 pointer-events-none" />
        </div>

        {/* 7. Interest */}
        <div className="mb-2 flex items-center gap-2">
          <label className="font-bold text-gray-800 whitespace-nowrap">
            ดอกเบี้ย*
          </label>
          <span className="bg-[#EAEAEA] text-gray-600 text-[10px] px-2 py-0.5 rounded-full">Interest</span>
          <span className="ml-auto text-gray-500 text-xs">บาท</span>
        </div>
        <div className="relative mb-2">
          <input
            type="text"
            value={formatNumber(totalInterest)}
            readOnly
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 focus:outline-none font-medium"
          />
        </div>
        <p className="text-[10px] text-gray-400 mb-8">
          *จำนวนดอกเบี้ยคำนวณจากวงเงินและระยะเวลาที่เลือก
        </p>

        {/* 8. Action Buttons */}
        <div className="space-y-3">
          {/* Continue */}
          <button
            onClick={handleSubmit}
            disabled={!isRegistered || isSubmitting || loanAmountNum === 0}
            className={`w-full rounded-2xl py-3 flex flex-col items-center justify-center shadow-md transition-all active:scale-[0.98] ${
              isRegistered && loanAmountNum > 0
                ? 'bg-[#B85C38] hover:bg-[#A04D2D] text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <span className="text-base font-bold">
              {isSubmitting ? 'กำลังส่งคำขอ...' : 'ดำเนินการต่อ'}
            </span>
            <span className="text-[10px] font-light opacity-90">Continue</span>
          </button>

          {/* Register / Verify - Only show if not verified */}
          {!isRegistered && (
            <button
              onClick={handleRegister}
              className="w-full bg-[#C97C5D] hover:bg-[#B85C38] text-white rounded-2xl py-3 flex flex-col items-center justify-center shadow-sm transition-all active:scale-[0.98]"
            >
              <span className="text-base font-bold">
                {kycStatus ? 'ยืนยันตัวตน' : 'ลงทะเบียน'}
              </span>
              <span className="text-[10px] font-light opacity-90">
                {kycStatus ? 'Verify identity' : 'Register'}
              </span>
            </button>
          )}

          {/* Save Draft */}
          <button
            onClick={handleSaveDraft}
            className="w-full bg-[#F5EBE5] hover:bg-[#EBDDD5] text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors active:scale-[0.98]"
          >
            <span className="text-base font-bold">บันทึกชั่วคราว</span>
            <span className="text-[10px] font-light opacity-80">Save draft</span>
          </button>

          {/* Estimate Another */}
          <button
            onClick={onBack}
            className="w-full bg-white border border-[#B85C38] hover:bg-gray-50 text-[#B85C38] rounded-2xl py-3 flex flex-col items-center justify-center transition-colors active:scale-[0.98]"
          >
            <span className="text-base font-bold">ประเมินสินค้าอื่น</span>
            <span className="text-[10px] font-light opacity-80">Estimate another item</span>
          </button>
        </div>

        {/* Warning message if not registered or not verified */}
        {!isRegistered && (
          <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
            <p className="text-sm text-yellow-800">
              <span className="font-semibold">หมายเหตุ:</span>{' '}
              {kycStatus
                ? 'บัญชีของคุณยังไม่ผ่านการยืนยันตัวตน กรุณายืนยันก่อนทำรายการ'
                : 'คุณยังไม่ได้ลงทะเบียน กรุณาลงทะเบียนก่อนดำเนินการต่อ'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
