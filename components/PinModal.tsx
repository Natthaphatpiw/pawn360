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

const roleThemes: Record<PinRole, { primary: string; soft: string; border: string; shell: string; overlay: string }> = {
  PAWNER: {
    primary: 'var(--primary)',
    soft: 'var(--primary-soft)',
    border: 'var(--primary-border)',
    shell: 'linear-gradient(135deg, color-mix(in srgb, var(--primary-soft) 84%, white 16%) 0%, var(--background-white) 58%, color-mix(in srgb, var(--primary-soft) 78%, white 22%) 100%)',
    overlay: 'color-mix(in srgb, var(--foreground) 38%, transparent)',
  },
  INVESTOR: {
    primary: '#1E3A8A',
    soft: '#EEF2FF',
    border: '#BFCCF8',
    shell: 'linear-gradient(135deg, #f7faff 0%, #ffffff 58%, #eef2ff 100%)',
    overlay: 'rgba(11, 31, 66, 0.45)',
  },
  DROP_POINT: {
    primary: '#365314',
    soft: '#ECFCCB',
    border: '#B9D38B',
    shell: 'linear-gradient(135deg, #f6fbef 0%, #ffffff 58%, #ecfccb 100%)',
    overlay: 'rgba(25, 43, 15, 0.42)',
  },
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
      style={{ backgroundColor: theme.overlay }}
    >
      <div
        className="modal-pop-in w-full max-w-sm rounded-[30px] border p-4 shadow-soft"
        style={{
          ...modalVars,
          borderColor: 'var(--pin-border)',
          backgroundImage: theme.shell,
        }}
      >
        <div className="rounded-[24px] border border-background-white bg-background-white px-4 py-4 shadow-soft">
          <div
            className="inline-flex rounded-full border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
            style={{ borderColor: 'var(--pin-border)', color: 'var(--pin-primary)' }}
          >
            Secure Access
          </div>
          <h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--pin-primary)' }}>
            {mode === 'setup' && 'ตั้งค่า PIN 6 หลัก'}
            {mode === 'verify' && 'ยืนยัน PIN'}
            {mode === 'reset' && 'ลืม PIN'}
          </h2>
          <p className="mt-1 text-xs text-foreground-subtle">
            ใช้สำหรับยืนยันก่อนทำธุรกรรมที่สำคัญ
          </p>
        </div>

        {lockedUntil && remainingSeconds > 0 ? (
          <div
            className="mt-4 rounded-[24px] border bg-background-white p-4 text-sm"
            style={{ borderColor: 'var(--pin-border)', color: 'var(--pin-primary)' }}
          >
            บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่อีกครั้งใน {remainingLabel}
          </div>
        ) : (
          <div className="mt-4 rounded-[24px] border border-background-white bg-background-white p-4 shadow-soft">
            <div className="mb-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">PIN 6 หลัก</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="mt-2 w-full rounded-2xl border border-line-soft bg-background-white px-4 py-3 text-center text-lg tracking-[0.5em] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1"
                style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--pin-primary) 20%, transparent)' }}
                placeholder="••••••"
              />
            </div>

            {mode !== 'verify' && (
              <div className="mb-4">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">ยืนยัน PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full rounded-2xl border border-line-soft bg-background-white px-4 py-3 text-center text-lg tracking-[0.5em] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1"
                  style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--pin-primary) 20%, transparent)' }}
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
                  className="w-full rounded-2xl border border-line-soft bg-background-white px-4 py-3 text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1"
                  style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--pin-primary) 20%, transparent)' }}
                />
                {(role === 'PAWNER' || role === 'INVESTOR') && (
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="เลขบัตรประชาชน"
                    className="w-full rounded-2xl border border-line-soft bg-background-white px-4 py-3 text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1"
                    style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--pin-primary) 20%, transparent)' }}
                  />
                )}
                {role === 'DROP_POINT' && (
                  <input
                    type="text"
                    value={dropPointCode}
                    onChange={(e) => setDropPointCode(e.target.value)}
                    placeholder="รหัสสาขา Drop Point"
                    className="w-full rounded-2xl border border-line-soft bg-background-white px-4 py-3 text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-1"
                    style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--pin-primary) 20%, transparent)' }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-error-border bg-error-soft px-4 py-3 text-xs text-error">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {mode === 'verify' && (
            <button
              onClick={handleVerify}
              disabled={loading || !!lockedUntil}
              className="btn-transition btn-sheen w-full rounded-2xl bg-[image:var(--background-image-grad-primary)] py-3 text-sm font-semibold text-primary-fg shadow-soft hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'กำลังยืนยัน...' : 'ยืนยัน PIN'}
            </button>
          )}

          {mode === 'setup' && (
            <button
              onClick={handleSetup}
              disabled={loading || !!lockedUntil}
              className="btn-transition btn-sheen w-full rounded-2xl bg-[image:var(--background-image-grad-primary)] py-3 text-sm font-semibold text-primary-fg shadow-soft hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'กำลังตั้งค่า...' : 'ตั้งค่า PIN'}
            </button>
          )}

          {mode === 'reset' && (
            <button
              onClick={handleReset}
              disabled={loading || !!lockedUntil}
              className="btn-transition btn-sheen w-full rounded-2xl bg-[image:var(--background-image-grad-primary)] py-3 text-sm font-semibold text-primary-fg shadow-soft hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'กำลังรีเซ็ต...' : 'รีเซ็ต PIN'}
            </button>
          )}

          {mode === 'verify' && (
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="w-full rounded-2xl border border-primary-border bg-background-white py-3 text-sm font-medium text-primary"
            >
              ลืม PIN
            </button>
          )}

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => setMode('verify')}
              className="w-full rounded-2xl border border-primary-border bg-background-white py-3 text-sm font-medium text-primary"
            >
              กลับไปยืนยัน PIN
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-line-soft bg-background-white py-3 text-sm font-medium text-foreground-subtle"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
