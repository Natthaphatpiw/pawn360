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
  // Contract steps: 'contract' -> 'signatures' -> 'photo' -> 'complete' -> 'waiting'
  const [currentStep, setCurrentStep] = useState<'contract' | 'signatures' | 'photo' | 'complete' | 'waiting'>('contract');

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

  console.log('ContractForm rendered with:', { item: !!item, customer: !!customer });

  // Contract signatures
  const [signatures, setSignatures] = useState<{
    seller: { name: string; signature: string; date: string };
    buyer: { name: string; signature: string; date: string };
  }>({
    seller: { name: customer?.fullName || '', signature: '', date: new Date().toLocaleDateString('th-TH') },
    buyer: { name: '', signature: '', date: new Date().toLocaleDateString('th-TH') }
  });

  // Update signatures when customer changes
  useEffect(() => {
    if (customer?.fullName && signatures.seller.name !== customer.fullName) {
      setSignatures(prev => ({
        ...prev,
        seller: { ...prev.seller, name: customer.fullName }
      }));
    }
  }, [customer?.fullName]);

  // Editable contract details
  const [contractDetails, setContractDetails] = useState({
    pawnPrice: item.desiredAmount || item.estimatedValue || 0,
    interestRate: item.interestRate || 10,
    loanDays: item.loanDays || 30,
  });

  // Original values for comparison
  const originalDetails = {
    pawnPrice: item.desiredAmount || item.estimatedValue || 0,
    interestRate: item.interestRate || 10,
    loanDays: item.loanDays || 30,
  };

  // Confirmation status
  const [confirmationStatus, setConfirmationStatus] = useState<'pending' | 'confirmed' | 'canceled' | null>(null);

  // Photo verification
  const [verificationPhoto, setVerificationPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Camera input ref
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Contract content ref for PDF generation
  const contractContentRef = useRef<HTMLDivElement>(null);

  // Contract data calculation
  const calculateInterest = () => {
    const pawnedPrice = contractDetails.pawnPrice;
    const interestRate = contractDetails.interestRate;
    const periodDays = contractDetails.loanDays;
    const dailyRate = interestRate / 100 / 30;
    return Math.round(pawnedPrice * dailyRate * periodDays);
  };

  // Check if details have been modified
  const hasModifications = () => {
    return (
      contractDetails.pawnPrice !== originalDetails.pawnPrice ||
      contractDetails.interestRate !== originalDetails.interestRate ||
      contractDetails.loanDays !== originalDetails.loanDays
    );
  };

  // Get modification details for LINE message
  const getModificationDetails = () => {
    const changes = [];
    if (contractDetails.pawnPrice !== originalDetails.pawnPrice) {
      changes.push(`ราคา จาก ${originalDetails.pawnPrice.toLocaleString()} เป็น ${contractDetails.pawnPrice.toLocaleString()}`);
    }
    if (contractDetails.interestRate !== originalDetails.interestRate) {
      changes.push(`ดอกเบี้ย จาก ${originalDetails.interestRate}% เป็น ${contractDetails.interestRate}%`);
    }
    if (contractDetails.loanDays !== originalDetails.loanDays) {
      changes.push(`จำนวนวัน จาก ${originalDetails.loanDays} เป็น ${contractDetails.loanDays}`);
    }
    return changes;
  };

  // Generate full contract HTML
  const generateContractHTML = () => {
    const contractData = {
      contractDate: new Date().toLocaleDateString('th-TH'),
      sellerName: customer.fullName,
      sellerId: customer.idNumber,
      sellerAddress: `${customer.address.houseNumber} ${customer.address.street || ''} ${customer.address.subDistrict} ${customer.address.district} ${customer.address.province} ${customer.address.postcode}`,
      buyerAddress: '1400/84 เขตสวนหลวง แขวงสวนหลวง กทม 10250',
      itemType: item.type,
      itemDetails: `${item.brand} ${item.model}${item.serialNo ? ` (S/N: ${item.serialNo})` : ''}${item.accessories ? ` ${item.accessories}` : ''}${item.defects ? ` ${item.defects}` : ''}${item.note ? ` ${item.note}` : ''}`,
      price: contractDetails.pawnPrice,
      periodDays: contractDetails.loanDays,
      principal: contractDetails.pawnPrice,
      interest: calculateInterest(),
      serviceFee: 0,
      total: contractDetails.pawnPrice + calculateInterest()
    };

    return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>สัญญาซื้อขายทรัพย์ (TH)</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Sarabun', 'Arial', sans-serif;
                line-height: 1.8;
                background-color: #ffffff;
                color: #333;
                margin: 0;
                padding: 0;
            }
            .page-container {
                width: 21cm;
                min-height: 29.7cm;
                padding: 2cm;
                margin: 0 auto;
                background-color: #ffffff;
                box-sizing: border-box;
            }
            h3 { text-align: center; font-weight: 700; }
            p { margin: 8px 0; }
            .clause { margin-bottom: 20px; }
            .clause-title { font-weight: 700; margin-top: 15px; }
            .preamble p { text-indent: 2em; }
            input[type="text"] {
                border: none;
                border-bottom: 1px solid #000;
                padding: 2px 4px;
                font-family: 'Sarabun', 'Arial', sans-serif;
                font-size: 0.95em;
                background-color: transparent;
            }
            .date { width: 120px; }
            .days { width: 50px; text-align: center; }
            .id-num { width: 150px; }
            .name { width: 280px; }
            .price, .amount { width: 140px; text-align: right; }
            .address { width: 95%; }
            .office-address { width: 60%; }
            .item-type { width: 400px; }
            .item-details { width: 90%; }
            .signature-section {
                display: flex;
                justify-content: space-between;
                margin-top: 40px;
                padding-top: 20px;
            }
            .signature-block { width: 48%; }
            .signature-block p { margin-bottom: 10px; }
        </style>
    </head>
    <body>
        <div class="page-container">
            <h3>สัญญาซื้อขายทรัพย์พร้อมสิทธิไถ่คืนโดยสมัครใจ</h3>

            <div class="preamble clause">
                <p>
                    ทำขึ้น ณ วันที่ <input type="text" class="date" value="${contractData.contractDate}" readonly>
                    ระหว่าง <input type="text" class="name" value="${contractData.sellerName}" readonly>
                    เลขบัตรประชาชน <input type="text" class="id-num" value="${contractData.sellerId}" readonly>
                    อยู่ที่อยู่ <input type="text" class="address" value="${contractData.sellerAddress}" readonly>
                    ซึ่งต่อไปในสัญญานี้เรียกว่า "ผู้ขาย" กับ Pawnly Technologies Co., Ltd.
                    สำนักงานตั้งอยู่ที่ <input type="text" class="office-address" value="${contractData.buyerAddress}" readonly>
                    ซึ่งต่อไปในสัญญานี้เรียกว่า "ผู้ซื้อ"
                </p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 1: รายละเอียดของทรัพย์</p>
                <p>ผู้ขายตกลงขายทรัพย์สินให้แก่ผู้ซื้อ รายการดังต่อไปนี้ :</p>
                <p style="padding-left: 20px;">ประเภททรัพย์ : <input type="text" class="item-type" value="${contractData.itemType}" readonly></p>
                <p style="padding-left: 20px;">ยี่ห้อ / รุ่น / รายละเอียดเพิ่มเติม : <input type="text" class="item-details" value="${contractData.itemDetails}" readonly></p>
                <p style="padding-left: 20px;">ราคาซื้อขาย : <input type="text" class="price" value="${contractData.price.toLocaleString()}" readonly> บาท ( รวมภาษีแล้ว )</p>
                <p>ผู้ขายรับรองว่าเป็นเจ้าของทรัพย์โดยชอบด้วยกฎหมาย และทรัพย์ไม่ได้อยู่ภายใต้ภาระผูกพันใด ๆ</p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 2: การโอนกรรมสิทธิ์</p>
                <p>ผู้ขายตกลงโอนกรรมสิทธิ์ทรัพย์ดังกล่าวให้แก่ผู้ซื้อทันทีในวันที่ทำสัญญานี้ และผู้ซื้อได้ชำระเงินครบถ้วนแล้ว</p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 3: สิทธิในการไถ่คืน</p>
                <p>ผู้ขายมีสิทธิไถ่คืนทรัพย์ดังกล่าวจากผู้ซื้อได้ ภายใน <input type="text" class="days" value="${contractData.periodDays}" readonly> วัน นับจากวันทำสัญญา โดยต้องชำระเงินคืนรวม :</p>
                <p style="padding-left: 20px;">เงินต้นจำนวน <input type="text" class="amount" value="${contractData.principal.toLocaleString()}" readonly> บาท</p>
                <p style="padding-left: 20px;">ดอกเบี้ยจำนวน <input type="text" class="amount" value="${contractData.interest.toLocaleString()}" readonly> บาท</p>
                <p style="padding-left: 20px;">ค่าธรรมเนียมการดูแลรักษาทรัพย์และดำเนินการ : <input type="text" class="amount" value="${contractData.serviceFee.toLocaleString()}" readonly> บาท</p>
                <p style="padding-left: 20px;">รวมทั้งสิ้น : <input type="text" class="amount" value="${contractData.total.toLocaleString()}" readonly> บาท</p>
                <p>หากผู้ขายไม่ชำระเงินคืนภายในกำหนดดังกล่าว ถือว่าผู้ขายสละสิทธิในการไถ่คืนโดยไม่จำเป็นต้องมีหนังสือบอกกล่าวใด ๆ และกรรมสิทธิ์ในทรัพย์เป็นของผู้ซื้อโดยสมบูรณ์</p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 4: การยืนยันความสมัครใจ</p>
                <p>ผู้ขายรับรองว่าการทำสัญญาครั้งนี้เป็นการ ขายขาดโดยสมัครใจ ไม่อยู่ภายใต้การขู่เข็ญ บังคับ หรือหลอกลวง และเข้าใจเงื่อนไขของสิทธิในการไถ่คืนเป็นอย่างดี</p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 5: การไม่เป็นสัญญาจำนำหรือขายฝาก</p>
                <p>คู่สัญญาทั้งสองฝ่ายตกลงร่วมกันว่าสัญญาฉบับนี้ มิใช่สัญญาจำนำ หรือขายฝาก ตามประมวลกฎหมายแพ่งและพาณิชย์ และไม่มีข้อบทใดที่ตีความเป็นอย่างอื่นได้</p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 6: การจัดเก็บและรับผิดชอบทรัพย์</p>
                <p>ผู้ซื้อจะทำการเก็บรักษาทรัพย์ไว้โดยปลอดภัยจนกว่าจะครบกำหนดไถ่คืนหรือจนกว่าจะตกเป็นกรรมสิทธิ์ของผู้ซื้อ</p>
            </div>

            <div class="clause">
                <p class="clause-title">ข้อ 7: กฎหมายที่ใช้บังคับ</p>
                <p>สัญญาฉบับนี้อยู่ภายใต้กฎหมายไทย หากมีข้อพิพาท ให้ใช้ศาลในเขตกรุงเทพมหานครเป็นที่พิจารณาคดี</p>
            </div>

            <div class="signature-section">
                <div class="signature-block">
                    <p>ลงชื่อ <input type="text" style="width: 70%;" value="${signatures.seller.signature ? '[ลายเซ็น]' : ''}" readonly> ผู้ขาย</p>
                    <p>( <input type="text" style="width: 80%;" value="${signatures.seller.name}" readonly> )</p>
                    <p>วันที่ : <input type="text" class="date" value="${signatures.seller.date}" readonly></p>
                </div>
                <div class="signature-block">
                    <p>ลงชื่อ <input type="text" style="width: 70%;" value="${signatures.buyer.signature ? '[ลายเซ็น]' : ''}" readonly> ผู้ซื้อ</p>
                    <p>( pawnly technologies co.,ltd )</p>
                    <p>วันที่ : <input type="text" class="date" value="${signatures.buyer.date}" readonly></p>
                </div>
            </div>
        </div>
    </body>
    </html>`;
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

  // Send confirmation message to user
  const sendConfirmationMessage = async () => {
    try {
      const modifications = getModificationDetails();

      const response = await fetch('/api/contracts/send-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lineId: customer.lineId,
          itemId: item._id,
          modifications,
          newContract: {
            itemId: item._id,
            pawnPrice: contractDetails.pawnPrice,
            interestRate: contractDetails.interestRate,
            loanDays: contractDetails.loanDays,
            interest: calculateInterest(),
            total: contractDetails.pawnPrice + calculateInterest(),
            item: `${item.brand} ${item.model}`,
          },
        }),
      });

      if (response.ok) {
        setCurrentStep('waiting');
        pollConfirmationStatus();
      } else {
        throw new Error('Failed to send confirmation message');
      }
    } catch (error) {
      console.error('Error sending confirmation message:', error);
      setError('เกิดข้อผิดพลาดในการส่งข้อความยืนยัน');
    }
  };

  // Poll for confirmation status
  const pollConfirmationStatus = async () => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/contracts/confirmation-status?itemId=${item._id}`);
        const data = await response.json();

        if (data.status === 'confirmed') {
          clearInterval(pollInterval);
          setConfirmationStatus('confirmed');
          setCurrentStep('signatures');
        } else if (data.status === 'canceled') {
          clearInterval(pollInterval);
          setConfirmationStatus('canceled');
          setError('ผู้ใช้ได้ยกเลิกการแก้ไขสัญญา กรุณาแก้ไขข้อมูลใหม่');
          setCurrentStep('contract');
        }
      } catch (error) {
        console.error('Error polling confirmation status:', error);
      }
    }, 5000); // Poll every 5 seconds

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (confirmationStatus !== 'confirmed') {
        setError('หมดเวลายืนยัน กรุณาทำรายการใหม่');
        setCurrentStep('contract');
      }
    }, 300000); // 5 minutes
  };

  // Navigation handlers
  const goToSignatures = async () => {
    if (hasModifications()) {
      await sendConfirmationMessage();
    } else {
      setCurrentStep('signatures');
    }
  };

  const goToPhoto = () => {
    setCurrentStep('photo');
  };

  const completeContract = async () => {
    console.log('completeContract called with:', {
      sellerSignature: !!signatures.seller.signature,
      buyerSignature: !!signatures.buyer.signature,
      verificationPhoto: !!verificationPhoto,
      itemId: item?._id,
      item: !!item,
      customer: !!customer
    });

    if (!signatures.seller.signature || !signatures.buyer.signature || !verificationPhoto) {
      console.log('Validation failed');
      setError('กรุณาเซ็นชื่อและถ่ายรูปให้ครบถ้วน');
      return;
    }

    console.log('Validation passed, proceeding...');

    try {
      setLoading(true);

      console.log('Starting contract creation...', {
        itemId: item._id,
        hasVerificationPhoto: !!verificationPhoto,
        verificationPhotoLength: verificationPhoto?.length,
        sellerSignatureLength: signatures.seller.signature?.length,
        buyerSignatureLength: signatures.buyer.signature?.length
      });

      // Generate contract HTML and save
      const contractHTML = generateContractHTML();
      console.log('Generated contract HTML, length:', contractHTML.length);

      console.log('About to make fetch request...');
      let saveResponse;
      try {
        saveResponse = await fetch('/api/contracts/save-contract-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            itemId: item._id,
            contractHTML: contractHTML, // Send HTML for PDF generation
            verificationPhoto: verificationPhoto
          })
        });
        console.log('Fetch completed, response status:', saveResponse.status);
      } catch (fetchError: any) {
        console.error('Fetch failed:', fetchError);
        throw new Error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์');
      }

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        console.error('Save response error:', errorText);
        throw new Error('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }

      const saveResult = await saveResponse.json();
      console.log('Save result:', saveResult);

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
        verificationPhoto,
        verificationPhotoUrl: saveResult.verificationPhotoUrl
      };

        // Send notification to customer
        try {
          await fetch('/api/contracts/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              itemId: item._id,
              lineId: customer.lineId,
              contractData: contractData
            })
          });
          console.log('Notification sent successfully');
        } catch (notifyError) {
          console.error('Failed to send notification:', notifyError);
          // Don't fail the whole process if notification fails
        }

        onComplete(contractData);
    } catch (error: any) {
      console.error('Error completing contract:', error);
      setError(error.message || 'เกิดข้อผิดพลาดในการสร้างสัญญา');
    } finally {
      setLoading(false);
    }
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
              {currentStep === 'contract' && 'ตรวจสอบและแก้ไขสัญญา'}
              {currentStep === 'waiting' && 'กำลังรอผู้ใช้อยืนยัน'}
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
            {currentStep === 'waiting' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">
                      กำลังรอผู้ใช้ยืนยัน
                    </h3>
                    <p className="text-blue-700 text-sm">
                      ได้ส่งข้อความไปยัง LINE ของผู้ใช้แล้ว
                      <br />
                      กรุณารอให้ผู้ใช้กดยืนยันหรือยกเลิกการแก้ไข
                    </p>
                    <div className="mt-4 text-xs text-gray-600">
                      จะหมดเวลาใน 5 นาที
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">รายละเอียดการแก้ไขที่ส่งไป:</h4>
                  <div className="space-y-1 text-sm">
                    {getModificationDetails().map((change, index) => (
                      <div key={index} className="text-gray-700">
                        • {change}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            {currentStep === 'contract' && (
              <div className="space-y-4">
                {/* Contract Details - Editable */}
                <div className="border border-gray-300 rounded-lg p-4 bg-white">
                  <h3 className="text-center font-bold text-base mb-4">รายละเอียดสัญญา</h3>

                  <div className="space-y-4">
                    {/* Pawn Price */}
                    <div>
                      <label className="block text-sm font-medium mb-1">ราคาจำนำ (บาท)</label>
                      <input
                        type="number"
                        value={contractDetails.pawnPrice}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          pawnPrice: parseFloat(e.target.value) || 0
                        }))}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="1"
                      />
                    </div>

                    {/* Interest Rate */}
                    <div>
                      <label className="block text-sm font-medium mb-1">อัตราดอกเบี้ย (%)</label>
                      <input
                        type="number"
                        value={contractDetails.interestRate}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          interestRate: parseFloat(e.target.value) || 0
                        }))}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    {/* Loan Days */}
                    <div>
                      <label className="block text-sm font-medium mb-1">จำนวนวันจำนำ</label>
                      <input
                        type="number"
                        value={contractDetails.loanDays}
                        onChange={(e) => setContractDetails(prev => ({
                          ...prev,
                          loanDays: parseInt(e.target.value) || 0
                        }))}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="1"
                      />
                    </div>

                    {/* Summary */}
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>ราคาจำนำ:</span>
                          <span className="font-semibold">{contractDetails.pawnPrice.toLocaleString()} บาท</span>
                        </div>
                        <div className="flex justify-between">
                          <span>ดอกเบี้ย ({contractDetails.interestRate}%):</span>
                          <span className="font-semibold">{calculateInterest().toLocaleString()} บาท</span>
                        </div>
                        <div className="flex justify-between">
                          <span>ระยะเวลา:</span>
                          <span className="font-semibold">{contractDetails.loanDays} วัน</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="font-semibold">รวม:</span>
                          <span className="font-bold text-green-600">
                            {(contractDetails.pawnPrice + calculateInterest()).toLocaleString()} บาท
                          </span>
                        </div>
                      </div>
                    </div>

                    {hasModifications() && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-yellow-800 text-sm font-medium">
                          ⚠️ ข้อมูลสัญญาได้ถูกแก้ไข จะต้องส่งให้ผู้ใช้ยืนยันก่อนดำเนินการต่อ
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => window.open(`/contract/${item._id}/full?mode=view`, '_blank')}
                    className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors font-medium"
                  >
                    ดูร่างสัญญาเต็ม (ดูเฉยๆ)
                  </button>
                  <button
                    onClick={goToSignatures}
                    className="w-full bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 transition-colors font-medium"
                  >
                    {hasModifications() ? 'ส่งยืนยันและดำเนินการต่อ' : 'ดำเนินการต่อ - เซ็นชื่อในสัญญา'}
                  </button>
                </div>
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

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => window.open(`/contract/${item._id}/full?mode=view`, '_blank')}
                    className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors font-medium"
                  >
                    ดูร่างสัญญาเต็ม (ดูเฉยๆ)
                  </button>
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
                    disabled={!verificationPhoto || loading}
                    className="flex-1 bg-green-500 text-white py-3 px-4 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'กำลังสร้างสัญญา...' : 'สร้างสัญญา'}
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
