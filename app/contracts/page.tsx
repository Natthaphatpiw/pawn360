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
    type: string;
    images: string[];
  };
  pawnDetails: {
    pawnedPrice: number;
    interestRate: number;
    periodDays: number;
    remainingAmount: number;
  };
  dates: {
    startDate: string;
    dueDate: string;
  };
}

export default function ContractsPage() {
  const { profile, isLoading, error: liffError } = useLiff();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'redeemed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'ใช้งานอยู่';
      case 'overdue':
        return 'เกินกำหนด';
      case 'redeemed':
        return 'ไถ่ถอนแล้ว';
      case 'lost':
        return 'ตกเป็นของร้าน';
      default:
        return status;
    }
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

  if (selectedContract) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setSelectedContract(null)}
            className="mb-4 text-blue-600 hover:text-blue-800 flex items-center"
          >
            ← กลับ
          </button>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">สัญญาเลขที่</h1>
                <p className="text-gray-600">{selectedContract.contractNumber}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
                  selectedContract.status
                )}`}
              >
                {getStatusText(selectedContract.status)}
              </span>
            </div>

            {/* Item Info */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">ข้อมูลสินค้า</h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-800 font-medium">
                  {selectedContract.item.brand} {selectedContract.item.model}
                </p>
                <p className="text-gray-600 text-sm">{selectedContract.item.type}</p>
              </div>
            </div>

            {/* Financial Details */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">ข้อมูลการเงิน</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">จำนวนเงินจำนำ:</span>
                  <span className="font-semibold">
                    {selectedContract.pawnDetails.pawnedPrice.toLocaleString()} บาท
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">อัตราดอกเบี้ย:</span>
                  <span className="font-semibold">{selectedContract.pawnDetails.interestRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">ระยะเวลา:</span>
                  <span className="font-semibold">{selectedContract.pawnDetails.periodDays} วัน</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-600">ยอดที่ต้องชำระ:</span>
                  <span className="font-bold text-lg text-blue-600">
                    {selectedContract.pawnDetails.remainingAmount.toLocaleString()} บาท
                  </span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">วันที่</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">วันที่เริ่มสัญญา:</span>
                  <span>{formatDate(selectedContract.dates.startDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">วันครบกำหนด:</span>
                  <span className="font-semibold text-red-600">
                    {formatDate(selectedContract.dates.dueDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {selectedContract.status === 'active' && (
              <div className="space-y-3">
                <button className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700">
                  ต่อดอกเบี้ย
                </button>
                <button className="w-full bg-green-600 text-white py-3 rounded-md font-semibold hover:bg-green-700">
                  ไถ่ถอนสินค้า
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">สถานะสัญญาจำนำ</h1>

        {isSearching && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">กำลังโหลดสัญญา...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Contracts List */}
        {hasSearched && !isSearching && (
          <>
            {contracts.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <p className="text-gray-600">ไม่พบสัญญาที่ใช้งานอยู่</p>
              </div>
            ) : (
              <div className="space-y-4">
                {contracts.map((contract) => (
                  <div
                    key={contract._id}
                    onClick={() => setSelectedContract(contract)}
                    className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {contract.item.brand} {contract.item.model}
                        </h3>
                        <p className="text-sm text-gray-600">สัญญา #{contract.contractNumber}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          contract.status
                        )}`}
                      >
                        {getStatusText(contract.status)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">จำนวนเงิน:</span>
                      <span className="font-semibold">
                        {contract.pawnDetails.pawnedPrice.toLocaleString()} บาท
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-600">ครบกำหนด:</span>
                      <span className="text-red-600">{formatDate(contract.dates.dueDate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
