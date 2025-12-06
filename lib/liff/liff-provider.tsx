'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import liff from '@line/liff';

interface LiffContextType {
  liffObject: typeof liff | null;
  isLoggedIn: boolean;
  profile: any;
  error: string | null;
  isLoading: boolean;
}

const LiffContext = createContext<LiffContextType>({
  liffObject: null,
  isLoggedIn: false,
  profile: null,
  error: null,
  isLoading: true,
});

export const useLiff = () => useContext(LiffContext);

export function LiffProvider({
  children,
  liffId
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
      console.log('🔄 Initializing LIFF with ID:', liffId, '(type:', typeof liffId, ')');

      try {
        if (!liffId) {
          throw new Error('LIFF ID is not provided');
        }

        if (typeof window === 'undefined') {
          console.log('⚠️ Running on server side, skipping LIFF init');
          setIsLoading(false);
          return;
        }

        console.log('📱 Calling liff.init...');
        await liff.init({ liffId });
        console.log('✅ LIFF initialized successfully');
        setLiffObject(liff);

        const isLoggedIn = liff.isLoggedIn();
        console.log('🔐 LIFF login status:', isLoggedIn);

        if (isLoggedIn) {
          console.log('👤 Getting user profile...');
          setIsLoggedIn(true);
          const userProfile = await liff.getProfile();
          console.log('✅ User profile obtained:', userProfile);
          setProfile(userProfile);
        } else {
          console.log('🔑 User not logged in, calling liff.login()');
          liff.login();
        }
      } catch (err: any) {
        console.error('❌ LIFF initialization failed:', err);
        setError(err.message || 'Failed to initialize LIFF');
      } finally {
        console.log('🏁 LIFF initialization completed');
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [liffId]);

  return (
    <LiffContext.Provider
      value={{
        liffObject,
        isLoggedIn,
        profile,
        error,
        isLoading,
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}
