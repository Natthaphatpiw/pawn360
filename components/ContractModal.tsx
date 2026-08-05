'use client';

import { useState, useRef, useEffect } from 'react';
import { Noto_Sans_Thai } from 'next/font/google';

const sarabun = Noto_Sans_Thai({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

interface ContractModalProps {
  pawnRequest: any;
  customerData: any;
  onComplete: (contractData: any) => void;
  onClose: () => void;
}

interface SignatureData {
  seller: {
    name: string;
    signatureData?: string;
    signedDate: Date;
  };
  buyer: {
    name: string;
    signatureData?: string;
    signedDate: Date;
  };
}

export default function ContractModal({ pawnRequest, customerData, onComplete, onClose }: ContractModalProps) {
  const [currentStep, setCurrentStep] = useState<'contract' | 'photo'>('contract');
  const [signatureData, setSignatureData] = useState<SignatureData>({
    seller: { name: customerData.fullName, signedDate: new Date() },
    buyer: { name: '', signedDate: new Date() }
  });
  const [verificationPhoto, setVerificationPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas refs for signatures
  const sellerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const buyerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isDrawing, setIsDrawing] = useState<{ seller: boolean; buyer: boolean }>({
    seller: false,
    buyer: false
  });

  // Contract data
  const contractData = {
    contractDate: new Date().toLocaleDateString('th-TH'),
    sellerName: customerData.fullName,
    sellerId: customerData.idNumber,
    sellerAddress: `${customerData.address.houseNumber} ${customerData.address.street || ''} ${customerData.address.subDistrict} ${customerData.address.district} ${customerData.address.province} ${customerData.address.postcode}`,
    buyerAddress: '1400/84 เขตสวนหลวง แขวงสวนหลวง กทม 10250',
    itemType: pawnRequest.type,
    itemDetails: `${pawnRequest.brand} ${pawnRequest.model}${pawnRequest.serialNo ? ` (S/N: ${pawnRequest.serialNo})` : ''}${pawnRequest.accessories ? ` ${pawnRequest.accessories}` : ''}${pawnRequest.defects ? ` ${pawnRequest.defects}` : ''}${pawnRequest.note ? ` ${pawnRequest.note}` : ''}`,
    price: pawnRequest.pawnedPrice,
    periodDays: pawnRequest.periodDays,
    principal: pawnRequest.pawnedPrice,
    interest: calculateInterest(),
    serviceFee: 0, // default
    total: pawnRequest.pawnedPrice + calculateInterest()
  };

  function calculateInterest() {
    const dailyRate = pawnRequest.interestRate / 100 / 30;
    return Math.round(pawnRequest.pawnedPrice * dailyRate * pawnRequest.periodDays);
  }

  // Signature drawing functions
  const startDrawing = (canvasRef: React.RefObject<HTMLCanvasElement | null>, type: 'seller' | 'buyer') => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(prev => ({ ...prev, [type]: true }));

    const handleMouseDown = (e: MouseEvent) => {
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawing[type]) {
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
      }
    };

    const handleMouseUp = () => {
      setIsDrawing(prev => ({ ...prev, [type]: false }));
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
    };
  };

  const clearSignature = (type: 'seller' | 'buyer') => {
    const canvas = type === 'seller' ? sellerCanvasRef.current : buyerCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = (type: 'seller' | 'buyer') => {
    const canvas = type === 'seller' ? sellerCanvasRef.current : buyerCanvasRef.current;
    if (!canvas) return;

    const dataURL = canvas.toDataURL('image/png');
    setSignatureData(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        signatureData: dataURL
      }
    }));
  };

  // Photo capture
  const handleTakePhoto = () => {
    if (photoInputRef.current) {
      photoInputRef.current.click();
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setVerificationPhoto(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Initialize canvases
  useEffect(() => {
    const canvases = [sellerCanvasRef.current, buyerCanvasRef.current];
    canvases.forEach(canvas => {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    });
  }, []);

  const handleNext = () => {
    if (currentStep === 'contract') {
      // Validate contract signatures
      if (!signatureData.seller.signatureData || !signatureData.buyer.name) {
        setError('กรุณาเซ็นชื่อในสัญญาให้ครบถ้วน');
        return;
      }
      setCurrentStep('photo');
      setError(null);
    }
  };

  const handleComplete = async () => {
    if (!verificationPhoto) {
      setError('กรุณาถ่ายรูปยืนยันตัวตน');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Save signatures
      saveSignature('seller');
      saveSignature('buyer');

      const finalContractData = {
        ...contractData,
        signatures: signatureData,
        verificationPhoto: verificationPhoto,
        serviceFee: 0
      };

      onComplete(finalContractData);
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden ${sarabun.className}`}>
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">
            {currentStep === 'contract' ? 'สัญญาซื้อขายทรัพย์' : 'ถ่ายรูปยืนยันตัวตน'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {currentStep === 'contract' && (
            <div className="space-y-6">
              {/* Contract Content */}
              <div className="border border-gray-300 rounded-lg p-6 bg-gray-50 text-sm leading-relaxed">
                <h3 className="text-center font-bold text-lg mb-4">สัญญาซื้อขายทรัพย์พร้อมสิทธิไถ่คืนโดยสมัครใจ</h3>

                <p className="mb-4">
                  ทำขึ้น ณ วันที่ <span className="font-semibold">{contractData.contractDate}</span> ระหว่าง{' '}
                  <span className="font-semibold">{contractData.sellerName}</span> เลขบัตรประชาชน{' '}
                  <span className="font-semibold">{contractData.sellerId}</span> อยู่ที่{' '}
                  <span className="font-semibold">{contractData.sellerAddress}</span> ซึ่งต่อไปในสัญญานี้เรียกว่า &ldquo;ผู้ขาย&rdquo; กับ Astly technologies co.,ltd. สำนักงานตั้งอยู่ที่{' '}
                  <span className="font-semibold">{contractData.buyerAddress}</span> ซึ่งต่อไปในสัญญานี้เรียกว่า &ldquo;ผู้ซื้อ&rdquo;
                </p>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 1: รายละเอียดของทรัพย์</p>
                  <p>ประเภททรัพย์: <span className="font-semibold">{contractData.itemType}</span></p>
                  <p>ยี่ห้อ / รุ่น / รายละเอียดเพิ่มเติม: <span className="font-semibold">{contractData.itemDetails}</span></p>
                  <p>ราคาซื้อขาย: <span className="font-semibold">{contractData.price.toLocaleString()}</span> บาท</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 3: สิทธิในการไถ่คืน</p>
                  <p>ผู้ขายมีสิทธิไถ่คืนทรัพย์ดังกล่าวจากผู้ซื้อได้ ภายใน <span className="font-semibold">{contractData.periodDays}</span> วัน</p>
                  <p>เงินต้นจำนวน <span className="font-semibold">{contractData.principal.toLocaleString()}</span> บาท</p>
                  <p>ดอกเบี้ยจำนวน <span className="font-semibold">{contractData.interest.toLocaleString()}</span> บาท</p>
                  <p>ค่าธรรมเนียมการดูแลรักษาทรัพย์และดำเนินการ: <span className="font-semibold">{contractData.serviceFee.toLocaleString()}</span> บาท</p>
                  <p>รวมทั้งสิ้น: <span className="font-semibold">{contractData.total.toLocaleString()}</span> บาท</p>
                </div>
              </div>

              {/* Signature Section */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Seller Signature */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">ผู้ขาย</h4>
                  <div className="border border-gray-200 rounded p-2 mb-3">
                    <canvas
                      ref={sellerCanvasRef}
                      width={300}
                      height={150}
                      className="border border-gray-300 rounded w-full cursor-crosshair"
                      onMouseDown={() => startDrawing(sellerCanvasRef, 'seller')}
                    />
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => clearSignature('seller')}
                      className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300"
                    >
                      ล้าง
                    </button>
                    <button
                      onClick={() => saveSignature('seller')}
                      className="flex-1 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                    >
                      บันทึก
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 text-center">
                    เซ็นชื่อ: {signatureData.seller.name}
                  </p>
                </div>

                {/* Buyer Signature */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">ผู้ซื้อ</h4>
                  <div className="mb-3">
                    <input
                      type="text"
                      placeholder="ชื่อพนักงาน"
                      value={signatureData.buyer.name}
                      onChange={(e) => setSignatureData(prev => ({
                        ...prev,
                        buyer: { ...prev.buyer, name: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="border border-gray-200 rounded p-2 mb-3">
                    <canvas
                      ref={buyerCanvasRef}
                      width={300}
                      height={150}
                      className="border border-gray-300 rounded w-full cursor-crosshair"
                      onMouseDown={() => startDrawing(buyerCanvasRef, 'buyer')}
                    />
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => clearSignature('buyer')}
                      className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300"
                    >
                      ล้าง
                    </button>
                    <button
                      onClick={() => saveSignature('buyer')}
                      className="flex-1 bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                    >
                      บันทึก
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 text-center">
                    เซ็นชื่อ: {signatureData.buyer.name || 'ยังไม่ได้ระบุ'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'photo' && (
            <div className="text-center space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">ถ่ายรูปยืนยันตัวตน</h3>
                <p className="text-blue-700">
                  กรุณาถ่ายรูปคู่กับ QR Code หรือเอกสารสำคัญเพื่อยืนยันตัวตน
                </p>
              </div>

              <div className="max-w-md mx-auto">
                {verificationPhoto ? (
                  <div className="space-y-4">
                    <img
                      src={verificationPhoto}
                      alt="Verification Photo"
                      className="w-full rounded-lg border border-gray-300"
                    />
                    <div className="flex gap-4">
                      <button
                        onClick={handleTakePhoto}
                        className="flex-1 bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600"
                      >
                        ถ่ายใหม่
                      </button>
                      <button
                        onClick={() => setVerificationPhoto(null)}
                        className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg hover:bg-gray-600"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-full h-64 bg-gray-200 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-400">
                      <div className="text-center">
                        <div className="text-4xl text-gray-400 mb-2">📷</div>
                        <p className="text-gray-600">ยังไม่ได้ถ่ายรูป</p>
                      </div>
                    </div>
                    <button
                      onClick={handleTakePhoto}
                      className="w-full bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600"
                    >
                      ถ่ายรูปยืนยันตัวตน
                    </button>
                  </div>
                )}
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 p-4 flex justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            ยกเลิก
          </button>

          <div className="flex gap-3">
            {currentStep === 'contract' ? (
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                ถัดไป: ถ่ายรูป
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading || !verificationPhoto}
                className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'กำลังบันทึก...' : 'สร้างสัญญา'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
