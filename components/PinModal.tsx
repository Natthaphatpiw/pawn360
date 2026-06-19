'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { ChevronLeft, LockKeyhole } from 'lucide-react';
import type { PinRole } from '@/lib/security/pin';
import { setPinSession } from '@/lib/security/pin-session';

type PinModalProps = {
  open: boolean;
  role: PinRole;
  lineId: string;
  onClose: () => void;
  onVerified: (token: string, expiresAt: string) => void;
  initialMode?: PinMode;
  previewMode?: boolean;
  previewStartStep?: PinStep;
  previewPrefill?: {
    phoneNumber?: string;
    nationalId?: string;
    dropPointCode?: string;
  };
};

type PinMode = 'verify' | 'setup' | 'reset';
type PinStep = 'pin' | 'confirm' | 'details';

const PIN_LENGTH = 6;

const roleThemes: Record<
  PinRole,
  {
    primary: string;
    soft: string;
    border: string;
    pageBase: string;
    heroGradient: string;
    panelGradient: string;
    pageGradient: string;
    subtitle: string;
  }
> = {
  PAWNER: {
    primary: 'var(--primary)',
    soft: 'var(--primary-soft)',
    border: 'var(--primary-border)',
    pageBase: 'color-mix(in srgb, var(--primary-active) 28%, black 72%)',
    heroGradient:
      'linear-gradient(160deg, color-mix(in srgb, var(--primary-active) 84%, black 16%) 0%, color-mix(in srgb, var(--primary) 74%, black 26%) 52%, color-mix(in srgb, var(--primary-soft) 18%, black 82%) 100%)',
    panelGradient:
      'linear-gradient(180deg, color-mix(in srgb, var(--primary-soft) 22%, black 78%) 0%, color-mix(in srgb, var(--background-white) 94%, var(--primary-soft) 6%) 100%)',
    pageGradient:
      'linear-gradient(334deg, color-mix(in srgb, var(--primary-active) 84%, black 16%), color-mix(in srgb, var(--primary) 78%, black 22%), color-mix(in srgb, var(--primary-soft) 70%, black 30%))',
    subtitle: 'Primary / warm orange',
  },
  INVESTOR: {
    primary: 'var(--s2)',
    soft: 'var(--s2-soft)',
    border: 'var(--s2-border)',
    pageBase: 'color-mix(in srgb, var(--s2-active) 28%, black 72%)',
    heroGradient:
      'linear-gradient(160deg, color-mix(in srgb, var(--s2-active) 84%, black 16%) 0%, color-mix(in srgb, var(--s2) 74%, black 26%) 52%, color-mix(in srgb, var(--s2-soft) 18%, black 82%) 100%)',
    panelGradient:
      'linear-gradient(180deg, color-mix(in srgb, var(--s2-soft) 22%, black 78%) 0%, color-mix(in srgb, var(--background-white) 94%, var(--s2-soft) 6%) 100%)',
    pageGradient:
      'linear-gradient(334deg, color-mix(in srgb, var(--s2-active) 84%, black 16%), color-mix(in srgb, var(--s2) 78%, black 22%), color-mix(in srgb, var(--s2-soft) 70%, black 30%))',
    subtitle: 'S2 / electric blue',
  },
  DROP_POINT: {
    primary: 'var(--s3)',
    soft: 'var(--s3-soft)',
    border: 'var(--s3-border)',
    pageBase: 'color-mix(in srgb, var(--s3-active) 28%, black 72%)',
    heroGradient:
      'linear-gradient(160deg, color-mix(in srgb, var(--s3-active) 84%, black 16%) 0%, color-mix(in srgb, var(--s3) 74%, black 26%) 52%, color-mix(in srgb, var(--s3-soft) 18%, black 82%) 100%)',
    panelGradient:
      'linear-gradient(180deg, color-mix(in srgb, var(--s3-soft) 22%, black 78%) 0%, color-mix(in srgb, var(--background-white) 94%, var(--s3-soft) 6%) 100%)',
    pageGradient:
      'linear-gradient(334deg, color-mix(in srgb, var(--s3-active) 84%, black 16%), color-mix(in srgb, var(--s3) 78%, black 22%), color-mix(in srgb, var(--s3-soft) 70%, black 30%))',
    subtitle: 'S3 / fresh green',
  },
};

const modeLabels: Record<PinMode, string> = {
  verify: 'กรอก PIN',
  setup: 'ตั้งค่า PIN',
  reset: 'ลืม PIN',
};

const roleLabels: Record<PinRole, string> = {
  PAWNER: 'BORROWER',
  INVESTOR: 'INVESTOR',
  DROP_POINT: 'DROP POINT',
};

const ui = {
  text: 'var(--foreground)',
  textSoft: 'var(--foreground-subtle)',
  panel: 'color-mix(in srgb, var(--background-white) 78%, transparent)',
  panelStrong: 'color-mix(in srgb, var(--background-white) 90%, transparent)',
  panelMuted: 'color-mix(in srgb, var(--background-white) 64%, transparent)',
  panelOverlay: 'color-mix(in srgb, var(--background-white) 18%, transparent)',
  panelBorder: 'color-mix(in srgb, var(--background-white) 28%, transparent)',
  panelBorderSoft: 'color-mix(in srgb, var(--background-white) 18%, transparent)',
  shadowStrong: '0 16px 48px color-mix(in srgb, var(--foreground) 12%, transparent)',
  shadowMedium: '0 14px 30px color-mix(in srgb, var(--foreground) 18%, transparent)',
  shadowSoft: '0 8px 18px color-mix(in srgb, var(--foreground) 8%, transparent)',
};

function PinDot({
  filled,
  error,
}: {
  filled: boolean;
  error: boolean;
}) {
  return (
    <span
      className="h-4 w-4 rounded-full transition-all duration-200"
      style={
        error
          ? {
              backgroundColor: 'var(--error)',
              boxShadow: '0 0 0 4px color-mix(in srgb, var(--error) 18%, transparent)',
            }
          : filled
            ? {
                backgroundColor: 'var(--background-white)',
              }
            : {
                backgroundColor: 'color-mix(in srgb, var(--background-white) 16%, transparent)',
              }
      }
    />
  );
}

export default function PinModal({
  open,
  role,
  lineId,
  onClose,
  onVerified,
  initialMode = 'verify',
  previewMode = false,
  previewStartStep,
  previewPrefill,
}: PinModalProps) {
  const theme = roleThemes[role];
  const modalVars = {
    '--pin-primary': theme.primary,
    '--pin-soft': theme.soft,
    '--pin-border': theme.border,
  } as CSSProperties;

  const [mode, setMode] = useState<PinMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dropPointCode, setDropPointCode] = useState('');
  const [step, setStep] = useState<PinStep>('pin');
  const autoSubmitKeyRef = useRef<string | null>(null);
  const confirmAdvanceArmedRef = useRef(true);
  const confirmMismatchTimerRef = useRef<number | null>(null);

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
    setMode(initialMode);
    setStep(previewStartStep || 'pin');
    autoSubmitKeyRef.current = null;
    confirmAdvanceArmedRef.current = true;
    if (confirmMismatchTimerRef.current) {
      window.clearTimeout(confirmMismatchTimerRef.current);
      confirmMismatchTimerRef.current = null;
    }

    if (previewMode && previewPrefill) {
      setPhoneNumber(previewPrefill.phoneNumber || '');
      setNationalId(previewPrefill.nationalId || '');
      setDropPointCode(previewPrefill.dropPointCode || '');
    }

    if (previewMode) return;
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role, lineId, initialMode, previewMode, previewStartStep, previewPrefill]);

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

      setMode(status.pinSet ? 'verify' : 'setup');
    } catch (statusError: any) {
      setError(statusError.response?.data?.error || 'ไม่สามารถตรวจสอบสถานะ PIN ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = (pinToken: string, expiresAt: string) => {
    setPinSession(role, lineId, { token: pinToken, expiresAt });
    onVerified(pinToken, expiresAt);
    onClose();
  };

  const handleVerify = async (nextPin?: string) => {
    if (previewMode) return;

    const pinValue = nextPin ?? pin;
    if (pinValue.length !== PIN_LENGTH) return;

    try {
      setLoading(true);
      setError(null);
      const response = await axios.post('/api/pin/verify', { role, lineId, pin: pinValue });
      const { pinToken, expiresAt } = response.data;
      handleSuccess(pinToken, expiresAt);
    } catch (verifyError: any) {
      const payload = verifyError.response?.data;
      if (payload?.pinSetupRequired) {
        setMode('setup');
      }
      if (payload?.pinLocked) {
        setLockedUntil(payload.lockedUntil || null);
        setRemainingSeconds(payload.lockRemainingSeconds || 0);
      }
      setError(payload?.error || 'PIN ไม่ถูกต้อง กรุณาลองใหม่');
      setTimeout(() => setPin(''), 220);
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    if (previewMode) return;

    if (pin.length !== PIN_LENGTH) {
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
      handleSuccess(pinToken, expiresAt);
    } catch (setupError: any) {
      const payload = setupError.response?.data;
      setError(payload?.error || 'ตั้งค่า PIN ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (previewMode) return;

    if (pin.length !== PIN_LENGTH) {
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
      handleSuccess(pinToken, expiresAt);
    } catch (resetError: any) {
      const payload = resetError.response?.data;
      const rawMessage = String(payload?.error || '');
      const friendlyMessage = 'เบอร์โทรศัพท์หรือเลขบัตรประชาชนไม่ถูกต้อง';
      const shouldUseFriendlyMessage =
        !rawMessage ||
        /เบอร์โทรศัพท์|เลขบัตรประชาชน|phone|mobile|id|national/i.test(rawMessage) ||
        resetError.response?.status === 400 ||
        resetError.response?.status === 422;

      setError(shouldUseFriendlyMessage ? friendlyMessage : rawMessage);
    } finally {
      setLoading(false);
    }
  };

  const applyDigit = (digit: string) => {
    if (loading || lockedUntil) return;

    setError(null);
    autoSubmitKeyRef.current = null;
    if (confirmMismatchTimerRef.current) {
      window.clearTimeout(confirmMismatchTimerRef.current);
      confirmMismatchTimerRef.current = null;
    }

    if (mode === 'verify') {
      setPin((current) => (current.length >= PIN_LENGTH ? current : `${current}${digit}`));
      return;
    }

    if (step === 'pin') {
      confirmAdvanceArmedRef.current = true;
      setPin((current) => (current.length >= PIN_LENGTH ? current : `${current}${digit}`));
      return;
    }

    if (step === 'confirm') {
      setPinConfirm((current) => {
        if (current.length >= PIN_LENGTH) return current;
        const nextConfirm = `${current}${digit}`;

        if (mode === 'reset' && nextConfirm.length === PIN_LENGTH && nextConfirm === pin) {
          window.setTimeout(() => {
            setStep('details');
            setError(null);
            autoSubmitKeyRef.current = null;
          }, 120);
        }

        return nextConfirm;
      });
    }
  };

  const deleteDigit = () => {
    if (loading || lockedUntil) return;

    setError(null);
    autoSubmitKeyRef.current = null;
    if (confirmMismatchTimerRef.current) {
      window.clearTimeout(confirmMismatchTimerRef.current);
      confirmMismatchTimerRef.current = null;
    }

    if (mode === 'verify') {
      setPin((current) => current.slice(0, -1));
      return;
    }

    if (step === 'pin') {
      confirmAdvanceArmedRef.current = true;
      setPin((current) => current.slice(0, -1));
      return;
    }

    if (step === 'confirm') {
      setPinConfirm((current) => current.slice(0, -1));
    }
  };

  useEffect(() => {
    return () => {
      if (confirmMismatchTimerRef.current) {
        window.clearTimeout(confirmMismatchTimerRef.current);
        confirmMismatchTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previewMode || loading || lockedUntil) return;

    if (mode === 'verify' && pin.length === PIN_LENGTH) {
      const currentKey = `verify:${pin}`;
      if (autoSubmitKeyRef.current === currentKey) return;
      autoSubmitKeyRef.current = currentKey;
      const timer = window.setTimeout(() => {
        void handleVerify(pin);
      }, 120);
      return () => window.clearTimeout(timer);
    }

    if (mode === 'setup' && pin.length === PIN_LENGTH && pinConfirm.length === PIN_LENGTH && pin === pinConfirm) {
      const currentKey = `setup:${pin}:${pinConfirm}`;
      if (autoSubmitKeyRef.current === currentKey) return;
      autoSubmitKeyRef.current = currentKey;
      const timer = window.setTimeout(() => {
        void handleSetup();
      }, 120);
      return () => window.clearTimeout(timer);
    }

    autoSubmitKeyRef.current = null;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, loading, lockedUntil, mode, pin, pinConfirm, phoneNumber, nationalId, dropPointCode, role, step]);

  useEffect(() => {
    if (mode !== 'verify' && pin.length === PIN_LENGTH && step === 'pin') {
      if (!confirmAdvanceArmedRef.current) return undefined;

      const timer = window.setTimeout(() => setStep('confirm'), 120);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [mode, pin.length, step]);

  useEffect(() => {
    if (loading || lockedUntil) return;

    const isConfirmStep = mode !== 'verify' && step === 'confirm';
    if (!isConfirmStep) {
      if (confirmMismatchTimerRef.current) {
        window.clearTimeout(confirmMismatchTimerRef.current);
        confirmMismatchTimerRef.current = null;
      }
      return;
    }

    const confirmPrefix = pin.slice(0, pinConfirm.length);
    const hasMismatch = pinConfirm.length > 0 && pinConfirm !== confirmPrefix;

    if (hasMismatch && pinConfirm.length === PIN_LENGTH) {
      setError('PIN ไม่ตรงกัน');

      if (!confirmMismatchTimerRef.current) {
        confirmMismatchTimerRef.current = window.setTimeout(() => {
          setPinConfirm('');
          setError(null);
          autoSubmitKeyRef.current = null;
          confirmMismatchTimerRef.current = null;
        }, 260);
      }
      return;
    }

    if (!hasMismatch && error === 'PIN ไม่ตรงกัน') {
      setError(null);
    }
  }, [previewMode, loading, lockedUntil, mode, step, pin, pinConfirm, error]);

  const isLocked = Boolean(lockedUntil && remainingSeconds > 0);
  const pinComplete = pin.length === PIN_LENGTH;
  const confirmComplete = pinConfirm.length === PIN_LENGTH;
  const needsNationalId = role === 'PAWNER' || role === 'INVESTOR';
  const needsDropPointCode = role === 'DROP_POINT';
  const showConfirmStep = mode !== 'verify' && step === 'confirm';
  const showDetailsStep = mode === 'reset' && step === 'details';
  const confirmMismatch =
    showConfirmStep && pinConfirm.length > 0 && pinConfirm !== pin.slice(0, pinConfirm.length);
  const currentEntryComplete = mode === 'verify' ? pinComplete : showConfirmStep ? confirmComplete : pinComplete;
  const headingLabel = showDetailsStep ? 'ยืนยันข้อมูล' : showConfirmStep ? 'ยืนยัน PIN' : modeLabels[mode];
  const clearResetFields = () => {
    setPhoneNumber('');
    setNationalId('');
    setDropPointCode('');
  };

  const goBack = () => {
    if (showDetailsStep) {
      setStep('confirm');
      setPinConfirm('');
      setError(null);
      autoSubmitKeyRef.current = null;
      clearResetFields();
      return;
    }

    if (showConfirmStep) {
      setStep('pin');
      setPin('');
      setPinConfirm('');
      setError(null);
      autoSubmitKeyRef.current = null;
      confirmAdvanceArmedRef.current = false;
      if (confirmMismatchTimerRef.current) {
        window.clearTimeout(confirmMismatchTimerRef.current);
        confirmMismatchTimerRef.current = null;
      }
      clearResetFields();
      return;
    }

    onClose();
  };

  const backToPin = () => {
    setMode('verify');
    setStep('pin');
    setPin('');
    setPinConfirm('');
    setError(null);
    autoSubmitKeyRef.current = null;
    confirmAdvanceArmedRef.current = true;
    if (confirmMismatchTimerRef.current) {
      window.clearTimeout(confirmMismatchTimerRef.current);
      confirmMismatchTimerRef.current = null;
    }
    clearResetFields();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden text-foreground"
      style={{
        ...modalVars,
        backgroundColor: theme.pageBase,
        backgroundImage: theme.pageGradient,
        backgroundSize: '180% 180%',
        backgroundPosition: '0% 50%',
        animation: 'pin-gradient-animation 6s ease infinite',
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-24 top-16 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--pin-soft) 34%, transparent)' }}
        />
        <div
          className="absolute right-[-84px] top-1/2 h-72 w-72 rounded-full blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--pin-primary) 30%, transparent)' }}
        />
        <div
          className="absolute bottom-[-120px] left-1/3 h-80 w-80 rounded-full blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--background-white) 22%, transparent)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at top, color-mix(in srgb, var(--background-white) 24%, transparent) 0%, transparent 36%), linear-gradient(180deg, color-mix(in srgb, var(--background-white) 12%, transparent) 0%, transparent 100%)',
          }}
        />
      </div>

      <style jsx global>{`
        @keyframes pin-gradient-animation {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
      `}</style>

      <div className="relative flex h-dvh min-h-dvh flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-[calc(var(--safe-top)+12px)]">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-11 items-center gap-1 rounded-full pl-3 pr-5 text-sm font-medium backdrop-blur-xl transition-transform active:scale-[0.98]"
            style={{
              backgroundColor: ui.panelOverlay,
              color: 'var(--background-white)',
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            Back
          </button>

          <div
            className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] backdrop-blur-xl"
            style={{
              backgroundColor: ui.panelOverlay,
              color: 'color-mix(in srgb, var(--background-white) 85%, transparent)',
            }}
          >
            {roleLabels[role]}
          </div>
        </div>

        <div className="mx-auto flex h-full w-full max-w-md flex-1 min-h-0 flex-col px-5">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto pb-4 pt-[clamp(0.75rem,3vh,2rem)] text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full sm:h-16 sm:w-16"
              style={{
                backgroundColor: ui.panelOverlay,
                color: 'var(--background-white)',
                // boxShadow: ui.shadowMedium,
              }}
            >
              <LockKeyhole className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl" style={{ color: 'var(--background-white)' }}>
              {headingLabel}
            </h1>
            <p
              className="mt-2 max-w-xs text-xs leading-5 sm:text-sm sm:leading-6"
              style={{ color: 'color-mix(in srgb, var(--background-white) 88%, transparent)' }}
            >
              {mode === 'verify'
                ? ' '
                : showConfirmStep
                  ? mode === 'reset'
                    ? 'กรอกรหัส PIN เดิมอีกครั้ง แล้วใส่ข้อมูลยืนยันตัวตน'
                    : 'กรอกรหัส PIN เดิมอีกครั้งเพื่อยืนยัน'
                  : showDetailsStep
                    ? 'กรอกเบอร์โทรศัพท์และเลขบัตรประชาชนเพื่อยืนยัน'
                  : mode === 'setup'
                    ? 'กรอกรหัส PIN ใหม่ให้ครบ 6 หลัก ระบบจะพาไปหน้ายืนยันอัตโนมัติ'
                    : 'ลืม PIN แล้วกรอกข้อมูลยืนยันเพื่อสร้าง PIN ใหม่'}
            </p>

            <div className="mt-5 w-full max-w-sm sm:mt-7">
              {loading && !previewMode ? (
                <div className="flex flex-col items-center gap-4 py-10">
                  <div
                    className="h-12 w-12 animate-spin rounded-full border-4"
                    style={{ borderColor: ui.panelBorderSoft, borderTopColor: theme.primary }}
                  />
                  <p className="text-sm" style={{ color: 'color-mix(in srgb, var(--background-white) 88%, transparent)' }}>
                    กำลังตรวจสอบสถานะ PIN
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {!showConfirmStep && !showDetailsStep && (
                      <div>
                        <div className="flex items-center justify-center gap-4">
                          {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                            <PinDot key={`pin-${index}`} filled={index < pin.length} error={Boolean(error) && mode === 'verify'} />
                          ))}
                        </div>
                      </div>
                    )}

                    {showConfirmStep && (
                      <div className="space-y-5">
                        <div>
                          <div className="flex items-center justify-center gap-4">
                            {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                              <PinDot key={`confirm-${index}`} filled={index < pinConfirm.length} error={Boolean(error)} />
                            ))}
                          </div>
                        </div>

                        {mode === 'setup' && (
                          <button
                            type="button"
                            onClick={() => void handleSetup()}
                            disabled={loading || isLocked || pin.length !== PIN_LENGTH || pinConfirm.length !== PIN_LENGTH || pin !== pinConfirm}
                            className="w-full rounded-full px-5 py-4 text-sm font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
                            style={{
                              backgroundColor: 'var(--background-white)',
                              color: theme.primary,
                            }}
                          >
                            Confirm
                          </button>
                        )}

                      </div>
                    )}

                    {showDetailsStep && (
                      <div className="space-y-5">
                        <div className="space-y-4 text-left pt-1">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'color-mix(in srgb, var(--background-white) 76%, transparent)' }}>
                              เบอร์โทรศัพท์
                            </label>
                            <input
                              type="tel"
                              inputMode="numeric"
                              maxLength={10}
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              placeholder="กรอกเบอร์โทรศัพท์ 10 หลัก"
                              className="mt-2 w-full bg-transparent px-0 py-3 text-sm outline-none"
                              style={{
                                color: 'var(--background-white)',
                                borderBottom: '1px solid color-mix(in srgb, var(--background-white) 28%, transparent)',
                              }}
                            />
                          </div>

                          {needsNationalId && (
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'color-mix(in srgb, var(--background-white) 76%, transparent)' }}>
                                เลขบัตรประชาชน
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={13}
                                value={nationalId}
                                onChange={(e) => setNationalId(e.target.value.replace(/\D/g, '').slice(0, 13))}
                                placeholder="เลขบัตรประชาชน 13 หลัก"
                                className="mt-2 w-full bg-transparent px-0 py-3 text-sm outline-none"
                                style={{
                                  color: 'var(--background-white)',
                                  borderBottom: '1px solid color-mix(in srgb, var(--background-white) 28%, transparent)',
                                }}
                              />
                            </div>
                          )}

                          {needsDropPointCode && (
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'color-mix(in srgb, var(--background-white) 76%, transparent)' }}>
                                รหัสสาขา Drop Point
                              </label>
                              <input
                                type="text"
                                value={dropPointCode}
                                onChange={(e) => setDropPointCode(e.target.value)}
                                placeholder="รหัสสาขา"
                                className="mt-2 w-full bg-transparent px-0 py-3 text-sm outline-none"
                                style={{
                                  color: 'var(--background-white)',
                                  borderBottom: '1px solid color-mix(in srgb, var(--background-white) 28%, transparent)',
                                }}
                              />
                            </div>
                          )}

                          {error && (
                            <div className="pt-1 text-sm font-medium" style={{ color: 'var(--error)' }} aria-live="polite">
                              {error}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleReset()}
                          disabled={
                            loading ||
                            isLocked ||
                            !phoneNumber.trim() ||
                            (needsNationalId && !nationalId.trim()) ||
                            (needsDropPointCode && !dropPointCode.trim())
                          }
                          className="w-full rounded-full px-5 py-4 text-sm font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
                          style={{
                            backgroundColor: 'var(--background-white)',
                            color: theme.primary,
                          }}
                        >
                          Confirm
                        </button>
                      </div>
                    )}

                    {showConfirmStep ? (
                      <div
                        className="mx-auto rounded-full px-4 py-2 text-center text-sm"
                        style={{
                          color: 'var(--error)'
                        }}
                        aria-live="polite"
                      >
                        {error || (confirmMismatch ? 'PIN ไม่ตรงกัน' : ' ')}
                      </div>
                    ) : showDetailsStep ? (
                      <div className="h-1" aria-hidden="true" />
                    ) : (
                      <div
                        className="rounded-full px-4 py-3 text-center text-sm"
                        style={{
                          color: error ? 'var(--error)' : 'color-mix(in srgb, var(--background-white) 84%, transparent)',
                        }}
                        aria-live="polite"
                      >
                        {error || ' '}
                      </div>
                    )}

                    <div className="flex justify-center pt-0">
                      {mode === 'verify' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('reset');
                            setStep('pin');
                            setPin('');
                            setPinConfirm('');
                            setError(null);
                            autoSubmitKeyRef.current = null;
                            confirmAdvanceArmedRef.current = true;
                            if (confirmMismatchTimerRef.current) {
                              window.clearTimeout(confirmMismatchTimerRef.current);
                              confirmMismatchTimerRef.current = null;
                            }
                            clearResetFields();
                          }}
                          className="text-sm font-medium underline underline-offset-4"
                          style={{ color: 'color-mix(in srgb, var(--background-white) 82%, transparent)' }}
                        >
                          Forgot PIN
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={backToPin}
                          className="text-sm font-medium underline underline-offset-4"
                          style={{ color: 'color-mix(in srgb, var(--background-white) 82%, transparent)' }}
                        >
                          Back to PIN
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {!showDetailsStep && (
          <div className="shrink-0 px-4 pb-[calc(var(--safe-bottom)+24px)] pt-3">
            <div className="mx-auto w-full max-w-md">
              <div className="grid grid-cols-3 gap-3 pb-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => applyDigit(digit)}
                    disabled={loading || isLocked || currentEntryComplete}
                    className="flex h-[clamp(3.25rem,8.3vw,4.25rem)] items-center justify-center rounded-full text-xl font-semibold transition-transform active:scale-[0.99] disabled:opacity-50 sm:text-2xl"
                    style={{
                      color: 'var(--background-white)',
                      backgroundColor: ui.panelOverlay,
                    }}
                  >
                    {digit}
                  </button>
                ))}
                <div />
                <button
                  type="button"
                  onClick={() => applyDigit('0')}
                  disabled={loading || isLocked || currentEntryComplete}
                  className="flex h-[clamp(3.25rem,8.3vw,4.25rem)] items-center justify-center rounded-full text-xl font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 sm:text-2xl"
                  style={{
                    color: 'var(--background-white)',
                    backgroundColor: ui.panelOverlay,
                  }}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={deleteDigit}
                  disabled={
                    loading ||
                    isLocked ||
                    (mode === 'verify'
                      ? !pin.length
                      : showConfirmStep
                        ? !pinConfirm.length
                        : !pin.length)
                  }
                  className="flex h-[clamp(3.25rem,8.3vw,4.25rem)] items-center justify-center rounded-full border border-background-white/35 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
                  style={{
                    color: 'var(--background-white)',
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="-2 -5 24 24" className="mr-2 h-8 w-8 opacity-70">
                    <path d="M-2 -5h24v24H-2z" fill="none" />
                    <path
                      fill="currentColor"
                      d="M7.828 0H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7.828a2 2 0 0 1-1.414-.586L.707 7.707a1 1 0 0 1 0-1.414L6.414.586A2 2 0 0 1 7.828 0m0 12H18V2H7.828l-5 5zm6.586-5l1.414 1.414a1 1 0 0 1-1.414 1.414L13 8.414l-1.414 1.414a1 1 0 1 1-1.414-1.414L11.586 7l-1.414-1.414a1 1 0 1 1 1.414-1.414L13 5.586l1.414-1.414a1 1 0 1 1 1.414 1.414z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
