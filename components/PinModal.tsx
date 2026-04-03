'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import axios from 'axios';
import type { PinRole } from '@/lib/security/pin';
import { setPinSession } from '@/lib/security/pin-session';

type PinModalProps = {
  open: boolean;
  role: PinRole;
  lineId: string;
  onClose: () => void;
  onVerified: (token: string, expiresAt: string) => void;
};

type PinMode = 'verify' | 'setup' | 'reset';

const roleThemes: Record<PinRole, { primary: string; soft: string; border: string }> = {
  PAWNER: { primary: '#C0562F', soft: '#FFF3EC', border: '#E9B9A7' },
  INVESTOR: { primary: '#1E3A8A', soft: '#EEF2FF', border: '#BFCCF8' },
  DROP_POINT: { primary: '#365314', soft: '#ECFCCB', border: '#B9D38B' },
};

export default function PinModal({
  open,
  role,
  lineId,
  onClose,
  onVerified,
}: PinModalProps) {
  const theme = roleThemes[role];
  const modalVars = {
    '--pin-primary': theme.primary,
    '--pin-soft': theme.soft,
    '--pin-border': theme.border,
  } as CSSProperties;

  const [mode, setMode] = useState<PinMode>('verify');
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dropPointCode, setDropPointCode] = useState('');

  useEffect(() => {
    if (!open) return;
    setPin('');
    setPinConfirm('');
    setError(null);
    setLockedUntil(null);
    setRemainingSeconds(0);
    setPhoneNumber('');
    setNationalId('');
    setDropPointCode('');
    fetchStatus();
  }, [open, role, lineId]);

  useEffect(() => {
    if (!lockedUntil || remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil, remainingSeconds]);

  const fetchStatus = async () => {
    if (!lineId) return;
    try {
      setLoading(true);
      const response = await axios.post('/api/pin/status', { role, lineId });
      const status = response.data;
      if (status.locked) {
        setLockedUntil(status.lockedUntil || null);
        setRemainingSeconds(status.lockRemainingSeconds || 0);
      }
      if (status.pinSet) {
        setMode('verify');
      } else {
        setMode('setup');
      }
    } catch (statusError: any) {
      setError(statusError.response?.data?.error || 'ไม่สามารถตรวจสอบสถานะ PIN ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (pin.length !== 6) {
      setError('กรุณากรอกรหัส PIN 6 หลัก');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post('/api/pin/verify', { role, lineId, pin });
      const { pinToken, expiresAt } = response.data;
      setPinSession(role, lineId, { token: pinToken, expiresAt });
      onVerified(pinToken, expiresAt);
      onClose();
    } catch (verifyError: any) {
      const payload = verifyError.response?.data;
      if (payload?.pinSetupRequired) {
        setMode('setup');
      }
      if (payload?.pinLocked) {
        setLockedUntil(payload.lockedUntil || null);
        setRemainingSeconds(payload.lockRemainingSeconds || 0);
      }
      setError(payload?.error || 'PIN ไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    if (pin.length !== 6) {
      setError('กรุณากรอกรหัส PIN 6 หลัก');
      return;
    }
    if (pin !== pinConfirm) {
      setError('PIN ไม่ตรงกัน');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post('/api/pin/setup', { role, lineId, pin });
      const { pinToken, expiresAt } = response.data;
      setPinSession(role, lineId, { token: pinToken, expiresAt });
      onVerified(pinToken, expiresAt);
      onClose();
    } catch (setupError: any) {
      const payload = setupError.response?.data;
      setError(payload?.error || 'ตั้งค่า PIN ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (pin.length !== 6) {
      setError('กรุณากรอกรหัส PIN 6 หลัก');
      return;
    }
    if (pin !== pinConfirm) {
      setError('PIN ไม่ตรงกัน');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post('/api/pin/reset', {
        role,
        lineId,
        pin,
        phoneNumber,
        nationalId,
        dropPointCode,
      });
      const { pinToken, expiresAt } = response.data;
      setPinSession(role, lineId, { token: pinToken, expiresAt });
      onVerified(pinToken, expiresAt);
      onClose();
    } catch (resetError: any) {
      const payload = resetError.response?.data;
      setError(payload?.error || 'รีเซ็ต PIN ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const remainingLabel = remainingSeconds > 0
    ? `${Math.ceil(remainingSeconds / 60)} นาที`
    : '';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F42]/45 p-4 backdrop-blur-[2px]">
      <div
        className="w-full max-w-sm rounded-[30px] border border-[var(--pin-border)] bg-gradient-to-br from-[#F7FAFE] via-white to-[var(--pin-soft)] p-4 shadow-[0_22px_60px_rgba(11,59,130,0.20)]"
        style={modalVars}
      >
        <div className="rounded-[24px] border border-white/90 bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(11,59,130,0.06)]">
          <div className="inline-flex rounded-full border border-[var(--pin-border)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--pin-primary)]">
            Secure Access
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[var(--pin-primary)]">
            {mode === 'setup' && 'ตั้งค่า PIN 6 หลัก'}
            {mode === 'verify' && 'ยืนยัน PIN'}
            {mode === 'reset' && 'ลืม PIN'}
          </h2>
          <p className="mt-1 text-xs text-[#6F7E97]">
            ใช้สำหรับยืนยันก่อนทำธุรกรรมที่สำคัญ
          </p>
        </div>

        {lockedUntil && remainingSeconds > 0 ? (
          <div className="mt-4 rounded-[24px] border border-[var(--pin-border)] bg-white/80 p-4 text-sm text-[var(--pin-primary)]">
            บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่อีกครั้งใน {remainingLabel}
          </div>
        ) : (
          <div className="mt-4 rounded-[24px] border border-white/90 bg-white/80 p-4 shadow-[0_10px_24px_rgba(11,59,130,0.06)]">
            <div className="mb-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5C76A6]">PIN 6 หลัก</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="mt-2 w-full rounded-2xl border border-[#CCD6E6] bg-white px-4 py-3 text-center text-lg tracking-[0.5em] text-[#243B62] shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[var(--pin-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--pin-primary)]/20"
                placeholder="••••••"
              />
            </div>

            {mode !== 'verify' && (
              <div className="mb-4">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5C76A6]">ยืนยัน PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full rounded-2xl border border-[#CCD6E6] bg-white px-4 py-3 text-center text-lg tracking-[0.5em] text-[#243B62] shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[var(--pin-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--pin-primary)]/20"
                  placeholder="••••••"
                />
              </div>
            )}

            {mode === 'reset' && (
              <div className="mb-4 space-y-3">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="เบอร์โทรศัพท์"
                  className="w-full rounded-2xl border border-[#CCD6E6] bg-white px-4 py-3 text-sm text-[#243B62] shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[var(--pin-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--pin-primary)]/20"
                />
                {(role === 'PAWNER' || role === 'INVESTOR') && (
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="เลขบัตรประชาชน"
                    className="w-full rounded-2xl border border-[#CCD6E6] bg-white px-4 py-3 text-sm text-[#243B62] shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[var(--pin-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--pin-primary)]/20"
                  />
                )}
                {role === 'DROP_POINT' && (
                  <input
                    type="text"
                    value={dropPointCode}
                    onChange={(e) => setDropPointCode(e.target.value)}
                    placeholder="รหัสสาขา Drop Point"
                    className="w-full rounded-2xl border border-[#CCD6E6] bg-white px-4 py-3 text-sm text-[#243B62] shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[var(--pin-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--pin-primary)]/20"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {mode === 'verify' && (
            <button
              onClick={handleVerify}
              disabled={loading || !!lockedUntil}
              className="w-full rounded-2xl bg-gradient-to-r from-[var(--pin-primary)] to-[#6D8FC8] py-3 text-sm font-bold text-white shadow-[0_12px_24px_rgba(11,59,130,0.18)] transition hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'กำลังยืนยัน...' : 'ยืนยัน PIN'}
            </button>
          )}

          {mode === 'setup' && (
            <button
              onClick={handleSetup}
              disabled={loading || !!lockedUntil}
              className="w-full rounded-2xl bg-gradient-to-r from-[var(--pin-primary)] to-[#6D8FC8] py-3 text-sm font-bold text-white shadow-[0_12px_24px_rgba(11,59,130,0.18)] transition hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'กำลังตั้งค่า...' : 'ตั้งค่า PIN'}
            </button>
          )}

          {mode === 'reset' && (
            <button
              onClick={handleReset}
              disabled={loading || !!lockedUntil}
              className="w-full rounded-2xl bg-gradient-to-r from-[var(--pin-primary)] to-[#6D8FC8] py-3 text-sm font-bold text-white shadow-[0_12px_24px_rgba(11,59,130,0.18)] transition hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'กำลังรีเซ็ต...' : 'รีเซ็ต PIN'}
            </button>
          )}

          {mode === 'verify' && (
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="w-full rounded-2xl border border-[#D9E3F2] bg-white/80 py-3 text-xs font-semibold text-[#5C76A6]"
            >
              ลืม PIN
            </button>
          )}

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => setMode('verify')}
              className="w-full rounded-2xl border border-[#D9E3F2] bg-white/80 py-3 text-xs font-semibold text-[#5C76A6]"
            >
              กลับไปยืนยัน PIN
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-[#D9E3F2] bg-white/80 py-3 text-xs font-semibold text-[#6F7E97]"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
