'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import liff from '@line/liff';

// ─── Mock profile (ใช้ตอน development) ───────────────────────────────────────
// แก้ข้อมูลตรงนี้ได้เลยเพื่อจำลอง LINE user ต่าง ๆ

const MOCK_PROFILE = {
  userId: 'Umock_dev_user_001',
  displayName: 'Mock User (Dev)',
  pictureUrl: 'https://profile.line-scdn.net/0h00000000000000000000000000000000000000',
  statusMessage: 'Dev mode',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiffContextType {
  liffObject: typeof liff | null;
  isLoggedIn: boolean;
  profile: any;
  error: string | null;
  isLoading: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LiffContext = createContext<LiffContextType>({
  liffObject: null,
  isLoggedIn: false,
  profile: null,
  error: null,
  isLoading: true,
});

export const useLiff = () => useContext(LiffContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LiffProvider({
  children,
  liffId,
}: {
  children: React.ReactNode;
  liffId: string;
}) {
  const [liffObject, setLiffObject] = useState<typeof liff | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeLiff = async () => {
      // ── Mock mode (development only) ──────────────────────────────────────
      // เปิดใช้ด้วย NEXT_PUBLIC_LIFF_MOCK=true ใน .env.local
      const isMock = process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';

      if (isMock) {
        console.info('[LIFF Mock] Running in mock mode — skipping real LIFF init');
        setLiffObject(liff);
        setIsLoggedIn(true);
        setProfile(MOCK_PROFILE);
        setIsLoading(false);
        return;
      }

      // ── Real LIFF init ────────────────────────────────────────────────────
      try {
        if (!liffId) throw new Error('LIFF ID is not provided');

        await liff.init({ liffId });
        setLiffObject(liff);

        if (liff.isLoggedIn()) {
          setIsLoggedIn(true);
          const userProfile = await liff.getProfile();
          setProfile(userProfile);
        } else {
          liff.login();
        }
      } catch (err: any) {
        console.error('LIFF initialization failed:', err);
        setError(err.message || 'Failed to initialize LIFF');
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [liffId]);

  return (
    <LiffContext.Provider value={{ liffObject, isLoggedIn, profile, error, isLoading }}>
      {children}
    </LiffContext.Provider>
  );
}