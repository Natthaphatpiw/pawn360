'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Sarabun } from 'next/font/google';
import Image from 'next/image';
import html2canvas from 'html2canvas';

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

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureData: string, name: string) => void;
  title: string;
  placeholder: string;
  initialName?: string;
}

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

  const handleTouchEnd = () => {
    setIsDrawing(false);
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
                onTouchEnd={handleTouchEnd}
                style={{ touchAction: 'none' }}
              />
            </div>
          </div>

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

export default function FullContractPage({ params }: { params: { itemId: string } }) {
  const { itemId } = params;
  const router = useRouter();

  const [item, setItem] = useState<Item | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Contract signatures and dates
  const [signatures, setSignatures] = useState<{
    seller: { name: string; signature: string; date: string };
    buyer: { name: string; signature: string; date: string };
  }>({
    seller: { name: '', signature: '', date: '' },
    buyer: { name: '', signature: '', date: '' }
  });

  // Load data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`/api/pawn-requests/${itemId}`);
        if (response.data.success) {
          setItem(response.data.item);
          setCustomer(response.data.customer);
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError('ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      fetchData();
    }
  }, [itemId]);

  // Calculate interest
  const calculateInterest = () => {
    if (!item) return 0;
    const pawnedPrice = item.desiredAmount || item.estimatedValue || 0;
    const interestRate = item.interestRate || 10;
    const periodDays = item.loanDays || 30;
    const dailyRate = interestRate / 100 / 30;
    return Math.round(pawnedPrice * dailyRate * periodDays);
  };

  // Contract data
  const contractData = item && customer ? {
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
    total: (item.desiredAmount || item.estimatedValue || 0) + calculateInterest()
  } : null;

  // Signature handlers
  const openSignatureModal = (type: 'seller' | 'buyer') => {
    setSignatureModal({
      isOpen: true,
      type,
      title: type === 'seller' ? 'เซ็นชื่อผู้ขาย' : 'เซ็นชื่อผู้ซื้อ',
      placeholder: type === 'seller' ? 'ชื่อผู้จำนำ' : 'ชื่อพนักงาน'
    });
  };

  const closeSignatureModal = () => {
    setSignatureModal(prev => ({ ...prev, isOpen: false }));
  };

  const saveSignature = (signatureData: string, name: string) => {
    if (signatureModal.type === 'seller') {
      setSignatures(prev => ({
        ...prev,
        seller: { name, signature: signatureData, date: prev.seller.date }
      }));
    } else {
      setSignatures(prev => ({
        ...prev,
        buyer: { name, signature: signatureData, date: prev.buyer.date }
      }));
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleSaveContract = async () => {
    console.log('handleSaveContract called in full contract page');
    console.log('Signatures:', {
      seller: !!signatures.seller.signature,
      buyer: !!signatures.buyer.signature,
      sellerName: signatures.seller.name,
      buyerName: signatures.buyer.name
    });

    if (!signatures.seller.signature || !signatures.buyer.signature) {
      console.log('Validation failed - missing signatures');
      alert('กรุณาเซ็นชื่อให้ครบถ้วน');
      return;
    }

    console.log('Validation passed, proceeding with save...');

    try {
      setSaving(true);
      console.log('Set saving to true');

      console.log('Looking for contract element...');
      // Get the contract element
      const contractElement = document.querySelector('.page-container') as HTMLElement;
      if (!contractElement) {
        console.error('Contract element not found');
        throw new Error('ไม่พบองค์ประกอบสัญญา');
      }
      console.log('Contract element found, proceeding with html2canvas...');

      // Convert to canvas for image generation
      console.log('Starting html2canvas...');
      const canvas = await html2canvas(contractElement, {
        useCORS: true,
        allowTaint: true,
        background: '#ffffff'
      });
      console.log('html2canvas completed, canvas size:', canvas.width, 'x', canvas.height);

      // Convert to base64
      const contractImageData = canvas.toDataURL('image/png');
      console.log('Contract image data generated, length:', contractImageData.length);
      console.log('Image data preview:', contractImageData.substring(0, 100));

      // Prepare data to send
      const saveData = {
        itemId: itemId,
        contractImageData: contractImageData, // Send image data (saved as PDF file)
        verificationPhoto: null // Verification photo is saved from ContractForm
      };

      console.log('Sending data to API...');

      // Save to backend
      const response = await axios.post('/api/contracts/save-contract-image', saveData);
      console.log('API response received:', response.status, response.data);

      if (response.data.success) {
        console.log('Contract saved successfully');
        alert('บันทึกสัญญาเรียบร้อยแล้ว');
        router.back();
      } else {
        console.error('API returned error:', response.data.error);
        throw new Error(response.data.error || 'เกิดข้อผิดพลาดในการบันทึก');
      }

    } catch (error: any) {
      console.error('Error saving contract:', error);
      console.error('Error details:', error.response?.data || error.message);
      alert('เกิดข้อผิดพลาดในการบันทึกสัญญา: ' + (error.response?.data?.error || error.message));
    } finally {
      console.log('Setting saving to false');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !contractData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600">{error || 'ไม่พบข้อมูล'}</p>
          <button
            onClick={handleBack}
            className="mt-4 bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            ย้อนกลับ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-100 py-4 ${sarabun.className}`}>
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 mb-4">
        <div className="flex justify-between items-center">
          <button
            onClick={handleBack}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 flex items-center gap-2"
          >
            ← ย้อนกลับ
          </button>
          <h1 className="text-xl font-bold text-gray-800">สัญญาซื้อขายทรัพย์พร้อมสิทธิไถ่คืน</h1>
          <div></div>
        </div>
      </div>

      {/* Contract Document */}
      <div className="max-w-4xl mx-auto bg-white shadow-lg border border-gray-300">
        <div className="p-8" style={{ fontSize: '14px', lineHeight: '1.6' }}>
          {/* Title */}
          <h2 className="text-center text-xl font-bold mb-6 text-gray-800">
            สัญญาซื้อขายทรัพย์พร้อมสิทธิไถ่คืนโดยสมัครใจ
          </h2>

          {/* Preamble */}
          <div className="mb-6">
            <p className="mb-4" style={{ textIndent: '2em' }}>
              ทำขึ้น ณ วันที่{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[120px] focus:outline-none focus:border-blue-500"
                defaultValue={contractData.contractDate}
                readOnly
              />
              {' '}ระหว่าง{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[280px] focus:outline-none focus:border-blue-500"
                defaultValue={contractData.sellerName}
                readOnly
              />
              {' '}เลขบัตรประชาชน{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[150px] focus:outline-none focus:border-blue-500"
                defaultValue={contractData.sellerId}
                readOnly
              />
              {' '}อยู่ที่อยู่{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 w-full focus:outline-none focus:border-blue-500"
                defaultValue={contractData.sellerAddress}
                readOnly
              />
              {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า &quot;ผู้ขาย&quot; กับ Pawnly Technologies Co., Ltd.
              สำนักงานตั้งอยู่ที่{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[300px] focus:outline-none focus:border-blue-500"
                defaultValue={contractData.buyerAddress}
                readOnly
              />
              {' '}ซึ่งต่อไปในสัญญานี้เรียกว่า &quot;ผู้ซื้อ&quot;
            </p>
          </div>

          {/* Clause 1 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 1: รายละเอียดของทรัพย์</p>
            <p className="mb-2">ผู้ขายตกลงขายทรัพย์สินให้แก่ผู้ซื้อ รายการดังต่อไปนี้ :</p>
            <p className="ml-5 mb-1">ประเภททรัพย์ :{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[400px] focus:outline-none focus:border-blue-500"
                defaultValue={contractData.itemType}
                readOnly
              />
            </p>
            <p className="ml-5 mb-1">ยี่ห้อ / รุ่น / รายละเอียดเพิ่มเติม :{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 w-full focus:outline-none focus:border-blue-500"
                defaultValue={contractData.itemDetails}
                readOnly
              />
            </p>
            <p className="ml-5 mb-2">ราคาซื้อขาย :{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[140px] text-right focus:outline-none focus:border-blue-500"
                defaultValue={contractData.price.toLocaleString()}
                readOnly
              />
              {' '}บาท ( รวมภาษีแล้ว )
            </p>
            <p>ผู้ขายรับรองว่าเป็นเจ้าของทรัพย์โดยชอบด้วยกฎหมาย และทรัพย์ไม่ได้อยู่ภายใต้ภาระผูกพันใด ๆ</p>
          </div>

          {/* Clause 2 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 2: การโอนกรรมสิทธิ์</p>
            <p>ผู้ขายตกลงโอนกรรมสิทธิ์ทรัพย์ดังกล่าวให้แก่ผู้ซื้อทันทีในวันที่ทำสัญญานี้ และผู้ซื้อได้ชำระเงินครบถ้วนแล้ว</p>
          </div>

          {/* Clause 3 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 3: สิทธิในการไถ่คืน</p>
            <p className="mb-2">ผู้ขายมีสิทธิไถ่คืนทรัพย์ดังกล่าวจากผู้ซื้อได้ ภายใน{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[50px] text-center focus:outline-none focus:border-blue-500"
                defaultValue={contractData.periodDays}
                readOnly
              />
              {' '}วัน นับจากวันทำสัญญา โดยต้องชำระเงินคืนรวม :
            </p>
            <p className="ml-5 mb-1">เงินต้นจำนวน{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[140px] text-right focus:outline-none focus:border-blue-500"
                defaultValue={contractData.principal.toLocaleString()}
                readOnly
              />
              {' '}บาท
            </p>
            <p className="ml-5 mb-1">ดอกเบี้ยจำนวน{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[140px] text-right focus:outline-none focus:border-blue-500"
                defaultValue={contractData.interest.toLocaleString()}
                readOnly
              />
              {' '}บาท
            </p>
            <p className="ml-5 mb-1">ค่าธรรมเนียมการดูแลรักษาทรัพย์และดำเนินการ :{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[140px] text-right focus:outline-none focus:border-blue-500"
                defaultValue={contractData.serviceFee.toLocaleString()}
                readOnly
              />
              {' '}บาท
            </p>
            <p className="ml-5 mb-2">รวมทั้งสิ้น :{' '}
              <input
                type="text"
                className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[140px] text-right focus:outline-none focus:border-blue-500"
                defaultValue={contractData.total.toLocaleString()}
                readOnly
              />
              {' '}บาท
            </p>
            <p>หากผู้ขายไม่ชำระเงินคืนภายในกำหนดดังกล่าว ถือว่าผู้ขายสละสิทธิในการไถ่คืนโดยไม่จำเป็นต้องมีหนังสือบอกกล่าวใด ๆ และกรรมสิทธิ์ในทรัพย์เป็นของผู้ซื้อโดยสมบูรณ์</p>
          </div>

          {/* Clause 4 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 4: การยืนยันความสมัครใจ</p>
            <p>ผู้ขายรับรองว่าการทำสัญญาครั้งนี้เป็นการ ขายขาดโดยสมัครใจ ไม่อยู่ภายใต้การขู่เข็ญ บังคับ หรือหลอกลวง และเข้าใจเงื่อนไขของสิทธิในการไถ่คืนเป็นอย่างดี</p>
          </div>

          {/* Clause 5 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 5: การไม่เป็นสัญญาจำนำหรือขายฝาก</p>
            <p>คู่สัญญาทั้งสองฝ่ายตกลงร่วมกันว่าสัญญาฉบับนี้ มิใช่สัญญาจำนำ หรือขายฝาก ตามประมวลกฎหมายแพ่งและพาณิชย์ และไม่มีข้อบทใดที่ตีความเป็นอย่างอื่นได้</p>
          </div>

          {/* Clause 6 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 6: การจัดเก็บและรับผิดชอบทรัพย์</p>
            <p>ผู้ซื้อจะทำการเก็บรักษาทรัพย์ไว้โดยปลอดภัยจนกว่าจะครบกำหนดไถ่คืนหรือจนกว่าจะตกเป็นกรรมสิทธิ์ของผู้ซื้อ</p>
          </div>

          {/* Clause 7 */}
          <div className="mb-6">
            <p className="font-bold mb-2">ข้อ 7: กฎหมายที่ใช้บังคับ</p>
            <p>สัญญาฉบับนี้อยู่ภายใต้กฎหมายไทย หากมีข้อพิพาท ให้ใช้ศาลในเขตกรุงเทพมหานครเป็นที่พิจารณาคดี</p>
          </div>

          {/* Signatures */}
          <div className="flex justify-between mt-12 pt-8 border-t border-gray-300">
            <div className="w-1/2 pr-4">
              <p className="mb-2">ลงชื่อ{' '}
                {signatures.seller.signature ? (
                  <Image
                    src={signatures.seller.signature}
                    alt="Seller signature"
                    width={150}
                    height={60}
                    className="inline-block border-b border-gray-400 align-bottom"
                    onClick={() => openSignatureModal('seller')}
                    style={{ cursor: 'pointer' }}
                  />
                ) : (
                  <span
                    className="border-b border-gray-400 px-2 py-1 cursor-pointer hover:bg-gray-100 inline-block min-w-[150px]"
                    onClick={() => openSignatureModal('seller')}
                  >
                    [คลิกเพื่อเซ็นชื่อ]
                  </span>
                )}
                {' '}ผู้ขาย
              </p>
              <p className="mb-2">( {' '}
                <input
                  type="text"
                  className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[200px] focus:outline-none focus:border-blue-500"
                  placeholder="ชื่อผู้จำนำ"
                  value={signatures.seller.name}
                  onChange={(e) => setSignatures(prev => ({ ...prev, seller: { ...prev.seller, name: e.target.value } }))}
                />
                {' '} )
              </p>
              <p>วันที่ : {' '}
                <input
                  type="text"
                  className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[120px] focus:outline-none focus:border-blue-500"
                  placeholder="วันที่"
                  value={signatures.seller.date}
                  onChange={(e) => setSignatures(prev => ({ ...prev, seller: { ...prev.seller, date: e.target.value } }))}
                />
              </p>
            </div>

            <div className="w-1/2 pl-4">
              <p className="mb-2">ลงชื่อ{' '}
                {signatures.buyer.signature ? (
                  <Image
                    src={signatures.buyer.signature}
                    alt="Buyer signature"
                    width={150}
                    height={60}
                    className="inline-block border-b border-gray-400 align-bottom"
                    onClick={() => openSignatureModal('buyer')}
                    style={{ cursor: 'pointer' }}
                  />
                ) : (
                  <span
                    className="border-b border-gray-400 px-2 py-1 cursor-pointer hover:bg-gray-100 inline-block min-w-[150px]"
                    onClick={() => openSignatureModal('buyer')}
                  >
                    [คลิกเพื่อเซ็นชื่อ]
                  </span>
                )}
                {' '}ผู้ซื้อ
              </p>
              <p className="mb-2">( pawnly technologies co.,ltd )</p>
              <p>วันที่ : {' '}
                <input
                  type="text"
                  className="border-b border-gray-400 bg-transparent px-1 py-0.5 min-w-[120px] focus:outline-none focus:border-blue-500"
                  placeholder="วันที่"
                  value={signatures.buyer.date}
                  onChange={(e) => setSignatures(prev => ({ ...prev, buyer: { ...prev.buyer, date: e.target.value } }))}
                />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="max-w-4xl mx-auto px-4 mt-6 flex justify-center gap-4">
        <button
          onClick={handleBack}
          className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-colors"
        >
          ย้อนกลับ
        </button>
        <button
          onClick={handleSaveContract}
          disabled={!signatures.seller.signature || !signatures.buyer.signature || saving}
          className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกสัญญา'}
        </button>
      </div>

      {/* Signature Modal */}
      <SignatureModal
        isOpen={signatureModal.isOpen}
        onClose={closeSignatureModal}
        onSave={saveSignature}
        title={signatureModal.title}
        placeholder={signatureModal.placeholder}
      />
    </div>
  );
}
