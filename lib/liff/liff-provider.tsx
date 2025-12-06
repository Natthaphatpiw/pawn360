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
      try {
        if (!liffId) {
          throw new Error('LIFF ID is not provided');
        }

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
