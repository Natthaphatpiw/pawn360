'use client';

export function getLiffAuthorizationHeaders(liffObject: { getIDToken: () => string | null } | null) {
  const idToken = liffObject?.getIDToken();
  if (!idToken) throw new Error('LIFF_ID_TOKEN_UNAVAILABLE');
  return { Authorization: `Bearer ${idToken}` };
}
