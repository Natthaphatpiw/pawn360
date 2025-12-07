'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';
import { Camera, ChevronUp, ChevronDown, Search, X, Check } from 'lucide-react';
import { Sarabun } from 'next/font/google';
import PawnSummary from './pawn-summary';
import SuccessConfirmation from './success-confirmation';

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

// Mock Apple products data (in production, this would come from an API)
const APPLE_PRODUCTS = [
  { id: 1, name: 'iPhone 15 Pro Max', type: 'Mobile', specs: '256GB Titanium Natural', category: 'iPhone' },
  { id: 2, name: 'iPhone 15 Pro', type: 'Mobile', specs: '128GB Blue Titanium', category: 'iPhone' },
  { id: 3, name: 'iPhone 15', type: 'Mobile', specs: '128GB Black', category: 'iPhone' },
  { id: 4, name: 'iPhone 14 Pro Max', type: 'Mobile', specs: '256GB Deep Purple', category: 'iPhone' },
  { id: 5, name: 'iPhone 14 Pro', type: 'Mobile', specs: '128GB Space Black', category: 'iPhone' },
  { id: 6, name: 'iPhone 14', type: 'Mobile', specs: '128GB Midnight', category: 'iPhone' },
  { id: 7, name: 'iPhone 13 Pro Max', type: 'Mobile', specs: '256GB Sierra Blue', category: 'iPhone' },
  { id: 8, name: 'iPhone 13', type: 'Mobile', specs: '128GB Starlight', category: 'iPhone' },
  { id: 9, name: 'MacBook Air M1', type: 'Laptop', specs: '8GB/256GB Silver (2020)', category: 'MacBook' },
  { id: 10, name: 'MacBook Air M2', type: 'Laptop', specs: '8GB/256GB Midnight (2022)', category: 'MacBook' },
  { id: 11, name: 'MacBook Air M3', type: 'Laptop', specs: '8GB/256GB Space Grey (2024)', category: 'MacBook' },
  { id: 12, name: 'MacBook Pro 14"', type: 'Laptop', specs: 'M3 Pro 18GB/512GB Space Black', category: 'MacBook' },
  { id: 13, name: 'MacBook Pro 16"', type: 'Laptop', specs: 'M3 Max 36GB/1TB Space Black', category: 'MacBook' },
  { id: 14, name: 'iPad Air 5', type: 'Tablet', specs: '64GB Wi-Fi Blue (M1)', category: 'iPad' },
  { id: 15, name: 'iPad Pro 11"', type: 'Tablet', specs: '128GB Wi-Fi Space Grey (M2)', category: 'iPad' },
  { id: 16, name: 'iPad Pro 12.9"', type: 'Tablet', specs: '256GB Wi-Fi+Cellular Silver (M2)', category: 'iPad' },
  { id: 17, name: 'Apple Watch Series 9', type: 'Smartwatch', specs: '45mm GPS Midnight Aluminum', category: 'Watch' },
  { id: 18, name: 'Apple Watch Ultra 2', type: 'Smartwatch', specs: '49mm GPS+Cellular Titanium', category: 'Watch' },
  { id: 19, name: 'AirPods Pro 2', type: 'Audio', specs: 'USB-C MagSafe Case', category: 'Audio' },
  { id: 20, name: 'AirPods Max', type: 'Audio', specs: 'Space Grey', category: 'Audio' },
];

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
  selectedAppleProduct?: any;
  appleSearchTerm?: string;
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

type Step = 'form' | 'estimate_result' | 'pawn_summary' | 'pawn_setup' | 'qr_display' | 'success_confirmation';

export default function EstimatePage() {
  const router = useRouter();
  const { profile, isLoading, error: liffError } = useLiff();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Current step
  const [currentStep, setCurrentStep] = useState<Step>('form');

  // Form data
  const [formData, setFormData] = useState<FormData>({
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
    appleSearchTerm: '',
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

  // Apple product search
  const [showAppleResults, setShowAppleResults] = useState(false);
  const [selectedAppleProduct, setSelectedAppleProduct] = useState<any>(null);

  // Success confirmation data
  const [loanRequestId, setLoanRequestId] = useState<string>('');
  const [itemId, setItemId] = useState<string>('');

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.userId]);

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

  // Handle clicks outside Apple search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowAppleResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        accessories: '',
        lenses: ['', ''],
        cpu: '',
        ram: '',
        storage: '',
        gpu: '',
      }));
      setSelectedAppleProduct(null);
    }
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

  // Handle Apple product search
  const handleAppleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, appleSearchTerm: value }));
    setShowAppleResults(true);
    setSelectedAppleProduct(null);
  };

  const handleSelectAppleProduct = (product: any) => {
    setSelectedAppleProduct(product);
    setFormData(prev => ({
      ...prev,
      appleSearchTerm: `${product.name} ${product.specs}`,
      model: `${product.name} ${product.specs}`,
      brand: 'Apple',
    }));
    setShowAppleResults(false);
  };

  const clearAppleSelection = () => {
    setSelectedAppleProduct(null);
    setFormData(prev => ({ ...prev, appleSearchTerm: '', model: '', brand: '' }));
    setShowAppleResults(false);
  };

  const filteredAppleProducts = APPLE_PRODUCTS.filter(product =>
    product.name.toLowerCase().includes((formData.appleSearchTerm || '').toLowerCase()) ||
    product.specs.toLowerCase().includes((formData.appleSearchTerm || '').toLowerCase()) ||
    product.category.toLowerCase().includes((formData.appleSearchTerm || '').toLowerCase())
  );

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
    switch (formData.itemType) {
      case 'โทรศัพท์มือถือ':
        if (!formData.brand) return 'กรุณาเลือกยี่ห้อ';
        if (!formData.model) return 'กรุณาระบุรุ่น';
        if (!formData.capacity) return 'กรุณาระบุความจุ';
        if (!formData.serialNo) return 'กรุณาระบุหมายเลขซีเรียล';
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
        if (!selectedAppleProduct) return 'กรุณาเลือกรุ่นสินค้า Apple';
        if (!formData.serialNo) return 'กรุณาระบุ Serial Number / IMEI';
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

  // Upload images
  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    const uploadPromises = images.map(async (file) => {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const response = await axios.post('/api/upload/image', formDataUpload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
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

    try {
      // Step 1: Analyze condition with AI
      const base64Images = await Promise.all(
        images.map(async (file) => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );

      const conditionResponse = await axios.post('/api/analyze-condition', {
        images: base64Images
      });

      setConditionResult(conditionResponse.data);
      setIsAnalyzing(false);
      console.log('✅ Condition analysis completed');

      // Step 2: Upload images
      console.log('📤 Starting image upload...');
      const uploadedUrls = await uploadImages();
      setUploadedImageUrls(uploadedUrls);
      console.log('✅ Image upload completed:', uploadedUrls);

      // Step 3: Estimate price with AI
      console.log('🧠 Starting price estimation...');
      const estimateData = {
        itemType: formData.itemType,
        brand: formData.brand,
        model: formData.model,
        capacity: formData.capacity,
        serialNo: formData.serialNo,
        accessories: formData.itemType === 'Apple'
          ? Object.entries(formData.appleAccessories || {})
              .filter(([, value]) => value)
              .map(([key]) => key)
              .join(', ')
          : formData.accessories,
        condition: conditionResponse.data.score,
        defects: formData.defects,
        note: formData.note,
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

      const estimateResponse = await axios.post('/api/estimate', estimateData);
      console.log('✅ Price estimation completed:', estimateResponse.data);
      setEstimateResult(estimateResponse.data);
      setDesiredPrice(estimateResponse.data.estimatedPrice.toString());

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
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการประเมินราคา');
    } finally {
      setIsAnalyzing(false);
      setIsEstimating(false);
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

        {/* Form Step */}
        {currentStep === 'form' && (
          <>
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

                {/* Apple Product Search */}
                {formData.itemType === 'Apple' && (
                  <div className="mb-6 relative" ref={searchRef}>
                    <FormLabel thai="ค้นหารุ่นสินค้า" eng="Search Apple Model" required />

                    <div className="relative">
                      <div className="absolute left-3 top-3.5 text-gray-400">
                        <Search className="w-5 h-5" />
                      </div>
                      <input
                        type="text"
                        value={formData.appleSearchTerm}
                        onChange={handleAppleSearch}
                        onFocus={() => setShowAppleResults(true)}
                        placeholder="เช่น MacBook M1, iPhone 13..."
                        className={`w-full p-3 pl-10 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 text-sm md:text-base ${
                          selectedAppleProduct ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                        }`}
                      />
                      {formData.appleSearchTerm && (
                        <button
                          onClick={clearAppleSelection}
                          className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>

                    {/* Search Results Dropdown */}
                    {showAppleResults && formData.appleSearchTerm && !selectedAppleProduct && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredAppleProducts.length > 0 ? (
                          filteredAppleProducts.map((product) => (
                            <div
                              key={product.id}
                              onClick={() => handleSelectAppleProduct(product)}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-none flex justify-between items-start"
                            >
                              <div>
                                <div className="font-bold text-gray-800">{product.name}</div>
                                <div className="text-xs text-gray-500">{product.specs}</div>
                              </div>
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                                {product.category}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-gray-500 text-sm">
                            ไม่พบสินค้ารุ่นนี้
                          </div>
                        )}
                      </div>
                    )}

                    {/* Selected Product Badge */}
                    {selectedAppleProduct && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
                        <div className="bg-green-100 p-1 rounded-full mt-0.5">
                          <Check className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">ระบุรุ่นเรียบร้อย</p>
                          <p className="text-xs text-gray-600 mt-1">
                            ประเภท: <span className="font-medium">{selectedAppleProduct.type}</span> <br />
                            สเปค: {selectedAppleProduct.specs}
                          </p>
                        </div>
                      </div>
                    )}
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

                {/* Serial Number (for all except mobile accessory) */}
                {formData.itemType !== 'อุปกรณ์เสริมโทรศัพท์' && (
                  <div className="mb-4">
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
                      placeholder={formData.itemType === 'Apple' ? 'ระบุหมายเลขเครื่อง' : 'หมายเลขซีเรียล'}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 placeholder-gray-300 text-sm md:text-base"
                    />
                  </div>
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

            {/* Submit Button */}
            <button
              onClick={handleAnalyzeAndEstimate}
              disabled={isAnalyzing || isEstimating}
              className="w-full py-3 px-4 rounded-lg transition-colors font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: (isAnalyzing || isEstimating) ? '#9ca3af' : '#c2410c',
                color: 'white'
              }}
            >
              {isAnalyzing
                ? 'กำลังวิเคราะห์สภาพด้วย AI...'
                : isEstimating
                  ? 'กำลังประเมินราคา...'
                  : 'ประเมินราคาด้วย AI'}
            </button>
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
              condition: formData.condition,
              images: uploadedImageUrls,
              estimatedPrice: estimateResult?.estimatedPrice || 0,
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
            }}
            lineId={profile.userId}
            onBack={() => setCurrentStep('form')}
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
              setCurrentStep('success_confirmation');
            }}
          />
        )}

        {/* Success Confirmation Step */}
        {currentStep === 'success_confirmation' && (
          <SuccessConfirmation
            loanRequestId={loanRequestId}
            itemId={itemId}
            onContinue={() => {
              // Redirect to contract agreement page using Next.js router to keep LIFF context
              router.push(`/contract-agreement?loanRequestId=${loanRequestId}&itemId=${itemId}`);
            }}
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
                appleSearchTerm: '',
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
                {formData.serialNo && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Serial No.:</span>
                    <span className="font-medium">{formData.serialNo}</span>
                  </div>
                )}
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
                  setCurrentStep('form');
                  setEstimateResult(null);
                  setConditionResult(null);
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
                          className="w-24 p-1 border border-gray-300 rounded text-right text-sm"
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
                  appleSearchTerm: '',
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
