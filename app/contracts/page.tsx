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
    dueDate?: string;
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
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'active':
        return { text: 'หน่วย', bg: 'bg-green-500', textColor: 'text-white' };
      case 'overdue':
        return { text: 'รับจำนำ', bg: 'bg-red-500', textColor: 'text-white' };
      case 'suspended':
        return { text: 'หลุดจำนำ', bg: 'bg-orange-500', textColor: 'text-white' };
      case 'sold':
        return { text: 'ขายถอดตลาด', bg: 'bg-red-600', textColor: 'text-white' };
      case 'redeemed':
        return { text: 'ไถ่ถอนไปแล้ว', bg: 'bg-green-100', textColor: 'text-green-800' };
      default:
        return { text: status, bg: 'bg-gray-500', textColor: 'text-white' };
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gray-200 p-3 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">รายการจำนำ</h1>
        <span className="text-sm text-gray-600">หน่วย {contracts.length} สินค้า</span>
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
        <div className="p-4 space-y-3">
          {contracts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">ไม่พบรายการจำนำ</p>
            </div>
          ) : (
            contracts.map((contract) => {
              const statusInfo = getStatusInfo(contract.status);
              return (
                <div
                  key={contract._id}
                  className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex flex-col space-y-2">
                    <span className="text-md font-bold text-gray-800">
                      {contract.item.brand} {contract.item.model}
                    </span>
                    <span className="text-sm text-gray-600">
                      ราคา: {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท
                    </span>
                    <span className="text-sm text-gray-600">
                      วันที่จำนำ: {formatDate(contract.dates.startDate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <button
                      className={`rounded-full px-4 py-1 ${statusInfo.bg} ${statusInfo.textColor} text-sm font-medium`}
                    >
                      {statusInfo.text}
                    </button>
                    <span className="text-sm text-gray-600">
                      รหัสสินค้า {contract.contractNumber}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer Button */}
      <div className="p-4">
        <button className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-bold text-md">
          Pawn entry
        </button>
      </div>
    </div>
  );
}
