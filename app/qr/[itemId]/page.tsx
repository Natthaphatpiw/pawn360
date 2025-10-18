'use client';

import { useEffect, useState, use } from 'react';
import axios from 'axios';

interface PawnRequest {
  _id: string;
  lineId: string;
  brand: string;
  model: string;
  type: string;
  pawnedPrice: number;
  interestRate: number;
  periodDays: number;
  totalInterest: number;
  storeId: string;
  status: string;
  createdAt: string;
}

export default function QRCodePage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const [pawnRequest, setPawnRequest] = useState<PawnRequest | null>(null);
  const [editedPrice, setEditedPrice] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // ดึงข้อมูล pawn request
        const pawnResponse = await axios.get(`/api/pawn-requests/${itemId}`);
        if (pawnResponse.data.success) {
          setPawnRequest(pawnResponse.data.pawnRequest);
          setEditedPrice(pawnResponse.data.pawnRequest.pawnedPrice.toString());
        }
      } catch (err: any) {
        console.error('Error:', err);
        setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [itemId]);

  const handleSavePrice = async () => {
    if (!pawnRequest || !editedPrice) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await axios.put(`/api/pawn-requests/${itemId}`, {
        pawnedPrice: parseInt(editedPrice),
        totalInterest: calculateInterest(parseInt(editedPrice))
      });

      if (response.data.success) {
        setSuccess('บันทึกการแก้ไขราคาเรียบร้อยแล้ว');
        setPawnRequest(prev => prev ? {
          ...prev,
          pawnedPrice: parseInt(editedPrice),
          totalInterest: calculateInterest(parseInt(editedPrice))
        } : null);
      }
    } catch (err: any) {
      console.error('Error saving price:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateContract = async () => {
    if (!pawnRequest) return;

    setSaving(true);
    setError(null);

    try {
      const response = await axios.post('/api/contracts/create', {
        pawnRequestId: itemId
      });

      if (response.data.success) {
        setSuccess('สร้างสัญญาจำนำเรียบร้อยแล้ว');
        // Redirect or show success state
      }
    } catch (err: any) {
      console.error('Error creating contract:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้างสัญญา');
    } finally {
      setSaving(false);
    }
  };

  const calculateInterest = (price: number) => {
    if (!pawnRequest) return 0;
    const dailyRate = pawnRequest.interestRate / 100 / 30;
    return Math.round(price * dailyRate * pawnRequest.periodDays);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด QR Code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFBFA' }}>
      <div className="max-w-md mx-auto py-8 px-4">
        <div className="rounded-xl shadow-sm p-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E6E7E8' }}>

          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2" style={{ color: '#1E293B' }}>ตรวจสอบและแก้ไขราคา</h1>
            <p className="text-sm" style={{ color: '#6B7280' }}>สำหรับพนักงานร้านค้า</p>
          </div>

          {/* Item Info */}
          {pawnRequest && (
            <div className="mb-6">
              <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: '#EEECEB' }}>
                <p className="text-sm mb-1" style={{ color: '#6B7280' }}>สินค้า</p>
                <p className="text-base font-semibold" style={{ color: '#1E293B' }}>
                  {pawnRequest.brand} {pawnRequest.model}
                </p>
                <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
                  ประเภท: {pawnRequest.type}
                </p>
              </div>
            </div>
          )}

          {/* Price Edit Section */}
          {pawnRequest && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: '#6B7280' }}>
                ราคาจำนำ (บาท)
              </label>
              <input
                type="number"
                value={editedPrice}
                onChange={(e) => setEditedPrice(e.target.value)}
                className="w-full px-3 py-2 focus:outline-none"
                style={{
                  border: '1px solid #E6E7E8',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '10px',
                  color: '#1E293B',
                  height: '44px'
                }}
              />

              <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: '#F9F9F9', border: '1px solid #E6E7E8' }}>
                <div className="flex justify-between text-sm mb-1">
                  <span style={{ color: '#6B7280' }}>ราคาจำนำ:</span>
                  <span style={{ color: '#1E293B' }}>{parseInt(editedPrice).toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#6B7280' }}>ดอกเบี้ย ({pawnRequest.interestRate}% x {pawnRequest.periodDays} วัน):</span>
                  <span style={{ color: '#1E293B' }}>{calculateInterest(parseInt(editedPrice)).toLocaleString()} บาท</span>
                </div>
              </div>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#FEE', border: '1px solid #FCC', color: '#C33' }}>
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#EFE', border: '1px solid #CFC', color: '#363' }}>
              {success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSavePrice}
              disabled={saving}
              className="w-full py-3 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: saving ? '#D1D5DB' : '#1F6F3B',
                color: saving ? '#9CA3AF' : '#FFFFFF'
              }}
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขราคา'}
            </button>

            <button
              onClick={handleCreateContract}
              disabled={saving}
              className="w-full py-3 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: saving ? '#D1D5DB' : '#1F6F3B',
                color: saving ? '#9CA3AF' : '#FFFFFF'
              }}
            >
              {saving ? 'กำลังสร้างสัญญา...' : 'ยืนยันและสร้างสัญญา'}
            </button>
          </div>

          {/* Item ID */}
          <p className="text-xs text-center mt-4" style={{ color: '#9CA3AF' }}>
            Item ID: {itemId.substring(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
}
