'use client';

import { useState, useRef, useEffect } from 'react';
import { Sarabun } from 'next/font/google';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureData: string, name: string) => void;
  title: string;
  placeholder: string;
  initialName?: string;
}

// Signature Modal Component
function SignatureModal({ isOpen, onClose, onSave, title, placeholder, initialName }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [name, setName] = useState(initialName || '');

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      clearCanvas();
    }
  }, [isOpen, initialName]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (canvas && name.trim()) {
      const dataURL = canvas.toDataURL('image/png');
      onSave(dataURL, name.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-center">{title}</h3>
        </div>

        <div className="p-4 space-y-4">
          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium mb-1">ชื่อ</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Signature Canvas */}
          <div>
            <label className="block text-sm font-medium mb-2">ลายเซ็น</label>
            <div className="border border-gray-300 rounded bg-white">
              <canvas
                ref={canvasRef}
                width={300}
                height={150}
                className="w-full h-32 cursor-crosshair border border-gray-200 rounded"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none' }}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={clearCanvas}
              className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              ล้าง
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={saveSignature}
              disabled={!name.trim()}
              className="flex-1 py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              เซ็นชื่อ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Item {
  _id: string;
  brand: string;
  model: string;
  type: string;
  serialNo?: string;
  accessories?: string;
  condition: number;
  defects?: string;
  note?: string;
  images: string[];
  desiredAmount?: number;
  estimatedValue?: number;
  loanDays?: number;
  interestRate?: number;
}

interface Customer {
  lineId: string;
  title: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  idNumber: string;
  address: {
    houseNumber: string;
    street?: string;
    subDistrict: string;
    district: string;
    province: string;
    postcode: string;
  };
}

interface ContractFormProps {
  item: Item;
  customer: Customer;
  onComplete: (contractData: any) => void;
  onClose: () => void;
}

export default function ContractForm({ item, customer, onComplete, onClose }: ContractFormProps) {
  // Contract steps: 'contract' -> 'signatures' -> 'photo' -> 'complete'
  const [currentStep, setCurrentStep] = useState<'contract' | 'signatures' | 'photo' | 'complete'>('contract');

  // Signature modal state
  const [signatureModal, setSignatureModal] = useState<{
    isOpen: boolean;
    type: 'seller' | 'buyer';
    title: string;
    placeholder: string;
  }>({
    isOpen: false,
    type: 'seller',
    title: '',
    placeholder: ''
  });

  // Contract signatures
  const [signatures, setSignatures] = useState<{
    seller: { name: string; signature: string; date: string };
    buyer: { name: string; signature: string; date: string };
  }>({
    seller: { name: customer.fullName, signature: '', date: new Date().toLocaleDateString('th-TH') },
    buyer: { name: '', signature: '', date: new Date().toLocaleDateString('th-TH') }
  });

  // Photo verification
  const [verificationPhoto, setVerificationPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Camera input ref
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Contract data calculation
  const calculateInterest = () => {
    const pawnedPrice = item.desiredAmount || item.estimatedValue || 0;
    const interestRate = item.interestRate || 10;
    const periodDays = item.loanDays || 30;
    const dailyRate = interestRate / 100 / 30;
    return Math.round(pawnedPrice * dailyRate * periodDays);
  };

  // Signature modal handlers
  const openSignatureModal = (type: 'seller' | 'buyer') => {
    setSignatureModal({
      isOpen: true,
      type,
      title: type === 'seller' ? 'เซ็นชื่อผู้ขาย' : 'เซ็นชื่อผู้ซื้อ',
      placeholder: type === 'seller' ? 'ชื่อผู้ขาย' : 'ชื่อพนักงาน'
    });
  };

  const closeSignatureModal = () => {
    setSignatureModal(prev => ({ ...prev, isOpen: false }));
  };

  const saveSignature = (signatureData: string, name: string) => {
    if (signatureModal.type === 'seller') {
      setSignatures(prev => ({
        ...prev,
        seller: { name, signature: signatureData, date: new Date().toLocaleDateString('th-TH') }
      }));
    } else {
      setSignatures(prev => ({
        ...prev,
        buyer: { name, signature: signatureData, date: new Date().toLocaleDateString('th-TH') }
      }));
    }
  };

  // Photo handlers
  const handleTakePhoto = () => {
    photoInputRef.current?.click();
  };

  const handlePhotoCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setVerificationPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Navigation handlers
  const goToSignatures = () => {
    setCurrentStep('signatures');
  };

  const goToPhoto = () => {
    setCurrentStep('photo');
  };

  const completeContract = () => {
    if (!signatures.seller.signature || !signatures.buyer.signature || !verificationPhoto) {
      setError('กรุณาเซ็นชื่อและถ่ายรูปให้ครบถ้วน');
      return;
    }

    const contractData = {
      contractDate: new Date().toLocaleDateString('th-TH'),
      sellerName: customer.fullName,
      sellerId: customer.idNumber,
      sellerAddress: `${customer.address.houseNumber} ${customer.address.street || ''} ${customer.address.subDistrict} ${customer.address.district} ${customer.address.province} ${customer.address.postcode}`,
      buyerAddress: '1400/84 เขตสวนหลวง แขวงสวนหลวง กทม 10250',
      itemType: item.type,
      itemDetails: `${item.brand} ${item.model}${item.serialNo ? ` (S/N: ${item.serialNo})` : ''}${item.accessories ? ` ${item.accessories}` : ''}${item.defects ? ` ${item.defects}` : ''}${item.note ? ` ${item.note}` : ''}`,
      price: item.desiredAmount || item.estimatedValue || 0,
      periodDays: item.loanDays || 30,
      principal: item.desiredAmount || item.estimatedValue || 0,
      interest: calculateInterest(),
      serviceFee: 0,
      total: (item.desiredAmount || item.estimatedValue || 0) + calculateInterest(),
      signatures: {
        seller: {
          name: signatures.seller.name,
          signatureData: signatures.seller.signature,
          signedDate: new Date()
        },
        buyer: {
          name: signatures.buyer.name,
          signatureData: signatures.buyer.signature,
          signedDate: new Date()
        }
      },
      verificationPhoto
    };

    onComplete(contractData);
  };

  return (
    <>
      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModal.isOpen}
        onClose={closeSignatureModal}
        onSave={saveSignature}
        title={signatureModal.title}
        placeholder={signatureModal.placeholder}
        initialName={signatureModal.type === 'seller' ? signatures.seller.name : signatures.buyer.name}
      />

      {/* Main Modal */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-2">
        <div className={`bg-white rounded-lg max-w-sm w-full max-h-[95vh] overflow-hidden ${sarabun.className}`}>
          {/* Header */}
          <div className="flex justify-between items-center p-3 border-b bg-gray-50">
            <h2 className="text-lg font-bold text-gray-800">
              {currentStep === 'contract' && 'สัญญาซื้อขาย'}
              {currentStep === 'signatures' && 'เซ็นชื่อในสัญญา'}
              {currentStep === 'photo' && 'ถ่ายรูปยืนยัน'}
              {currentStep === 'complete' && 'เสร็จสิ้น'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(95vh-120px)]">
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {currentStep === 'contract' && (
              <div className="space-y-4">
                {/* Contract Preview - Mobile Optimized */}
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 text-xs leading-relaxed max-h-96 overflow-y-auto">
                  <h3 className="text-center font-bold text-base mb-3">สัญญาซื้อขายทรัพย์พร้อมสิทธิไถ่คืน</h3>
                  <div className="space-y-3">
                    <p>วันที่: {new Date().toLocaleDateString('th-TH')}</p>
                    <p>ผู้ขาย: {customer.fullName}</p>
                    <p>ผู้ซื้อ: Pawnly Technologies Co., Ltd.</p>
                    <p>สินค้า: {item.type} - {item.brand} {item.model}</p>
                    <p>ราคา: {(item.desiredAmount || item.estimatedValue || 0).toLocaleString()} บาท</p>
                    <p>ระยะเวลา: {item.loanDays || 30} วัน</p>
                    <p>ดอกเบี้ย: {calculateInterest().toLocaleString()} บาท</p>
                    <p className="text-xs text-gray-600 mt-2">
                      * ขยายเพื่อดูรายละเอียดเต็ม (เนื้อหาสัญญาถูกต้องตามกฎหมาย)
                    </p>
                  </div>
                </div>

                {/* Next Button */}
                <button
                  onClick={goToSignatures}
                  className="w-full bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 transition-colors font-medium"
                >
                  ดำเนินการต่อ - เซ็นชื่อในสัญญา
                </button>
              </div>
            )}

            {currentStep === 'signatures' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  กรุณาเซ็นชื่อในสัญญาทั้งผู้ขายและผู้ซื้อ
                </p>

                {/* Seller Signature */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">เซ็นชื่อผู้ขาย</h4>
                  {signatures.seller.signature ? (
                    <div className="space-y-2">
                      <img
                        src={signatures.seller.signature}
                        alt="Seller signature"
                        className="border border-gray-200 rounded mx-auto block max-h-20"
                      />
                      <p className="text-sm text-center text-gray-600">
                        {signatures.seller.name} - {signatures.seller.date}
                      </p>
                      <button
                        onClick={() => openSignatureModal('seller')}
                        className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 text-sm"
                      >
                        เซ็นชื่อใหม่
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openSignatureModal('seller')}
                      className="w-full bg-blue-500 text-white py-3 px-4 rounded hover:bg-blue-600"
                    >
                      เซ็นชื่อผู้ขาย
                    </button>
                  )}
                </div>

                {/* Buyer Signature */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">เซ็นชื่อผู้ซื้อ</h4>
                  {signatures.buyer.signature ? (
                    <div className="space-y-2">
                      <img
                        src={signatures.buyer.signature}
                        alt="Buyer signature"
                        className="border border-gray-200 rounded mx-auto block max-h-20"
                      />
                      <p className="text-sm text-center text-gray-600">
                        {signatures.buyer.name} - {signatures.buyer.date}
                      </p>
                      <button
                        onClick={() => openSignatureModal('buyer')}
                        className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300 text-sm"
                      >
                        เซ็นชื่อใหม่
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openSignatureModal('buyer')}
                      className="w-full bg-green-500 text-white py-3 px-4 rounded hover:bg-green-600"
                    >
                      เซ็นชื่อผู้ซื้อ
                    </button>
                  )}
                </div>

                {/* Navigation Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentStep('contract')}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 px-4 rounded hover:bg-gray-300"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    onClick={goToPhoto}
                    disabled={!signatures.seller.signature || !signatures.buyer.signature}
                    className="flex-1 bg-green-500 text-white py-3 px-4 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ถัดไป - ถ่ายรูป
                  </button>
                </div>
              </div>
            )}

            {currentStep === 'photo' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-800 mb-2">ถ่ายรูปยืนยันตัวตน</h3>
                  <p className="text-blue-700 text-sm">
                    กรุณาถ่ายรูปคู่กับ QR Code หรือเอกสารสำคัญเพื่อยืนยันตัวตน
                  </p>
                </div>

                {/* Hidden Camera Input */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {verificationPhoto ? (
                  <div className="space-y-4">
                    <img
                      src={verificationPhoto}
                      alt="Verification Photo"
                      className="w-full rounded-lg border border-gray-300 max-h-64 object-contain"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleTakePhoto}
                        className="flex-1 bg-blue-500 text-white py-3 px-4 rounded hover:bg-blue-600"
                      >
                        ถ่ายใหม่
                      </button>
                      <button
                        onClick={() => setVerificationPhoto(null)}
                        className="flex-1 bg-gray-500 text-white py-3 px-4 rounded hover:bg-gray-600"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-400">
                      <div className="text-center">
                        <div className="text-4xl text-gray-400 mb-2">📷</div>
                        <p className="text-gray-600 text-sm">ยังไม่ได้ถ่ายรูป</p>
                      </div>
                    </div>
                    <button
                      onClick={handleTakePhoto}
                      className="w-full bg-green-500 text-white py-3 px-4 rounded hover:bg-green-600"
                    >
                      ถ่ายรูปยืนยันตัวตน
                    </button>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentStep('signatures')}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 px-4 rounded hover:bg-gray-300"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    onClick={completeContract}
                    disabled={!verificationPhoto}
                    className="flex-1 bg-green-500 text-white py-3 px-4 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    สร้างสัญญา
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
