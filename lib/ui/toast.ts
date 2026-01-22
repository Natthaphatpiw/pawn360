export type ToastKind = 'info' | 'success' | 'error';

export function showToast(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return;
  const detail = { message, kind };
  window.dispatchEvent(new CustomEvent('pawnly-toast', { detail }));
}
