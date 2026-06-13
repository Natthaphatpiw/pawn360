'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiff } from '@/lib/liff/liff-provider';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ChevronDown } from 'lucide-react';

interface InvestorData {
  investor_id: string;
  line_id: string;
  firstname: string;
  lastname: string;
  phone_number: string;
  national_id: string;
  email: string;
  addr_house_no: string;
  addr_village: string;
  addr_street: string;
  addr_sub_district: string;
  addr_district: string;
  addr_province: string;
  addr_country: string;
  addr_postcode: string;
  bank_name: string;
  bank_account_no: string;
  bank_account_type: string;
  bank_account_name: string;
  investor_signature_id?: string | null;
}

interface FormData {
  firstname: string;
  lastname: string;
  phoneNumber: string;
  nationalId: string;
  email: string;
  address: {
    houseNo: string;
    village: string;
    street: string;
    subDistrict: string;
    district: string;
    province: string;
    country: string;
    postcode: string;
  };
  bankInfo: {
    bankName: string;
    accountNo: string;
    accountType: string;
    accountName: string;
  };
}

const BANK_OPTIONS = [
  'พร้อมเพย์',
  'กสิกรไทย',
  'ไทยพาณิชย์',
  'กรุงเทพ',
  'กรุงไทย',
  'ธนชาต',
  'กรุงศรีอยุธยา',
  'ทหารไทยธนชาต',
];

const ACCOUNT_TYPE_OPTIONS = [
  'บัญชีออมทรัพย์',
  'บัญชีเงินฝากประจำ',
  'บัญชีกระแสรายวัน',
  'บัญชีเงินตราต่างประเทศ',
];

export default function InvestorEditProfile() {
  const { profile, isLoading: liffLoading, error: liffError } = useLiff();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingSignatureRef = useRef(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [signatureDraft, setSignatureDraft] = useState('');
  const [modalSignatureDraft, setModalSignatureDraft] = useState('');
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    firstname: '',
    lastname: '',
    phoneNumber: '',
    nationalId: '',
    email: '',
    address: {
      houseNo: '',
      village: '',
      street: '',
      subDistrict: '',
      district: '',
      province: '',
      country: 'Thailand',
      postcode: ''
    },
    bankInfo: {
      bankName: '',
      accountNo: '',
      accountType: '',
      accountName: ''
    }
  });

  useEffect(() => {
    if (liffLoading) return;

    if (liffError || !profile?.userId) {
      setError('ไม่สามารถเชื่อมต่อ LINE LIFF ได้ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
      return;
    }

    const fetchInvestorData = async () => {
      try {
        const response = await axios.get(`/api/investors/by-line-id/${profile.userId}`);
        if (response.data.success) {
          const data: InvestorData = response.data.investor;
          setFormData({
            firstname: data.firstname || '',
            lastname: data.lastname || '',
            phoneNumber: data.phone_number || '',
            nationalId: data.national_id || '',
            email: data.email || '',
            address: {
              houseNo: data.addr_house_no || '',
              village: data.addr_village || '',
              street: data.addr_street || '',
              subDistrict: data.addr_sub_district || '',
              district: data.addr_district || '',
              province: data.addr_province || '',
              country: data.addr_country || 'Thailand',
              postcode: data.addr_postcode || ''
            },
            bankInfo: {
              bankName: data.bank_name || '',
              accountNo: data.bank_account_no || '',
              accountType: data.bank_account_type || '',
              accountName: data.bank_account_name || ''
            }
          });
          const existingSignatureUrl = data.investor_signature_id || '';
          setSignatureUrl(existingSignatureUrl);
        }
      } catch (error: any) {
        console.error('Error fetching investor data:', error);
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestorData();
  }, [liffLoading, liffError, profile?.userId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('addr_')) {
      const addressField = name.replace('addr_', '');
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else if (name.startsWith('bank_')) {
      const bankField = name.replace('bank_', '');
      setFormData(prev => ({
        ...prev,
        bankInfo: {
          ...prev.bankInfo,
          [bankField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const setupSignatureCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111827';
  };

  useEffect(() => {
    if (!signatureModalOpen) return;

    const frame = requestAnimationFrame(setupSignatureCanvas);
    window.addEventListener('resize', setupSignatureCanvas);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', setupSignatureCanvas);
    };
  }, [signatureModalOpen]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleSignatureStart = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    isDrawingSignatureRef.current = true;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const handleSignatureMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignatureRef.current) return;

    const ctx = signatureCanvasRef.current?.getContext('2d');
    if (!ctx) return;

    event.preventDefault();
    const point = getCanvasPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const handleSignatureEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !isDrawingSignatureRef.current) return;

    event.preventDefault();
    isDrawingSignatureRef.current = false;
    setModalSignatureDraft(canvas.toDataURL('image/png'));
  };

  const handleClearSignature = () => {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setModalSignatureDraft('');
  };

  const handleOpenSignatureModal = () => {
    setModalSignatureDraft('');
    setSignatureModalOpen(true);
  };

  const handleCancelSignature = () => {
    setSignatureModalOpen(false);
    setModalSignatureDraft('');
  };

  const handleSaveSignatureDraft = () => {
    if (!modalSignatureDraft) return;

    setSignatureDraft(modalSignatureDraft);
    setSignatureModalOpen(false);
    setModalSignatureDraft('');
  };

  const handleSubmit = async () => {
    if (!profile?.userId) {
      setError('กรุณาเข้าสู่ระบบ LINE');
      return;
    }

    // Validation
    if (!formData.firstname || !formData.lastname || !formData.phoneNumber) {
      setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, นามสกุล, เบอร์โทร)');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      let nextSignatureUrl = signatureUrl;

      if (signatureDraft) {
        const signatureBlob = await fetch(signatureDraft).then((response) => response.blob());
        const uploadFormData = new FormData();
        uploadFormData.append('file', signatureBlob, 'investor-signature.png');
        uploadFormData.append('folder', 'signatures');

        const uploadResponse = await axios.post('/api/upload', uploadFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (!uploadResponse.data.url) {
          throw new Error('ไม่สามารถอัปโหลดลายเซ็นได้');
        }

        nextSignatureUrl = uploadResponse.data.url;
      }

      const response = await axios.put('/api/investors/update', {
        lineId: profile.userId,
        ...formData,
        signatureUrl: nextSignatureUrl || undefined,
      });

      if (response.data.success) {
        setSignatureUrl(nextSignatureUrl);
        setSignatureDraft('');
        setSuccess(true);
        setTimeout(() => {
          router.push('/register-invest');
        }, 1500);
      }
    } catch (error: any) {
      console.error('Update error:', error);
      setError(error.response?.data?.error || 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล');
    } finally {
      setSubmitting(false);
    }
  };

  if (liffLoading || loading) {
    return (
      <div className="page-investor min-h-screen bg-background-white flex items-center justify-center">
        <div className="dot-bricks"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-white font-sans text-foreground">
      <div className="px-4 pt-6 flex justify-center">
        <div className="w-full max-w-md pb-10">
          {success && (
            <div className="register-status-success mb-4 rounded-lg p-4 text-sm">
              บันทึกข้อมูลเรียบร้อยแล้ว กำลังกลับไปหน้าโปรไฟล์...
            </div>
          )}

          <div className="register-shell rounded-xl p-4">
            <div className="register-inner-card mb-5 rounded-lg px-4 py-4">
              <div className="register-pill inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
                Investor Profile
              </div>
              <div className="register-title mt-3 text-3xl font-semibold tracking-[0.08em]">
                แก้ไขข้อมูล
              </div>
              <p className="register-subtle mt-1 text-xs">อัปเดตข้อมูลส่วนตัวและบัญชีธนาคารให้เป็นปัจจุบัน</p>
            </div>

            <div className="mb-2">
              <h2 className="register-heading text-lg font-bold">Personal Information</h2>
              <p className="register-subtle text-xs">ข้อมูลส่วนตัว</p>
            </div>
            <div className="space-y-1">
            <EditField
              labelEn="First name"
              labelTh="ชื่อจริง"
              placeholder="ชื่อจริง"
              name="firstname"
              value={formData.firstname}
              onChange={handleInputChange}
              required
            />
            <EditField
              labelEn="Last name"
              labelTh="นามสกุล"
              placeholder="นามสกุล"
              name="lastname"
              value={formData.lastname}
              onChange={handleInputChange}
              required
            />
            <EditField
              labelEn="Phone number"
              labelTh="เบอร์โทรศัพท์"
              placeholder="000-000-0000"
              name="phoneNumber"
              type="tel"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              required
            />
            <EditField
              labelEn="ID"
              labelTh="เลขบัตรประชาชน 13 หลัก"
              placeholder="X-XXXX-XXXXX-XX-X"
              name="nationalId"
              value={formData.nationalId}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Email"
              labelTh="อีเมล"
              placeholder="example@email.com"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
            />
          </div>
          </div>
          
          <div className="register-shell mt-4 rounded-xl p-4">
            <div className="mb-4">
              <h2 className="register-heading text-lg font-bold">Address</h2>
              <p className="register-subtle text-xs">ที่อยู่</p>
            </div>
            <div className="space-y-1">
            <EditField
              labelEn="Address (เลขที่)"
              labelTh=""
              placeholder="บ้านเลขที่"
              name="addr_houseNo"
              value={formData.address.houseNo}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Village/Building (หมู่บ้าน/อาคาร)"
              labelTh=""
              placeholder="ชื่อหมู่บ้าน/อาคาร"
              name="addr_village"
              value={formData.address.village}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Street (ตรอก/ซอย/ถนน)"
              labelTh=""
              placeholder="ถนน/ตรอก/ซอย"
              name="addr_street"
              value={formData.address.street}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Sub-district (แขวง/ตำบล)"
              labelTh=""
              placeholder="แขวง/ตำบล"
              name="addr_subDistrict"
              value={formData.address.subDistrict}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="District (เขต/อำเภอ)"
              labelTh=""
              placeholder="เขต/อำเภอ"
              name="addr_district"
              value={formData.address.district}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Province (จังหวัด)"
              labelTh=""
              placeholder="จังหวัด"
              name="addr_province"
              value={formData.address.province}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Country (ประเทศ)"
              labelTh=""
              placeholder="ประเทศ"
              name="addr_country"
              value={formData.address.country}
              onChange={handleInputChange}
            />
            <EditField
              labelEn="Postcode (รหัสไปรษณีย์)"
              labelTh=""
              placeholder="XXXXX"
              name="addr_postcode"
              value={formData.address.postcode}
              onChange={handleInputChange}
            />
          </div>
          </div>
          
          <div className="register-shell mt-4 rounded-xl p-4">
            <div className="mb-4">
              <h2 className="register-heading text-lg font-bold">Bank Account</h2>
              <p className="register-subtle text-xs">ข้อมูลบัญชีธนาคาร</p>
            </div>
            <div className="space-y-1">
            <DropdownField
              labelEn="Bank Name"
              labelTh="ชื่อธนาคาร"
              name="bank_bankName"
              value={formData.bankInfo.bankName}
              placeholder="เลือกธนาคาร"
              options={BANK_OPTIONS}
              onChange={handleInputChange}
            />

            <EditField
              labelEn="Account No."
              labelTh="หมายเลขบัญชี"
              placeholder="0000000000"
              name="bank_accountNo"
              type="text"
              value={formData.bankInfo.accountNo}
              onChange={handleInputChange}
            />
            <DropdownField
              labelEn="Account Type"
              labelTh="ประเภทบัญชี"
              name="bank_accountType"
              value={formData.bankInfo.accountType}
              placeholder="เลือกประเภทบัญชี"
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={handleInputChange}
            />

            <EditField
              labelEn="Account Name"
              labelTh="ชื่อเจ้าของบัญชี"
              placeholder="ชื่อเจ้าของบัญชี"
              name="bank_accountName"
              value={formData.bankInfo.accountName}
              onChange={handleInputChange}
            />
          </div>
          </div>
          
          <div className="register-shell mt-4 rounded-xl p-4">
            <div className="mb-4">
              <h2 className="register-heading text-lg font-bold">Signature</h2>
              <p className="register-subtle text-xs">ลายเซ็นผู้ลงทุนสำหรับแสดงบนสัญญา</p>
            </div>

            <div className="space-y-3">
              <div className="register-inner-card flex h-32 items-center justify-center rounded-xl px-4 py-3">
                {signatureDraft || signatureUrl ? (
                  <img
                    src={signatureDraft || signatureUrl}
                    alt="Investor signature"
                    className="max-h-24 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <div className="register-heading text-sm font-semibold">ยังไม่มีลายเซ็น</div>
                    <p className="register-subtle mt-1 text-xs">เพิ่มลายเซ็นเพื่อใช้ในเอกสารสัญญา</p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenSignatureModal}
                className="register-secondary-btn flex w-full items-center justify-center rounded-full border border-s2 py-2 text-sm font-medium transition-colors"
              >
                {signatureDraft || signatureUrl ? 'แก้ไขลายเซ็น' : 'เพิ่มลายเซ็น'}
              </button>

              {signatureDraft && (
                <p className="register-subtle text-xs leading-relaxed">
                  ลายเซ็นใหม่พร้อมใช้งานแล้ว กดบันทึกเพื่ออัปเดตลงโปรไฟล์
                </p>
              )}
            </div>
          </div>
          
          {signatureModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="register-shell w-full max-w-md rounded-2xl p-4 shadow-strong">
                <div className="mb-4">
                  <h2 className="register-heading text-lg font-bold">Draw Signature</h2>
                  <p className="register-subtle text-xs">วาดลายเซ็นในกรอบด้านล่าง</p>
                </div>

                <div className="register-inner-card rounded-xl p-3">
                  <canvas
                    ref={signatureCanvasRef}
                    className="h-36 w-full touch-none rounded-lg bg-background-white"
                    onPointerDown={handleSignatureStart}
                    onPointerMove={handleSignatureMove}
                    onPointerUp={handleSignatureEnd}
                    onPointerCancel={handleSignatureEnd}
                    onPointerLeave={handleSignatureEnd}
                  />
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="register-secondary-btn flex min-h-10 flex-1 items-center justify-center rounded-full border border-s2 px-4 py-2 text-sm font-medium transition-colors"
                  >
                    ล้าง
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSignature}
                    className="register-secondary-btn flex min-h-10 flex-1 items-center justify-center rounded-full border border-s2 px-4 py-2 text-sm font-medium transition-colors"
                  >
                    ยกเลิก
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSignatureDraft}
                  disabled={!modalSignatureDraft}
                  className="register-primary-btn mt-3 flex w-full items-center justify-center rounded-full py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  บันทึกลายเซ็น
                </button>
              </div>
            </div>
          )}
          
          {error && (
            <div className="register-status-error my-4 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || success}
              className="register-primary-btn flex w-full flex-col items-center justify-center rounded-full py-2 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-base font-medium">
                {submitting ? 'กำลังบันทึก...' : success ? 'บันทึกเรียบร้อย' : 'บันทึก'}
              </span>
              {!submitting && !success && (
                <span className="text-xs font-light opacity-90">Save</span>
              )}
            </button>

            <button
              onClick={() => router.back()}
              disabled={submitting}
              className="register-secondary-btn flex w-full flex-col items-center justify-center rounded-full border border-s2 py-2 transition-colors disabled:opacity-50"
            >
              <span className="text-base font-medium">ยกเลิก</span>
              <span className="text-xs font-light opacity-80">Cancel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DropdownField({
  labelEn,
  labelTh,
  name,
  value,
  placeholder,
  options,
  onChange,
}: {
  labelEn: string;
  labelTh: string;
  name: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSelect = (nextValue: string) => {
    const syntheticEvent = {
      target: { name, value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
    setOpen(false);
  };

  return (
    <div className="mb-4" ref={containerRef}>
      <div className="mb-1">
        <div className="text-sm font-medium text-foreground md:text-base">{labelEn}</div>
        <div className="register-subtle text-xs font-light">{labelTh}</div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="register-select-trigger flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-base"
          aria-expanded={open}
        >
          <span className={value ? 'text-foreground' : 'register-select-placeholder'}>{value || placeholder}</span>
          <ChevronDown className={`h-4 w-4 text-foreground-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="register-select-menu absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl">
            <div className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors ${value === option ? 'register-select-option-active' : 'text-foreground-muted hover:bg-background-subtle'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Component for Edit Form Fields
const EditField = ({
  labelEn,
  labelTh,
  placeholder,
  value,
  onChange,
  name,
  type = "text",
  required = false
}: {
  labelEn: string;
  labelTh: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  type?: string;
  required?: boolean;
}) => {
  return (
    <div className="mb-4">
      <div className="mb-1">
        <div className="text-sm font-medium text-foreground md:text-base">
          {labelEn} {required && <span className="text-error">*</span>}
        </div>
        {labelTh && <div className="register-subtle text-xs font-light">{labelTh}</div>}
      </div>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="register-input w-full rounded-xl px-3 py-3"
      />
    </div>
  );
};
