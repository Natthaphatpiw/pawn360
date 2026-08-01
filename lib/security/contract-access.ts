import { ObjectId, type Db, type Document } from 'mongodb';
import { LiffAuthError, requireLiffIdentity, type LiffRole } from '@/lib/security/liff-auth';
import { requireLiffOwner } from '@/lib/security/request-auth';

type ContractPartyRole = Extract<LiffRole, 'PAWNER' | 'INVESTOR'>;

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function localMockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_LIFF_MOCK === 'true';
}

/**
 * Binds a Supabase contract/action record to the authenticated LINE subject.
 * The owner is always read from the database relation, never request data.
 */
export async function requireContractParty(
  request: Request,
  contract: Record<string, unknown> | null | undefined,
  role: ContractPartyRole,
): Promise<string> {
  const relation = role === 'INVESTOR'
    ? relationOne(contract?.investors as Record<string, unknown> | Record<string, unknown>[] | null)
    : relationOne(contract?.pawners as Record<string, unknown> | Record<string, unknown>[] | null);
  const ownerLineId = typeof relation?.line_id === 'string' ? relation.line_id.trim() : '';

  if (!ownerLineId) {
    // Do not reveal whether a contract exists but is missing a party relation.
    throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
  }

  return requireLiffOwner(request, role, ownerLineId);
}

/**
 * Authorizes a store employee against the Mongo store membership list. The
 * store id may identify a resource, but the LIFF subject is the authority.
 */
export async function requireStoreMembership(
  request: Request,
  db: Db,
  storeId: unknown,
): Promise<{ lineId: string; store: Document }> {
  const normalizedStoreId = String(storeId || '').trim();
  if (!ObjectId.isValid(normalizedStoreId)) {
    throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
  }

  const store = await db.collection('stores').findOne(
    { _id: new ObjectId(normalizedStoreId), isActive: { $ne: false } },
    { projection: { _id: 1, storeName: 1, lineIds: 1 } },
  );
  const allowedLineIds = Array.isArray(store?.lineIds)
    ? store.lineIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];

  if (!store || allowedLineIds.length === 0) {
    throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
  }

  if (localMockAllowed()) {
    return { lineId: allowedLineIds[0], store };
  }

  const identity = await requireLiffIdentity(request, 'STORE');
  if (!allowedLineIds.includes(identity.lineId)) {
    throw new LiffAuthError('CONTRACT_ACCESS_DENIED', 403);
  }

  return { lineId: identity.lineId, store };
}

