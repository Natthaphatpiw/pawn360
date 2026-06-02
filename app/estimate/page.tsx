'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';
import { Camera, ChevronUp, ChevronDown, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import PawnSummary from './pawn-summary';
import ContractAgreementStep from './contract-agreement-step';
import ContractSuccess from './contract-success';
import { useRouter, useSearchParams } from 'next/navigation';
import { splitItemNotesAndPasscode } from '@/lib/utils/item-private-notes';
import { clearPawnerEstimateResume, getPawnerEstimateResume } from '@/lib/pawner-estimate-resume';
import VolumeSlider from '@/components/VolumeSlider';
import {
  buildMockEstimate,
  createMockPawnRequest,
  getMockCustomer,
  getMockDraftCount,
  getMockImageUrls,
  getMockStores,
  isMockPawnerMode,
  waitMock,
} from '@/lib/mock-pawner';

// Item types configuration
const ITEM_TYPES = [
  { id: 'apple', label: 'สินค้าของ Apple', value: 'Apple' },
  { id: 'mobile', label: 'โทรศัพท์มือถือ(Mobile)', value: 'โทรศัพท์มือถือ' },
  { id: 'mobile-accessory', label: 'อุปกรณ์เสริมโทรศัพท์มือถือ(Mobile accessory)', value: 'อุปกรณ์เสริมโทรศัพท์' },
  { id: 'camera', label: 'กล้องถ่ายรูป(Camera)', value: 'กล้อง' },
  { id: 'laptop', label: 'คอมพิวเตอร์แล็ปท็อป(Computer laptop)', value: 'โน้ตบุค' },
  { id: 'computer-hardware', label: 'อุปกรณ์คอมพิวเตอร์(Computer hardware)', value: 'อุปกรณ์คอมพิวเตอร์' },
];

// Brand options for each type
const BRANDS_BY_TYPE: Record<string, string[]> = {
  'โทรศัพท์มือถือ': ['Samsung', 'Huawei', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'OnePlus', 'Google', 'Sony', 'Nokia', 'ASUS', 'อื่นๆ'],
  'อุปกรณ์เสริมโทรศัพท์': ['Samsung', 'Anker', 'Baseus', 'Belkin', 'JBL', 'Sony', 'อื่นๆ'],
  'กล้อง': ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'อื่นๆ'],
  'โน้ตบุค': ['Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Samsung', 'Microsoft', 'Razer', 'อื่นๆ'],
  'อุปกรณ์คอมพิวเตอร์': ['Intel', 'AMD', 'NVIDIA', 'ASUS', 'MSI', 'Gigabyte', 'ASRock', 'Corsair', 'Kingston', 'Crucial', 'Seagate', 'WD', 'Samsung', 'Cooler Master', 'Thermaltake', 'NZXT', 'Logitech', 'Razer', 'SteelSeries', 'อื่นๆ'],
};

const SERIAL_OPTIONAL_TYPES = new Set([
  'อุปกรณ์เสริมโทรศัพท์',
  'กล้อง',
  'อุปกรณ์คอมพิวเตอร์',
]);

const isSerialRequiredForType = (itemType?: string) => {
  if (!itemType) return false;
  return !SERIAL_OPTIONAL_TYPES.has(itemType);
};

const APPLE_CATEGORIES = [
  { value: 'iPhone', label: 'iPhone' },
  { value: 'iPad', label: 'iPad' },
  { value: 'MacBook', label: 'MacBook' },
  { value: 'Apple Watch', label: 'Apple Watch' },
  { value: 'AirPods', label: 'AirPods' },
  { value: 'iMac', label: 'iMac' },
  { value: 'Mac mini', label: 'Mac mini' },
  { value: 'Mac Studio', label: 'Mac Studio' },
  { value: 'Mac Pro', label: 'Mac Pro' },
];

const APPLE_MODELS_BY_CATEGORY: Record<string, string[]> = {
  iPhone: [
    'iPhone 17 Pro Max',
    'iPhone 17 Pro',
    'iPhone 17 Air',
    'iPhone 17',
    'iPhone 17e',
    'iPhone 16e',
    'iPhone 16 Pro Max',
    'iPhone 16 Pro',
    'iPhone 16 Plus',
    'iPhone 16',
    'iPhone 15 Pro Max',
    'iPhone 15 Pro',
    'iPhone 15 Plus',
    'iPhone 15',
    'iPhone 14 Pro Max',
    'iPhone 14 Pro',
    'iPhone 14 Plus',
    'iPhone 14',
    'iPhone SE (3rd generation)',
    'iPhone 13 Pro Max',
    'iPhone 13 Pro',
    'iPhone 13',
    'iPhone 13 mini',
    'iPhone 12 Pro Max',
    'iPhone 12 Pro',
    'iPhone 12',
    'iPhone 12 mini',
    'iPhone SE (2nd generation)',
    'iPhone 11 Pro Max',
    'iPhone 11 Pro',
    'iPhone 11',
    'iPhone XS Max',
    'iPhone XS',
    'iPhone XR',
    'iPhone X',
    'iPhone 8 Plus',
    'iPhone 8',
    'iPhone 7 Plus',
    'iPhone 7',
    'iPhone SE (1st generation)',
    'iPhone 6s Plus',
    'iPhone 6s',
    'iPhone 6 Plus',
    'iPhone 6',
    'iPhone 5s',
    'iPhone 5c',
    'iPhone 5',
    'iPhone 4s',
    'iPhone 4',
    'iPhone 3GS',
    'iPhone 3G',
    'iPhone (1st generation)',
  ],
  iPad: [
    'iPad Pro 13-inch (M5)',
    'iPad Pro 11-inch (M5)',
    'iPad Pro 13-inch (M4)',
    'iPad Pro 11-inch (M4)',
    'iPad Pro 12.9-inch (6th generation)',
    'iPad Pro 11-inch (4th generation)',
    'iPad Pro 12.9-inch (5th generation)',
    'iPad Pro 11-inch (3rd generation)',
    'iPad Pro 12.9-inch (4th generation)',
    'iPad Pro 11-inch (2nd generation)',
    'iPad Pro 12.9-inch (3rd generation)',
    'iPad Pro 11-inch (1st generation)',
    'iPad Pro 12.9-inch (2nd generation)',
    'iPad Pro 10.5-inch',
    'iPad Pro 12.9-inch (1st generation)',
    'iPad Pro 9.7-inch',
    'iPad Air 13-inch (M4)',
    'iPad Air 11-inch (M4)',
    'iPad Air 13-inch (M3)',
    'iPad Air 11-inch (M3)',
    'iPad Air 13-inch (M2)',
    'iPad Air 11-inch (M2)',
    'iPad Air (5th generation)',
    'iPad Air (4th generation)',
    'iPad Air (3rd generation)',
    'iPad Air 2',
    'iPad Air (1st generation)',
    'iPad mini (A17 Pro)',
    'iPad mini (6th generation)',
    'iPad mini (5th generation)',
    'iPad mini 4',
    'iPad mini 3',
    'iPad mini 2',
    'iPad mini (1st generation)',
    'iPad (10th generation)',
    'iPad (9th generation)',
    'iPad (8th generation)',
    'iPad (7th generation)',
    'iPad (6th generation)',
    'iPad (5th generation)',
    'iPad (4th generation)',
    'iPad (3rd generation)',
    'iPad 2',
    'iPad (1st generation)',
  ],
  MacBook: [
    'MacBook Pro 14-inch (M5, 2025)',
    'MacBook Pro 14-inch (M4 Pro/Max, 2024)',
    'MacBook Pro 16-inch (M4 Pro/Max, 2024)',
    'MacBook Pro 14-inch (M4, 2024)',
    'MacBook Pro 14-inch (M3 Pro/Max, 2023)',
    'MacBook Pro 16-inch (M3 Pro/Max, 2023)',
    'MacBook Pro 14-inch (M3, 2023)',
    'MacBook Pro 14-inch (M2 Pro/Max, 2023)',
    'MacBook Pro 16-inch (M2 Pro/Max, 2023)',
    'MacBook Pro 13-inch (M2, 2022)',
    'MacBook Pro 14-inch (M1 Pro/Max, 2021)',
    'MacBook Pro 16-inch (M1 Pro/Max, 2021)',
    'MacBook Pro 13-inch (M1, 2020)',
    'MacBook Pro 13-inch (Intel, 2020)',
    'MacBook Pro 16-inch (Intel, 2019)',
    'MacBook Pro 13/15-inch (Touch Bar, 2016-2019)',
    'MacBook Pro 13/15-inch (Retina, 2012-2015)',
    'MacBook Pro 13/15/17-inch (Unibody, 2008-2012)',
    'MacBook Pro (Original, 2006)',
    'MacBook Air 13-inch (M4, 2025)',
    'MacBook Air 15-inch (M4, 2025)',
    'MacBook Air 13-inch (M3, 2024)',
    'MacBook Air 15-inch (M3, 2024)',
    'MacBook Air 15-inch (M2, 2023)',
    'MacBook Air 13-inch (M2, 2022)',
    'MacBook Air (M1, 2020)',
    'MacBook Air (Retina, 2018-2020)',
    'MacBook Air 11/13-inch (Classic, 2008-2017)',
    'MacBook 12-inch (Retina, 2015-2017)',
    'MacBook (Unibody Polycarbonate, 2009-2010)',
    'MacBook (Unibody Aluminum, 2008)',
    'MacBook (Original Polycarbonate, 2006-2009)',
  ],
  'Apple Watch': [
    'Apple Watch Series 11',
    'Apple Watch Series 10',
    'Apple Watch Series 9',
    'Apple Watch Series 8',
    'Apple Watch Series 7',
    'Apple Watch Series 6',
    'Apple Watch Series 5',
    'Apple Watch Series 4',
    'Apple Watch Series 3',
    'Apple Watch Series 2',
    'Apple Watch Series 1',
    'Apple Watch (1st generation)',
    'Apple Watch Ultra 3',
    'Apple Watch Ultra 2',
    'Apple Watch Ultra (1st generation)',
    'Apple Watch SE (3rd generation)',
    'Apple Watch SE (2nd generation)',
    'Apple Watch SE (1st generation)',
  ],
  AirPods: [
    'AirPods Pro (2nd generation) - USB-C',
    'AirPods Pro (2nd generation) - Lightning',
    'AirPods Pro (1st generation)',
    'AirPods (4th generation) with Active Noise Cancellation',
    'AirPods (4th generation)',
    'AirPods (3rd generation)',
    'AirPods (2nd generation)',
    'AirPods (1st generation)',
    'AirPods Max (USB-C)',
    'AirPods Max (Lightning)',
  ],
  iMac: [
    'iMac 24-inch (M4)',
    'iMac 24-inch (M3)',
    'iMac 24-inch (M1)',
    'iMac 27-inch (Retina 5K)',
    'iMac 21.5-inch (Retina 4K)',
    'iMac Pro',
    'iMac (Intel-based Aluminum)',
    'iMac (G5)',
    'iMac (G4)',
    'iMac (G3)',
  ],
  'Mac mini': [
    'Mac mini (M4 Pro)',
    'Mac mini (M4)',
    'Mac mini (M2 Pro)',
    'Mac mini (M2)',
    'Mac mini (M1)',
    'Mac mini (Intel-based)',
    'Mac mini (PowerPC G4)',
  ],
  'Mac Studio': [
    'Mac Studio (M4 Ultra)',
    'Mac Studio (M4 Max)',
    'Mac Studio (M2 Ultra)',
    'Mac Studio (M2 Max)',
    'Mac Studio (M1 Ultra)',
    'Mac Studio (M1 Max)',
  ],
  'Mac Pro': [
    'Mac Pro (M4 Ultra)',
    'Mac Pro (M2 Ultra)',
    'Mac Pro (Tower & Rack, 2019)',
    'Mac Pro (Late 2013)',
    'Mac Pro (Original Tower)',
  ],
};

// Helper component for form labels
const FormLabel = ({ thai, eng, required = false }: { thai: string; eng?: string; required?: boolean }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="font-medium text-foreground-muted text-sm md:text-base">
      {thai} {required && <span className="text-error">*</span>}
    </span>
    {eng && (
      <span className="bg-background-white/80 text-foreground-subtle text-xs px-2 py-0.5 rounded-md font-normal">
        {eng}
      </span>
    )}
  </div>
);

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
        className={`flex w-full items-center justify-between rounded-xl border border-primary-border bg-background-white px-3 py-3 text-left text-sm font-base text-foreground-muted transition focus:outline-none focus:ring-1 focus:ring-primary-active disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-foreground-subtle ${className}`}
      >
        <span className={selectedOption ? 'text-foreground-muted' : 'font-normal text-foreground-subtle'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-foreground-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className={`dropdown-slide-down absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-primary-border bg-background-white shadow-[0_10px_24px_rgba(11,59,130,0.08)] ${menuClassName}`}>
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${value === option.value ? 'bg-primary-soft text-primary' : 'text-foreground-muted hover:bg-background-subtle'}`}
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

const EstimateSection = ({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`rounded-xl border border-primary-border bg-primary-soft/50 p-4 ${className}`}>
    <div className="mb-4">
      <h2 className="text-lg font-bold text-primary font-english">{title}</h2>
      {subtitle ? <p className="text-xs text-foreground-subtle">{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

interface FormData {
  itemType: string;
  brand: string;
  model: string;
  capacity?: string;
  serialNo?: string;
  devicePasscode?: string;
  color?: string;
  screenSize?: string;
  watchSize?: string;
  watchConnectivity?: string;
  connectivity?: string;
  accessories?: string;
  condition: number;
  defects: string;
  note: string;
  // Camera specific
  lenses?: string[];
  // Laptop specific
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  // Apple specific
  appleCategory?: string;
  appleSpecs?: string;
  appleAccessories?: {
    box: boolean;
    adapter: boolean;
    cable: boolean;
    receipt: boolean;
  };
}

interface EstimateResult {
  estimatedPrice: number;
  condition: number;
  confidence: number;
}

interface Store {
  _id: string;
  storeName: string;
  phone?: string;
  address?: {
    houseNumber: string;
    street?: string;
    subDistrict: string;
    district: string;
    province: string;
    postcode: string;
  };
  interestPerday?: number;
  interestSet?: { [days: string]: number };
  logo?: string;
  googlemap?: string;
  bankUrl?: string;
  delayed?: {
    maxday: number;
    feeperday: number;
  };
}

interface Customer {
  _id: string;
  lineId: string;
  fullName: string;
  phone: string;
  contractsID: string[];
  storeId: string[];
  pawnRequests: any[];
}

type Step = 'form' | 'estimate_result' | 'pawn_summary' | 'pawn_setup' | 'qr_display' | 'contract_agreement' | 'contract_success';

const createInitialFormData = (): FormData => ({
  itemType: '',
  brand: '',
  model: '',
  capacity: '',
  serialNo: '',
  devicePasscode: '',
  color: '',
  screenSize: '',
  watchSize: '',
  watchConnectivity: '',
  connectivity: '',
  accessories: '',
  condition: 50,
  defects: '',
  note: '',
  lenses: ['', ''],
  appleCategory: '',
  appleSpecs: '',
  appleAccessories: {
    box: false,
    adapter: false,
    cable: false,
    receipt: false,
  },
});

function EstimatePageInner() {
  const mockMode = isMockPawnerMode();
  const { profile, isLoading, error: liffError } = useLiff();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');
  const [resumedDraftId, setResumedDraftId] = useState<string | null>(null);
  const effectiveDraftId = draftId || resumedDraftId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Current step
  const [currentStep, setCurrentStep] = useState<Step>('form');

  // Draft management
  const [draftCount, setDraftCount] = useState<number>(0);

  // Form data
  const [formData, setFormData] = useState<FormData>(createInitialFormData);

  // Images
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);

  // Estimation and AI results
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [conditionResult, setConditionResult] = useState<{ score: number; reason: string } | null>(null);

  // Pawn setup
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [pawnDuration, setPawnDuration] = useState<string>('30');
  const [interestCalculationType, setInterestCalculationType] = useState<'daily' | 'monthly'>('monthly');
  const [interestAmount, setInterestAmount] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [desiredPrice, setDesiredPrice] = useState<string>('');
  const [customer, setCustomer] = useState<Customer | null>(null);

  // UI state
  const [isConditionExpanded, setIsConditionExpanded] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<{
    percent: number;
    title: string;
    detail: string;
  } | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [manualEstimateEnabled, setManualEstimateEnabled] = useState(false);
  const [manualConfigLoaded, setManualConfigLoaded] = useState(false);
  const [manualRequestId, setManualRequestId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const manualPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appleModels = formData.appleCategory ? (APPLE_MODELS_BY_CATEGORY[formData.appleCategory] || []) : [];

  // Success confirmation data
  const [loanRequestId, setLoanRequestId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [contractId, setContractId] = useState<string>('');

  const resetEstimateForm = () => {
    setFormData(createInitialFormData());
    setImages([]);
    setImageUrls([]);
    setUploadedImageUrls([]);
    setEstimateResult(null);
    setConditionResult(null);
    setError(null);
    setIsAnalyzing(false);
    setIsEstimating(false);
    setProcessingStatus(null);
    setIsCanceling(false);
    setManualRequestId(null);
    abortControllerRef.current = null;
    clearManualPolling();
  };

  const isProcessing = isAnalyzing || isEstimating;

  const updateProcessingStatus = (percent: number, title: string, detail: string) => {
    setProcessingStatus({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      title,
      detail,
    });
  };

  const clearManualPolling = () => {
    if (manualPollTimeoutRef.current) {
      clearTimeout(manualPollTimeoutRef.current);
      manualPollTimeoutRef.current = null;
    }
  };

  const ensureNotCanceled = (signal?: AbortSignal) => {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  };

  const handleCancelProcessing = async () => {
    setIsCanceling(true);
    setProcessingStatus((prev) => ({
      percent: prev?.percent ?? 0,
      title: 'กำลังยกเลิกการประเมิน',
      detail: 'กำลังหยุดการประมวลผล',
    }));

    if (mockMode) {
      await waitMock(150);
      setIsAnalyzing(false);
      setIsEstimating(false);
      setProcessingStatus(null);
      setIsCanceling(false);
      setError('ยกเลิก mock preview แล้ว');
      return;
    }

    abortControllerRef.current?.abort();

    if (manualRequestId) {
      try {
        await axios.delete('/api/manual-estimate', {
          data: {
            requestId: manualRequestId,
            lineId: profile?.userId,
          },
        });
      } catch (cancelError) {
        console.warn('Failed to cancel manual estimate:', cancelError);
      }

      setManualRequestId(null);
      clearManualPolling();
      setIsAnalyzing(false);
      setIsEstimating(false);
      setProcessingStatus(null);
      setIsCanceling(false);
      setError('ยกเลิกการประเมินแล้ว');
    }
  };

  // Check customer exists
  const checkCustomerExists = async () => {
    if (!profile?.userId) return;
    if (mockMode) {
      setCustomer({
        ...getMockCustomer(),
        lineId: profile.userId,
      });
      return;
    }
    try {
      const response = await axios.get(`/api/users/check?lineId=${profile.userId}`);
      if (response.data.exists) {
        setCustomer(response.data.customer);
      } else {
        setCustomer(null);
      }
    } catch (error) {
      console.error('Error checking customer:', error);
      setCustomer(null);
    }
  };

  useEffect(() => {
    if (profile?.userId) {
      checkCustomerExists();
      fetchDraftCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.userId]);

  useEffect(() => {
    if (!profile?.userId || draftId) return;
    const resume = getPawnerEstimateResume(profile.userId);
    if (resume?.draftId) {
      setResumedDraftId(resume.draftId);
    }
  }, [profile?.userId, draftId]);

  useEffect(() => {
    let mounted = true;
    const fetchManualConfig = async () => {
      if (mockMode) {
        if (mounted) {
          setManualEstimateEnabled(false);
          setManualConfigLoaded(true);
        }
        return;
      }
      try {
        const response = await axios.get('/api/manual-estimate/config');
        if (mounted) {
          setManualEstimateEnabled(Boolean(response.data?.enabled));
        }
      } catch (configError) {
        console.warn('Manual estimate config fetch failed:', configError);
      } finally {
        if (mounted) {
          setManualConfigLoaded(true);
        }
      }
    };

    fetchManualConfig();

    return () => {
      mounted = false;
    };
  }, []);

  // Load draft into estimate flow (continue from /drafts/[itemId])
  useEffect(() => {
    if (!profile?.userId || !effectiveDraftId) return;

    const loadDraft = async () => {
      try {
        const res = await axios.get(`/api/items/draft?lineId=${profile.userId}&itemId=${effectiveDraftId}`);
        if (!res.data?.success || !res.data?.item) return;

        const d = res.data.item;
        const notesPayload = splitItemNotesAndPasscode(d.notes);
        const accessoriesTokens = (d.accessories || '')
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean);

        setFormData(prev => ({
          ...prev,
          itemType: d.item_type || '',
          brand: d.brand || '',
          model: d.model || '',
          capacity: d.capacity || '',
          serialNo: d.serial_number || '',
          devicePasscode: d.device_passcode || notesPayload.devicePasscode || '',
          color: d.color || '',
          screenSize: d.screen_size || '',
          watchSize: d.watch_size || '',
          watchConnectivity: d.watch_connectivity || '',
          accessories: d.accessories || '',
          condition: typeof d.item_condition === 'number' ? d.item_condition : prev.condition,
          defects: d.defects || '',
          note: notesPayload.publicNotes,
          cpu: d.cpu || '',
          ram: d.ram || '',
          storage: d.storage || '',
          gpu: d.gpu || '',
          appleAccessories: {
            box: accessoriesTokens.includes('box'),
            adapter: accessoriesTokens.includes('adapter'),
            cable: accessoriesTokens.includes('cable'),
            receipt: accessoriesTokens.includes('receipt'),
          },
        }));

        setUploadedImageUrls(d.image_urls || []);
        setEstimateResult({
          estimatedPrice: d.estimated_value || 0,
          condition: d.item_condition || 0,
          confidence: d.ai_confidence || 0,
        });
        setConditionResult({
          score: typeof d.ai_condition_score === 'number' ? d.ai_condition_score : (d.item_condition || 0) / 100,
          reason: d.ai_condition_reason || '',
        });

        // Continue to pawn summary right away (user can proceed to contract)
        setCurrentStep('pawn_summary');
        clearPawnerEstimateResume(profile.userId);
      } catch (e) {
        console.error('Error loading draft:', e);
      }
    };

    loadDraft();
  }, [profile?.userId, effectiveDraftId]);

  // Fetch draft count
  const fetchDraftCount = async () => {
    if (!profile?.userId) return;
    if (mockMode) {
      setDraftCount(getMockDraftCount());
      return;
    }
    try {
      const response = await axios.get(`/api/items/draft?lineId=${profile.userId}`);
      if (response.data.success) {
        setDraftCount(response.data.items.length);
      }
    } catch (error) {
      console.error('Error fetching draft count:', error);
    }
  };

  // Fetch stores
  const fetchStores = async () => {
    if (mockMode) {
      setStores(getMockStores());
      return;
    }
    try {
      const response = await axios.get('/api/stores');
      if (response.data.success) {
        setStores(response.data.stores);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  useEffect(() => {
    if (currentStep === 'pawn_setup') {
      fetchStores();
    }
  }, [currentStep]);

  useEffect(() => {
    if (!manualRequestId || !profile?.userId) return;

    let canceled = false;

    const pollStatus = async () => {
      try {
        const response = await axios.get('/api/manual-estimate', {
          params: { requestId: manualRequestId, lineId: profile.userId },
        });
        const request = response.data?.request;
        if (!request || canceled) return;

        if (request.status === 'COMPLETED') {
          const estimatedPrice = Number(request.estimated_price ?? 0);
          const conditionScore = Number(request.condition_score ?? 0);
          const note = request.condition_note || 'ประเมินโดยเจ้าหน้าที่';

          setEstimateResult({
            estimatedPrice,
            condition: conditionScore / 100,
            confidence: 0.9,
          });
          setDesiredPrice(estimatedPrice.toString());
          setConditionResult({
            score: conditionScore / 100,
            reason: note,
          });
          setFormData(prev => ({
            ...prev,
            condition: conditionScore,
          }));

          setManualRequestId(null);
          clearManualPolling();
          setIsAnalyzing(false);
          setIsEstimating(false);
          setProcessingStatus(null);
          setIsCanceling(false);
          setCurrentStep('pawn_summary');
          return;
        }

        if (request.status === 'CANCELLED') {
          setManualRequestId(null);
          clearManualPolling();
          setIsAnalyzing(false);
          setIsEstimating(false);
          setProcessingStatus(null);
          setIsCanceling(false);
          setError('ยกเลิกการประเมินแล้ว');
          return;
        }
      } catch (pollError: any) {
        console.warn('Manual estimate polling failed:', pollError);
      }

      if (!canceled) {
        manualPollTimeoutRef.current = setTimeout(pollStatus, 5000);
      }
    };

    pollStatus();

    return () => {
      canceled = true;
      clearManualPolling();
    };
  }, [manualRequestId, profile?.userId]);

  // Calculate interest
  useEffect(() => {
    const calculateInterest = () => {
      const store = stores.find(s => s._id === selectedStore);
      if (!store || !estimateResult) return;

      const principal = parseFloat(desiredPrice) || estimateResult.estimatedPrice;
      const days = parseInt(pawnDuration);
      let interest = 0;

      if (interestCalculationType === 'daily' && store.interestPerday) {
        interest = principal * store.interestPerday * days;
      } else if (interestCalculationType === 'monthly' && store.interestSet) {
        if (store.interestSet[days.toString()]) {
          interest = principal * store.interestSet[days.toString()];
        } else {
          const monthlyRate = store.interestSet['30'] || 0.10;
          const dailyRate = monthlyRate / 30;
          interest = principal * dailyRate * days;
        }
      } else {
        if (store.interestSet) {
          if (store.interestSet[days.toString()]) {
            interest = principal * store.interestSet[days.toString()];
          } else {
            const monthlyRate = store.interestSet['30'] || 0.10;
            const dailyRate = monthlyRate / 30;
            interest = principal * dailyRate * days;
          }
        } else if (store.interestPerday) {
          interest = principal * store.interestPerday * days;
        }
      }

      setInterestAmount(Math.round(interest));
      setTotalAmount(Math.round(principal + interest));
    };

    if (selectedStore && pawnDuration && estimateResult) {
      calculateInterest();
    }
  }, [selectedStore, pawnDuration, interestCalculationType, estimateResult, desiredPrice, stores]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Reset fields when item type changes
    if (name === 'itemType') {
      setFormData(prev => ({
        ...prev,
        brand: '',
        model: '',
        capacity: '',
        serialNo: '',
        devicePasscode: '',
        color: '',
        screenSize: '',
        watchSize: '',
        watchConnectivity: '',
        connectivity: '',
        accessories: '',
        lenses: ['', ''],
        cpu: '',
        ram: '',
        storage: '',
        gpu: '',
        appleCategory: '',
        appleSpecs: '',
      }));
    }
  };

  const handleAppleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFormData(prev => ({
      ...prev,
      appleCategory: value,
      model: '',
      capacity: '',
      color: '',
      appleSpecs: '',
      brand: value ? 'Apple' : '',
    }));
  };

  const handleAppleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFormData(prev => ({
      ...prev,
      model: value,
      brand: value ? 'Apple' : prev.brand,
    }));
  };

  // Camera functions
  const openCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const totalImages = images.length + newFiles.length;

    if (totalImages > 6) {
      setError('สามารถอัปโหลดรูปได้สูงสุด 6 รูป');
      return;
    }

    setImages(prev => [...prev, ...newFiles]);
    const newUrls = newFiles.map(file => URL.createObjectURL(file));
    setImageUrls(prev => [...prev, ...newUrls]);

    setError(null);
    setShowTutorial(false);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(imageUrls[index]);
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Handle lens management for cameras
  const addLens = () => {
    if (formData.lenses && formData.lenses.length < 5) {
      setFormData(prev => ({
        ...prev,
        lenses: [...(prev.lenses || []), '']
      }));
    }
  };

  const updateLens = (index: number, value: string) => {
    const newLenses = [...(formData.lenses || [])];
    newLenses[index] = value;
    setFormData(prev => ({
      ...prev,
      lenses: newLenses
    }));
  };

  // Handle Apple accessories checkbox
  const handleAppleAccessoryChange = (accessory: 'box' | 'adapter' | 'cable' | 'receipt') => {
    setFormData(prev => ({
      ...prev,
      appleAccessories: {
        ...prev.appleAccessories!,
        [accessory]: !prev.appleAccessories![accessory]
      }
    }));
  };

  // Validation
  const validateForm = (): string | null => {
    if (!mockMode && images.length === 0) {
      return 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป';
    }

    if (!formData.itemType) {
      return 'กรุณาเลือกประเภทสินค้า';
    }

    // Validate by item type
    // Note: Serial number is NOT required during estimation - only required at pawn setup
    switch (formData.itemType) {
      case 'โทรศัพท์มือถือ':
        if (!formData.brand) return 'กรุณาเลือกยี่ห้อ';
        if (!formData.model) return 'กรุณาระบุรุ่น';
        if (!formData.capacity) return 'กรุณาระบุความจุ';
        // serialNo not required for estimation
        break;

      case 'อุปกรณ์เสริมโทรศัพท์':
        if (!formData.brand) return 'กรุณาเลือกยี่ห้อ';
        if (!formData.model) return 'กรุณาระบุรุ่น';
        break;

      case 'กล้อง':
        if (!formData.brand) return 'กรุณาเลือกยี่ห้อ';
        if (!formData.model) return 'กรุณาระบุรุ่นตัวกล้อง';
        break;

      case 'Apple':
        if (!formData.appleCategory) return 'กรุณาเลือกประเภทสินค้า Apple';
        if (!formData.model) return 'กรุณาเลือกรุ่นสินค้า Apple';
        if (!formData.capacity) return 'กรุณาระบุความจุของสินค้า Apple';
        if (!formData.color) return 'กรุณาระบุสีของสินค้า Apple';
        // serialNo not required for estimation
        break;

      case 'โน้ตบุค':
        if (!formData.brand) return 'กรุณาเลือกยี่ห้อ';
        if (!formData.model) return 'กรุณาระบุรุ่น';
        if (!formData.cpu) return 'กรุณาระบุ CPU';
        if (!formData.ram) return 'กรุณาระบุ RAM';
        if (!formData.gpu) return 'กรุณาระบุการ์ดจอ';
        break;

      case 'อุปกรณ์คอมพิวเตอร์':
        if (!formData.brand) return 'กรุณาเลือกยี่ห้อ';
        if (!formData.model) return 'กรุณาระบุรุ่น';
        break;
    }

    return null;
  };

  const getCompressionOptions = (fileCount: number) => {
    const maxTotalMB = 3.2;
    const perImageMB = Math.min(0.8, maxTotalMB / Math.max(1, fileCount));
    return {
      maxSizeMB: perImageMB,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg' as const,
    };
  };

  // Upload images
  const uploadImages = async (files: File[], signal?: AbortSignal): Promise<string[]> => {
    if (files.length === 0) return [];
    ensureNotCanceled(signal);

    const uploadPromises = files.map(async (file) => {
      ensureNotCanceled(signal);
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const response = await axios.post('/api/upload/image', formDataUpload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal,
      });

      return response.data.url;
    });

    const urls = await Promise.all(uploadPromises);
    return urls;
  };

  const hashImagesForEstimateCache = async (files: File[]): Promise<string[]> => {
    if (!files.length) return [];

    const hasSubtleCrypto = Boolean(globalThis.crypto?.subtle);
    if (!hasSubtleCrypto) {
      return files.map((file) => `${file.name}:${file.size}:${file.lastModified}`);
    }

    return Promise.all(
      files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      })
    );
  };

  // Analyze condition with AI
  const handleAnalyzeAndEstimate = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!profile?.userId) {
      setError('กรุณาเข้าสู่ระบบ LINE ก่อน');
      return;
    }

    if (mockMode) {
      setIsAnalyzing(true);
      setIsEstimating(true);
      setError(null);
      setIsCanceling(false);

      try {
        updateProcessingStatus(12, 'เตรียมข้อมูลตัวอย่าง', 'กำลังจัดเตรียม mock data สำหรับ preview');
        await waitMock(300);
        updateProcessingStatus(42, 'วิเคราะห์สภาพสินค้า', 'กำลังจำลองการวิเคราะห์สภาพจากข้อมูลที่กรอก');
        await waitMock(450);

        const mockImages = imageUrls.length > 0 ? imageUrls : getMockImageUrls(formData.itemType, formData.model);
        const { estimateResult: mockEstimateResult, conditionResult: mockConditionResult } = buildMockEstimate({
          itemType: formData.itemType,
          brand: formData.brand,
          model: formData.model,
          condition: formData.condition,
          appleCategory: formData.appleCategory,
        });

        setUploadedImageUrls(mockImages);
        setConditionResult(mockConditionResult);
        updateProcessingStatus(78, 'คำนวณราคาประเมิน', 'กำลังสร้างผลลัพธ์ตัวอย่างสำหรับ frontend preview');
        await waitMock(450);

        setEstimateResult(mockEstimateResult);
        setDesiredPrice(mockEstimateResult.estimatedPrice.toString());
        setFormData((prev) => ({
          ...prev,
          condition: Math.round(mockConditionResult.score * 100),
        }));

        updateProcessingStatus(100, 'พร้อมแสดงผล', 'กำลังเปิดหน้า Pawn Summary');
        await waitMock(250);
        setCurrentStep('pawn_summary');
      } catch (mockError) {
        console.error('Error during mock estimate flow:', mockError);
        setError('เกิดข้อผิดพลาดในการสร้าง mock preview');
      } finally {
        setIsAnalyzing(false);
        setIsEstimating(false);
        setProcessingStatus(null);
        setIsCanceling(false);
      }
      return;
    }

    let useManualEstimate = manualEstimateEnabled;
    if (!manualConfigLoaded) {
      try {
        const response = await axios.get('/api/manual-estimate/config');
        useManualEstimate = Boolean(response.data?.enabled);
        setManualEstimateEnabled(useManualEstimate);
      } catch (configError) {
        console.warn('Manual estimate config refresh failed:', configError);
      } finally {
        setManualConfigLoaded(true);
      }
    }

    setIsAnalyzing(true);
    setIsEstimating(true);
    setError(null);
    setIsCanceling(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    updateProcessingStatus(5, 'เตรียมรูปภาพ', 'กำลังบีบอัดและเตรียมรูปภาพ');

    let waitingForManual = false;

    try {
      // Step 1: Compress and analyze condition with AI
      console.log('🗜️ Compressing images...');
      const compressionOptions = getCompressionOptions(images.length);
      const compressedImages = await Promise.all(
        images.map(async (file) => {
          try {
            const compressedFile = await imageCompression(file, compressionOptions);
            console.log(`📊 Original: ${(file.size / 1024).toFixed(2)}KB → Compressed: ${(compressedFile.size / 1024).toFixed(2)}KB`);
            return compressedFile;
          } catch (error) {
            console.warn('⚠️ Compression failed, using original:', error);
            return file;
          }
        })
      );
      ensureNotCanceled(signal);

      if (useManualEstimate) {
        updateProcessingStatus(30, 'อัปโหลดรูปภาพ', 'กำลังอัปโหลดรูปภาพเพื่อประเมินราคา');
        const uploadedUrls = await uploadImages(compressedImages, signal);
        setUploadedImageUrls(uploadedUrls);
        ensureNotCanceled(signal);
        updateProcessingStatus(65, 'ส่งข้อมูล', 'กำลังส่งข้อมูลเพื่อประเมินราคา');

        const appleAccessories = formData.appleAccessories
          ? Object.entries(formData.appleAccessories)
              .filter(([, value]) => value)
              .map(([key]) => key)
          : [];
        const accessoriesValue = formData.itemType === 'Apple'
          ? appleAccessories.join(', ')
          : formData.accessories;

        const manualItemData = {
          itemType: formData.itemType,
          brand: formData.brand,
          model: formData.model,
          capacity: formData.capacity,
          color: formData.color,
          screenSize: formData.screenSize,
          watchSize: formData.watchSize,
          watchConnectivity: formData.watchConnectivity,
          accessories: accessoriesValue,
          appleAccessories,
          pawnerCondition: formData.condition,
          defects: formData.defects,
          note: formData.note,
          appleCategory: formData.appleCategory,
          appleSpecs: formData.appleSpecs,
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
          gpu: formData.gpu,
          lenses: formData.lenses?.filter(l => l.trim() !== ''),
        };

        const manualResponse = await axios.post('/api/manual-estimate', {
          lineId: profile.userId,
          itemData: manualItemData,
          imageUrls: uploadedUrls,
        }, { signal });

        setManualRequestId(manualResponse.data.requestId);
        updateProcessingStatus(90, 'ประเมินราคา', 'กำลังรอผลการประเมิน');
        waitingForManual = true;
        return;
      }

      updateProcessingStatus(20, 'เตรียมรูปภาพ', 'กำลังแปลงรูปภาพสำหรับตรวจสอบ');

      // Convert compressed images to base64
      const base64Images = await Promise.all(
        compressedImages.map(async (file) => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );
      ensureNotCanceled(signal);
      updateProcessingStatus(35, 'ตรวจสอบรูปภาพ', 'กำลังตรวจสอบประเภทสินค้าและความสอดคล้องของรูปภาพ');

      console.log('🔍 Analyzing condition...');
      const conditionResponse = await axios.post('/api/analyze-condition', {
        images: base64Images,
        itemType: formData.itemType,
        brand: formData.brand,
        model: formData.model,
        appleCategory: formData.appleCategory,
      }, { signal });

      setConditionResult(conditionResponse.data);
      setIsAnalyzing(false);
      console.log('✅ Condition analysis completed');
      ensureNotCanceled(signal);
      updateProcessingStatus(60, 'อัปโหลดรูปภาพ', 'กำลังอัปโหลดรูปภาพเพื่อประเมินราคา');

      const imageHashes = await hashImagesForEstimateCache(compressedImages);
      ensureNotCanceled(signal);

      // Step 2: Upload images
      console.log('📤 Starting image upload...');
      const uploadedUrls = await uploadImages(compressedImages, signal);
      setUploadedImageUrls(uploadedUrls);
      console.log('✅ Image upload completed:', uploadedUrls);
      ensureNotCanceled(signal);
      updateProcessingStatus(80, 'ประเมินราคา', 'กำลังคำนวณราคาประเมิน');

      const pawnerConditionPercent = Number.isFinite(formData.condition)
        ? Math.min(100, Math.max(0, formData.condition))
        : 0;
      const aiConditionPercent = Number.isFinite(conditionResponse.data.score)
        ? Math.min(100, Math.max(0, conditionResponse.data.score <= 1 ? conditionResponse.data.score * 100 : conditionResponse.data.score))
        : 0;
      const finalConditionPercent = Math.min(
        100,
        Math.max(0, pawnerConditionPercent * 0.6 + aiConditionPercent * 0.4)
      );
      const finalConditionScore = finalConditionPercent / 100;

      // Step 3: Estimate price with AI
      console.log('🧠 Starting price estimation...');
      const appleExtraLines = formData.itemType === 'Apple'
        ? [
            formData.appleCategory ? `Category: ${formData.appleCategory}` : null,
            formData.capacity ? `Capacity: ${formData.capacity}` : null,
            formData.appleSpecs ? `Specs: ${formData.appleSpecs}` : null,
            formData.color ? `Color: ${formData.color}` : null,
          ].filter(Boolean).join('\n')
        : '';
      const estimateData = {
        itemType: formData.itemType,
        brand: formData.brand,
        model: formData.model,
        capacity: formData.capacity,
        accessories: formData.itemType === 'Apple'
          ? Object.entries(formData.appleAccessories || {})
              .filter(([, value]) => value)
              .map(([key]) => key)
              .join(', ')
          : formData.accessories,
        condition: finalConditionScore,
        pawnerCondition: pawnerConditionPercent,
        aiCondition: conditionResponse.data.score,
        defects: formData.defects,
        note: [formData.note, appleExtraLines].filter(Boolean).join('\n'),
        images: uploadedUrls,
        imageHashes,
        lineId: profile.userId,
        // Additional fields based on item type
        ...(formData.itemType === 'กล้อง' && { lenses: formData.lenses?.filter(l => l.trim() !== '') }),
        ...(formData.itemType === 'โน้ตบุค' && {
          cpu: formData.cpu,
          ram: formData.ram,
          storage: formData.storage,
          gpu: formData.gpu,
        }),
      };

      const estimateResponse = await axios.post('/api/estimate', estimateData, { signal });
      console.log('✅ Price estimation completed:', estimateResponse.data);
      setEstimateResult(estimateResponse.data);
      setDesiredPrice(estimateResponse.data.estimatedPrice.toString());
      updateProcessingStatus(100, 'สรุปผล', 'กำลังจัดเตรียมผลการประเมิน');

      // Update form data with blended condition
      setFormData(prev => ({
        ...prev,
        condition: finalConditionPercent
      }));

      // Move to pawn summary step
      console.log('🎯 Moving to pawn summary step');
      setCurrentStep('pawn_summary');

    } catch (error: any) {
      console.error('Error during analysis and estimation:', error);
      if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
        setError('ยกเลิกการประเมินแล้ว');
        return;
      }
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการประเมินราคา');
    } finally {
      if (waitingForManual) {
        setIsAnalyzing(false);
        setIsEstimating(true);
        setIsCanceling(false);
        abortControllerRef.current = null;
      } else {
        setIsAnalyzing(false);
        setIsEstimating(false);
        setProcessingStatus(null);
        setIsCanceling(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Create pawn request
  const handleCreatePawnRequest = async () => {
    if (!selectedStore || !estimateResult) {
      setError('กรุณาเลือกร้านและกรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (!customer) {
      setError('กรุณาลงทะเบียนก่อนสร้าง QR Code');
      const liffIdRegister = process.env.NEXT_PUBLIC_LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
      window.location.href = `https://liff.line.me/${liffIdRegister}/register`;
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (mockMode) {
        await waitMock(500);
        const mockRequest = createMockPawnRequest();
        setLoanRequestId(mockRequest.requestId);
        setCurrentStep('qr_display');
        return;
      }

      const pawnRequestData = {
        lineId: profile?.userId,
        brand: formData.brand,
        model: formData.model,
        type: formData.itemType,
        serialNo: formData.serialNo,
        condition: formData.condition,
        defects: formData.defects,
        note: formData.note,
        accessories: formData.itemType === 'Apple'
          ? Object.entries(formData.appleAccessories || {})
              .filter(([, value]) => value)
              .map(([key]) => key)
              .join(', ')
          : formData.accessories,
        images: uploadedImageUrls,
        estimatedValue: estimateResult.estimatedPrice,
        pawnedPrice: parseFloat(desiredPrice) || estimateResult.estimatedPrice,
        interestRate: interestCalculationType === 'daily'
          ? stores.find(s => s._id === selectedStore)?.interestPerday || 0
          : (stores.find(s => s._id === selectedStore)?.interestSet?.[pawnDuration.toString()] || 0) / parseInt(pawnDuration) / 30,
        periodDays: parseInt(pawnDuration),
        storeId: selectedStore,
        customer: customer,
        status: 'pending'
      };

      const response = await axios.post('/api/pawn-requests', pawnRequestData);

      if (response.data.success) {
        setCurrentStep('qr_display');
      } else {
        throw new Error(response.data.error || 'Failed to create pawn request');
      }
    } catch (error: any) {
      console.error('Error creating pawn request:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้าง QR Code');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center page-investor">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="theme-liff min-h-screen flex items-center justify-center bg-background-white p-6">
        <div className="w-full max-w-md rounded-[30px] border border-primary-border/60 bg-gradient-to-br from-background-white via-primary-soft/35 to-primary-border/30 p-4 shadow-[0_22px_60px_rgba(219,71,16,0.14)]">
          <div className="rounded-[24px] border border-background-white/90 bg-background-white/90 px-4 py-6 text-center shadow-[0_10px_24px_rgba(219,71,16,0.06)]">
          <p className="text-error">เกิดข้อผิดพลาด: {liffError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-liff page-pawner min-h-screen bg-background-white flex justify-center py-4 px-2 font-sans md:px-0">
      <div className="w-full max-w-md px-1 pb-20 pt-2 md:px-0">
        {isProcessing && processingStatus && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-foreground/40" />
            <div className="relative w-full max-w-sm rounded-xl border border-primary-border/40 bg-background-white p-5 shadow-[var(--shadow-strong)]">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-primary-border border-t-primary animate-spin" />
                <div>
                  <p className="text-xs text-foreground-subtle">กำลังดำเนินการ</p>
                  <p className="text-base font-semibold text-foreground-muted">{processingStatus.title}</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-foreground-subtle">{processingStatus.detail}</p>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-foreground-subtle">
                  <span>ความคืบหน้า</span>
                  <span>{processingStatus.percent}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background-subtle">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${processingStatus.percent}%` }}
                  />
                </div>
              </div>

              <button
                onClick={handleCancelProcessing}
                disabled={isCanceling}
                className="mt-5 w-full min-h-12 rounded-full border border-s1 bg-background-white px-4 py-2 text-sm font-medium text-s1 hover:bg-background-subtle disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCanceling ? 'กำลังยกเลิก...' : 'ยกเลิกการประเมิน'}
              </button>
            </div>
          </div>
        )}

        {/* Form Step */}
        {currentStep === 'form' && (
          <>
            {/* Header */}
            <div className="mb-4 rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <div className="rounded-[var(--radius-lg)] border border-background-white/80 bg-background-white/90 px-4 py-4">
                <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
                  AI Price Estimation
                </div>
                <div className="mt-3 text-primary bg-clip-text text-3xl font-semibold tracking-[0.08em]">
                  ประเมินราคา
                </div>
                <p className="mt-1 text-xs text-foreground-subtle">
                  กรอกรายละเอียดสินค้า อัปโหลดรูปภาพ และตั้งค่าขอสินเชื่อในสไตล์เดียวกับหน้าสมัครสมาชิก
                </p>
              </div>
            </div>

            {/* Image Upload Section */}
            <EstimateSection title="Item Images" subtitle="รูปสินค้า" className="mb-4">
              <div className="flex justify-between items-end mb-2">
                <FormLabel thai="รูปสินค้า" eng="Item images" required />
                <span className="text-foreground-subtle text-xs">{images.length}/6</span>
              </div>

              {images.length === 0 ? (
                <div className="border-2 border-dashed border-primary-border rounded-[var(--radius-lg)] bg-background-white/90 text-primary-border h-32 flex flex-col items-center justify-center cursor-pointer hover:bg-background-subtle transition-colors shadow-[0_8px_18px_rgba(11,59,130,0.05)]" onClick={() => setShowTutorial(true)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" className="bi bi-camera-fill" viewBox="0 0 16 16">
                    <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/>
                    <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0"/>
                  </svg>
                  <span className="mt-2 text-foreground-subtle text-sm font-medium">เพิ่มรูปถ่าย</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {imageUrls.map((url, index) => (
                    <div key={index} className="relative">
                      <Image
                        src={url}
                        alt={`สินค้า ${index + 1}`}
                        width={100}
                        height={100}
                        className="w-full h-24 object-cover rounded-2xl"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-error text-error-fg rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {images.length < 6 && (
                    <button
                      onClick={() => setShowTutorial(true)}
                      className="border-2 border-dashed border-primary-border rounded-[var(--radius-lg)] h-24 flex items-center justify-center bg-background-white/75 text-foreground-subtle"
                    >
                      +
                    </button>
                  )}
                </div>
              )}

              <div className="mt-3 text-xs text-foreground-subtle space-y-1">
                {formData.itemType === 'อุปกรณ์เสริมโทรศัพท์' ? (
                  <>
                    <p>*อย่างน้อย 2 รูป</p>
                    <p>*หากมีอุปกรณ์เสริมให้ถ่ายอุปกรณ์เสริมด้วย</p>
                  </>
                ) : formData.itemType === 'Apple' ? (
                  <>
                    <p>*ถ่ายรูปตัวเครื่องรอบด้าน และตำหนิ(ถ้ามี)</p>
                    <p>*ถ่ายหน้า About/Settings ที่แสดง Serial Number</p>
                  </>
                ) : isSerialRequiredForType(formData.itemType) ? (
                  <>
                    <p>*กรุณาถ่าย serial number 1 รูป</p>
                    <p>*หากมีอุปกรณ์เสริมให้ถ่ายอุปกรณ์เสริมด้วย</p>
                  </>
                ) : (
                  <>
                    <p>*ถ่ายรูปตัวสินค้าให้เห็นรายละเอียดชัดเจน</p>
                    <p>*หากมีอุปกรณ์เสริมให้ถ่ายอุปกรณ์เสริมด้วย</p>
                  </>
                )}
              </div>
            </EstimateSection>

            <EstimateSection title="Item Details" subtitle="รายละเอียดสินค้า" className="mb-4">
              <div className="mb-4">
                <FormLabel thai="ประเภทสินค้า" eng="Item type" required />
                <div className="relative">
                  <DropdownField
                    value={formData.itemType}
                    placeholder="เลือกประเภทสินค้า"
                    options={ITEM_TYPES.map((type) => ({ value: type.value, label: type.label }))}
                    onChange={(nextValue) => {
                      handleInputChange({
                        target: { name: 'itemType', value: nextValue },
                      } as React.ChangeEvent<HTMLSelectElement>);
                    }}
                  />
                </div>
              </div>

              {/* Conditional Fields Based on Item Type */}
              {formData.itemType && (
                <>
                  <div className="h-px bg-primary my-6"></div>

                  {/* Apple Product Selection */}
                  {formData.itemType === 'Apple' && (
                    <div className="mb-6 space-y-4">
                      <div>
                        <FormLabel thai="ประเภทสินค้า Apple" eng="Apple category" required />
                        <div className="relative">
                          <DropdownField
                            value={formData.appleCategory || ''}
                            placeholder="เลือกประเภทสินค้า"
                            options={APPLE_CATEGORIES.map((category) => ({ value: category.value, label: category.label }))}
                            onChange={(nextValue) => {
                              handleAppleCategoryChange({
                                target: { value: nextValue },
                              } as React.ChangeEvent<HTMLSelectElement>);
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <FormLabel thai="รุ่นสินค้า Apple" eng="Apple model" required />
                        <div className="relative">
                          <DropdownField
                            value={formData.model}
                            placeholder={formData.appleCategory ? 'เลือกรุ่นสินค้า' : 'กรุณาเลือกประเภทสินค้าก่อน'}
                            options={appleModels.map((model) => ({ value: model, label: model }))}
                            onChange={(nextValue) => {
                              handleAppleModelChange({
                                target: { value: nextValue },
                              } as React.ChangeEvent<HTMLSelectElement>);
                            }}
                            disabled={!formData.appleCategory}
                          />
                        </div>
                      </div>

                      <div>
                        <FormLabel thai="ความจุ" eng="Capacity" required />
                        <input
                          type="text"
                          name="capacity"
                          value={formData.capacity}
                          onChange={handleInputChange}
                          placeholder="เช่น 128GB, 256GB, 1TB"
                          list="apple-capacity-options"
                          className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                        />
                        <datalist id="apple-capacity-options">
                          <option value="32GB" />
                          <option value="64GB" />
                          <option value="128GB" />
                          <option value="256GB" />
                          <option value="512GB" />
                          <option value="1TB" />
                          <option value="2TB" />
                          <option value="4TB" />
                          <option value="8TB" />
                        </datalist>
                      </div>

                      <div>
                        <FormLabel thai="สเปคเพิ่มเติม" eng="Additional specs" />
                        <input
                          type="text"
                          name="appleSpecs"
                          value={formData.appleSpecs}
                          onChange={handleInputChange}
                          placeholder="เช่น ชิป M2, Cellular, GPS + Cellular"
                          className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                        />
                      </div>

                      <div>
                        <FormLabel thai="สี" eng="Color" required />
                        <input
                          type="text"
                          name="color"
                          value={formData.color}
                          onChange={handleInputChange}
                          placeholder="เช่น Black, Silver, Starlight..."
                          className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                        />
                      </div>
                    </div>
                  )}

                {/* Regular Brand Selection (Not Apple) */}
                {formData.itemType !== 'Apple' && (
                  <div className="mb-4">
                    <FormLabel thai="ยี่ห้อ" eng="Brand" required />
                    <div className="relative">
                      <DropdownField
                        value={formData.brand}
                        placeholder="ยี่ห้อ"
                        options={(BRANDS_BY_TYPE[formData.itemType] || []).map((brand) => ({ value: brand, label: brand }))}
                        onChange={(nextValue) => {
                          handleInputChange({
                            target: { name: 'brand', value: nextValue },
                          } as React.ChangeEvent<HTMLSelectElement>);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Model Field (Not for Apple - already filled by search) */}
                {formData.itemType !== 'Apple' && (
                  <div className="mb-4">
                    <FormLabel thai="รุ่น" eng="Model" required />
                    <input
                      type="text"
                      name="model"
                      value={formData.model}
                      onChange={handleInputChange}
                      placeholder="รุ่น"
                      className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                    />
                  </div>
                )}

                {/* Mobile Specific Fields */}
                {formData.itemType === 'โทรศัพท์มือถือ' && (
                  <>
                    <div className="h-px bg-line-soft my-6"></div>
                    <div className="mb-4">
                      <FormLabel thai="ความจุ" eng="Capacity" required />
                      <input
                        type="text"
                        name="capacity"
                        value={formData.capacity}
                        onChange={handleInputChange}
                        placeholder="ความจุเครื่อง"
                        className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                      />
                    </div>
                  </>
                )}

                {/* Camera Specific - Lens Model */}
                {formData.itemType === 'กล้อง' && (
                  <div className="mb-4 bg-background-subtle/60 p-2 -mx-2 rounded-2xl">
                    <div className="flex justify-between items-end mb-2 px-1">
                      <FormLabel thai="รุ่นเลนส์" eng="Lens model" />
                      <span className="text-foreground-subtle text-xs">{formData.lenses?.length || 0}/5</span>
                    </div>

                    <div className="space-y-3">
                      {formData.lenses?.map((lens, index) => (
                        <input
                          key={index}
                          type="text"
                          value={lens}
                          onChange={(e) => updateLens(index, e.target.value)}
                          placeholder="รุ่นเลนส์"
                          className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                        />
                      ))}

                      {(formData.lenses?.length || 0) < 5 && (
                        <button
                          type="button"
                          onClick={addLens}
                        className="w-full min-h-12 py-2.5 border border-primary-border text-primary rounded-2xl font-medium hover:bg-primary-soft transition-colors flex items-center justify-center gap-1 text-sm md:text-base"
                        >
                          <span className="font-bold">เพิ่ม</span>
                          <span className="text-xs font-normal">add</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Laptop Specific Fields */}
                {formData.itemType === 'โน้ตบุค' && (
                  <>
                    <div className="h-px bg-line-soft my-6"></div>
                    <div className="mb-4">
                      <FormLabel thai="ซีพียู" eng="CPU" required />
                      <input
                        type="text"
                        name="cpu"
                        value={formData.cpu}
                        onChange={handleInputChange}
                        placeholder="CPU"
                        className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                      />
                    </div>
                    <div className="mb-4">
                      <FormLabel thai="แรม" eng="RAM" required />
                      <input
                        type="text"
                        name="ram"
                        value={formData.ram}
                        onChange={handleInputChange}
                        placeholder="RAM"
                        className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                      />
                    </div>
                    <div className="mb-4">
                      <FormLabel thai="การ์ดจอ" eng="GPU" required />
                      <input
                        type="text"
                        name="gpu"
                        value={formData.gpu}
                        onChange={handleInputChange}
                        placeholder="GPU"
                        className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                      />
                    </div>
                  </>
                )}

                {/* Accessories (for relevant types) */}
                {(formData.itemType === 'โทรศัพท์มือถือ' || formData.itemType === 'กล้อง' || formData.itemType === 'โน้ตบุค') && (
                  <div className="mb-6">
                    <FormLabel
                      thai="อุปกรณ์เสริม"
                      eng="Accessories"
                      required={false}
                    />
                    <input
                      type="text"
                      name="accessories"
                      value={formData.accessories}
                      onChange={handleInputChange}
                      placeholder="อุปกรณ์เสริม"
                      className="w-full min-h-12 p-3 border border-primary-border rounded-full bg-background-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle text-sm md:text-sm text-foreground-muted"
                    />
                  </div>
                )}

                {/* Apple Accessories Checkboxes */}
                {formData.itemType === 'Apple' && (
                  <div className="mb-8">
                    <FormLabel thai="อุปกรณ์ที่มีให้" eng="Included Items" />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <label
                        className={`flex items-center justify-center rounded-full border px-4 py-2 text-center transition-colors ${
                          formData.appleAccessories?.box
                            ? 'border-primary bg-primary text-primary-fg'
                            : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
                        } cursor-pointer`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={formData.appleAccessories?.box || false}
                          onChange={() => handleAppleAccessoryChange('box')}
                        />
                        กล่อง (Box)
                      </label>
                      <label
                        className={`flex items-center justify-center rounded-full border px-4 py-2 text-center transition-colors ${
                          formData.appleAccessories?.adapter
                            ? 'border-primary bg-primary text-primary-fg'
                            : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
                        } cursor-pointer`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={formData.appleAccessories?.adapter || false}
                          onChange={() => handleAppleAccessoryChange('adapter')}
                        />
                        หัวชาร์จ (Adapter)
                      </label>
                      <label
                        className={`flex items-center justify-center rounded-full border px-4 py-2 text-center transition-colors ${
                          formData.appleAccessories?.cable
                            ? 'border-primary bg-primary text-primary-fg'
                            : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
                        } cursor-pointer`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={formData.appleAccessories?.cable || false}
                          onChange={() => handleAppleAccessoryChange('cable')}
                        />
                        สายชาร์จ (Cable)
                      </label>
                      <label
                        className={`flex items-center justify-center rounded-full border px-4 py-2 text-center transition-colors ${
                          formData.appleAccessories?.receipt
                            ? 'border-primary bg-primary text-primary-fg'
                            : 'border-primary-border bg-background-white text-foreground-subtle hover:bg-background-subtle'
                        } cursor-pointer`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={formData.appleAccessories?.receipt || false}
                          onChange={() => handleAppleAccessoryChange('receipt')}
                        />
                        ใบเสร็จ (Receipt)
                      </label>
                    </div>
                  </div>
                )}

                {/* Condition Slider */}
                <div className="mb-4 mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <FormLabel thai="สภาพ" eng="Condition" required />
                    <span className="text-primary font-bold">{formData.condition}%</span>
                  </div>

                  <div className="mb-2 rounded-lg border border-primary/15 bg-background-white px-5 py-3">
                    <VolumeSlider
                      min={0}
                      max={100}
                      step={1}
                      value={formData.condition}
                      ariaLabel="Condition"
                      onChange={(condition) => setFormData(prev => ({ ...prev, condition }))}
                    />

                    <div className="mt-3 flex justify-between text-xs font-semibold text-foreground-subtle">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                {/* Condition Instructions Box */}
                <div className="bg-background-white rounded-lg px-4 py-3 mb-6 border border-primary-border">
                  <div
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => setIsConditionExpanded(!isConditionExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm md:text-base">
                        {formData.itemType === 'Apple' ? 'วิธีประเมินสภาพ' : 'วิธีดูสภาพ'}
                      </span>
                      <span className="bg-background-subtle text-foreground-subtle text-xs px-2 py-0.5 rounded-md">
                        {formData.itemType === 'Apple' ? 'Guide' : 'Instructions'}
                      </span>
                    </div>
                    {isConditionExpanded ? <ChevronUp className="w-5 h-5 text-foreground-subtle" /> : <ChevronDown className="w-5 h-5 text-foreground-subtle" />}
                  </div>

                  <div
                    className={`overflow-hidden text-sm text-foreground-muted transition-[max-height,opacity,transform] duration-300 ease-out ${
                      isConditionExpanded
                        ? 'mt-3 max-h-[500px] translate-y-0 border-t border-primary-border pt-3 opacity-100'
                        : 'max-h-0 -translate-y-2 opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="space-y-3">
                      {formData.itemType === 'Apple' ? (
                        <>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-foreground-muted">95 - 100%</span>
                            <span>Perfect: ไม่มีรอย เครื่องสวยกริ๊บ แบตเตอรี่สุขภาพดี</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-foreground-muted">80 - 94%</span>
                            <span>Good: มีรอยขนแมวเล็กน้อยตามขอบ ไม่กระทบหน้าจอ</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-foreground-muted">60 - 79%</span>
                            <span>Fair: มีรอยชัดเจน รอยบุบ หรือหน้าจอลอก แต่ใช้งานปกติ</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-foreground-muted">ต่ำกว่า 60%</span>
                            <span>Poor: จอแตก เปิดไม่ติด หรือมีฟังก์ชันเสียหาย (เช่น FaceID เสีย)</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-foreground-muted">90 - 100%</span>
                            <span>เหมือนใหม่ ไม่มีรอยขีดข่วนหรือตำหนิใดๆ ใช้งานได้ 100%</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-foreground-muted">70 - 89%</span>
                            <span>ใช้งานได้ หน้าจอไม่มีรอยตำหนิลึก อาจมีรอยขนแมวตามขอบหรือด้านหลังเล็กน้อย</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-foreground-muted">50 - 69%</span>
                            <span>ใช้งานได้ <span className="font-bold text-foreground">แต่</span> หน้าจอมีรอยขีดข่วนชัดเจน ตัวเครื่องมีรอยบุบ/ถลอกจากการใช้งาน</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-foreground-muted">25 - 49%</span>
                            <span>ใช้งานได้แต่มีตำหนิใหญ่ หน้าจอมีรอยร้าว หรือตัวเครื่องมีรอยบุบอย่างเห็นได้ชัด</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-foreground-muted">0 - 24%</span>
                            <span>ใช้งานไม่ได้ เครื่องเปิดไม่ติด, หน้าจอแตก, ปุ่มหลักเสีย, หรือมีความเสียหายจากน้ำ</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Defects */}
                <div className="mb-4">
                  <FormLabel thai="ตำหนิ" eng="Defects" />
                  {formData.itemType === 'Apple' ? (
                    <textarea
                      name="defects"
                      value={formData.defects}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="เช่น จอมี Dead Pixel 1 จุด, สายชาร์จเหลือง, ไม่มีกล่อง..."
                      className="w-full min-h-12 rounded-2xl border border-primary-border bg-background-white p-3 text-sm md:text-sm text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle"
                    />
                  ) : (
                    <input
                      type="text"
                      name="defects"
                      value={formData.defects}
                      onChange={handleInputChange}
                      placeholder="ตำหนิ"
                      className="w-full min-h-12 rounded-full border border-primary-border bg-background-white p-3 text-sm md:text-sm text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle"
                    />
                  )}
                </div>

                {/* Remarks */}
                <div className="mb-8">
                  <FormLabel thai="หมายเหตุ" eng="Remarks" />
                  <input
                    type="text"
                    name="note"
                    value={formData.note}
                    onChange={handleInputChange}
                    placeholder="หมายเหตุ"
                    className="w-full min-h-12 rounded-full border border-primary-border bg-background-white p-3 text-sm md:text-sm text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-foreground-subtle"
                  />
                </div>
                </>
              )}
            </EstimateSection>

            {/* Error Message */}
            {error && (
              <div className="mb-4 rounded-lg border border-error/20 bg-error-soft p-3 text-error">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleAnalyzeAndEstimate}
                disabled={isProcessing}
                className="w-full min-h-12 rounded-full px-4 py-3 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: isProcessing ? 'var(--background-subtle)' : 'var(--primary)',
                  color: 'var(--primary-fg)',
                }}
              >
                {isProcessing ? 'กำลังประมวลผล...' : 'ประเมินราคาด้วย AI'}
              </button>

              <button
                onClick={() => router.push('/drafts')}
                className="relative flex w-full min-h-12 items-center justify-center rounded-full bg-background-subtle px-4 py-3 text-base font-medium text-foreground-muted transition-colors hover:bg-line-soft"
              >
                <span className="text-center">ดูบันทึกชั่วคราว</span>
                {draftCount > 0 && (
                  <span className="absolute right-4 flex h-6 w-6 items-center justify-center rounded-full bg-error text-[10px] font-bold text-error-fg">
                    {draftCount}
                  </span>
                )}
              </button>
            </div>
          </>
        )}

        {/* Pawn Summary Step */}
        {(() => {
          console.log('🔍 Checking pawn summary conditions:', {
            currentStep,
            hasEstimateResult: !!estimateResult,
            hasProfileUserId: !!profile?.userId,
            shouldShow: currentStep === 'pawn_summary' && estimateResult && profile?.userId
          });
          return currentStep === 'pawn_summary' && estimateResult && profile?.userId;
        })() && (
          <PawnSummary
            itemData={{
              itemType: formData.itemType,
              brand: formData.brand,
              model: formData.model,
              capacity: formData.capacity,
              color: formData.color,
              screenSize: formData.screenSize,
              watchSize: formData.watchSize,
              watchConnectivity: formData.watchConnectivity,
              serialNo: formData.serialNo,
              devicePasscode: formData.devicePasscode,
              condition: formData.condition,
              aiConditionScore: conditionResult?.score,
              aiConditionReason: conditionResult?.reason,
              images: uploadedImageUrls,
              estimatedPrice: estimateResult?.estimatedPrice || 0,
              aiConfidence: estimateResult?.confidence,
              appleAccessories: formData.appleAccessories
                ? Object.entries(formData.appleAccessories)
                    .filter(([, value]) => value)
                    .map(([key]) => key)
                : [],
              processor: formData.cpu,
              ram: formData.ram,
              storage: formData.storage,
              gpu: formData.gpu,
              lenses: formData.lenses
                ?.filter(l => l.trim() !== '')
                .map(l => ({ brand: '', model: l })),
              defects: formData.defects,
              notes: [
                formData.note,
                formData.itemType === 'Apple'
                  ? [
                      formData.appleCategory ? `Category: ${formData.appleCategory}` : null,
                      formData.capacity ? `Capacity: ${formData.capacity}` : null,
                      formData.appleSpecs ? `Specs: ${formData.appleSpecs}` : null,
                      formData.color ? `Color: ${formData.color}` : null,
                    ].filter(Boolean).join('\n')
                  : null,
              ].filter(Boolean).join('\n'),
            }}
            lineId={profile.userId}
            draftItemId={effectiveDraftId}
            onBack={() => {
              resetEstimateForm();
              setCurrentStep('form');
            }}
            onSuccess={(reqId, itmId) => {
              console.log('🎉 onSuccess called with:', reqId, itmId);

              if (!reqId || !itmId) {
                console.error('❌ Invalid reqId or itmId received:', { reqId, itmId });
                alert('เกิดข้อผิดพลาดในการสร้างคำขอ กรุณาลองใหม่อีกครั้ง');
                return;
              }

              console.log('📊 Setting state - loanRequestId:', reqId, 'itemId:', itmId);
              clearPawnerEstimateResume(profile.userId);
              setLoanRequestId(reqId);
              setItemId(itmId);
              setCurrentStep('contract_agreement');
            }}
          />
        )}

        {/* Contract Agreement Step */}
        {currentStep === 'contract_agreement' && profile?.userId && (
          <ContractAgreementStep
            loanRequestId={loanRequestId}
            itemId={itemId}
            lineId={profile.userId}
            onBack={() => setCurrentStep('pawn_summary')}
            onSuccess={(newContractId) => {
              setContractId(newContractId);
              setCurrentStep('contract_success');
            }}
          />
        )}

        {/* Contract Success Step */}
        {currentStep === 'contract_success' && (
          <ContractSuccess
            contractId={contractId}
            onBackToHome={() => {
              setCurrentStep('form');
              setFormData(createInitialFormData());
              setImages([]);
              setImageUrls([]);
              setEstimateResult(null);
              setConditionResult(null);
              setSelectedStore('');
              setLoanRequestId('');
              setItemId('');
              setContractId('');
            }}
          />
        )}

        {/* Estimate Result Step */}
        {currentStep === 'estimate_result' && estimateResult && conditionResult && (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-primary-border bg-gradient-to-br from-background-white via-primary-soft/35 to-primary-border/30 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <div className="rounded-[24px] border border-background-white/80 bg-background-white/70 px-4 py-4 text-center">
                <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground-subtle">
                  Estimate Result
                </div>
                <div className="mt-3 bg-gradient-to-r from-primary via-s2 to-s2-active bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                  ผลการประเมินราคา
                </div>
                <p className="mt-1 text-xs text-foreground-subtle">
                  ตรวจสอบราคาประเมิน สภาพสินค้า และรายละเอียดก่อนดำเนินการต่อ
                </p>
              </div>
            </div>

            <EstimateSection title="Estimated Price" subtitle="ราคาประเมิน">
              <div className="rounded-[24px] border border-primary-border bg-background-white/80 p-6 text-center shadow-[0_8px_18px_rgba(11,59,130,0.05)]">
                <p className="mb-2 text-sm text-foreground-subtle">ราคาประเมิน</p>
                <p className="text-4xl font-bold text-primary">{estimateResult.estimatedPrice.toLocaleString()} ฿</p>
                <p className="mt-2 text-xs text-foreground-subtle">Confidence: {Math.round(estimateResult.confidence * 100)}%</p>
              </div>
            </EstimateSection>

            <EstimateSection title="Condition Analysis" subtitle="สภาพสินค้า (วิเคราะห์โดย AI)">
              <div className="rounded-[24px] border border-primary-border bg-background-white/80 p-4 shadow-[0_8px_18px_rgba(11,59,130,0.05)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground-subtle">คะแนนสภาพ:</span>
                  <span className="text-lg font-bold text-foreground-muted">{Math.round(conditionResult.score * 100)}%</span>
                </div>
                <div className="w-full rounded-full h-3 mb-3 bg-background-subtle">
                  <div
                    className="h-3 rounded-full bg-success"
                    style={{ width: `${conditionResult.score * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-foreground-muted">{conditionResult.reason}</p>
              </div>
            </EstimateSection>

            <EstimateSection title="Item Details" subtitle="รายละเอียดสินค้า">
              <div className="rounded-[24px] border border-primary-border bg-background-white/80 p-4 shadow-[0_8px_18px_rgba(11,59,130,0.05)]">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-foreground-subtle">ประเภท:</span>
                    <span className="font-medium text-foreground-muted">{formData.itemType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-subtle">ยี่ห้อ:</span>
                    <span className="font-medium text-foreground-muted">{formData.brand}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-subtle">รุ่น:</span>
                    <span className="font-medium text-foreground-muted">{formData.model}</span>
                  </div>
                </div>
              </div>
            </EstimateSection>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setCurrentStep('pawn_setup')}
                className="w-full rounded-full bg-success px-4 py-3 text-base font-medium text-success-fg transition-colors hover:bg-success-hover"
              >
                ดำเนินการขอสินเชื่อต่อ
              </button>
              <button
                onClick={() => {
                  // Full reset for new estimation
                  setCurrentStep('form');
                  setFormData(createInitialFormData());
                  setImages([]);
                  setImageUrls([]);
                  setUploadedImageUrls([]);
                  setEstimateResult(null);
                  setConditionResult(null);
                  setSelectedStore('');
                  setError(null);
                }}
                className="w-full rounded-full bg-background-subtle px-4 py-3 text-base font-medium text-foreground-muted transition-colors hover:bg-line-soft"
              >
                ประเมินสินค้าอื่น
              </button>
            </div>
          </div>
        )}

        {/* Pawn Setup Step */}
        {currentStep === 'pawn_setup' && estimateResult && (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-primary-border bg-gradient-to-br from-background-white via-primary-soft/35 to-primary-border/30 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <div className="rounded-[24px] border border-background-white/80 bg-background-white/70 px-4 py-4 text-center">
                <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground-subtle">
                  Pawn Setup
                </div>
                <div className="mt-3 bg-gradient-to-r from-primary via-s2 to-s2-active bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                  ตั้งค่าการขอสินเชื่อ
                </div>
                <p className="mt-1 text-xs text-foreground-subtle">
                  เลือกสาขา ระยะเวลา และตรวจสอบยอดรวมก่อนสร้าง QR Code
                </p>
              </div>
            </div>

            <EstimateSection title="Serial Number" subtitle="หมายเลขซีเรียล">
              <FormLabel
                thai={formData.itemType === 'Apple' ? 'Serial Number / IMEI' : 'หมายเลขซีเรียล'}
                eng="Serial no."
                required={isSerialRequiredForType(formData.itemType)}
              />
              <input
                type="text"
                name="serialNo"
                value={formData.serialNo}
                onChange={handleInputChange}
                placeholder={formData.itemType === 'Apple' ? 'ระบุหมายเลขเครื่อง' : 'ระบุหมายเลขซีเรียล'}
                className="w-full min-h-12 rounded-2xl border border-line-soft bg-background-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-2 text-xs text-foreground-subtle">
                {isSerialRequiredForType(formData.itemType)
                  ? 'กรุณากรอกเลขเครื่อง/Serial ให้ครบถ้วนก่อนดำเนินการขอสินเชื่อ'
                  : 'ถ้ามีหมายเลขซีเรียล สามารถกรอกได้เพื่อความถูกต้องของสัญญา'}
              </p>
            </EstimateSection>

            <EstimateSection title="Drop Point" subtitle="เลือกจุดรับฝาก">
              <DropdownField
                value={selectedStore}
                placeholder="กรุณาเลือกร้าน"
                options={stores.map((store) => ({ value: store._id, label: store.storeName }))}
                onChange={setSelectedStore}
              />
            </EstimateSection>

            {/* Duration and Interest */}
            {selectedStore && (
              <EstimateSection title="Loan Terms" subtitle="ระยะเวลาและดอกเบี้ย">
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">จำนวนวันที่ต้องการขอสินเชื่อ</label>
                  <DropdownField
                    value={pawnDuration}
                    placeholder="เลือกจำนวนวัน"
                    options={['7', '14', '30', '60', '90'].map((day) => ({ value: day, label: `${day} วัน` }))}
                    onChange={setPawnDuration}
                  />
                </div>

                {/* Interest Calculation Display */}
                <div className="rounded-xl border border-primary-border bg-background-white/80 p-4 shadow-[0_8px_18px_rgba(11,59,130,0.05)]">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>ราคาประเมิน:</span>
                      <span className="font-semibold">{estimateResult.estimatedPrice.toLocaleString()} บาท</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>ราคาที่ต้องการขอสินเชื่อ:</span>
                      <div className="flex items-center gap-2">
                          <input
                          type="number"
                          value={desiredPrice}
                          onChange={(e) => setDesiredPrice(e.target.value)}
                          placeholder={estimateResult.estimatedPrice.toString()}
                          className="w-24 rounded border border-line-soft p-1 text-right text-sm placeholder:text-foreground-subtle"
                          min="1"
                          max={estimateResult.estimatedPrice}
                        />
                        <span>บาท</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span>จำนวนวัน:</span>
                      <span className="font-semibold">{pawnDuration} วัน</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ดอกเบี้ย:</span>
                      <span className="font-semibold text-error">{interestAmount.toLocaleString()} บาท</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span>รวมทั้งสิ้น:</span>
                      <span className="text-success">{totalAmount.toLocaleString()} บาท</span>
                    </div>
                  </div>
                </div>
              </EstimateSection>
            )}

            {/* Customer Info */}
            {customer && (
              <EstimateSection title="Customer Info" subtitle="ข้อมูลลูกค้า">
                <p className="text-sm text-foreground-subtle">{customer.fullName}</p>
                <p className="text-sm text-foreground-subtle">{customer.phone}</p>
              </EstimateSection>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-error/20 bg-error-soft p-3 text-error">
                {error}
              </div>
            )}

            {/* Create QR Button */}
            <div className="space-y-3">
              {selectedStore ? (
                <button
                  onClick={handleCreatePawnRequest}
                  disabled={isSubmitting}
                  className="w-full rounded-full bg-success px-4 py-4 text-base font-semibold text-success-fg transition-colors hover:bg-success-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code สำหรับขอสินเชื่อ'}
                </button>
              ) : (
                <div className="w-full rounded-full bg-background-subtle px-4 py-4 text-center text-base font-semibold text-foreground-subtle">
                  เลือกร้านเพื่อสร้าง QR Code
                </div>
              )}

              <button
                onClick={() => setCurrentStep('estimate_result')}
                className="w-full rounded-full bg-background-subtle px-4 py-3 text-base font-medium text-foreground-muted transition-colors hover:bg-line-soft"
              >
                ย้อนกลับ
              </button>
            </div>

            <p className="text-xs text-center text-foreground-subtle">
              QR Code จะถูกส่งไปยัง LINE ของคุณ และคุณสามารถนำไปให้ร้านไหนก็ได้
            </p>
          </div>
        )}

        {/* QR Display Step */}
        {currentStep === 'qr_display' && (
          <div className="text-center space-y-6">
            <div className="rounded-[28px] border border-primary-border bg-gradient-to-br from-background-white via-primary-soft/35 to-primary-border/30 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <div className="rounded-[24px] border border-background-white/80 bg-background-white/70 px-4 py-4">
                <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground-subtle">
                  QR Ready
                </div>
                <div className="mt-3 bg-gradient-to-r from-primary via-s2 to-s2-active bg-clip-text text-3xl font-semibold tracking-[0.08em] text-transparent">
                  สร้าง QR Code สำเร็จ!
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-success/20 bg-success-soft p-6">
              <div className="text-success">
                <Check className="w-16 h-16 mx-auto mb-4" />
                <p className="font-medium">QR Code ถูกส่งไปยัง LINE ของคุณแล้ว</p>
                <p className="text-sm mt-2">กรุณาตรวจสอบข้อความใน LINE</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-primary-border bg-gradient-to-br from-background-white via-primary-soft/35 to-primary-border/30 p-4 text-left shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
              <h3 className="font-bold mb-2">ขั้นตอนต่อไป:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-foreground-muted">
                <li>เปิด LINE และตรวจสอบข้อความ QR Code</li>
                <li>นำ QR Code ไปแสดงที่จุดรับฝาก</li>
                <li>พนักงานจะสแกน QR Code และตรวจสอบสินค้า</li>
                <li>รับเงินสินเชื่อหลังจากพนักงานอนุมัติ</li>
              </ol>
            </div>

            <button
              onClick={() => {
                setCurrentStep('form');
                setFormData(createInitialFormData());
                setImages([]);
                setImageUrls([]);
                setEstimateResult(null);
                setConditionResult(null);
                setSelectedStore('');
              }}
              className="w-full rounded-full bg-background-subtle px-4 py-3 text-base font-medium text-foreground-muted transition-colors hover:bg-line-soft"
            >
              ประเมินสินค้าอื่น
            </button>
          </div>
        )}

        {/* Tutorial Modal */}
        {showTutorial && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4"
            onClick={() => setShowTutorial(false)}
          >
            <div
              className="modal-pop-in w-full max-w-sm rounded-[var(--radius-xl)] bg-background-white p-4 shadow-[var(--shadow-strong)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="rounded-lg bg-background-subtle p-4">
                <h3 className="mb-4 text-lg font-semibold text-foreground-muted">คำแนะนำในการถ่ายรูป</h3>
                <div className="space-y-2 text-sm text-foreground-muted">
                  <p>• ถ่าย 4 ด้าน (หน้า หลัง ซ้าย ขวา)</p>
                  <p>• ถ่ายในที่ที่มีแสงสว่างเพียงพอ</p>
                  <p>• ไม่ถ่ายติดแสงสะท้อน</p>
                  <p>• แตะโฟกัสไปที่ตัวสินค้าก่อนถ่ายทุกครั้ง</p>
                  <p>• วางสินค้าเดี่ยวๆ พยายามไม่ให้มีวัตถุอื่นอยู่ในเฟรม</p>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={openCamera}
                  className="flex-1 min-h-12 rounded-full bg-primary px-4 py-2 text-primary-fg hover:bg-primary-hover"
                >
                  ถ่ายรูป
                </button>
                <button
                  onClick={openFilePicker}
                  className="flex-1 min-h-12 rounded-full bg-primary-soft px-4 py-2 text-primary hover:bg-primary-border"
                >
                  อัปโหลดรูปภาพ
                </button>
              </div>
              <button
                onClick={() => setShowTutorial(false)}
                className="mt-3 w-full rounded-full bg-background-subtle px-4 py-2 text-foreground-muted transition-colors hover:bg-line-soft"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageSelect}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
          multiple
        />
      </div>
    </div>
  );
}

export default function EstimatePage() {
  return (
    <Suspense
      fallback={
        <div className="theme-liff min-h-screen flex items-center justify-center bg-background-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-foreground-subtle">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <EstimatePageInner />
    </Suspense>
  );
}
