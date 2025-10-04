'use client';

import { useState } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';

export default function NewPawnPage() {
  const { profile, isLoading, error: liffError } = useLiff();
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    type: 'Electronics',
    serialNo: '',
    condition: 90,
    defects: '',
    note: '',
    accessories: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'range' ? parseInt(e.target.value) : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value,
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // Convert FileList to Array and create data URLs
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImages((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!profile?.userId) {
        throw new Error('LINE profile not found');
      }

      // ตรวจสอบว่า lineId นี้ลงทะเบียนแล้วหรือยัง
      const checkResponse = await axios.get(`/api/users/check?lineId=${profile.userId}`);
      if (!checkResponse.data.exists) {
        // เด้งไปหน้าลงทะเบียน
        const liffIdRegister = process.env.NEXT_PUBLIC_LIFF_ID_REGISTER || '2008216710-BEZ5XNyd';
        window.location.href = `https://liff.line.me/${liffIdRegister}/register`;
        return;
      }

      const response = await axios.post('/api/pawn-requests', {
        lineId: profile.userId,
        brand: formData.brand,
        model: formData.model,
        type: formData.type,
        serialNo: formData.serialNo,
        condition: formData.condition,
        defects: formData.defects,
        note: formData.note,
        accessories: formData.accessories,
        images: images,
      });

      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          if (window.liff) {
            window.liff.closeWindow();
          }
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้างรายการจำนำ');
    } finally {
      setIsSubmitting(false);
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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-md text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h2 className="text-green-800 font-semibold text-lg mb-2">สร้างรายการสำเร็จ!</h2>
          <p className="text-green-600">QR Code ถูกส่งไปที่แชทของคุณแล้ว</p>
          <p className="text-gray-600 text-sm mt-2">กำลังปิดหน้าต่าง...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">สร้างรายการจำนำใหม่</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Item Information */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">ข้อมูลสินค้า</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ยี่ห้อ</label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="Apple, Samsung, ฯลฯ"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">รุ่น</label>
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="iPhone 15, Galaxy S24, ฯลฯ"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ประเภทสินค้า</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="Electronics">อิเล็กทรอนิกส์</option>
                    <option value="Smartphone">สมาร์ทโฟน</option>
                    <option value="Laptop">โน้ตบุ๊ค</option>
                    <option value="Tablet">แท็บเล็ต</option>
                    <option value="Watch">นาฬิกา</option>
                    <option value="Jewelry">เครื่องประดับ</option>
                    <option value="Gold">ทองคำ</option>
                    <option value="Other">อื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">หมายเลขซีเรียล (ถ้ามี)</label>
                  <input
                    type="text"
                    name="serialNo"
                    value={formData.serialNo}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  สภาพสินค้า: {formData.condition}%
                </label>
                <input
                  type="range"
                  name="condition"
                  min="0"
                  max="100"
                  step="5"
                  value={formData.condition}
                  onChange={handleChange}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>เสีย</span>
                  <span>ใช้งานได้</span>
                  <span>ดี</span>
                  <span>เยี่ยม</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ตำหนิ/ข้อบกพร่อง (ถ้ามี)</label>
                <textarea
                  name="defects"
                  value={formData.defects}
                  onChange={handleChange}
                  rows={3}
                  placeholder="รอยขีดข่วน, หน้าจอแตก, ฯลฯ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">อุปกรณ์เสริม</label>
                <input
                  type="text"
                  name="accessories"
                  value={formData.accessories}
                  onChange={handleChange}
                  placeholder="กล่อง, สายชาร์จ, หูฟัง, ฯลฯ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">หมายเหตุเพิ่มเติม</label>
                <textarea
                  name="note"
                  value={formData.note}
                  onChange={handleChange}
                  rows={3}
                  placeholder="ข้อมูลเพิ่มเติมที่ต้องการแจ้ง"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">รูปภาพสินค้า</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {images.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                    {images.map((img, index) => (
                      <div key={index} className="relative">
                        <img
                          src={img}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-32 object-cover rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'กำลังสร้างรายการ...' : 'สร้างรายการจำนำ'}
          </button>
        </form>
      </div>
    </div>
  );
}
