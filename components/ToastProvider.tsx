'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { showToast, ToastKind } from '@/lib/ui/toast';

type ToastItem = {
  id: string;
  message: string;
  kind: ToastKind;
};

const TOAST_DURATION_MS = 3200;

const kindStyles: Record<ToastKind, string> = {
  info: 'bg-[#1F2937] text-white',
  success: 'bg-[#0F766E] text-white',
  error: 'bg-[#B91C1C] text-white',
};

export default function ToastProvider() {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    setMounted(true);
    const originalAlert = window.alert;

    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; kind?: ToastKind }>).detail;
      const message = detail?.message?.trim();
      if (!message) return;

      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const kind = detail?.kind ?? 'info';

      setToasts((prev) => [...prev, { id, message, kind }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, TOAST_DURATION_MS);
    };

    window.addEventListener('pawnly-toast', handleToast as EventListener);
    window.alert = (message?: string) => {
      showToast(String(message ?? ''), 'info');
    };

    return () => {
      window.removeEventListener('pawnly-toast', handleToast as EventListener);
      window.alert = originalAlert;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-5 left-1/2 z-[9999] w-[min(92vw,420px)] -translate-x-1/2 space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-xl ${kindStyles[toast.kind]}`}
        >
          <div className="text-sm leading-snug whitespace-pre-wrap">{toast.message}</div>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
            className="ml-auto rounded-full p-1 transition hover:bg-white/10"
            aria-label="ปิดข้อความแจ้งเตือน"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
