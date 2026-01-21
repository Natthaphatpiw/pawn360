import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';

export type PinRole = 'PAWNER' | 'INVESTOR' | 'DROP_POINT';

type PinCheckResult =
  | { ok: true; token?: string; expiresAt?: string }
  | { ok: false; status: number; payload: Record<string, any> };

export type PinStatusResult =
  | {
      ok: true;
      pinSet: boolean;
      failedAttempts: number;
      locked: boolean;
      lockedUntil: string | null;
      lockRemainingSeconds: number;
      pinUpdatedAt: string | null;
    }
  | { ok: false; status: number; payload: Record<string, any> };

const TOKEN_TTL_MS = 2 * 60 * 1000;
const LOCK_RULES = [
  { attempts: 5, minutes: 30 },
  { attempts: 3, minutes: 1 },
];

export function normalizeRole(role?: string): PinRole | null {
  if (!role) return null;
  const upper = role.toUpperCase();
  if (upper === 'PAWNER' || upper === 'INVESTOR' || upper === 'DROP_POINT') {
    return upper as PinRole;
  }
  return null;
}

export function isValidPin(pin?: string) {
  return typeof pin === 'string' && /^[0-9]{6}$/.test(pin);
}

function getLockUntil(attempts: number) {
  for (const rule of LOCK_RULES) {
    if (attempts >= rule.attempts) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + rule.minutes);
      return lockedUntil;
    }
  }
  return null;
}

function getRemainingSeconds(lockedUntil?: string | null) {
  if (!lockedUntil) return 0;
  const lockedAt = new Date(lockedUntil).getTime();
  const now = Date.now();
  if (lockedAt <= now) return 0;
  return Math.ceil((lockedAt - now) / 1000);
}

function normalizeDigits(value?: string | null) {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

async function fetchRoleIdentity(role: PinRole, lineId: string) {
  const supabase = supabaseAdmin();
  if (role === 'PAWNER') {
    return supabase
      .from('pawners')
      .select('customer_id, line_id, phone_number, national_id')
      .eq('line_id', lineId)
      .single();
  }
  if (role === 'INVESTOR') {
    return supabase
      .from('investors')
      .select('investor_id, line_id, phone_number, national_id, kyc_status')
      .eq('line_id', lineId)
      .single();
  }
  return supabase
    .from('drop_points')
    .select('drop_point_id, line_id, phone_number, drop_point_code')
    .eq('line_id', lineId)
    .single();
}

async function ensureSecurityRecord(role: PinRole, lineId: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('user_security')
    .select('*')
    .eq('role', role)
    .eq('line_id', lineId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const { data: created, error: insertError } = await supabase
      .from('user_security')
      .insert({
        role,
        line_id: lineId,
        failed_attempts: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      throw insertError;
    }
    return created;
  }

  if (data.locked_until) {
    const lockedAt = new Date(data.locked_until).getTime();
    if (lockedAt <= Date.now()) {
      const { data: cleared, error: clearError } = await supabase
        .from('user_security')
        .update({
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('security_id', data.security_id)
        .select('*')
        .single();

      if (clearError) {
        throw clearError;
      }
      return cleared;
    }
  }

  return data;
}

async function issuePinSessionToken(securityId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from('user_security')
    .update({
      pin_session_token: token,
      pin_session_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('security_id', securityId);

  if (error) {
    throw error;
  }

  return { token, expiresAt };
}

export async function getPinStatus(role: PinRole, lineId: string): Promise<PinStatusResult> {
  const { data: identity, error: identityError } = await fetchRoleIdentity(role, lineId);
  if (identityError || !identity) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'User not found' },
    };
  }

  const security = await ensureSecurityRecord(role, lineId);
  const locked = Boolean(security.locked_until && new Date(security.locked_until).getTime() > Date.now());
  return {
    ok: true,
    pinSet: Boolean(security.pin_hash),
    failedAttempts: security.failed_attempts || 0,
    locked,
    lockedUntil: security.locked_until,
    lockRemainingSeconds: getRemainingSeconds(security.locked_until),
    pinUpdatedAt: security.pin_updated_at,
  };
}

export async function setupPin(role: PinRole, lineId: string, pin: string) {
  if (!isValidPin(pin)) {
    return {
      ok: false,
      status: 400,
      payload: { error: 'PIN must be 6 digits' },
    } satisfies PinCheckResult;
  }

  const { data: identity, error: identityError } = await fetchRoleIdentity(role, lineId);
  if (identityError || !identity) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'User not found' },
    } satisfies PinCheckResult;
  }

  const security = await ensureSecurityRecord(role, lineId);
  if (security.pin_hash) {
    return {
      ok: false,
      status: 409,
      payload: { error: 'PIN already set', pinAlreadySet: true },
    } satisfies PinCheckResult;
  }

  const pinHash = await bcrypt.hash(pin, 10);
  const supabase = supabaseAdmin();

  const { data: updated, error } = await supabase
    .from('user_security')
    .update({
      pin_hash: pinHash,
      failed_attempts: 0,
      locked_until: null,
      pin_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('security_id', security.security_id)
    .select('*')
    .single();

  if (error || !updated) {
    return {
      ok: false,
      status: 500,
      payload: { error: 'Failed to set PIN' },
    } satisfies PinCheckResult;
  }

  const session = await issuePinSessionToken(updated.security_id);
  return { ok: true, token: session.token, expiresAt: session.expiresAt };
}

export async function verifyPinAndIssueToken(role: PinRole, lineId: string, pin: string) {
  if (!isValidPin(pin)) {
    return {
      ok: false,
      status: 400,
      payload: { error: 'PIN must be 6 digits' },
    } satisfies PinCheckResult;
  }

  const security = await ensureSecurityRecord(role, lineId);

  if (!security.pin_hash) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'PIN not set', pinSetupRequired: true },
    } satisfies PinCheckResult;
  }

  if (security.locked_until && new Date(security.locked_until).getTime() > Date.now()) {
    return {
      ok: false,
      status: 403,
      payload: {
        error: 'PIN locked',
        pinLocked: true,
        lockedUntil: security.locked_until,
        lockRemainingSeconds: getRemainingSeconds(security.locked_until),
      },
    } satisfies PinCheckResult;
  }

  const matched = await bcrypt.compare(pin, security.pin_hash);
  if (!matched) {
    const nextAttempts = (security.failed_attempts || 0) + 1;
    const lockedUntil = getLockUntil(nextAttempts);

    const supabase = supabaseAdmin();
    await supabase
      .from('user_security')
      .update({
        failed_attempts: nextAttempts,
        locked_until: lockedUntil ? lockedUntil.toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('security_id', security.security_id);

    return {
      ok: false,
      status: 401,
      payload: {
        error: 'Invalid PIN',
        pinInvalid: true,
        failedAttempts: nextAttempts,
        lockedUntil: lockedUntil?.toISOString() ?? null,
        lockRemainingSeconds: getRemainingSeconds(lockedUntil?.toISOString() ?? null),
      },
    } satisfies PinCheckResult;
  }

  const supabase = supabaseAdmin();
  await supabase
    .from('user_security')
    .update({
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('security_id', security.security_id);

  const session = await issuePinSessionToken(security.security_id);
  return { ok: true, token: session.token, expiresAt: session.expiresAt };
}

export async function resetPin(
  role: PinRole,
  lineId: string,
  pin: string,
  identity: { phoneNumber?: string; nationalId?: string; dropPointCode?: string }
) {
  if (!isValidPin(pin)) {
    return {
      ok: false,
      status: 400,
      payload: { error: 'PIN must be 6 digits' },
    } satisfies PinCheckResult;
  }

  const { data: user, error: userError } = await fetchRoleIdentity(role, lineId);
  if (userError || !user) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'User not found' },
    } satisfies PinCheckResult;
  }

  if (role === 'PAWNER' || role === 'INVESTOR') {
    if (!identity.phoneNumber || !identity.nationalId) {
      return {
        ok: false,
        status: 400,
        payload: { error: 'Identity verification required' },
      } satisfies PinCheckResult;
    }
    if (
      normalizeDigits(user.phone_number) !== normalizeDigits(identity.phoneNumber) ||
      normalizeDigits(user.national_id) !== normalizeDigits(identity.nationalId)
    ) {
      return {
        ok: false,
        status: 403,
        payload: { error: 'Identity verification failed' },
      } satisfies PinCheckResult;
    }
  } else {
    if (!identity.phoneNumber || !identity.dropPointCode) {
      return {
        ok: false,
        status: 400,
        payload: { error: 'Identity verification required' },
      } satisfies PinCheckResult;
    }
    if (
      normalizeDigits(user.phone_number) !== normalizeDigits(identity.phoneNumber) ||
      String(user.drop_point_code || '').trim().toUpperCase() !== String(identity.dropPointCode || '').trim().toUpperCase()
    ) {
      return {
        ok: false,
        status: 403,
        payload: { error: 'Identity verification failed' },
      } satisfies PinCheckResult;
    }
  }

  const security = await ensureSecurityRecord(role, lineId);
  const pinHash = await bcrypt.hash(pin, 10);
  const supabase = supabaseAdmin();

  const { data: updated, error } = await supabase
    .from('user_security')
    .update({
      pin_hash: pinHash,
      failed_attempts: 0,
      locked_until: null,
      pin_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('security_id', security.security_id)
    .select('*')
    .single();

  if (error || !updated) {
    return {
      ok: false,
      status: 500,
      payload: { error: 'Failed to reset PIN' },
    } satisfies PinCheckResult;
  }

  const session = await issuePinSessionToken(updated.security_id);
  return { ok: true, token: session.token, expiresAt: session.expiresAt };
}

export async function requirePinToken(role: PinRole, lineId: string, pinToken?: string): Promise<PinCheckResult> {
  if (!pinToken) {
    return {
      ok: false,
      status: 403,
      payload: { error: 'PIN required', pinRequired: true },
    };
  }

  const { data: identity, error: identityError } = await fetchRoleIdentity(role, lineId);
  if (identityError || !identity) {
    return {
      ok: false,
      status: 404,
      payload: { error: 'User not found' },
    };
  }

  const security = await ensureSecurityRecord(role, lineId);

  if (!security.pin_hash) {
    return {
      ok: false,
      status: 403,
      payload: { error: 'PIN not set', pinSetupRequired: true },
    };
  }

  if (security.locked_until && new Date(security.locked_until).getTime() > Date.now()) {
    return {
      ok: false,
      status: 403,
      payload: {
        error: 'PIN locked',
        pinLocked: true,
        lockedUntil: security.locked_until,
        lockRemainingSeconds: getRemainingSeconds(security.locked_until),
      },
    };
  }

  if (!security.pin_session_token || security.pin_session_token !== pinToken) {
    return {
      ok: false,
      status: 403,
      payload: { error: 'PIN required', pinRequired: true },
    };
  }

  if (!security.pin_session_expires_at || new Date(security.pin_session_expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      status: 403,
      payload: { error: 'PIN session expired', pinRequired: true },
    };
  }

  return { ok: true };
}
