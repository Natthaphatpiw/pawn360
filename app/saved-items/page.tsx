'use client';

import { useState, useEffect } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';

interface Item {
  _id: string;
  brand: string;
  model: string;
  type: string;
  condition: number;
  images: string[];
  status: string;
  estimatedValue?: number;
  createdAt: string;
}

export default function SavedItemsPage() {
  const { profile, isLoading, error: liffError } = useLiff();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.userId) {
      fetchSavedItems();
    }
  }, [profile?.userId]);

  const fetchSavedItems = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/items?lineId=${profile.userId}`);
      setItems(response.data.items || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดสินค้า');
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (itemId: string) => {
    window.location.href = `/item-actions/${itemId}`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'temporary':
        return 'บันทึกชั่วคราว';
      case 'pending':
        return 'รอดำเนินการ';
      case 'active':
        return 'จำนำอยู่';
      case 'redeemed':
        return 'ไถ่ถอนแล้ว';
      case 'lost':
        return 'สูญหาย';
      case 'sold':
        return 'ขายแล้ว';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'temporary':
        return 'bg-orange-100 text-orange-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'redeemed':
        return 'bg-blue-100 text-blue-800';
      case 'lost':
        return 'bg-red-100 text-red-800';
      case 'sold':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">เกิดข้อผิดพลาด: {liffError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4">
          <h1 className="text-xl font-bold text-center">สินค้าที่บันทึกไว้</h1>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">กำลังโหลดสินค้า...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchSavedItems}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                ลองใหม่
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-6xl mb-4">📦</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">ไม่มีสินค้าที่บันทึกไว้</h3>
              <p className="text-gray-600 mb-4">เริ่มประเมินราคาสินค้าแรกของคุณ</p>
              <button
                onClick={() => window.location.href = '/estimate'}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                ประเมินราคาสินค้า
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item._id}
                  onClick={() => handleItemClick(item._id)}
                  className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex space-x-3">
                    {/* Item Image */}
                    <div className="flex-shrink-0">
                      {item.images && item.images.length > 0 ? (
                        <Image
                          src={item.images[0]}
                          alt={item.brand + ' ' + item.model}
                          width={80}
                          height={80}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                          <span className="text-gray-400 text-xs">ไม่มีรูป</span>
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {item.brand} {item.model}
                        </h3>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                          {getStatusText(item.status)}
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 mb-1">{item.type}</p>
                      <p className="text-xs text-gray-600 mb-2">สภาพ: {item.condition}%</p>

                      {item.estimatedValue && (
                        <p className="text-sm font-semibold text-green-600">
                          ราคาประเมิน: ฿{item.estimatedValue.toLocaleString()}
                        </p>
                      )}

                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(item.createdAt).toLocaleDateString('th-TH')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 max-w-md mx-auto">
          <button
            onClick={() => window.location.href = '/estimate'}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            ประเมินสินค้าใหม่
          </button>
        </div>

        {/* Add padding to prevent content from being hidden behind bottom nav */}
        <div className="h-20"></div>
      </div>
    </div>
  );
}
