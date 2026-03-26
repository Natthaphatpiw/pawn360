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
  statePath?: string;
}) => {
  if (typeof window === 'undefined') {
    return;
  }

  const liffId = resolveLiffId(...options.liffIdCandidates);
  const normalizedStatePath = normalizeCandidate(options.statePath);
  if (liffId) {
    const stateQuery = normalizedStatePath
      ? `?liff.state=${encodeURIComponent(normalizedStatePath)}`
      : '';
    window.location.assign(`https://liff.line.me/${liffId}${stateQuery}`);
    return;
  }

  window.location.assign(normalizedStatePath || options.fallbackPath);
};
