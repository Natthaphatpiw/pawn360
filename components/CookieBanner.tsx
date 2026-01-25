'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type ConsentState = {
  essential: boolean;
  functionality: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
};

const STORAGE_KEY = 'user_consent';
const DEFAULT_CONSENT: ConsentState = {
  essential: true,
  functionality: false,
  analytics: false,
  marketing: false,
  timestamp: '',
};

const GA_SCRIPT_ID = 'pawnly-ga';
const MARKETING_SCRIPT_ID = 'pawnly-marketing';

const safeParse = (value: string | null): ConsentState | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ConsentState;
    return {
      ...DEFAULT_CONSENT,
      ...parsed,
      essential: true,
      timestamp: parsed.timestamp || '',
    };
  } catch {
    return null;
  }
};

const loadScript = (id: string, src: string) => {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.src = src;
  script.async = true;
  document.head.appendChild(script);
};

const loadScripts = (consent: ConsentState) => {
  if (typeof window === 'undefined') return;

  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (gaId) {
    (window as any)[`ga-disable-${gaId}`] = !consent.analytics;
    if (consent.analytics && !(window as any).__pawnlyGaLoaded) {
      loadScript(GA_SCRIPT_ID, `https://www.googletagmanager.com/gtag/js?id=${gaId}`);
      (window as any).dataLayer = (window as any).dataLayer || [];
      const gtag = (...args: any[]) => (window as any).dataLayer.push(args);
      (window as any).gtag = gtag;
      gtag('js', new Date());
      gtag('config', gaId, { anonymize_ip: true });
      (window as any).__pawnlyGaLoaded = true;
    }
  }

  const marketingSrc = process.env.NEXT_PUBLIC_MARKETING_SCRIPT_SRC;
  if (marketingSrc && consent.marketing && !(window as any).__pawnlyMarketingLoaded) {
    loadScript(MARKETING_SCRIPT_ID, marketingSrc);
    (window as any).__pawnlyMarketingLoaded = true;
  }
};

export default function CookieBanner() {
  const [isMounted, setIsMounted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [draft, setDraft] = useState<ConsentState>(DEFAULT_CONSENT);

  const hasConsent = useMemo(() => Boolean(consent?.timestamp), [consent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
    if (stored) {
      setConsent(stored);
      setDraft(stored);
      setIsMounted(true);
      loadScripts(stored);
      return;
    }
    setIsMounted(true);
    setShowBanner(true);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [settingsOpen]);

  const persistConsent = (nextConsent: ConsentState) => {
    const payload = {
      ...nextConsent,
      essential: true,
      timestamp: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setConsent(payload);
    setDraft(payload);
    loadScripts(payload);
  };

  const acceptAll = () => {
    persistConsent({
      ...DEFAULT_CONSENT,
      functionality: true,
      analytics: true,
      marketing: true,
      timestamp: '',
    });
    setShowBanner(false);
  };

  const rejectAll = () => {
    persistConsent({
      ...DEFAULT_CONSENT,
      functionality: false,
      analytics: false,
      marketing: false,
      timestamp: '',
    });
    setShowBanner(false);
  };

  const openSettings = () => {
    setDraft(consent ?? DEFAULT_CONSENT);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    persistConsent(draft);
    setSettingsOpen(false);
    setShowBanner(false);
  };

  if (!isMounted) return null;

  return (
    <>
      {showBanner && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6 sm:pb-6"
          role="region"
          aria-label="Cookie notice"
        >
          <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 rounded-[24px] border border-[#e0dcd8] bg-[#f5f4f2]/95 p-4 text-[#686360] shadow-[0_16px_36px_rgba(67,63,60,0.18)] backdrop-blur sm:flex-row sm:items-center sm:gap-6 sm:p-5">
            <div className="flex-1 text-sm text-[#7f7b78]">
              เราใช้คุกกี้เพื่อพัฒนาเว็บไซต์และมอบประสบการณ์ที่ดีขึ้นให้คุณ
              <span className="block text-[11px] text-[#8e8a86] sm:text-xs">
                We use cookies to improve the site and your experience. You can manage preferences anytime.
              </span>
              <Link href="/cookie-policy" className="mt-2 inline-block text-xs text-[var(--accent)] underline">
                นโยบายคุกกี้ / Cookie Policy
              </Link>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={acceptAll}
                className="rounded-full bg-[#686360] px-4 py-2 text-xs text-[#f5f4f2] transition-colors duration-200 hover:bg-[#4f4b48]"
              >
                ยอมรับทั้งหมด
              </button>
              <button
                type="button"
                onClick={rejectAll}
                className="rounded-full border border-[#c55125] px-4 py-2 text-xs text-[#c55125] transition-colors duration-200 hover:bg-[#c55125] hover:text-white"
              >
                ปฏิเสธ
              </button>
              <button
                type="button"
                onClick={openSettings}
                className="rounded-full border border-[#d7d2cf] px-4 py-2 text-xs text-[#686360] transition-colors duration-200 hover:border-[#cfcac7]"
              >
                ตั้งค่า
              </button>
            </div>
          </div>
        </div>
      )}

      {hasConsent && (
        <button
          type="button"
          onClick={openSettings}
          className="fixed bottom-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-[#686360] text-white shadow-[0_12px_24px_rgba(44,42,40,0.2)] transition-transform duration-200 hover:scale-105"
          aria-label="Cookie settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.5-2-3.5-2.4.6a7.6 7.6 0 0 0-1.7-1L13 2h-4l-.9 2.6a7.6 7.6 0 0 0-1.7 1L4 5l-2 3.5 2 1.5a7.9 7.9 0 0 0 0 2L2 13.5 4 17l2.4-.6c.5.4 1.1.7 1.7 1L9 22h4l.9-2.6c.6-.2 1.2-.6 1.7-1l2.4.6 2-3.5-2-1.5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6 sm:px-6">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
            className="relative z-10 w-full max-w-[620px] rounded-[28px] bg-[#f5f4f2] p-6 text-[#686360] shadow-[0_24px_60px_rgba(44,42,40,0.22)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 id="cookie-settings-title" className="text-lg font-semibold text-[#686360]">
                  ตั้งค่าความเป็นส่วนตัว
                </h2>
                <p className="text-xs text-[#8e8a86]">
                  Cookie Preferences Center
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e2e0dd] text-[#686360] transition-colors duration-200 hover:border-[#cfcac7]"
                aria-label="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm text-[#7f7b78]">
              คุณสามารถเลือกอนุญาตคุกกี้แต่ละประเภทได้ตามต้องการ โดยคุกกี้ที่จำเป็นจะเปิดใช้งานตลอดเวลา
              <span className="block text-[11px] text-[#8e8a86] sm:text-xs">
                Manage your preferences below. Necessary cookies are always active.
              </span>
            </p>

            <div className="mt-6 space-y-4">
              {[
                {
                  key: 'essential' as const,
                  title: 'คุกกี้ที่จำเป็น (Strictly Necessary)',
                  desc: 'คุกกี้ที่ทำให้เว็บไซต์ทำงานได้ตามปกติ ไม่สามารถปิดได้',
                  locked: true,
                },
                {
                  key: 'functionality' as const,
                  title: 'คุกกี้เพื่อการทำงานของเว็บไซต์ (Functionality/Preference)',
                  desc: 'จดจำการตั้งค่า เช่น ภาษา หรือข้อมูลการเข้าสู่ระบบ',
                  locked: false,
                },
                {
                  key: 'analytics' as const,
                  title: 'คุกกี้เพื่อการวิเคราะห์ (Analytics/Performance)',
                  desc: 'ช่วยให้เราเข้าใจการใช้งานเพื่อปรับปรุงประสิทธิภาพเว็บไซต์',
                  locked: false,
                },
                {
                  key: 'marketing' as const,
                  title: 'คุกกี้เพื่อการตลาด/ปรับเนื้อหา (Marketing/Personalization)',
                  desc: 'ช่วยแสดงเนื้อหาที่เหมาะสมกับความสนใจของคุณ',
                  locked: false,
                },
              ].map((item) => {
                const isOn = draft[item.key];
                return (
                  <div key={item.key} className="rounded-2xl border border-[#e0dcd8] bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-[#686360]">{item.title}</h3>
                        <p className="mt-1 text-xs text-[#8e8a86]">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.locked) return;
                          setDraft((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                        }}
                        className={`flex h-6 w-11 items-center rounded-full border transition-colors duration-200 ${
                          isOn ? 'border-[#c55125] bg-[#c55125]' : 'border-[#d7d2cf] bg-[#e9e6e3]'
                        } ${item.locked ? 'cursor-not-allowed opacity-70' : ''}`}
                        aria-pressed={isOn}
                        aria-label={item.title}
                      >
                        <span
                          className={`h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                            isOn ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full border border-[#d7d2cf] px-5 py-2 text-xs text-[#686360] transition-colors duration-200 hover:border-[#cfcac7]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveSettings}
                className="rounded-full bg-[#686360] px-5 py-2 text-xs text-[#f5f4f2] transition-colors duration-200 hover:bg-[#4f4b48]"
              >
                บันทึกและปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
