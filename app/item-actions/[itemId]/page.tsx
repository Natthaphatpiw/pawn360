'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import Image from 'next/image';
import { getMockItemActionData, isInvestorPreviewMode } from '@/lib/mock-investment';

interface Item {
  _id: string;
  brand: string;
  model: string;
  type: string;
  serialNo?: string;
  condition: number;
  defects?: string;
  note?: string;
  accessories?: string;
  images: string[];
  status: string;
  estimatedValue?: number;
  desiredAmount?: number;
  loanDays?: number;
  interestRate?: number;
}

interface Store {
  _id: string;
  storeName: string;
  interestRate?: number;
}

interface Customer {
  _id: string;
  lineId: string;
  fullName: string;
  phone: string;
  contractsID: string[];
  storeId: string[];
  pawnRequests: any[];
}

export default function ItemActionsPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.itemId as string;
  const { profile, isLoading, error: liffError } = useLiff();

  const [item, setItem] = useState<Item | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [pawnDuration, setPawnDuration] = useState<string>('30');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.userId && itemId) {
      fetchItemDetails();
      fetchStores();
      checkCustomerExists();
    }
  }, [profile?.userId, itemId]);

  const fetchItemDetails = async () => {
    try {
      if (isInvestorPreviewMode()) {
        setItem(getMockItemActionData().item);
        return;
      }
      const response = await axios.get(`/api/items/${itemId}`);
      setItem(response.data.item);
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสินค้า');
    }
  };

  const fetchStores = async () => {
    try {
      if (isInvestorPreviewMode()) {
        setStores(getMockItemActionData().stores);
        return;
      }
      const response = await axios.get('/api/stores');
      setStores(response.data.stores);
    } catch (err: any) {
      console.error('Error fetching stores:', err);
    }
  };

  const checkCustomerExists = async () => {
    try {
      if (isInvestorPreviewMode()) {
        setCustomer(getMockItemActionData().customer);
        return;
      }
      const response = await axios.get(`/api/users/check?lineId=${profile.userId}`);
      if (response.data.exists) {
        setCustomer(response.data.customer);
      }
    } catch (err: any) {
      console.error('Error checking customer:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStoreSelect = (storeId: string) => {
    setSelectedStore(storeId);
  };

  const calculateInterest = () => {
    if (!item?.estimatedValue) return 0;
    const store = stores.find(s => s._id === selectedStore);
    const interestRate = store?.interestRate || 10;
    const days = parseInt(pawnDuration);
    const monthlyRate = interestRate / 100 / 30;
    return Math.round(item.estimatedValue * monthlyRate * days);
  };

  const handleContinue = () => {
    if (!selectedStore) {
      setError('กรุณาเลือกจุดรับฝาก');
      return;
    }

    if (!customer) {
      setError('กรุณาลงทะเบียนก่อนดำเนินการต่อ');
      return;
    }

    // Navigate to pawn setup with item data
    window.location.href = `/estimate?itemId=${itemId}&storeId=${selectedStore}&duration=${pawnDuration}`;
  };

  const handleRegister = () => {
    window.location.href = '/register';
  };

  const handleSaveTemporary = async () => {
    setIsSubmitting(true);
    // Item is already saved, just show success message
    setSuccess('สินค้านี้บันทึกไว้แล้ว');
    setTimeout(() => {
      setSuccess(null);
      setIsSubmitting(false);
    }, 2000);
  };

  if (isLoading || loading) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks" />
      </div>
    );
  }

  if (liffError || error) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <p className="text-error">{liffError || error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6">
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-s2-border bg-s2-soft px-6 py-8 text-center shadow-soft">
            <p className="text-error">ไม่พบข้อมูลสินค้า</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-liff theme-investor min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-5 rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
          <div className="rounded-lg border border-background-white bg-background-white p-4 shadow-soft">
            <div className="inline-flex rounded-full border border-s2-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-s2/70">
              Item Action
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[0.08em] text-s2">
              เลือกการดำเนินการ
            </div>
            <p className="mt-2 text-xs text-foreground-subtle">ตั้งค่าจุดรับฝาก ระยะเวลา และรายละเอียดก่อนดำเนินการต่อ</p>
          </div>
        </div>

        <div className="space-y-4">
          {item.images && item.images.length > 0 && (
            <div className="rounded-xl border border-s2-border bg-background-white p-4 shadow-soft">
              <Image
                src={item.images[0]}
                alt={item.brand + ' ' + item.model}
                width={320}
                height={320}
                className="w-full rounded-xl object-cover"
              />
            </div>
          )}

          <div className="rounded-xl border border-s2-border bg-background-white p-4 shadow-soft">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">Item Detail</h3>
            <div className="mb-3 text-xl font-semibold text-foreground">{item.brand} {item.model}</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-foreground-subtle">ประเภท</span><span className="text-right text-foreground-muted">{item.type}</span></div>
              {item.serialNo && <div className="flex justify-between gap-3"><span className="text-foreground-subtle">ซีเรียล</span><span className="text-right text-foreground-muted">{item.serialNo}</span></div>}
              <div className="flex justify-between gap-3"><span className="text-foreground-subtle">สภาพ</span><span className="text-right text-foreground-muted">{item.condition}%</span></div>
              {item.accessories && <div className="flex justify-between gap-3"><span className="text-foreground-subtle">อุปกรณ์เสริม</span><span className="text-right text-foreground-muted">{item.accessories}</span></div>}
              {item.defects && <div className="flex justify-between gap-3"><span className="text-foreground-subtle">ตำหนิ</span><span className="text-right text-foreground-muted">{item.defects}</span></div>}
              {item.note && <div className="flex justify-between gap-3"><span className="text-foreground-subtle">หมายเหตุ</span><span className="text-right text-foreground-muted">{item.note}</span></div>}
            </div>
          </div>

          {item.estimatedValue && (
            <div className="rounded-xl border border-s2-border bg-s2-soft/50 p-5 text-center shadow-soft">
              <p className="text-sm text-foreground-subtle mb-2">ราคาประเมิน</p>
              <p className="text-3xl font-semibold text-s2">฿{item.estimatedValue.toLocaleString()}</p>
            </div>
          )}

          <div className="rounded-xl border border-s2-border bg-background-white p-4 shadow-soft">
            <label className="mb-2 block text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">
              จุดรับฝาก
            </label>
            <select
              value={selectedStore}
              onChange={(e) => handleStoreSelect(e.target.value)}
              className="w-full rounded-xl border border-s2-border bg-background-white px-4 py-3 text-foreground outline-none focus:border-s2"
            >
              <option value="">เลือกจุดรับฝาก</option>
              {stores.map(store => (
                <option key={store._id} value={store._id}>
                  {store.storeName}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-s2-border bg-background-white p-4 shadow-soft">
            <label className="mb-2 block text-sm font-semibold uppercase tracking-[0.18em] text-s2/70">
              ระยะเวลาที่ต้องการขอสินเชื่อ
            </label>
            <select
              value={pawnDuration}
              onChange={(e) => setPawnDuration(e.target.value)}
              className="w-full rounded-xl border border-s2-border bg-background-white px-4 py-3 text-foreground outline-none focus:border-s2"
            >
              <option value="7">7 วัน</option>
              <option value="14">14 วัน</option>
              <option value="30">30 วัน</option>
              <option value="60">60 วัน</option>
              <option value="90">90 วัน</option>
            </select>
          </div>

          {selectedStore && item.estimatedValue && (
            <div className="rounded-xl border border-s2-border bg-s2-soft/55 p-4 shadow-soft">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-foreground-subtle">ราคาประเมิน</span>
                <span className="font-semibold text-foreground">฿{item.estimatedValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-foreground-subtle">ดอกเบี้ย</span>
                <span className="font-semibold text-foreground">฿{calculateInterest().toLocaleString()}</span>
              </div>
              <hr className="my-3 border-s2-border" />
              <div className="flex justify-between">
                <span className="text-sm font-semibold text-s2">รวม</span>
                <span className="font-bold text-s2">
                  ฿{(item.estimatedValue + calculateInterest()).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-success-border bg-success-soft p-3 text-success shadow-soft">
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-error-border bg-error-soft p-3 text-error shadow-soft">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleContinue}
              disabled={!selectedStore || !customer}
              className="btn-transition btn-sheen w-full rounded-full bg-[image:var(--background-image-grad-investor)] py-3 text-s2-fg shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              ดำเนินการต่อ
            </button>

            <button
              onClick={handleRegister}
              className="btn-transition w-full rounded-full border border-s2 bg-background-white py-3 text-s2"
            >
              ลงทะเบียน
            </button>

            <button
              onClick={handleSaveTemporary}
              disabled={isSubmitting}
              className="btn-transition w-full rounded-full border border-s2-border bg-s2-soft py-3 text-s2 disabled:opacity-50"
            >
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกชั่วคราว'}
            </button>

            <button
              onClick={() => router.push('/estimate')}
              className="btn-transition w-full rounded-full border border-line-soft bg-background-white py-3 text-foreground-muted"
            >
              ประเมินสินค้าอื่นๆ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
