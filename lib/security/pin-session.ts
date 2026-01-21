import type { PinRole } from './pin';

type PinSession = {
  token: string;
  expiresAt: string;
};

function storageKey(role: PinRole, lineId: string) {
  return `pin_session:${role}:${lineId}`;
}

export function getPinSession(role: PinRole, lineId: string): PinSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(storageKey(role, lineId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PinSession;
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(storageKey(role, lineId));
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(storageKey(role, lineId));
    return null;
  }
}

export function setPinSession(role: PinRole, lineId: string, session: PinSession) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(storageKey(role, lineId), JSON.stringify(session));
}

export function clearPinSession(role: PinRole, lineId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(storageKey(role, lineId));
}
