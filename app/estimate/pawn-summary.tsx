'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, MapPin, Phone, ExternalLink } from 'lucide-react';
import axios from 'axios';
import MapEmbed from '@/components/MapEmbed';
import { haversineDistanceMeters } from '@/lib/services/geo';

const SERIAL_OPTIONAL_TYPES = new Set([
  'อุปกรณ์เสริมโทรศัพท์',
  'กล้อง',
  'อุปกรณ์คอมพิวเตอร์',
]);

const isSerialRequiredForType = (itemType?: string) => {
  if (!itemType) return false;
  return !SERIAL_OPTIONAL_TYPES.has(itemType);
};

interface Branch {
  branch_id: string;
  branch_name: string;
  address: string;
  district: string;
  province: string;
  postal_code: string;
  latitude?: number | null;
  longitude?: number | null;
  phone_number: string;
  google_maps_link: string;
  map_embed?: string | null;
  operating_hours: string;
}

interface PawnSummaryProps {
  itemData: {
    itemType: string;
    brand: string;
    model: string;
    capacity?: string;
    color?: string;
    screenSize?: string;
    watchSize?: string;
    watchConnectivity?: string;
    serialNo?: string;
    condition: number;
    aiConditionScore?: number;
    aiConditionReason?: string;
    images: string[];
    estimatedPrice: number;
    aiConfidence?: number;
    appleAccessories?: string[];
    processor?: string;
    ram?: string;
    storage?: string;
    gpu?: string;
    lenses?: Array<{ brand: string; model: string }>;
    defects?: string;
    notes?: string;
  };
  lineId: string;
  onBack: () => void;
  onSuccess: (loanRequestId: string, itemId: string) => void;
}

export default function PawnSummary({ itemData, lineId, onBack, onSuccess }: PawnSummaryProps) {
  console.log('🎯 PawnSummary component rendered with:', { itemData, lineId });

  const [loanAmount, setLoanAmount] = useState<string>('');
  const [serialNo, setSerialNo] = useState<string>(itemData.serialNo || '');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('pickup');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [defaultBranchId, setDefaultBranchId] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>('30');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryEligible, setDeliveryEligible] = useState<boolean | null>(null);
  const [deliveryLocationRequested, setDeliveryLocationRequested] = useState(false);
  const [suggestedBranch, setSuggestedBranch] = useState<{
    branch_id: string;
    branch_name: string;
    distance_m?: number;
  } | null>(null);

  const maxLoanAmount = itemData.estimatedPrice;
  const loanAmountNum = parseFloat(loanAmount.replace(/,/g, '')) || 0;
  const deliveryFee = deliveryMethod === 'delivery' ? 40 : 0;
  const MAX_DELIVERY_DISTANCE_KM = 10;
  const interestRateTotal = 0.03; // total 3% per month
  const interestRatePawner = 0.02; // interest portion 2%
  const feeRate = 0.01; // fee portion 1%
  const durationMonths = parseInt(duration) / 30;
  const interestAmount = loanAmountNum * interestRatePawner * durationMonths;
  const feeAmount = loanAmountNum * feeRate * durationMonths;
  const totalInterest = interestAmount + feeAmount;
  const totalRepayment = loanAmountNum + totalInterest + deliveryFee;

  const currentBranch = branches.find(b => b.branch_id === selectedBranchId);

  const getBranchDistanceKm = (
    origin: { latitude: number; longitude: number },
    branch?: Branch | null
  ) => {
    if (!branch || branch.latitude == null || branch.longitude == null) return null;
    const distanceMeters = haversineDistanceMeters(origin, {
      latitude: Number(branch.latitude),
      longitude: Number(branch.longitude),
    });
    return Math.round((distanceMeters / 1000) * 10) / 10;
  };

  useEffect(() => {
    checkRegistration();
    fetchBranches();
  }, []);

  useEffect(() => {
    if (!branches.length) return;
    if (selectedBranchId) return;
    if (defaultBranchId && branches.find(b => b.branch_id === defaultBranchId)) {
      setSelectedBranchId(defaultBranchId);
    }
  }, [branches, defaultBranchId, selectedBranchId]);

  useEffect(() => {
    if (deliveryMethod !== 'delivery') {
      setDeliveryError(null);
      setDeliveryDistanceKm(null);
      setDeliveryEligible(null);
      return;
    }

    if (!deliveryLocationRequested && !userLocation) {
      setDeliveryLocationRequested(true);
      handleUseLocation({ setDefault: false, context: 'delivery' });
      return;
    }

    if (userLocation && currentBranch) {
      const distanceKm = getBranchDistanceKm(userLocation, currentBranch);
      setDeliveryDistanceKm(distanceKm);
      if (distanceKm != null) {
        setDeliveryEligible(distanceKm <= MAX_DELIVERY_DISTANCE_KM);
        if (distanceKm > MAX_DELIVERY_DISTANCE_KM) {
          setDeliveryError('ตำแหน่งของคุณอยู่นอกระยะบริการจัดส่ง (เกิน 10 กม.)');
        } else {
          setDeliveryError(null);
        }
      }
    }
  }, [deliveryMethod, userLocation, currentBranch, deliveryLocationRequested]);

  const checkRegistration = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/pawners/check?lineId=${lineId}`);

      if (response.data.exists) {
        const status = response.data.pawner.kyc_status;
        setKycStatus(status);
        setIsRegistered(status === 'VERIFIED');
        setDefaultBranchId(response.data.pawner.default_drop_point_id || null);
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
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const handleBranchChange = async (branchId: string) => {
    setSelectedBranchId(branchId);
    if (!lineId) return;
    try {
      await axios.post('/api/pawners/default-branch', {
        lineId,
        branchId,
        source: 'manual',
      });
    } catch (error) {
      console.warn('Failed to set default branch:', error);
    }
  };

  const handleUseLocation = (options?: { setDefault?: boolean; context?: 'manual' | 'delivery' }) => {
    if (!lineId) {
      setLocationMessage('ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage('อุปกรณ์นี้ไม่รองรับการใช้งานตำแหน่ง');
      return;
    }

    setIsLocating(true);
    setLocationMessage(null);
    const setDefault = options?.setDefault ?? true;
    const context = options?.context ?? 'manual';

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserLocation(currentLocation);
          const response = await axios.post('/api/pawners/location', {
            lineId,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: position.coords.accuracy,
            source: 'liff_geolocation',
            setDefault,
          });

          const suggested = response.data?.suggestedBranch || null;
          if (context === 'manual') {
            setSuggestedBranch(suggested);
            if (suggested?.branch_id) {
              setSelectedBranchId(suggested.branch_id);
              setDefaultBranchId(suggested.branch_id);
              setLocationMessage(`แนะนำสาขา ${suggested.branch_name} ให้แล้ว`);
            } else {
              setLocationMessage('ไม่พบสาขาใกล้เคียง กรุณาเลือกเอง');
            }
          } else if (context === 'delivery') {
            const distanceKm = getBranchDistanceKm(currentLocation, currentBranch);
            setDeliveryDistanceKm(distanceKm);
            if (distanceKm != null) {
              setDeliveryEligible(distanceKm <= MAX_DELIVERY_DISTANCE_KM);
              setDeliveryError(
                distanceKm > MAX_DELIVERY_DISTANCE_KM
                  ? 'ตำแหน่งของคุณอยู่นอกระยะบริการจัดส่ง (เกิน 10 กม.)'
                  : null
              );
              setLocationMessage('ตรวจสอบระยะทางสำหรับบริการจัดส่งแล้ว');
            } else {
              setLocationMessage('ไม่พบพิกัดสาขา กรุณาเลือกสาขาอื่น');
            }
          }
        } catch (error) {
          console.error('Location save error:', error);
          setLocationMessage('บันทึกตำแหน่งไม่สำเร็จ กรุณาเลือกสาขาเอง');
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setIsLocating(false);
        setLocationMessage('ไม่สามารถดึงตำแหน่งได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    );
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
    const normalizedSerial = serialNo.trim();
    const isSerialRequired = isSerialRequiredForType(itemData.itemType);
    if (isSerialRequired && !normalizedSerial) {
      alert('กรุณาระบุหมายเลขเครื่อง/Serial ก่อนดำเนินการ');
      return;
    }
    if (!selectedBranchId) {
      alert('กรุณาเลือกสาขาที่สะดวก');
      return;
    }
    if (deliveryMethod === 'delivery') {
      if (!userLocation) {
        setDeliveryError('กรุณาอนุญาตตำแหน่งของคุณก่อนใช้บริการจัดส่ง');
        alert('กรุณาอนุญาตตำแหน่งของคุณก่อนใช้บริการจัดส่ง');
        return;
      }
      const distanceKm = getBranchDistanceKm(userLocation, currentBranch);
      if (distanceKm == null) {
        setDeliveryError('ไม่สามารถตรวจสอบระยะทางกับสาขาที่เลือกได้');
        alert('ไม่สามารถตรวจสอบระยะทางกับสาขาที่เลือกได้ กรุณาลองใหม่');
        return;
      }
      if (distanceKm > MAX_DELIVERY_DISTANCE_KM) {
        const message = 'คุณอยู่ไกลจาก Drop Point เกินกว่าที่กำหนด ขออภัยกรุณาเลือก "ดำเนินการด้วยตัวเอง (Walk-in)" เพื่อนำมาส่งให้ Drop Point ด้วยตัวเอง ขออภัยในความสะดวก ขอบคุณครับ';
        setDeliveryError(message);
        alert(message);
        setDeliveryMethod('pickup');
        return;
      }
    }
    if (!isRegistered || loanAmountNum === 0) {
      console.log('❌ Validation failed:', { isRegistered, loanAmountNum });
      return;
    }

    try {
      setIsSubmitting(true);
      const submissionData = {
        lineId,
        itemData: {
          ...itemData,
          serialNo: normalizedSerial || undefined,
        },
        loanAmount: loanAmountNum,
        deliveryMethod,
        deliveryFee,
        branchId: selectedBranchId,
        duration: parseInt(duration),
        interestRate: interestRateTotal,
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
      const normalizedSerial = serialNo.trim();
      const draftData = {
        lineId,
        itemType: itemData.itemType,
        brand: itemData.brand,
        model: itemData.model,
        capacity: itemData.capacity,
        color: itemData.color,
        serialNo: normalizedSerial || undefined,
        screenSize: itemData.screenSize,
        watchSize: itemData.watchSize,
        watchConnectivity: itemData.watchConnectivity,
        accessories: itemData.appleAccessories?.join(', ') || null,
        defects: itemData.defects,
        notes: itemData.notes,
        imageUrls: itemData.images,
        conditionResult: {
          score: itemData.aiConditionScore,
          reason: itemData.aiConditionReason,
        },
        estimateResult: {
          estimatedPrice: itemData.estimatedPrice,
          confidence: itemData.aiConfidence,
        },
        cpu: itemData.processor,
        ram: itemData.ram,
        storage: itemData.storage,
        gpu: itemData.gpu,
        lenses: itemData.lenses?.map(lens => lens.model),
      };

      await axios.post('/api/items/draft', draftData);
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

        {/* 2.1 Serial Number */}
        <div className="mb-6">
          <label className="block font-bold text-gray-800 mb-2">
            {itemData.itemType === 'Apple' ? 'Serial Number / IMEI' : 'หมายเลขซีเรียล'}
            {isSerialRequiredForType(itemData.itemType) && <span className="text-red-500"> *</span>}
          </label>
          <input
            type="text"
            value={serialNo}
            onChange={(e) => setSerialNo(e.target.value)}
            placeholder={itemData.itemType === 'Apple' ? 'ระบุหมายเลขเครื่อง' : 'ระบุหมายเลขซีเรียล'}
            className="w-full p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C0562F] text-gray-800 placeholder:text-gray-300"
          />
          <p className="text-xs text-gray-500 mt-2">
            {isSerialRequiredForType(itemData.itemType)
              ? 'กรุณากรอก IMEI หรือ Serial ให้ครบถ้วนก่อนดำเนินการจำนำ'
              : 'ถ้ามีหมายเลขซีเรียล สามารถกรอกได้เพื่อความถูกต้องของสัญญา'}
          </p>
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
              className="w-full p-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C0562F] text-gray-800 font-bold placeholder:text-gray-300"
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
              <option value="pickup">ดำเนินการด้วยตัวเอง (Walk-in)</option>
            </select>
            <ChevronDown className="absolute right-4 top-4.5 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>

          <p className="text-[10px] text-gray-500 mt-2 leading-tight">
            *ถ้าอยู่นอกพื้นที่การจัดส่งสามารถเลือก &quot;ดำเนินการด้วยตัวเอง&quot;<br/>
            แล้วเรียกบริการส่งของด้วยตัวเองได้ หรือติดต่อ &quot;ช่วยเหลือ/Support&quot;
          </p>
          {deliveryMethod === 'delivery' && deliveryDistanceKm != null && (
            <p className={`text-[11px] mt-2 ${deliveryEligible ? 'text-green-600' : 'text-red-500'}`}>
              ระยะทางจากตำแหน่งของคุณถึงสาขา ~{deliveryDistanceKm.toFixed(1)} กม.
              {deliveryEligible === false ? ' (เกิน 10 กม. ไม่สามารถใช้บริการจัดส่งได้)' : ''}
            </p>
          )}
          {deliveryError && (
            <p className="text-[11px] text-red-500 mt-2">{deliveryError}</p>
          )}
        </div>

        {/* Branch Selection & Info Card */}
        <div className="mb-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-gray-700">สาขาใกล้คุณ</div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                กดปุ่มเพื่อค้นหาจุดรับฝากที่ใกล้คุณที่สุด
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleUseLocation({ setDefault: true, context: 'manual' })}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#C0562F] bg-[#FDF4EF] px-3 py-2 text-[11px] font-semibold text-[#C0562F] shadow-sm transition hover:bg-[#FBE8DD] disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <MapPin className="h-3.5 w-3.5" />
              {isLocating ? 'กำลังค้นหา...' : 'ใช้ตำแหน่งของฉัน'}
            </button>
          </div>

          {locationMessage && (
            <div className="mb-2 text-[11px] text-gray-500">
              {locationMessage}
              {suggestedBranch?.distance_m != null && (
                <span className="ml-1 text-gray-400">
                  ({(suggestedBranch.distance_m / 1000).toFixed(1)} กม.)
                </span>
              )}
            </div>
          )}

          {/* Branch Dropdown Selector */}
          <div className="mb-2">
            <label className="text-sm font-bold text-gray-700 mb-1 block">เลือกสาขาที่สะดวก</label>
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="w-full p-3 pr-10 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#C0562F]"
              >
                <option value="">เลือกสาขา</option>
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

              {currentBranch.map_embed && (
                <div className="mt-3">
                  <MapEmbed embedHtml={currentBranch.map_embed} className="h-40" />
                </div>
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

        {/* 7. Interest & Fee */}
        <div className="mb-2 flex items-center gap-2">
          <label className="font-bold text-gray-800 whitespace-nowrap">
            ดอกเบี้ย*
          </label>
          <span className="bg-[#EAEAEA] text-gray-600 text-[10px] px-2 py-0.5 rounded-full">Interest</span>
          <span className="ml-auto text-gray-500 text-xs">บาท</span>
        </div>
        <div className="relative mb-1">
          <input
            type="text"
            value={formatNumber(interestAmount)}
            readOnly
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 focus:outline-none font-medium"
          />
        </div>
        <p className="text-[11px] text-gray-500 mb-4">
          ดอกเบี้ย 2% ของมูลค่าสัญญา (คิดตามระยะเวลาที่เลือก)
        </p>

        <div className="mb-2 flex items-center gap-2">
          <label className="font-bold text-gray-800 whitespace-nowrap">
            ค่าธรรมเนียม*
          </label>
          <span className="bg-[#EAEAEA] text-gray-600 text-[10px] px-2 py-0.5 rounded-full">Fee</span>
          <span className="ml-auto text-gray-500 text-xs">บาท</span>
        </div>
        <div className="relative mb-1">
          <input
            type="text"
            value={formatNumber(feeAmount)}
            readOnly
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 focus:outline-none font-medium"
          />
        </div>
        <p className="text-[11px] text-gray-500 mb-8">
          ค่าธรรมเนียมคำนวณจากมูลค่าสัญญา (คงที่ตามวงเงินเริ่มต้น)
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
