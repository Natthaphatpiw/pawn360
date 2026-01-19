'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';
import { Camera, ChevronUp, ChevronDown, Check, FileText } from 'lucide-react';
import { Sarabun } from 'next/font/google';
import imageCompression from 'browser-image-compression';
import PawnSummary from './pawn-summary';
import ContractAgreementStep from './contract-agreement-step';
import ContractSuccess from './contract-success';
import { useRouter, useSearchParams } from 'next/navigation';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

// Item types configuration
const ITEM_TYPES = [
  { id: 'mobile', label: 'โทรศัพท์มือถือ(Mobile)', value: 'โทรศัพท์มือถือ' },
  { id: 'mobile-accessory', label: 'อุปกรณ์เสริมโทรศัพท์มือถือ(Mobile accessory)', value: 'อุปกรณ์เสริมโทรศัพท์' },
  { id: 'camera', label: 'กล้องถ่ายรูป(Camera)', value: 'กล้อง' },
  { id: 'apple', label: 'สินค้าของ Apple', value: 'Apple' },
  { id: 'laptop', label: 'คอมพิวเตอร์แล็ปท็อป(Computer laptop)', value: 'โน้ตบุค' },
];

// Brand options for each type
const BRANDS_BY_TYPE: Record<string, string[]> = {
  'โทรศัพท์มือถือ': ['Apple', 'Samsung', 'Huawei', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'OnePlus', 'Google', 'Sony', 'Nokia', 'ASUS', 'อื่นๆ'],
  'อุปกรณ์เสริมโทรศัพท์': ['Apple', 'Samsung', 'Anker', 'Baseus', 'Belkin', 'JBL', 'Sony', 'อื่นๆ'],
  'กล้อง': ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'อื่นๆ'],
  'โน้ตบุค': ['Apple', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Samsung', 'Microsoft', 'Razer', 'อื่นๆ'],
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
    <span className="font-bold text-gray-800 text-sm md:text-base">
      {thai} {required && <span className="text-red-500">*</span>}
    </span>
    {eng && (
      <span className="bg-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded-md font-normal">
        {eng}
      </span>
    )}
  </div>
);

interface FormData {
  itemType: string;
  brand: string;
  model: string;
  capacity?: string;
  serialNo?: string;
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

function EstimatePageInner() {
  const { profile, isLoading, error: liffError } = useLiff();
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Current step
  const [currentStep, setCurrentStep] = useState<Step>('form');

  // Draft management
  const [draftCount, setDraftCount] = useState<number>(0);

  // Form data
  const [formData, setFormData] = useState<FormData>({
    itemType: '',
    brand: '',
    model: '',
    capacity: '',
    serialNo: '',
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
  const [isConditionExpanded, setIsConditionExpanded] = useState(true);
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const appleModels = formData.appleCategory ? (APPLE_MODELS_BY_CATEGORY[formData.appleCategory] || []) : [];

  // Success confirmation data
  const [loanRequestId, setLoanRequestId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');
  const [contractId, setContractId] = useState<string>('');

  const resetEstimateForm = () => {
    setFormData({
      itemType: '',
      brand: '',
      model: '',
      capacity: '',
      serialNo: '',
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
    abortControllerRef.current = null;
  };

  const isProcessing = isAnalyzing || isEstimating;

  const updateProcessingStatus = (percent: number, title: string, detail: string) => {
    setProcessingStatus({
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      title,
      detail,
    });
  };

  const ensureNotCanceled = (signal?: AbortSignal) => {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  };

  const handleCancelProcessing = () => {
    setIsCanceling(true);
    setProcessingStatus((prev) => ({
      percent: prev?.percent ?? 0,
      title: 'กำลังยกเลิกการประเมิน',
      detail: 'กำลังหยุดการประมวลผล',
    }));
    abortControllerRef.current?.abort();
  };

  // Check customer exists
  const checkCustomerExists = async () => {
    if (!profile?.userId) return;
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

  // Load draft into estimate flow (continue from /drafts/[itemId])
  useEffect(() => {
    if (!profile?.userId || !draftId) return;

    const loadDraft = async () => {
      try {
        const res = await axios.get(`/api/items/draft?lineId=${profile.userId}&itemId=${draftId}`);
        if (!res.data?.success || !res.data?.item) return;

        const d = res.data.item;
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
          color: d.color || '',
          screenSize: d.screen_size || '',
          watchSize: d.watch_size || '',
          watchConnectivity: d.watch_connectivity || '',
          accessories: d.accessories || '',
          condition: typeof d.item_condition === 'number' ? d.item_condition : prev.condition,
          defects: d.defects || '',
          note: d.notes || '',
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
      } catch (e) {
        console.error('Error loading draft:', e);
      }
    };

    loadDraft();
  }, [profile?.userId, draftId]);

  // Fetch draft count
  const fetchDraftCount = async () => {
    if (!profile?.userId) return;
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
    if (images.length === 0) {
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
        if (!formData.accessories) return 'กรุณาระบุอุปกรณ์เสริม';
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
        if (!formData.storage) return 'กรุณาระบุพื้นที่จัดเก็บ';
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

    setIsAnalyzing(true);
    setIsEstimating(true);
    setError(null);
    setIsCanceling(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    updateProcessingStatus(5, 'เตรียมรูปภาพ', 'กำลังบีบอัดและเตรียมรูปภาพ');

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

      // Step 2: Upload images
      console.log('📤 Starting image upload...');
      const uploadedUrls = await uploadImages(compressedImages, signal);
      setUploadedImageUrls(uploadedUrls);
      console.log('✅ Image upload completed:', uploadedUrls);
      ensureNotCanceled(signal);
      updateProcessingStatus(80, 'ประเมินราคา', 'กำลังคำนวณราคาประเมิน');

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
        condition: conditionResponse.data.score,
        defects: formData.defects,
        note: [formData.note, appleExtraLines].filter(Boolean).join('\n'),
        images: uploadedUrls,
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

      // Update form data with condition from AI
      setFormData(prev => ({
        ...prev,
        condition: conditionResponse.data.score * 100
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
      setIsAnalyzing(false);
      setIsEstimating(false);
      setProcessingStatus(null);
      setIsCanceling(false);
      abortControllerRef.current = null;
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
      const pawnRequestData = {
        lineId: profile?.userId,
        brand: formData.brand,
        model: formData.model,
        type: formData.itemType,
        serialNo: formData.serialNo,
        condition: conditionResult?.score || formData.condition,
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (liffError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">เกิดข้อผิดพลาด: {liffError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-50 flex justify-center py-4 px-2 md:px-0 ${sarabun.className}`}>
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm p-4 md:p-6 pb-20">
        {isProcessing && processingStatus && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
                <div>
                  <p className="text-xs text-gray-500">กำลังดำเนินการ</p>
                  <p className="text-base font-semibold text-gray-800">{processingStatus.title}</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-600">{processingStatus.detail}</p>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>ความคืบหน้า</span>
                  <span>{processingStatus.percent}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${processingStatus.percent}%` }}
                  />
                </div>
              </div>

              <button
                onClick={handleCancelProcessing}
                disabled={isCanceling}
                className="mt-5 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-800">ประเมินราคาสินค้า</h1>
                <p className="text-xs text-gray-500">AI Price Estimation</p>
              </div>
            </div>

            {/* Image Upload Section */}
            <div className="mb-6">
              <div className="flex justify-between items-end mb-2">
                <FormLabel thai="รูปสินค้า" eng="Item images" required />
                <span className="text-gray-400 text-xs">{images.length}/6</span>
              </div>

              {images.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl bg-white h-32 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setShowTutorial(true)}>
                  <Camera className="w-8 h-8 text-gray-400 mb-1" />
                  <span className="text-gray-600 text-sm font-medium">เพิ่มรูปถ่าย</span>
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
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {images.length < 6 && (
                    <button
                      onClick={() => setShowTutorial(true)}
                      className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex items-center justify-center text-gray-400"
                    >
                      +
                    </button>
                  )}
                </div>
              )}

              <div className="mt-2 text-xs text-gray-400 space-y-1">
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
                ) : (
                  <>
                    <p>*กรุณาถ่าย serial number 1 รูป</p>
                    <p>*หากมีอุปกรณ์เสริมให้ถ่ายอุปกรณ์เสริมด้วย</p>
                  </>
                )}
              </div>
            </div>

            {/* Item Type Selection */}
            <div className="mb-4">
              <FormLabel thai="ประเภทสินค้า" eng="Item type" required />
              <div className="relative">
                <select
                  name="itemType"
                  value={formData.itemType}
                  onChange={handleInputChange}
                  className="w-full p-3 pr-10 bg-white border border-gray-200 rounded-lg text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 text-sm md:text-base"
                >
                  <option value="">เลือกประเภทสินค้า</option>
                  {ITEM_TYPES.map(type => (
                    <option key={type.id} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Conditional Fields Based on Item Type */}
            {formData.itemType && (
              <>
                <div className="h-px bg-gray-200 my-6"></div>

                {/* Apple Product Selection */}
                {formData.itemType === 'Apple' && (
                  <div className="mb-6 space-y-4">
                    <div>
                      <FormLabel thai="ประเภทสินค้า Apple" eng="Apple category" required />
                      <div className="relative">
                        <select
                          name="appleCategory"
                          value={formData.appleCategory}
                          onChange={handleAppleCategoryChange}
                          className="w-full p-3 pr-10 bg-white border border-gray-200 rounded-lg text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 text-sm md:text-base"
                        >
                          <option value="">เลือกประเภทสินค้า</option>
                          {APPLE_CATEGORIES.map(category => (
                            <option key={category.value} value={category.value}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <FormLabel thai="รุ่นสินค้า Apple" eng="Apple model" required />
                      <div className="relative">
                        <select
                          name="model"
                          value={formData.model}
                          onChange={handleAppleModelChange}
                          disabled={!formData.appleCategory}
                          className="w-full p-3 pr-10 bg-white border border-gray-200 rounded-lg text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 text-sm md:text-base disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="">
                            {formData.appleCategory ? 'เลือกรุ่นสินค้า' : 'กรุณาเลือกประเภทสินค้าก่อน'}
                          </option>
                          {appleModels.map(model => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
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
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 placeholder-gray-300 text-sm md:text-base"
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
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 placeholder-gray-300 text-sm md:text-base"
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
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 placeholder-gray-300 text-sm md:text-base"
                      />
                    </div>
                  </div>
                )}

                {/* Regular Brand Selection (Not Apple) */}
                {formData.itemType !== 'Apple' && (
                  <div className="mb-4">
                    <FormLabel thai="ยี่ห้อ" eng="Brand" required />
                    <div className="relative">
                      <select
                        name="brand"
                        value={formData.brand}
                        onChange={handleInputChange}
                        className="w-full p-3 pr-10 bg-white border border-gray-200 rounded-lg text-gray-400 appearance-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 text-sm md:text-base"
                      >
                        <option value="">ยี่ห้อ</option>
                        {BRANDS_BY_TYPE[formData.itemType]?.map(brand => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
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
                      className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                    />
                  </div>
                )}

                {/* Mobile Specific Fields */}
                {formData.itemType === 'โทรศัพท์มือถือ' && (
                  <>
                    <div className="h-px bg-gray-200 my-6"></div>
                    <div className="mb-4">
                      <FormLabel thai="ความจุ" eng="Capacity" required />
                      <input
                        type="text"
                        name="capacity"
                        value={formData.capacity}
                        onChange={handleInputChange}
                        placeholder="ความจุเครื่อง"
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                      />
                    </div>
                  </>
                )}

                {/* Camera Specific - Lens Model */}
                {formData.itemType === 'กล้อง' && (
                  <div className="mb-4 bg-gray-50/50 p-2 -mx-2 rounded-lg">
                    <div className="flex justify-between items-end mb-2 px-1">
                      <FormLabel thai="รุ่นเลนส์" eng="Lens model" />
                      <span className="text-gray-400 text-xs">{formData.lenses?.length || 0}/5</span>
                    </div>

                    <div className="space-y-3">
                      {formData.lenses?.map((lens, index) => (
                        <input
                          key={index}
                          type="text"
                          value={lens}
                          onChange={(e) => updateLens(index, e.target.value)}
                          placeholder="รุ่นเลนส์"
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                        />
                      ))}

                      {(formData.lenses?.length || 0) < 5 && (
                        <button
                          type="button"
                          onClick={addLens}
                          className="w-full py-2.5 border border-orange-300 text-orange-600 rounded-lg font-medium hover:bg-orange-50 transition-colors flex items-center justify-center gap-1 text-sm md:text-base"
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
                    <div className="h-px bg-gray-200 my-6"></div>
                    <div className="mb-4">
                      <FormLabel thai="ซีพียู" eng="CPU" required />
                      <input
                        type="text"
                        name="cpu"
                        value={formData.cpu}
                        onChange={handleInputChange}
                        placeholder="CPU"
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
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
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                      />
                    </div>
                    <div className="mb-4">
                      <FormLabel thai="พื้นที่จัดเก็บ" eng="Storage" required />
                      <input
                        type="text"
                        name="storage"
                        value={formData.storage}
                        onChange={handleInputChange}
                        placeholder="Storage"
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                      />
                    </div>
                    <div className="mb-4">
                      <FormLabel thai="การ์ดจอ" eng="GPU" />
                      <input
                        type="text"
                        name="gpu"
                        value={formData.gpu}
                        onChange={handleInputChange}
                        placeholder="GPU"
                        className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
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
                      required={formData.itemType === 'โทรศัพท์มือถือ'}
                    />
                    <input
                      type="text"
                      name="accessories"
                      value={formData.accessories}
                      onChange={handleInputChange}
                      placeholder="อุปกรณ์เสริม"
                      className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                    />
                  </div>
                )}

                {/* Apple Accessories Checkboxes */}
                {formData.itemType === 'Apple' && (
                  <div className="mb-8">
                    <FormLabel thai="อุปกรณ์ที่มีให้" eng="Included Items" />
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                      <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="accent-black"
                          checked={formData.appleAccessories?.box || false}
                          onChange={() => handleAppleAccessoryChange('box')}
                        /> กล่อง (Box)
                      </label>
                      <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="accent-black"
                          checked={formData.appleAccessories?.adapter || false}
                          onChange={() => handleAppleAccessoryChange('adapter')}
                        /> หัวชาร์จ (Adapter)
                      </label>
                      <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="accent-black"
                          checked={formData.appleAccessories?.cable || false}
                          onChange={() => handleAppleAccessoryChange('cable')}
                        /> สายชาร์จ (Cable)
                      </label>
                      <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="accent-black"
                          checked={formData.appleAccessories?.receipt || false}
                          onChange={() => handleAppleAccessoryChange('receipt')}
                        /> ใบเสร็จ (Receipt)
                      </label>
                    </div>
                  </div>
                )}

                {/* Condition Slider */}
                <div className="mb-4 mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <FormLabel thai="สภาพ" eng="Condition" required />
                    <span className="text-gray-500 font-medium">{formData.condition}%</span>
                  </div>

                  <div className="px-2 mb-2 relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formData.condition}
                      onChange={(e) => setFormData(prev => ({ ...prev, condition: parseInt(e.target.value) }))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${formData.itemType === 'Apple' ? '#000000' : '#c2410c'} 0%, ${formData.itemType === 'Apple' ? '#000000' : '#c2410c'} ${formData.condition}%, #e5e7eb ${formData.condition}%, #e5e7eb 100%)`
                      }}
                    />
                    <style jsx>{`
                      input[type=range]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        height: 24px;
                        width: 24px;
                        border-radius: 50%;
                        background: #ffffff;
                        border: 1px solid #e5e7eb;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        margin-top: -10px;
                      }
                    `}</style>

                    <div className="flex justify-between text-xs text-gray-500 mt-2 font-medium">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                {/* Condition Instructions Box */}
                <div className="bg-gray-100 rounded-xl px-4 py-3 mb-6 border border-gray-200">
                  <div
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => setIsConditionExpanded(!isConditionExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800 text-sm md:text-base">
                        {formData.itemType === 'Apple' ? 'วิธีประเมินสภาพ' : 'วิธีดูสภาพ'}
                      </span>
                      <span className="bg-gray-300 text-gray-600 text-xs px-2 py-0.5 rounded-md">
                        {formData.itemType === 'Apple' ? 'Guide' : 'Instructions'}
                      </span>
                    </div>
                    {isConditionExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>

                  {isConditionExpanded && (
                    <div className="mt-3 space-y-3 text-sm text-gray-600 border-t border-gray-200 pt-3">
                      {formData.itemType === 'Apple' ? (
                        <>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-gray-700">95 - 100%</span>
                            <span>Perfect: ไม่มีรอย เครื่องสวยกริ๊บ แบตเตอรี่สุขภาพดี</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-gray-700">80 - 94%</span>
                            <span>Good: มีรอยขนแมวเล็กน้อยตามขอบ ไม่กระทบหน้าจอ</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-gray-700">60 - 79%</span>
                            <span>Fair: มีรอยชัดเจน รอยบุบ หรือหน้าจอลอก แต่ใช้งานปกติ</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[80px] text-gray-700">ต่ำกว่า 60%</span>
                            <span>Poor: จอแตก เปิดไม่ติด หรือมีฟังก์ชันเสียหาย (เช่น FaceID เสีย)</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-gray-700">90 - 100%</span>
                            <span>เหมือนใหม่ ไม่มีรอยขีดข่วนหรือตำหนิใดๆ ใช้งานได้ 100%</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-gray-700">70 - 89%</span>
                            <span>ใช้งานได้ หน้าจอไม่มีรอยตำหนิลึก อาจมีรอยขนแมวตามขอบหรือด้านหลังเล็กน้อย</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-gray-700">50 - 69%</span>
                            <span>ใช้งานได้ <span className="font-bold text-black">แต่</span> หน้าจอมีรอยขีดข่วนชัดเจน ตัวเครื่องมีรอยบุบ/ถลอกจากการใช้งาน</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-gray-700">25 - 49%</span>
                            <span>ใช้งานได้แต่มีตำหนิใหญ่ หน้าจอมีรอยร้าว หรือตัวเครื่องมีรอยบุบอย่างเห็นได้ชัด</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="font-bold min-w-[70px] text-gray-700">0 - 24%</span>
                            <span>ใช้งานไม่ได้ เครื่องเปิดไม่ติด, หน้าจอแตก, ปุ่มหลักเสีย, หรือมีความเสียหายจากน้ำ</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
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
                      className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 placeholder-gray-300 text-sm md:text-base resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      name="defects"
                      value={formData.defects}
                      onChange={handleInputChange}
                      placeholder="ตำหนิ"
                      className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
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
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                  />
                </div>
              </>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleAnalyzeAndEstimate}
                disabled={isProcessing}
                className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isProcessing ? '#9ca3af' : '#c2410c',
                  color: 'white'
                }}
              >
                {isProcessing ? 'กำลังประมวลผล...' : 'ประเมินราคาด้วย AI'}
              </button>

              <button
                onClick={() => router.push('/drafts')}
                className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base bg-gray-200 hover:bg-gray-300 text-gray-700 flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                ดูบันทึกชั่วคราว
                {draftCount > 0 && (
                  <span className="bg-orange-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
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
              setFormData({
                itemType: '',
                brand: '',
                model: '',
                capacity: '',
                serialNo: '',
                accessories: '',
                condition: 50,
                defects: '',
                note: '',
                lenses: ['', ''],
                appleCategory: '',
                appleSpecs: '',
                color: '',
                appleAccessories: {
                  box: false,
                  adapter: false,
                  cable: false,
                  receipt: false,
                },
              });
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
            <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">ผลการประเมินราคา</h1>

            {/* Estimated Price Card */}
            <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">ราคาประเมิน</p>
                <p className="text-4xl font-bold text-orange-700">{estimateResult.estimatedPrice.toLocaleString()} ฿</p>
                <p className="text-xs text-gray-500 mt-2">Confidence: {Math.round(estimateResult.confidence * 100)}%</p>
              </div>
            </div>

            {/* Condition Result Card */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-3">สภาพสินค้า (วิเคราะห์โดย AI)</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">คะแนนสภาพ:</span>
                <span className="text-lg font-bold text-gray-800">{Math.round(conditionResult.score * 100)}%</span>
              </div>
              <div className="w-full rounded-full h-3 mb-3 bg-gray-200">
                <div
                  className="h-3 rounded-full bg-green-600"
                  style={{ width: `${conditionResult.score * 100}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">{conditionResult.reason}</p>
            </div>

            {/* Item Details Card */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-3">รายละเอียดสินค้า</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">ประเภท:</span>
                  <span className="font-medium">{formData.itemType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">ยี่ห้อ:</span>
                  <span className="font-medium">{formData.brand}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">รุ่น:</span>
                  <span className="font-medium">{formData.model}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setCurrentStep('pawn_setup')}
                className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base bg-green-600 hover:bg-green-700 text-white"
              >
                ดำเนินการจำนำต่อ
              </button>
              <button
                onClick={() => {
                  // Full reset for new estimation
                  setCurrentStep('form');
                  setFormData({
                    itemType: '',
                    brand: '',
                    model: '',
                    capacity: '',
                    serialNo: '',
                    accessories: '',
                    condition: 50,
                    defects: '',
                    note: '',
                    lenses: ['', ''],
                    appleCategory: '',
                    appleSpecs: '',
                    color: '',
                    appleAccessories: {
                      box: false,
                      adapter: false,
                      cable: false,
                      receipt: false,
                    },
                  });
                  setImages([]);
                  setImageUrls([]);
                  setUploadedImageUrls([]);
                  setEstimateResult(null);
                  setConditionResult(null);
                  setSelectedStore('');
                  setError(null);
                }}
                className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base bg-gray-200 hover:bg-gray-300 text-gray-700"
              >
                ประเมินสินค้าอื่น
              </button>
            </div>
          </div>
        )}

        {/* Pawn Setup Step */}
        {currentStep === 'pawn_setup' && estimateResult && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-center mb-6">ตั้งค่าการจำนำ</h1>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <FormLabel
                thai={formData.itemType === 'Apple' ? 'Serial Number / IMEI' : 'หมายเลขซีเรียล'}
                eng="Serial no."
                required={formData.itemType === 'โทรศัพท์มือถือ' || formData.itemType === 'Apple'}
              />
              <input
                type="text"
                name="serialNo"
                value={formData.serialNo}
                onChange={handleInputChange}
                placeholder={formData.itemType === 'Apple' ? 'ระบุหมายเลขเครื่อง' : 'ระบุหมายเลขซีเรียล'}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">
                แนะนำให้กรอกเลขเครื่อง/Serial เพื่อความถูกต้องของสัญญา
              </p>
            </div>

            {/* Store Selection */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold mb-3">เลือกร้านจำนำ</h3>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">กรุณาเลือกร้าน</option>
                {stores.map((store) => (
                  <option key={store._id} value={store._id}>
                    {store.storeName}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration and Interest */}
            {selectedStore && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold mb-3">ระยะเวลาและดอกเบี้ย</h3>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">จำนวนวันที่ต้องการจำนำ</label>
                  <select
                    value={pawnDuration}
                    onChange={(e) => setPawnDuration(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="7">7 วัน</option>
                    <option value="14">14 วัน</option>
                    <option value="30">30 วัน</option>
                    <option value="60">60 วัน</option>
                    <option value="90">90 วัน</option>
                  </select>
                </div>

                {/* Interest Calculation Display */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>ราคาประเมิน:</span>
                      <span className="font-semibold">{estimateResult.estimatedPrice.toLocaleString()} บาท</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>ราคาที่ต้องการจำนำ:</span>
                      <div className="flex items-center gap-2">
                          <input
                          type="number"
                          value={desiredPrice}
                          onChange={(e) => setDesiredPrice(e.target.value)}
                          placeholder={estimateResult.estimatedPrice.toString()}
                          className="w-24 p-1 border border-gray-300 rounded text-right text-sm placeholder:text-gray-300"
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
                      <span className="font-semibold text-red-600">{interestAmount.toLocaleString()} บาท</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span>รวมทั้งสิ้น:</span>
                      <span className="text-green-600">{totalAmount.toLocaleString()} บาท</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Customer Info */}
            {customer && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-semibold mb-2">ข้อมูลลูกค้า</h3>
                <p className="text-sm text-gray-600">{customer.fullName}</p>
                <p className="text-sm text-gray-600">{customer.phone}</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600">
                {error}
              </div>
            )}

            {/* Create QR Button */}
            <div className="space-y-3">
              {selectedStore ? (
                <button
                  onClick={handleCreatePawnRequest}
                  disabled={isSubmitting}
                  className="w-full py-4 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base font-semibold bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code สำหรับจำนำ'}
                </button>
              ) : (
                <div className="w-full py-4 px-4 rounded-lg text-center text-base font-semibold bg-gray-300 text-gray-500">
                  เลือกร้านเพื่อสร้าง QR Code
                </div>
              )}

              <button
                onClick={() => setCurrentStep('estimate_result')}
                className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base bg-gray-200 hover:bg-gray-300 text-gray-700"
              >
                ย้อนกลับ
              </button>
            </div>

            <p className="text-xs text-center text-gray-600">
              QR Code จะถูกส่งไปยัง LINE ของคุณ และคุณสามารถนำไปให้ร้านไหนก็ได้
            </p>
          </div>
        )}

        {/* QR Display Step */}
        {currentStep === 'qr_display' && (
          <div className="text-center space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">สร้าง QR Code สำเร็จ!</h1>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="text-green-700">
                <Check className="w-16 h-16 mx-auto mb-4" />
                <p className="font-medium">QR Code ถูกส่งไปยัง LINE ของคุณแล้ว</p>
                <p className="text-sm mt-2">กรุณาตรวจสอบข้อความใน LINE</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-left">
              <h3 className="font-bold mb-2">ขั้นตอนต่อไป:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>เปิด LINE และตรวจสอบข้อความ QR Code</li>
                <li>นำ QR Code ไปแสดงที่ร้านจำนำ</li>
                <li>พนักงานจะสแกน QR Code และตรวจสอบสินค้า</li>
                <li>รับเงินจำนำหลังจากพนักงานอนุมัติ</li>
              </ol>
            </div>

            <button
              onClick={() => {
                setCurrentStep('form');
                setFormData({
                  itemType: '',
                  brand: '',
                  model: '',
                  capacity: '',
                  serialNo: '',
                  accessories: '',
                  condition: 50,
                  defects: '',
                note: '',
                lenses: ['', ''],
                appleCategory: '',
                appleSpecs: '',
                color: '',
                appleAccessories: {
                  box: false,
                  adapter: false,
                    cable: false,
                    receipt: false,
                  },
                });
                setImages([]);
                setImageUrls([]);
                setEstimateResult(null);
                setConditionResult(null);
                setSelectedStore('');
              }}
              className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base bg-gray-200 hover:bg-gray-300 text-gray-700"
            >
              ประเมินสินค้าอื่น
            </button>
          </div>
        )}

        {/* Tutorial Modal */}
        {showTutorial && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full">
              <div className="bg-gray-100 rounded-xl p-4 max-w-sm w-full">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">คำแนะนำในการถ่ายรูป</h3>
                <div className="text-sm text-gray-700 space-y-2">
                  <p>• ถ่าย 4 ด้าน (หน้า หลัง ซ้าย ขวา)</p>
                  <p>• ถ่ายในที่ที่มีแสงสว่างเพียงพอ</p>
                  <p>• ไม่ถ่ายติดแสงสะท้อน</p>
                  <p>• แตะโฟกัสไปที่ตัวสินค้าก่อนถ่ายทุกครั้ง</p>
                  <p>• วางสินค้าเดี่ยวๆ พยายามไม่ให้มีวัตถุอื่นอยู่ในเฟรม</p>
                </div>
              </div>
              <div className="flex space-x-3 mt-4">
                <button
                  onClick={openCamera}
                  className="flex-1 bg-orange-700 text-white py-2 px-4 rounded-lg hover:bg-orange-800"
                >
                  ถ่ายรูป
                </button>
                <button
                  onClick={openFilePicker}
                  className="flex-1 bg-orange-50 text-orange-700 py-2 px-4 rounded-lg hover:bg-orange-100"
                >
                  อัปโหลดรูปภาพ
                </button>
              </div>
              <button
                onClick={() => setShowTutorial(false)}
                className="w-full mt-3 bg-gray-100 text-gray-800 py-2 px-4 rounded-lg"
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <EstimatePageInner />
    </Suspense>
  );
}
