const normalizeCandidate = (candidate?: string | null): string | null => {
  const trimmed = (candidate || '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const resolveLiffId = (...candidates: Array<string | undefined | null>): string | null => {
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export const openLiffEntry = (options: {
  liffIdCandidates: Array<string | undefined | null>;
  fallbackPath: string;
}) => {
  if (typeof window === 'undefined') {
    return;
  }

  const liffId = resolveLiffId(...options.liffIdCandidates);
  if (liffId) {
    window.location.assign(`https://liff.line.me/${liffId}`);
    return;
  }

  window.location.assign(options.fallbackPath);
};
