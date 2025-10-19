'use client';

import { useState, useRef, useEffect } from 'react';
import { Sarabun } from 'next/font/google';

const sarabun = Sarabun({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

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

export default function ContractForm({ item, customer, onComplete, onClose }: ContractFormProps) {
  // CSS styles for contract form inputs
  const inputStyles = `
    .date-input { width: 120px; }
    .days-input { width: 50px; text-align: center; }
    .id-input { width: 150px; }
    .name-input { width: 280px; }
    .price-input, .amount-input { width: 140px; text-align: right; }
    .address-input { width: 95%; }
    .office-input { width: 60%; }
    .item-input { width: 400px; }
    .details-input { width: 90%; }
    .signature-input { width: 70%; }
  `;

  // Add styles to document head
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = inputStyles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  const [currentStep, setCurrentStep] = useState<'contract' | 'photo'>('contract');
  const [signatureData, setSignatureData] = useState<SignatureData>({
    seller: { name: customer.fullName, signedDate: new Date() },
    buyer: { name: '', signedDate: new Date() }
  });
  const [verificationPhoto, setVerificationPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data for contract
  const [contractForm, setContractForm] = useState({
    sellerSignature: '',
    sellerPrintName: '',
    sellerDate: new Date().toLocaleDateString('th-TH'),
    buyerSignature: '',
    buyerName: '',
    buyerDate: new Date().toLocaleDateString('th-TH')
  });

  // Canvas refs for signatures
  const sellerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const buyerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isDrawing, setIsDrawing] = useState<{ seller: boolean; buyer: boolean }>({
    seller: false,
    buyer: false
  });

  // Contract data calculation
  const calculateInterest = () => {
    const pawnedPrice = item.desiredAmount || item.estimatedValue || 0;
    const interestRate = item.interestRate || 10;
    const periodDays = item.loanDays || 30;
    const dailyRate = interestRate / 100 / 30;
    return Math.round(pawnedPrice * dailyRate * periodDays);
  };

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
    serviceFee: 0, // default
    total: (item.desiredAmount || item.estimatedValue || 0) + calculateInterest()
  };

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
        serviceFee: 0,
        contractForm: contractForm
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
              {/* Contract Content - A4 Size Simulation */}
              <div className="border border-gray-300 rounded-lg p-6 bg-gray-50 text-sm leading-relaxed mx-auto" style={{width: '21cm', minHeight: '29.7cm', margin: '20px auto'}}>
                <h3 className="text-center font-bold text-lg mb-4">สัญญาซื้อขายทรัพย์พร้อมสิทธิไถ่คืนโดยสมัครใจ</h3>

                <div className="mb-4">
                  <p className="mb-4 text-indent">
                    ทำขึ้น ณ วันที่ <input type="text" className="date-input" defaultValue={contractData.contractDate} readOnly />
                    ระหว่าง <input type="text" className="name-input" defaultValue={contractData.sellerName} readOnly />
                    เลขบัตรประชาชน <input type="text" className="id-input" defaultValue={contractData.sellerId} readOnly />
                    อยู่ที่ <input type="text" className="address-input" defaultValue={contractData.sellerAddress} readOnly />
                    ซึ่งต่อไปในสัญญานี้เรียกว่า &ldquo;ผู้ขาย&rdquo; กับ Pawnly technologies co.,ltd.
                    สำนักงานตั้งอยู่ที่ <input type="text" className="office-input" defaultValue={contractData.buyerAddress} readOnly />
                    ซึ่งต่อไปในสัญญานี้เรียกว่า &ldquo;ผู้ซื้อ&rdquo;
                  </p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 1: รายละเอียดของทรัพย์</p>
                  <p>ผู้ขายตกลงขายทรัพย์สินให้แก่ผู้ซื้อ รายการดังต่อไปนี้ :</p>
                  <p className="pl-5">ประเภททรัพย์ : <input type="text" className="item-input" defaultValue={contractData.itemType} readOnly /></p>
                  <p className="pl-5">ยี่ห้อ / รุ่น / รายละเอียดเพิ่มเติม : <input type="text" className="details-input" defaultValue={contractData.itemDetails} readOnly /></p>
                  <p className="pl-5">ราคาซื้อขาย : <input type="text" className="price-input" defaultValue={contractData.price.toLocaleString()} readOnly /> บาท ( รวมภาษีแล้ว )</p>
                  <p>ผู้ขายรับรองว่าเป็นเจ้าของทรัพย์โดยชอบด้วยกฎหมาย และทรัพย์ไม่ได้อยู่ภายใต้ภาระผูกพันใด ๆ</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 2: การโอนกรรมสิทธิ์</p>
                  <p>ผู้ขายตกลงโอนกรรมสิทธิ์ทรัพย์ดังกล่าวให้แก่ผู้ซื้อทันทีในวันที่ทำสัญญานี้ และผู้ซื้อได้ชำระเงินครบถ้วนแล้ว</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 3: สิทธิในการไถ่คืน</p>
                  <p>ผู้ขายมีสิทธิไถ่คืนทรัพย์ดังกล่าวจากผู้ซื้อได้ ภายใน <input type="text" className="days-input" defaultValue={contractData.periodDays} readOnly /> วัน นับจากวันทำสัญญา โดยต้องชำระเงินคืนรวม :</p>
                  <p className="pl-5">เงินต้นจำนวน <input type="text" className="amount-input" defaultValue={contractData.principal.toLocaleString()} readOnly /> บาท</p>
                  <p className="pl-5">ดอกเบี้ยจำนวน <input type="text" className="amount-input" defaultValue={contractData.interest.toLocaleString()} readOnly /> บาท</p>
                  <p className="pl-5">ค่าธรรมเนียมการดูแลรักษาทรัพย์และดำเนินการ : <input type="text" className="amount-input" defaultValue={contractData.serviceFee.toLocaleString()} readOnly /> บาท</p>
                  <p className="pl-5">รวมทั้งสิ้น : <input type="text" className="amount-input" defaultValue={contractData.total.toLocaleString()} readOnly /> บาท</p>
                  <p>หากผู้ขายไม่ชำระเงินคืนภายในกำหนดดังกล่าว ถือว่าผู้ขายสละสิทธิในการไถ่คืนโดยไม่จำเป็นต้องมีหนังสือบอกกล่าวใด ๆ และกรรมสิทธิ์ในทรัพย์เป็นของผู้ซื้อโดยสมบูรณ์</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 4: การยืนยันความสมัครใจ</p>
                  <p>ผู้ขายรับรองว่าการทำสัญญาครั้งนี้เป็นการ ขายขาดโดยสมัครใจ ไม่อยู่ภายใต้การขู่เข็ญ บังคับ หรือหลอกลวง และเข้าใจเงื่อนไขของสิทธิในการไถ่คืนเป็นอย่างดี</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 5: การไม่เป็นสัญญาจำนำหรือขายฝาก</p>
                  <p>คู่สัญญาทั้งสองฝ่ายตกลงร่วมกันว่าสัญญาฉบับนี้ มิใช่สัญญาจำนำ หรือขายฝาก ตามประมวลกฎหมายแพ่งและพาณิชย์ และไม่มีข้อบทใดที่ตีความเป็นอย่างอื่นได้</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 6: การจัดเก็บและรับผิดชอบทรัพย์</p>
                  <p>ผู้ซื้อจะทำการเก็บรักษาทรัพย์ไว้โดยปลอดภัยจนกว่าจะครบกำหนดไถ่คืนหรือจนกว่าจะตกเป็นกรรมสิทธิ์ของผู้ซื้อ</p>
                </div>

                <div className="mb-4">
                  <p className="font-semibold mb-2">ข้อ 7: กฎหมายที่ใช้บังคับ</p>
                  <p>สัญญาฉบับนี้อยู่ภายใต้กฎหมายไทย หากมีข้อพิพาท ให้ใช้ศาลในเขตกรุงเทพมหานครเป็นที่พิจารณาคดี</p>
                </div>

                <div className="signature-section">
                  <div className="signature-block">
                    <p>ลงชื่อ <input
                      type="text"
                      className="signature-input"
                      value={contractForm.sellerSignature}
                      onChange={(e) => setContractForm(prev => ({ ...prev, sellerSignature: e.target.value }))}
                      placeholder="เซ็นชื่อผู้ขาย"
                    /> ผู้ขาย</p>
                    <p>( <input
                      type="text"
                      className="name-input"
                      value={contractForm.sellerPrintName}
                      onChange={(e) => setContractForm(prev => ({ ...prev, sellerPrintName: e.target.value }))}
                      placeholder="พิมพ์ชื่อ"
                    /> )</p>
                    <p>วันที่ : <input
                      type="text"
                      className="date-input"
                      value={contractForm.sellerDate}
                      onChange={(e) => setContractForm(prev => ({ ...prev, sellerDate: e.target.value }))}
                      placeholder="วันที่"
                    /></p>
                  </div>
                  <div className="signature-block">
                    <p>ลงชื่อ <input
                      type="text"
                      className="signature-input"
                      value={contractForm.buyerSignature}
                      onChange={(e) => setContractForm(prev => ({ ...prev, buyerSignature: e.target.value }))}
                      placeholder="เซ็นชื่อผู้ซื้อ"
                    /> ผู้ซื้อ</p>
                    <p>( <input
                      type="text"
                      className="name-input"
                      value={contractForm.buyerName}
                      onChange={(e) => setContractForm(prev => ({ ...prev, buyerName: e.target.value }))}
                      placeholder="พิมพ์ชื่อพนักงาน"
                    /> )</p>
                    <p>วันที่ : <input
                      type="text"
                      className="date-input"
                      value={contractForm.buyerDate}
                      onChange={(e) => setContractForm(prev => ({ ...prev, buyerDate: e.target.value }))}
                      placeholder="วันที่"
                    /></p>
                  </div>
                </div>
              </div>

              {/* Digital Signature Section */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Seller Digital Signature */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">เซ็นชื่อดิจิทัล - ผู้ขาย</h4>
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

                {/* Buyer Digital Signature */}
                <div className="border border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-center">เซ็นชื่อดิจิทัล - ผู้ซื้อ</h4>
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
