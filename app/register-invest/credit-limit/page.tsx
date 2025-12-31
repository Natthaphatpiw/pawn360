'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

interface InvestorData {
  investor_id: string;
  max_investment_amount?: number | null;
}

export default function CreditLimitPage() {
  const router = useRouter();
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState<InvestorData | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (liffLoading) return;

    if (liffError) {
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    if (!profile?.userId) {
      setError('ไม่พบ LINE profile กรุณาเปิดลิงก์ผ่าน LINE LIFF');
      setLoading(false);
      return;
    }

    const fetchInvestor = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/investors/check?lineId=${profile.userId}`);
        if (response.data.exists) {
          setInvestor(response.data.investor);
          const currentLimit = response.data.investor?.max_investment_amount || 0;
          setLimitInput(currentLimit.toString());
        } else {
          setError('ไม่พบข้อมูลผู้ลงทุน');
        }
      } catch (fetchError: any) {
        console.error('Error fetching investor:', fetchError);
        setError('ไม่สามารถโหลดข้อมูลได้');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestor();
  }, [liffLoading, liffError, profile?.userId]);

  const handleSave = async () => {
    if (!profile?.userId) return;
    const parsed = Number(limitInput.replace(/,/g, ''));
    if (Number.isNaN(parsed) || parsed < 0) {
      setError('กรุณากรอกวงเงินให้ถูกต้อง');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await axios.put('/api/investors/credit-limit', {
        lineId: profile.userId,
        maxInvestmentAmount: parsed
      });
      if (response.data.success) {
        setInvestor(response.data.investor);
        alert('บันทึกสำเร็จ');
        router.push('/register-invest');
      }
    } catch (saveError: any) {
      console.error('Error saving credit limit:', saveError);
      setError(saveError.response?.data?.error || 'ไม่สามารถบันทึกได้');
    } finally {
      setSaving(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E3A8A]"></div>
      </div>
    );
  }

  if (error && !investor) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="bg-[#1E3A8A] text-white px-6 py-3 rounded-lg"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const currentLimit = investor?.max_investment_amount || 0;

  return (
    <div className="min-h-screen bg-white font-sans p-4 flex flex-col items-center">
      <div className="w-full max-w-sm bg-[#E9EFF6] rounded-2xl p-6 text-center mb-6 mt-2">
        <h2 className="text-[#1E3A8A] text-lg font-medium mb-2">วงเงินปัจจุบัน</h2>
        <div className="text-3xl font-bold text-[#1E3A8A]">
          {currentLimit.toLocaleString()}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-800 font-bold text-lg">วงเงินใหม่</span>
            <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
              New credit limit
            </span>
          </div>
          <span className="text-gray-500 text-sm">บาท</span>
        </div>

        <input
          type="text"
          value={limitInput}
          onChange={(e) => setLimitInput(e.target.value)}
          placeholder="100,000"
          className="w-full p-4 bg-white border border-gray-300 rounded-xl text-2xl text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
        />

        {error && (
          <div className="mt-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6 bg-[#0B3B82] hover:bg-[#08306A] text-white rounded-2xl py-4 flex flex-col items-center justify-center transition-colors shadow-sm active:scale-[0.98] disabled:opacity-50"
        >
          <span className="text-base font-bold">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</span>
          <span className="text-[10px] opacity-80 font-light">Save</span>
        </button>
      </div>
    </div>
  );
}
