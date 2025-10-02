import type liff from '@line/liff';

declare global {
  interface Window {
    liff: typeof liff;
  }
}

export {};
