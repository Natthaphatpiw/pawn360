'use client';

import { useState, useRef, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';

// Item types and their brands
const ITEM_TYPES = [
  'โทรศัพท์',
  'โน้ตบุค',
  'อุปกรณ์โทรศัพท์',
  'อุปภรณ์คอมพิวเตอร์',
  'กล้อง'
];

const BRANDS_BY_TYPE: Record<string, string[]> = {
  'โทรศัพท์': ['Apple', 'Samsung', 'Huawei', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'OnePlus', 'Google', 'Sony', 'Nokia', 'ASUS', 'อื่นๆ'],
  'โน้ตบุค': ['Apple', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'Samsung', 'Microsoft', 'Razer', 'อื่นๆ'],
  'อุปกรณ์โทรศัพท์': ['Apple', 'Samsung', 'Anker', 'Baseus', 'Belkin', 'JBL', 'Sony', 'อื่นๆ'],
  'อุปภรณ์คอมพิวเตอร์': ['Logitech', 'Razer', 'Corsair', 'SteelSeries', 'Keychron', 'อื่นๆ'],
  'กล้อง': ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'อื่นๆ']
};

interface EstimateResult {
  estimatedPrice: number;
  condition: number;
  confidence: number;
}

interface Store {
  _id: string;
  storeName: string;
  interestRate?: number;
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

type Step = 'input' | 'form' | 'result' | 'pawn_setup' | 'qr_display';

export default function EstimatePage() {
  const { profile, isLoading, error: liffError } = useLiff();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Current step in the flow
  const [currentStep, setCurrentStep] = useState<Step>('input');

  // Form data
  const [formData, setFormData] = useState({
    itemType: '',
    brand: '',
    model: '',
    serialNo: '',
    accessories: '',
    condition: 50,
    defects: '',
    note: ''
  });

  // Images and upload state
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  // Estimation results
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pawn setup
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [pawnDuration, setPawnDuration] = useState<string>('30');
  const [interestRate, setInterestRate] = useState<number>(10);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // UI states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const checkCustomerExists = async () => {
    try {
      const response = await axios.get(`/api/users/check?lineId=${profile.userId}`);
      if (response.data.exists) {
        setCustomer(response.data.customer);
      }
    } catch (error) {
      console.error('Error checking customer:', error);
    }
  };

  // Check if customer exists on load
  useEffect(() => {
    if (profile?.userId) {
      checkCustomerExists();
    }
  }, [profile, checkCustomerExists]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Reset brand when item type changes
    if (name === 'itemType') {
      setFormData(prev => ({
        ...prev,
        brand: ''
      }));
    }
  };

  const handleConditionChange = (value: number) => {
    setFormData(prev => ({
      ...prev,
      condition: value
    }));
  };

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

    // Create preview URLs
    const newUrls = newFiles.map(file => URL.createObjectURL(file));
    setImageUrls(prev => [...prev, ...newUrls]);

    setError(null);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(imageUrls[index]);
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

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

  const handleEstimate = async () => {
    if (!profile?.userId) {
      setError('กรุณาเข้าสู่ระบบ LINE ก่อน');
      return;
    }

    if (images.length === 0) {
      setError('กรุณาอัปโหลดรูปภาพสินค้าอย่างน้อย 1 รูป');
      return;
    }

    if (!formData.itemType || !formData.brand || !formData.model) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }

    setIsEstimating(true);
    setError(null);

    try {
      // Upload images first
      const uploadedImageUrls = await uploadImages();

      // Prepare data for AI estimation
      const estimateData = {
        ...formData,
        images: uploadedImageUrls,
        lineId: profile.userId
      };

      // Call AI estimation API
      const response = await axios.post('/api/estimate', estimateData);
      setEstimateResult(response.data);

      // Move to result step
      setCurrentStep('result');

      // Fetch stores for pawn setup
      await fetchStores();

    } catch (error: any) {
      console.error('Estimation error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการประเมินราคา');
    } finally {
      setIsEstimating(false);
    }
  };

  const fetchStores = async () => {
    try {
      const response = await axios.get('/api/stores');
      setStores(response.data.stores);
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  const handleStoreSelect = (storeId: string) => {
    setSelectedStore(storeId);
    const store = stores.find(s => s._id === storeId);
    if (store?.interestRate) {
      setInterestRate(store.interestRate);
    }
  };

  const calculateInterest = () => {
    if (!estimateResult) return 0;
    const days = parseInt(pawnDuration);
    const monthlyRate = interestRate / 100 / 30; // Daily rate
    return Math.round(estimateResult.estimatedPrice * monthlyRate * days);
  };

  const handleContinue = () => {
    if (!selectedStore) {
      setError('กรุณาเลือกร้านจำนำ');
      return;
    }

    if (!customer) {
      setError('กรุณาลงทะเบียนก่อนดำเนินการต่อ');
      return;
    }

    setCurrentStep('pawn_setup');
    setError(null);
  };

  const handleRegister = () => {
    // ไปหน้า register
    window.location.href = '/register';
  };

  const handleSaveTemporary = async () => {
    if (!profile?.userId) {
      setError('กรุณาเข้าสู่ระบบก่อน');
      return;
    }

    setError(null);

    try {
      const tempData = {
        lineId: profile.userId,
        brand: formData.brand,
        model: formData.model,
        type: formData.itemType,
        serialNo: formData.serialNo,
        condition: formData.condition,
        defects: formData.defects,
        note: formData.note,
        accessories: formData.accessories,
        images: imageUrls,
        status: 'temporary',
        estimatedValue: estimateResult?.estimatedPrice,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await axios.post('/api/items/temporary', tempData);
      setSuccess('บันทึกข้อมูลชั่วคราวเรียบร้อยแล้ว');

      // Reset form after 2 seconds
      setTimeout(() => {
        setCurrentStep('input');
        // Reset form
        setFormData({
          itemType: '',
          brand: '',
          model: '',
          serialNo: '',
          accessories: '',
          condition: 50,
          defects: '',
          note: ''
        });
        setImages([]);
        setImageUrls([]);
        setEstimateResult(null);
        setSelectedStore('');
        setSuccess(null);
      }, 2000);

    } catch (error: any) {
      console.error('Error saving temporary:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกชั่วคราว');
    }
  };

  const handleCreatePawnRequest = async () => {
    if (!customer) {
      setError('กรุณาลงทะเบียนก่อนดำเนินการต่อ');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const pawnData = {
        ...formData,
        images: imageUrls,
        estimatedValue: estimateResult?.estimatedPrice,
        pawnedPrice: estimateResult?.estimatedPrice,
        interestRate,
        periodDays: parseInt(pawnDuration),
        storeId: selectedStore,
        lineId: profile.userId,
        totalInterest: calculateInterest(),
        remainingAmount: estimateResult?.estimatedPrice
      };

      await axios.post('/api/pawn-requests', pawnData);
      setSuccess('สร้างคำขอจำนำเรียบร้อยแล้ว');

      // Move to QR display step
      setCurrentStep('qr_display');

    } catch (error: any) {
      console.error('Error creating pawn request:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้างคำขอจำนำ');
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {currentStep === 'input' && (
          <div className="p-4">
            <h1 className="text-2xl font-bold text-center mb-6">ประเมินราคาสินค้า</h1>

            {/* Image Upload Section */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รูปภาพสินค้า* ({images.length}/6)
              </label>

              {images.length === 0 ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    ถ่ายรูป
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
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

                  {/* Next Step Button */}
                  <button
                    onClick={() => setCurrentStep('form')}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    ถัดไป - กรอกข้อมูลสินค้า
                  </button>
                </div>
              )}
            </div>

            {/* Tutorial Modal */}
            {showTutorial && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 max-w-sm w-full">
                  <h3 className="text-lg font-semibold mb-4">คำแนะนำในการถ่ายรูป</h3>
                  <div className="text-sm text-gray-600 mb-6 space-y-2">
                    <p>• ถ่าย 4 ด้าน (หน้า หลัง ซ้าย ขวา)</p>
                    <p>• ถ่ายในที่ที่มีแสงสว่างเพียงพอ</p>
                    <p>• ไม่ถ่ายติดแสงสะท้อน</p>
                    <p>• แตะโฟกัสไปที่ตัวสินค้าก่อนถ่ายทุกครั้ง</p>
                    <p>• วางสินค้าเดี่ยวๆ พยายามไม่ให้มีวัตถุอื่นอยู่ในเฟรม</p>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={openCamera}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
                    >
                      ถ่ายรูป
                    </button>
                    <button
                      onClick={openFilePicker}
                      className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700"
                    >
                      อัปโหลดรูปภาพ
                    </button>
                  </div>
                  <button
                    onClick={() => setShowTutorial(false)}
                    className="w-full mt-3 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg"
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
              multiple
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              multiple
            />

            {/* View Saved Items Button */}
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/saved-items'}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
              >
                ดูสินค้าที่บันทึกไว้
              </button>
            </div>
          </div>
        )}

        {currentStep === 'form' && (
          <div className="p-4">
            <div className="flex items-center mb-6">
              <button
                onClick={() => setCurrentStep('input')}
                className="text-blue-600 mr-2"
              >
                ←
              </button>
              <h1 className="text-2xl font-bold">กรอกข้อมูลสินค้า</h1>
            </div>

            {/* Item Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ประเภทสินค้า*
              </label>
              <select
                name="itemType"
                value={formData.itemType}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">เลือกประเภทสินค้า</option>
                {ITEM_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Brand */}
            {formData.itemType && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ยี่ห้อ*
                </label>
                <select
                  name="brand"
                  value={formData.brand}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">เลือกยี่ห้อ</option>
                  {BRANDS_BY_TYPE[formData.itemType]?.map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Model */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รุ่น*
              </label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น iPhone 15 Pro"
                required
              />
            </div>

            {/* Serial Number */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเลขซีเรียล*
              </label>
              <input
                type="text"
                name="serialNo"
                value={formData.serialNo}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="หมายเลขซีเรียล"
                required
              />
            </div>

            {/* Accessories */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                อุปกรณ์เสริม*
              </label>
              <input
                type="text"
                name="accessories"
                value={formData.accessories}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น กล่อง เคส หูฟัง"
                required
              />
            </div>

            {/* Condition Slider */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สภาพ* ({formData.condition}%)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={formData.condition}
                onChange={(e) => handleConditionChange(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Defects */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ตำหนิ
              </label>
              <textarea
                name="defects"
                value={formData.defects}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ระบุตำหนิของสินค้าถ้าหากว่ามี"
                rows={3}
              />
            </div>

            {/* Note */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                หมายเหตุ
              </label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="เช่น สุขภาพแบต 90%"
                rows={3}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {/* Estimate Button */}
            <button
              onClick={handleEstimate}
              disabled={isEstimating}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              {isEstimating ? 'กำลังประเมินราคา...' : 'ประเมินราคา'}
            </button>
          </div>
        )}

        {currentStep === 'result' && estimateResult && (
          <div className="p-4">
            <h1 className="text-2xl font-bold text-center mb-6">ผลการประเมินราคา</h1>

            {/* Item Image */}
            {imageUrls.length > 0 && (
              <div className="mb-6">
                <Image
                  src={imageUrls[0]}
                  alt="สินค้า"
                  width={200}
                  height={200}
                  className="w-full max-w-xs mx-auto rounded-lg object-cover"
                />
              </div>
            )}

            {/* Estimated Price */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6 text-center">
              <p className="text-sm text-green-600 mb-2">ราคาประเมิน</p>
              <p className="text-3xl font-bold text-green-700">
                ฿{estimateResult.estimatedPrice.toLocaleString()}
              </p>
              <p className="text-sm text-green-600 mt-2">
                สภาพสินค้า: {estimateResult.condition}/1.0
              </p>
            </div>

            {/* Pawn Shop Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ร้านจำนำ*
              </label>
              <select
                value={selectedStore}
                onChange={(e) => handleStoreSelect(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">เลือกร้านจำนำ</option>
                {stores.map(store => (
                  <option key={store._id} value={store._id}>
                    {store.storeName}
                  </option>
                ))}
              </select>
            </div>

            {/* Pawn Duration */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ระยะเวลาที่ต้องการจำนำ*
              </label>
              <select
                value={pawnDuration}
                onChange={(e) => setPawnDuration(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="7">7 วัน</option>
                <option value="14">14 วัน</option>
                <option value="30">30 วัน</option>
                <option value="60">60 วัน</option>
                <option value="90">90 วัน</option>
              </select>
            </div>

            {/* Interest Calculation */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-blue-600">ราคาประเมิน:</span>
                <span className="font-semibold">฿{estimateResult.estimatedPrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-blue-600">ดอกเบี้ย ({interestRate}%):</span>
                <span className="font-semibold">฿{calculateInterest().toLocaleString()}</span>
              </div>
              <hr className="my-2" />
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-blue-700">รวม:</span>
                <span className="font-bold text-blue-700">
                  ฿{(estimateResult.estimatedPrice + calculateInterest()).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Success/Error Messages */}
            {success && (
              <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg">
                {success}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* 1. ดำเนินการต่อ - disabled ถ้ายังไม่มี customer */}
              <button
                onClick={handleContinue}
                disabled={!selectedStore || !customer}
                className="w-full py-3 px-4 rounded-lg transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
              >
                ดำเนินการต่อ
              </button>

              {/* 2. ลงทะเบียน */}
              <button
                onClick={handleRegister}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors"
              >
                ลงทะเบียน
              </button>

              {/* 3. บันทึกชั่วคราว */}
              <button
                onClick={handleSaveTemporary}
                className="w-full bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 transition-colors"
              >
                บันทึกชั่วคราว
              </button>

              {/* 4. ประเมินสินค้าอื่นๆ */}
              <button
                onClick={() => {
                  setCurrentStep('input');
                  // Reset form
                  setFormData({
                    itemType: '',
                    brand: '',
                    model: '',
                    serialNo: '',
                    accessories: '',
                    condition: 50,
                    defects: '',
                    note: ''
                  });
                  setImages([]);
                  setImageUrls([]);
                  setEstimateResult(null);
                  setSelectedStore('');
                  setError(null);
                  setSuccess(null);
                }}
                className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors"
              >
                ประเมินสินค้าอื่นๆ
              </button>
            </div>
          </div>
        )}

        {currentStep === 'pawn_setup' && (
          <div className="p-4">
            <h1 className="text-2xl font-bold text-center mb-6">ตั้งค่าการจำนำ</h1>

            {/* Customer Info */}
            {customer && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold mb-2">ข้อมูลลูกค้า</h3>
                <p className="text-sm text-gray-600">{customer.fullName}</p>
                <p className="text-sm text-gray-600">{customer.phone}</p>
              </div>
            )}

            {/* Item Summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold mb-2">รายละเอียดสินค้า</h3>
              <p className="text-sm text-gray-600">{formData.brand} {formData.model}</p>
              <p className="text-sm text-gray-600">ซีเรียล: {formData.serialNo}</p>
              <p className="text-sm text-gray-600">สภาพ: {formData.condition}%</p>
            </div>

            {/* Success/Error Messages */}
            {success && (
              <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg">
                {success}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {/* Create Pawn Request Button */}
            <button
              onClick={handleCreatePawnRequest}
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'กำลังดำเนินการ...' : 'สร้างคำขอจำนำ'}
            </button>
          </div>
        )}

        {currentStep === 'qr_display' && (
          <div className="p-4">
            <h1 className="text-2xl font-bold text-center mb-6">QR Code สำหรับการจำนำ</h1>

            <div className="text-center">
              <p className="text-gray-600 mb-4">
                สแกน QR Code ที่ร้านจำนำเพื่อดำเนินการต่อ
              </p>

              {/* QR Code will be displayed here */}
              <div className="bg-gray-100 border border-gray-300 rounded-lg p-8 mb-6">
                <p className="text-gray-500">QR Code จะแสดงที่นี่</p>
              </div>

              <button
                onClick={() => setCurrentStep('input')}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                ประเมินสินค้าอื่นๆ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
