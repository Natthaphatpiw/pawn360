const STORAGE_KEY = 'pawner_estimate_resume_v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PawnerEstimateResume = {
  lineId: string;
  draftId: string;
  createdAt: string;
  returnAfterVerify: boolean;
};

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export const getPawnerEstimateResume = (lineId?: string | null): PawnerEstimateResume | null => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PawnerEstimateResume;
    if (!parsed?.lineId || !parsed?.draftId || !parsed?.createdAt) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const createdAtMs = new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (lineId && parsed.lineId !== lineId) {
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const savePawnerEstimateResume = (resume: PawnerEstimateResume) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
};

export const clearPawnerEstimateResume = (lineId?: string | null) => {
  if (!canUseStorage()) return;
  const current = getPawnerEstimateResume();
  if (!lineId || current?.lineId === lineId) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
};
