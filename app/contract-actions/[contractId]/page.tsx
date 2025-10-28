'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Sarabun } from 'next/font/google';
import liff from '@line/liff';

const sarabun = Sarabun({
  subsets: ['thai'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-sarabun',
});
interface Contract {
  _id: string;
  contractNumber: string;
  status: string;
  item: {
    brand: string;
    model: string;
  };
  pawnDetails: {
    pawnedPrice: number;
    interestRate: number;
    periodDays: number;
  };
  dates: {
    startDate: string;
    dueDate: string;
  };
}

export default function ContractActionsPage({ params }: { params: { contractId: string } }) {
  const { contractId } = params;
  const router = useRouter();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lineUserId, setLineUserId] = useState<string>('');

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID_CONTRACTS || '';
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
      } catch (err) {
        console.error('LIFF initialization error:', err);
      }
    };

    const fetchContract = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/contracts/${contractId}`);
        if (response.data.success) {
          setContract(response.data.contract);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสัญญา');
      } finally {
        setLoading(false);
      }
    };

    if (contractId) {
      initializeLiff();
      fetchContract();
    }
  }, [contractId]);

  const handleAction = async (actionType: string) => {
    if (!lineUserId) {
      alert('กรุณาเข้าสู่ระบบผ่าน LINE');
      return;
    }

    switch (actionType) {
      case 'redeem':
        // NEW FLOW: Send request to shop system first
        await handleRedemptionRequest();
        break;
      case 'renew':
        // NEW FLOW: Send request to shop system first
        await handleExtensionRequest();
        break;
      case 'increase':
        // เพิ่มต้น - ยังใช้ flow เดิม
        router.push(`/contract-actions/${contractId}/increase`);
        break;
      case 'reduce':
        // ลดต้น - ยังใช้ flow เดิม (ไปหน้า payment แต่ให้ user ระบุจำนวน)
        router.push(`/contract-actions/${contractId}/payment?action=${actionType}&amount=0`);
        break;
    }
  };

  const handleRedemptionRequest = async () => {
    try {
      setSubmitting(true);

      const response = await axios.post('/api/customer/request-redemption', {
        contractId,
        lineUserId,
        message: 'ลูกค้าต้องการไถ่ถอนสัญญา'
      });

      if (response.data.success) {
        alert('✅ ส่งคำขอไถ่ถอนเรียบร้อยแล้ว\n\nพนักงานจะดำเนินการภายใน 24 ชั่วโมง คุณจะได้รับ QR Code สำหรับชำระเงินผ่าน LINE Chat');

        // Close LIFF window and return to LINE chat
        if (liff.isInClient()) {
          liff.closeWindow();
        } else {
          router.push('/contracts');
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtensionRequest = async () => {
    try {
      setSubmitting(true);

      const response = await axios.post('/api/customer/request-extension', {
        contractId,
        lineUserId,
        message: 'ลูกค้าต้องการต่อดอกเบี้ย'
      });

      if (response.data.success) {
        alert('✅ ส่งคำขอต่อดอกเบี้ยเรียบร้อยแล้ว\n\nพนักงานจะดำเนินการภายใน 24 ชั่วโมง คุณจะได้รับ QR Code สำหรับชำระเงินผ่าน LINE Chat');

        // Close LIFF window and return to LINE chat
        if (liff.isInClient()) {
          liff.closeWindow();
        } else {
          router.push('/contracts');
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateInterest = () => {
    if (!contract) return 0;
    const { pawnedPrice, interestRate, periodDays } = contract.pawnDetails;
    // คำนวณดอกเบี้ยแบบประมาณ (30 วัน = 1 เดือน)
    return Math.round((pawnedPrice * interestRate * periodDays) / (100 * 30));
  };

  const calculateTotalAmount = () => {
    if (!contract) return 0;
    return contract.pawnDetails.pawnedPrice + calculateInterest();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error || 'ไม่พบข้อมูลสัญญา'}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 w-full bg-gray-500 text-white py-2 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white p-4 ${sarabun.className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-800 text-xl"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-black font-sarabun">จัดการสัญญา</h1>
        <div></div> {/* Spacer */}
      </div>

      {/* Contract Info */}
      <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: '#F0EFEF' }}>
        <h2 className="font-bold text-lg mb-2 font-sarabun" style={{ color: '#2C2A28' }}>
          {contract.item.brand} {contract.item.model}
        </h2>
        <div className="space-y-1 text-sm font-sarabun" style={{ color: '#2C2A28' }}>
          <p>รหัสสัญญา: {contract.contractNumber}</p>
          <p>มูลค่า: {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท</p>
          <p>ดอกเบี้ย: {calculateInterest().toLocaleString()} บาท</p>
          <p>รวมทั้งสิ้น: {calculateTotalAmount().toLocaleString()} บาท</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 font-sarabun">
        {/* ไถ่ถอน */}
        <button
          onClick={() => handleAction('redeem')}
          disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold text-left px-4 border-2 transition-colors disabled:opacity-50"
          style={{
            backgroundColor: '#fff9c4',
            color: '#f9a825',
            borderColor: '#fff9c4'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold font-sarabun">ไถ่ถอนสินค้า</div>
              <div className="text-sm font-normal opacity-75 font-sarabun">
                จ่ายเงินต้นและดอกเบี้ยเพื่อรับสินค้าคืน
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold font-sarabun">{calculateTotalAmount().toLocaleString()}</div>
              <div className="text-sm font-sarabun">บาท</div>
            </div>
          </div>
        </button>

        {/* ต่อดอกเบี้ย */}
        <button
          onClick={() => handleAction('renew')}
          disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold text-left px-4 border-2 transition-colors disabled:opacity-50"
          style={{
            backgroundColor: '#259b24',
            color: '#E7EFE9',
            borderColor: '#259b24'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold font-sarabun">ต่อดอกเบี้ย</div>
              <div className="text-sm font-normal opacity-75 font-sarabun">
                จ่ายดอกเบี้ยเพื่อต่อสัญญา
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold font-sarabun">{calculateInterest().toLocaleString()}</div>
              <div className="text-sm font-sarabun">บาท</div>
            </div>
          </div>
        </button>

        {/* เพิ่มต้น */}
        <button
          onClick={() => handleAction('increase')}
          className="w-full py-4 rounded-2xl font-bold text-left px-4 border-2 transition-colors"
          style={{
            backgroundColor: '#5677fc',
            color: '#F0EFEF',
            borderColor: '#5677fc'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold font-sarabun">เพิ่มเงินต้น</div>
              <div className="text-sm font-normal opacity-75 font-sarabun">
                เพิ่มจำนวนเงินกู้
              </div>
            </div>
            <div className="text-2xl font-sarabun text-white">➕</div>
          </div>
        </button>

        {/* ลดต้น */}
        <button
          onClick={() => handleAction('reduce')}
          className="w-full py-4 rounded-2xl font-bold text-left px-4 border-2 transition-colors"
          style={{
            backgroundColor: '#DA676E',
            color: '#FFF3F3',
            borderColor: '#DA676E'
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold font-sarabun">ลดเงินต้น</div>
              <div className="text-sm font-normal opacity-75 font-sarabun">
                จ่ายเงินต้นบางส่วน
              </div>
            </div>
            <div className="text-2xl font-sarabun text-[#FFE4E1]">➖</div>
          </div>
        </button>
      </div>
    </div>
  );
}
