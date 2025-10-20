'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

interface Contract {
  _id: string;
  contractNumber: string;
  status: string;
  item: {
    brand: string;
    model: string;
    type?: string;
    images?: string[];
  };
  pawnDetails: {
    pawnedPrice: number;
    interestRate?: number;
    periodDays?: number;
    remainingAmount?: number;
  };
  dates: {
    startDate: string;
    dueDate: string;
  };
}

export default function ContractsPage() {
  const { profile, isLoading, error: liffError } = useLiff();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Auto-fetch contracts when profile is loaded
  useEffect(() => {
    if (profile?.userId && !hasSearched) {
      handleSearch();
    }
  }, [profile]);

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      if (!profile?.userId) {
        throw new Error('LINE profile not found');
      }

      // เช็คจาก lineId เท่านั้น
      const response = await axios.get(`/api/contracts/by-line-id?lineId=${profile.userId}`);

      if (response.data.success) {
        setContracts(response.data.contracts);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการค้นหาสัญญา');
    } finally {
      setIsSearching(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold text-lg mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-red-600">{liffError}</p>
        </div>
      </div>
    );
  }


  // Function to get status style and text
  const getStatusInfo = (status: string, dueDate: string) => {
    const currentDate = new Date();
    const due = new Date(dueDate);
    const daysLeft = Math.ceil((due.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

    if (status === 'overdue' || daysLeft < 0) {
      return { text: 'ครบกำหนด', bg: '#FFEBEE', textColor: '#C62828' };
    } else if (daysLeft <= 7) {
      return { text: 'ใกล้ครบกำหนด', bg: '#FFF3E0', textColor: '#EF6C00' };
    } else {
      return { text: 'ปกติ', bg: '#E8F5E9', textColor: '#1B5E20' };
    }
  };

  // Function to calculate days left
  const getDaysLeft = (dueDate: string) => {
    const currentDate = new Date();
    const due = new Date(dueDate);
    const daysLeft = Math.ceil((due.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft;
  };

  return (
    <div className="min-h-screen bg-white p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold text-black">รายการสัญญาจำนำ</h1>
          <p className="text-sm" style={{ color: '#4A4644' }}>
            {profile?.displayName || 'ผู้ใช้'}
          </p>
        </div>
        <span className="text-sm" style={{ color: '#9E9E9E' }}>
          ทั้งหมด {contracts.length} รายการ
        </span>
      </div>

      {/* Loading State */}
      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">กำลังโหลด...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Contracts List */}
      {!isSearching && (
        <div className="space-y-3">
          {contracts.length === 0 ? (
            <div className="text-center py-8">
              <p style={{ color: '#4A4644' }}>ไม่พบรายการจำนำ</p>
            </div>
          ) : (
            contracts.map((contract) => {
              const statusInfo = getStatusInfo(contract.status, contract.dates.dueDate);
              const daysLeft = getDaysLeft(contract.dates.dueDate);
              return (
                <div
                  key={contract._id}
                  className="rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                  style={{ backgroundColor: '#F0EFEF' }}
                  onClick={() => window.location.href = `/contract-actions/${contract._id}`}
                >
                  <div className="bg-white rounded-lg p-4">
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <h2 className="font-bold text-black text-lg">
                          {contract.item.brand} {contract.item.model}
                        </h2>
                        <p className="text-sm mt-1" style={{ color: '#4A4644' }}>
                          มูลค่า: {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท
                        </p>
                        <p className="text-sm mt-1" style={{ color: '#4A4644' }}>
                          วันครบกำหนด: {formatDate(contract.dates.dueDate)}
                        </p>
                        <p className="text-sm mt-1" style={{ color: '#4A4644' }}>
                          เหลือเวลา: {daysLeft > 0 ? `${daysLeft} วัน` : 'หมดอายุแล้ว'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm" style={{ color: '#4A4644' }}>รหัสสัญญา</p>
                        <p className="text-sm font-medium text-black">{contract.contractNumber}</p>
                        <span
                          className="inline-block mt-2 px-3 py-1 text-sm rounded-full font-medium"
                          style={{
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.textColor
                          }}
                        >
                          {statusInfo.text}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer Button */}
      <div className="mt-6">
        <button
          className="w-full py-4 rounded-xl font-bold text-center"
          style={{ backgroundColor: '#E8F5E9', color: '#1B5E20' }}
        >
          จำนำสินค้า
          <div className="text-sm font-normal">Pawn entry</div>
        </button>
      </div>
    </div>
  );
}
