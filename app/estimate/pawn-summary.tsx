'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, MapPin, Phone, ExternalLink } from 'lucide-react';
import axios from 'axios';
import MapEmbed from '@/components/MapEmbed';
import { haversineDistanceMeters } from '@/lib/services/geo';
import { openLiffEntry } from '@/lib/liff/navigation';
import { savePawnerEstimateResume } from '@/lib/pawner-estimate-resume';
import {
  createMockLoanRequest,
  getMockBranches,
  isMockPawnerMode,
  saveMockDraft,
  waitMock,
} from '@/lib/mock-pawner';

const SERIAL_OPTIONAL_TYPES = new Set([
  'อุปกรณ์เสริมโทรศัพท์',
  'กล้อง',
  'อุปกรณ์คอมพิวเตอร์',
]);

const isSerialRequiredForType = (itemType?: string) => {
  if (!itemType) return false;
  return !SERIAL_OPTIONAL_TYPES.has(itemType);
};

const safeParseJson = <T,>(raw: string, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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
    conditionChecklist?: Record<string, boolean | null>;
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
    devicePasscode?: string;
  };
  lineId: string;
  draftItemId?: string | null;
  onBack: () => void;
  onSuccess: (loanRequestId: string, itemId: string) => void;
}

function DropdownField({
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
  className = '',
  menuClassName = '',
}: {
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const selectedOption = options.find((option) => option.value === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-xl border border-primary/70 bg-white px-3 py-3 text-left text-sm font-base text-grey-4 transition focus:outline-none focus:ring-1 focus:ring-primary-active disabled:cursor-not-allowed disabled:bg-background-grey-6 disabled:text-grey-4 ${className}`}
      >
        <span className={selectedOption ? 'text-foreground-subtle' : 'font-normal text-grey-5'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-foreground-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className={`dropdown-slide-down absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-primary-border bg-white shadow-lg ${menuClassName}`}>
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${value === option.value ? 'bg-primary-soft text-primary' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PawnSummary({ itemData, lineId, draftItemId, onBack, onSuccess }: PawnSummaryProps) {
  console.log('🎯 PawnSummary component rendered with:', { itemData, lineId });
  const mockMode = isMockPawnerMode();

  const [loanAmount, setLoanAmount] = useState<string>('');
  const [serialNo, setSerialNo] = useState<string>(itemData.serialNo || '');
  const [devicePasscode, setDevicePasscode] = useState<string>(itemData.devicePasscode || '');
  const [deliveryMethod, setDeliveryMethod] = useState<'rider' | 'pickup' | ''>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [defaultBranchId, setDefaultBranchId] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>('');
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
  const MIN_LOAN_AMOUNT = 1000;
  const loanAmountNum = parseFloat(loanAmount.replace(/,/g, '')) || 0;
  const deliveryFee = 0;
  const MAX_DELIVERY_DISTANCE_KM = 10;
  const interestRateTotal = 0.03; // total 3% per month
  const interestRatePawner = 0.015; // interest portion 1.5%
  const feeRate = 0.015; // platform fee portion 1.5%
  const durationMonths = duration ? parseInt(duration) / 30 : 0;
  const interestAmount = loanAmountNum * interestRatePawner * durationMonths;
  const feeAmount = loanAmountNum * feeRate * durationMonths;
  const totalInterest = interestAmount + feeAmount;
  const totalRepayment = loanAmountNum + totalInterest + deliveryFee;
  const normalizedSerial = serialNo.trim();
  const isSerialRequired = isSerialRequiredForType(itemData.itemType);
  const canContinue =
    isRegistered &&
    !isSubmitting &&
    loanAmountNum >= MIN_LOAN_AMOUNT &&
    Boolean(deliveryMethod) &&
    Boolean(duration) &&
    Boolean(selectedBranchId) &&
    (!isSerialRequired || Boolean(normalizedSerial));

  const currentBranch = branches.find(b => b.branch_id === selectedBranchId);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

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
    setDeliveryError(null);
    setDeliveryDistanceKm(null);
    setDeliveryEligible(null);
  }, [deliveryMethod]);

  const checkRegistration = async () => {
    if (mockMode) {
      const mockBranches = getMockBranches();
      setIsLoading(true);
      await waitMock(250);
      setKycStatus('VERIFIED');
      setIsRegistered(true);
      setDefaultBranchId(mockBranches[0]?.branch_id || null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/pawners/check?lineId=${lineId}`, {
        responseType: 'text',
      });
      const payload = safeParseJson<{ exists?: boolean; pawner?: { kyc_status?: string; default_drop_point_id?: string | null } }>(String(response.data || ''), {});

      if (payload.exists) {
        const status = payload.pawner?.kyc_status || null;
        setKycStatus(status);
        setIsRegistered(status === 'VERIFIED');
        setDefaultBranchId(payload.pawner?.default_drop_point_id || null);
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
    if (mockMode) {
      setBranches(getMockBranches());
      return;
    }
    try {
      const response = await axios.get('/api/drop-points', {
        responseType: 'text',
      });
      const payload = safeParseJson<{ branches?: Branch[] }>(String(response.data || ''), {});
      setBranches(payload.branches || []);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const handleBranchChange = async (branchId: string) => {
    setSelectedBranchId(branchId);
    if (mockMode || !lineId) return;
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
    if (mockMode) {
      const currentLocation = {
        latitude: 13.7468,
        longitude: 100.5329,
      };
      setUserLocation(currentLocation);
      const mockBranches = branches.length ? branches : getMockBranches();
      const nearestBranch = mockBranches[0];
      if (nearestBranch) {
        setSuggestedBranch({
          branch_id: nearestBranch.branch_id,
          branch_name: nearestBranch.branch_name,
          distance_m: 2800,
        });
        setSelectedBranchId(nearestBranch.branch_id);
        setDefaultBranchId(nearestBranch.branch_id);
      }
      setDeliveryDistanceKm(2.8);
      setDeliveryEligible(true);
      setDeliveryError(null);
      setLocationMessage('Mock location loaded for frontend preview');
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
    if (isSerialRequired && !normalizedSerial) {
      alert('กรุณาระบุหมายเลขเครื่อง/Serial ก่อนดำเนินการ');
      return;
    }
    if (!deliveryMethod) {
      alert('กรุณาเลือกวิธีการรับฝาก/ส่ง');
      return;
    }
    if (!duration) {
      alert('กรุณาเลือกระยะเวลา');
      return;
    }
    if (!selectedBranchId) {
      alert('กรุณาเลือกสาขาที่สะดวก');
      return;
    }
    if (!isRegistered || loanAmountNum === 0) {
      console.log('❌ Validation failed:', { isRegistered, loanAmountNum });
      return;
    }

    if (loanAmountNum < MIN_LOAN_AMOUNT) {
      alert(`วงเงินขั้นต่ำ ${MIN_LOAN_AMOUNT.toLocaleString('en-US')} บาท`);
      return;
    }

    try {
      setIsSubmitting(true);
      if (mockMode) {
        await waitMock(500);
        const mockSubmission = createMockLoanRequest();
        onSuccess(mockSubmission.loanRequestId, mockSubmission.itemId);
        return;
      }

      const submissionData = {
        lineId,
        itemData: {
          ...itemData,
          serialNo: normalizedSerial || undefined,
          devicePasscode: devicePasscode.trim() || undefined,
        },
        draftItemId,
        loanAmount: loanAmountNum,
        deliveryMethod,
        deliveryFee,
        branchId: selectedBranchId,
        userLocation: null,
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
      if (axios.isAxiosError(error)) {
        const responseError = error.response?.data?.error;
        const responseDetails = error.response?.data?.details;
        alert(
          responseError
            ? `${responseError}${responseDetails ? `\n${responseDetails}` : ''}`
            : 'เกิดข้อผิดพลาดในการส่งคำขอ กรุณาลองใหม่อีกครั้ง'
        );
      } else {
        alert('เกิดข้อผิดพลาดในการส่งคำขอ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      if (mockMode) {
        saveMockDraft({
          lineId,
          itemType: itemData.itemType,
          brand: itemData.brand,
          model: itemData.model,
        });
        alert('บันทึก mock draft เรียบร้อยแล้ว');
        return;
      }

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
        devicePasscode: devicePasscode.trim() || undefined,
        imageUrls: itemData.images,
        conditionChecklist: itemData.conditionChecklist,
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

  const buildDraftPayload = () => ({
    lineId,
    itemType: itemData.itemType,
    brand: itemData.brand,
    model: itemData.model,
    capacity: itemData.capacity,
    color: itemData.color,
    serialNo: serialNo.trim() || undefined,
    screenSize: itemData.screenSize,
    watchSize: itemData.watchSize,
    watchConnectivity: itemData.watchConnectivity,
    accessories: itemData.appleAccessories?.join(', ') || null,
    defects: itemData.defects,
    notes: itemData.notes,
    devicePasscode: devicePasscode.trim() || undefined,
    imageUrls: itemData.images,
    conditionChecklist: itemData.conditionChecklist,
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
  });

  const handleRegister = async () => {
    if (mockMode) {
      alert('Mock mode: registration is treated as verified for frontend preview');
      return;
    }
    try {
      setIsSubmitting(true);

      let resumeDraftId = draftItemId || null;
      if (!resumeDraftId) {
        const draftResponse = await axios.post('/api/items/draft', buildDraftPayload());
        resumeDraftId = draftResponse.data?.item?.item_id || null;
      }

      if (resumeDraftId) {
        savePawnerEstimateResume({
          lineId,
          draftId: resumeDraftId,
          createdAt: new Date().toISOString(),
          returnAfterVerify: true,
        });
      }
    } catch (saveResumeError) {
      console.error('Error preparing estimate resume:', saveResumeError);
    } finally {
      setIsSubmitting(false);
    }

    openLiffEntry({
      liffIdCandidates: [
        process.env.NEXT_PUBLIC_LIFF_ID_REGISTER,
        process.env.NEXT_PUBLIC_LIFF_ID,
      ],
      fallbackPath: kycStatus && kycStatus !== 'VERIFIED' ? '/ekyc' : '/register',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center page-investor">
        <div className="dot-bricks" />
      </div>
    );
  }

  return (
    <div className="theme-liff min-h-screen bg-background-white font-sans">

      {/* 1. Header Section */}
      <div className="bg-primary-soft/50 rounded-lg p-4 flex justify-between items-center text-foreground text-sm border border-primary-border">
        <div>
          <span className="font-bold text-foreground mb-1">สินค้า</span>
          <div className="text-xs text-foreground-subtle">item</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-foreground mb-1">{itemData.brand} {itemData.model}</div>
          <div className="text-xs text-foreground-subtle">สภาพ {Math.round(itemData.condition)}%</div>
        </div>
      </div>


      <div className="p-4 max-w-md mx-auto rounded-xl border border-primary-border bg-primary-soft/50 mt-4">
        <div className="">

        {/* 2. Product Image */}
        <div className="mb-6 flex justify-center">
          <div className="relative w-full h-48 bg-background-subtle rounded-2xl overflow-hidden">
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
            className="w-full min-h-12 p-3 border border-primary/70 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-grey-5 text-sm md:text-sm text-foreground-subtle"
          />
          <p className="text-xs text-foreground-subtle mt-2">
            {isSerialRequiredForType(itemData.itemType)
              ? 'กรุณากรอก IMEI หรือ Serial ให้ครบถ้วนก่อนดำเนินการขอสินเชื่อ'
              : 'ถ้ามีหมายเลขซีเรียล สามารถกรอกได้เพื่อความถูกต้องของสัญญา'}
          </p>
        </div>

        <div className="mb-6">
          <label className="block font-bold text-foreground mb-2">
            รหัสล็อกเครื่อง <span className="text-foreground-subtle font-light text-sm">(ถ้ามี)</span>
          </label>
          <input
            type="text"
            value={devicePasscode}
            onChange={(e) => setDevicePasscode(e.target.value)}
            placeholder="เช่น 1234 หรือ ABCD1234"
            className="w-full min-h-12 p-3 border border-primary/70 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-grey-5 text-sm md:text-sm text-foreground-subtle"
          />
          <p className="text-xs text-foreground-subtle mt-2">
            หากมีการตั้งรหัสล็อกเครื่องไว้ กรุณานำออกหรือแจ้งในช่องกรอก
          </p>
          <p className="text-xs text-foreground-subtle mt-1">
            รหัสของคุณจะถูกเก็บเป็นความลับ นอกจากพนักงานตรวจเครื่อง
          </p>
        </div>

        {/* 3. AI Estimated Price Card */}
        <div className="bg-white rounded-lg p-4 text-center mb-8 relative overflow-hidden border border-primary/70">
          {/* Decorative background circle */}
          <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>

          <h2 className="text-primary font-bold text-lg mb-1 relative z-10">ราคาประเมินจาก AI</h2>
          <p className="text-primary text-xs mb-4 opacity-80 relative z-10">AI-estimated price</p>

          <div className="text-primary text-4xl font-bold mb-4 relative z-10">
            {formatNumber(itemData.estimatedPrice)}
          </div>

          <div className="text-primary text-sm opacity-80 relative z-10">บาท</div>
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
              className="w-full min-h-12 p-3 border border-primary/70 rounded-full bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-grey-5 text-sm md:text-sm text-foreground-subtle"
            />
            <span className="absolute right-4 top-4 text-foreground-subtle text-sm">THB</span>
          </div>
          <p className="text-foreground-subtle text-xs mt-2 text-right">
            วงเงินขั้นต่ำ {MIN_LOAN_AMOUNT.toLocaleString('en-US')} บาท • สูงสุด {maxLoanAmount.toLocaleString('en-US')} บาท
          </p>
        </div>

        <div className="h-px bg-primary my-6"></div>

        {/* 5. Delivery Section */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <label className="whitespace-nowrap font-bold text-foreground">
              การรับฝาก/ส่ง*
            </label>
            <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[10px] text-foreground-subtle">Delivery</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <button
              type="button"
              onClick={() => setDeliveryMethod('rider')}
              className={`flex items-center justify-center rounded-full border px-4 py-3 text-center transition-colors ${
                deliveryMethod === 'rider'
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
              }`}
            >
              <span className="font-medium">เรียกไรเดอร์ด้วยตัวเอง</span>
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMethod('pickup')}
              className={`flex items-center justify-center rounded-full border px-4 py-3 text-center transition-colors ${
                deliveryMethod === 'pickup'
                  ? 'border-primary bg-primary text-primary-fg'
                  : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
              }`}
            >
              <span className="font-medium">ส่งที่สาขาด้วยตัวเอง</span>
            </button>
          </div>

          {/* <p className="text-[10px] text-grey-4 mt-2 leading-tight">
            *เลือก &quot;เรียกไรเดอร์ด้วยตัวเอง&quot; สำหรับนำส่งฟรี หรือเลือก &quot;ดำเนินการด้วยตัวเอง&quot; แบบ Walk-in
          </p> */}
          {deliveryError && (
            <p className="text-[11px] text-red-500 mt-2">{deliveryError}</p>
          )}
        </div>

        {/* Branch Selection & Info Card */}
        <div className="mb-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground-muted">สาขาใกล้คุณ</div>
              <p className="text-[11px] text-grey-4 mt-1 leading-snug">
                กดปุ่มเพื่อค้นหาจุดรับฝากที่ใกล้คุณที่สุด
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleUseLocation({ setDefault: true, context: 'manual' })}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary-border disabled:cursor-not-allowed disabled:bg-grey-5 disabled:text-foreground-subtle"
            >
              <MapPin className="h-3.5 w-3.5" />
              {isLocating ? 'กำลังค้นหา...' : 'ใช้ตำแหน่งของฉัน'}
            </button>
          </div>

          {locationMessage && (
            <div className="mb-2 text-[11px] text-grey-5">
              {locationMessage}
              {suggestedBranch?.distance_m != null && (
                <span className="ml-1 text-grey-5">
                  ({(suggestedBranch.distance_m / 1000).toFixed(1)} กม.)
                </span>
              )}
            </div>
          )}

          {/* Branch Dropdown Selector */}
          <div className="mb-2">
            <label className="text-sm font-medium text-foreground-muted mb-1 block">เลือกสาขาที่สะดวก</label>
            <DropdownField
              value={selectedBranchId}
              placeholder="เลือกสาขา"
              options={branches.map((branch) => ({ value: branch.branch_id, label: branch.branch_name }))}
              onChange={handleBranchChange}
              className="rounded-2xl bg-background-subtle text-foreground-muted"
            />
          </div>

          {/* Branch Details Card */}
          {currentBranch && (
            <div className="rounded-[var(--radius-lg)] border border-primary-border bg-background-white p-4 text-sm text-foreground-muted transition-all duration-300">
              <div className="flex gap-3 mb-2 items-start">
                <MapPin className="w-4 h-4 text-primary mt-1 shrink-0" />
                <div>
                  <span className="font-bold block mb-1 text-foreground-muted">{currentBranch.branch_name}</span>
                  <p className="text-foreground-muted leading-relaxed text-xs">
                    {currentBranch.address}, {currentBranch.district}, {currentBranch.province} {currentBranch.postal_code}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mb-3 items-center">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs text-foreground-muted">{currentBranch.phone_number}</span>
              </div>

              {/* Google Maps Button */}
              {currentBranch.google_maps_link && (
                <a
                  href={currentBranch.google_maps_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-primary bg-background-white px-4 py-2 text-sm font-base text-primary transition-colors hover:bg-background-subtle"
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
          <label className="whitespace-nowrap font-bold text-foreground">
            ระยะเวลา*
          </label>
          <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[10px] text-foreground-subtle">Duration</span>
          <span className="ml-auto text-xs text-foreground-subtle">วัน</span>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <button
            type="button"
            onClick={() => setDuration('15')}
            className={`flex items-center justify-center rounded-full border px-4 py-3 text-center transition-colors ${
              duration === '15'
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
            }`}
          >
            <span className="font-medium">15 วัน</span>
          </button>
          <button
            type="button"
            onClick={() => setDuration('30')}
            className={`flex items-center justify-center rounded-full border px-4 py-3 text-center transition-colors ${
              duration === '30'
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
            }`}
          >
            <span className="font-medium">30 วัน</span>
          </button>
        </div>

        {/* 7. Interest & Fee */}
        <div className="mb-2 flex items-center gap-2">
          <label className="whitespace-nowrap font-bold text-foreground">
            ดอกเบี้ย*
          </label>
          <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[10px] text-foreground-subtle">Interest</span>
          <span className="ml-auto text-xs text-foreground-subtle">บาท</span>
        </div>
        <div className="relative mb-1">
          <input
            type="text"
            value={formatNumber(interestAmount)}
            readOnly
            className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white p-3 text-sm text-foreground-subtle placeholder-grey-5 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary md:text-sm"
          />
        </div>
        <p className="mb-4 text-[11px] text-foreground-subtle">
          ดอกเบี้ย 1.5% ของมูลค่าสัญญา และค่าธรรมเนียมแพลตฟอร์ม 1.5% (คิดตามระยะเวลาที่เลือก)
        </p>

        <div className="mb-2 flex items-center gap-2">
          <label className="whitespace-nowrap font-bold text-foreground">
            ค่าธรรมเนียม*
          </label>
          <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[10px] text-foreground-subtle">Fee</span>
          <span className="ml-auto text-xs text-foreground-subtle">บาท</span>
        </div>
        <div className="relative mb-1">
          <input
            type="text"
            value={formatNumber(feeAmount)}
            readOnly
            className="w-full min-h-12 rounded-full border border-primary/70 bg-background-white p-3 text-sm text-foreground-subtle placeholder-grey-5 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary md:text-sm"
          />
        </div>
        <p className="mb-8 text-[11px] text-foreground-subtle">
          ค่าธรรมเนียมแพลตฟอร์ม 1.5% ของมูลค่าสัญญา (คงที่ตามวงเงินเริ่มต้น)
        </p>

        {/* 8. Action Buttons */}
        <div className="space-y-3">
          <div className="rounded-lg border border-warning/55 bg-warning/10 px-4 py-3 text-sm text-foreground-subtle">
            <div className="mb-1 font-semibold text-warning">หมายเหตุ</div>
            <p className="leading-relaxed">
              ของจะถูกเก็บไว้ที่จุดรับฝากแค่ 15 วัน หลังจากนั้นจะถูกส่งไปเก็บที่ส่วนกลาง
              หากต้องการไถ่ถอนแบบไม่เสียค่าใช้จ่ายเพิ่มให้วางแผนล่วงหน้า 7 วัน หรือไปรับเองที่ส่วนกลาง
              หรือหากต้องการรับของภายในวันถัดไปที่จุดรับฝากเดิมจะมีค่าดำเนินการเพิ่ม 100 บาท
              และหากครบกำหนดสัญญาแล้วจะมีค่าปรับเดือนละ 50 บาท
            </p>
          </div>

          {/* Continue */}
          <button
            onClick={handleSubmit}
            disabled={!canContinue}
            className={`w-full min-h-12 rounded-full px-4 py-2 flex flex-col items-center justify-center transition-colors ${
              canContinue
                ? 'btn-transition btn-sheen bg-[image:var(--background-image-grad-primary)] text-primary-fg hover:bg-primary-hover'
                : 'bg-grey-5 text-foreground-subtle cursor-not-allowed'
            }`}
          >
            <span className="text-base font-medium">
              {isSubmitting ? 'กำลังส่งคำขอ...' : 'ดำเนินการต่อ'}
            </span>
            <span className="text-xs font-light opacity-90">Continue</span>
          </button>

          {/* Register / Verify - Only show if not verified */}
          {!isRegistered && (
            <button
              onClick={handleRegister}
              className="w-full min-h-12 rounded-full bg-primary-soft px-4 py-2 flex flex-col items-center justify-center text-base font-medium text-primary transition-colors hover:bg-primary-border active:scale-[0.98]"
            >
              <span className="text-base font-medium">
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
            className="w-full min-h-12 rounded-full border border-primary px-4 py-2 flex flex-col items-center justify-center text-base font-medium text-primary transition-colors hover:bg-background-subtle active:scale-[0.98]"
          >
            <span className="text-base font-medium">บันทึกชั่วคราว</span>
            <span className="text-xs font-light opacity-80">Save draft</span>
          </button>

          {/* Estimate Another */}
          <button
            onClick={onBack}
            className="flex w-full min-h-12 flex-col items-center justify-center rounded-full bg-primary/25 px-4 py-2 text-base font-medium text-primary transition-colors hover:bg-line-soft active:scale-[0.98]"
          >
            <span className="text-base font-medium">ประเมินสินค้าอื่น</span>
            <span className="text-xs font-light opacity-80 font-english">Estimate another item</span>
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
    </div>
  );
}
