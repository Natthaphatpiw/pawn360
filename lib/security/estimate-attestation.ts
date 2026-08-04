import crypto from 'node:crypto';

import type {
  EstimateRequest,
  EstimateResponse,
} from '@/lib/services/estimate-pipeline';

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;
// An anchor-only price with a single reference and no known release year lands
// just under this, which is exactly the case that should be refused.
const DEFAULT_CONFIDENCE_FLOOR_TO_QUOTE = 0.25;
const DEFAULT_MIN_CONFIDENCE = 0.5;
const MAX_TOKEN_LENGTH = 4_096;

export class EstimateAttestationError extends Error {
  constructor(
    public readonly code:
      | 'ESTIMATE_ATTESTATION_CONFIG_MISSING'
      | 'ESTIMATE_ATTESTATION_REQUIRED'
      | 'ESTIMATE_ATTESTATION_INVALID'
      | 'ESTIMATE_ATTESTATION_EXPIRED'
      | 'ESTIMATE_INPUT_MISMATCH'
      | 'ESTIMATE_REQUIRES_MANUAL_REVIEW',
    public readonly status: 400 | 409 | 422 | 503,
  ) {
    super(code);
    this.name = 'EstimateAttestationError';
  }
}

export interface EstimateAttestationPayload {
  v: 1;
  referenceId: string;
  owner: string;
  input: string;
  estimatedPrice: number;
  /**
   * ราคากลาง - the representative second-hand market price the estimate was
   * derived from, before the 60% LTV factor and the condition adjustment.
   *
   * It rides in the signed token rather than being posted by the browser
   * because it is shown to investors as the collateral's market value. A
   * client-supplied number there would let a pawner inflate the collateral
   * figure that up to 500 investors use to decide whether to fund the loan.
   *
   * Null for manual-estimate items, which have no ราคากลาง by construction:
   * an operator supplies a final price and a condition score, not a market
   * survey. Also null for tokens issued before this field existed - hence
   * optional in validation rather than a TOKEN_VERSION bump, which would have
   * invalidated every estimate in flight for the token's whole TTL.
   */
  marketPrice: number | null;
  condition: number;
  aiCondition: number | null;
  confidence: number;
  issuedAt: number;
  expiresAt: number;
  source: 'AI' | 'MANUAL';
}

type EstimateInputLike = Partial<EstimateRequest> & {
  processor?: unknown;
  imageUrls?: unknown;
  appleAccessories?: unknown;
  notes?: unknown;
};

function secret(): string {
  const production = process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production';
  const value = String(
    process.env.ESTIMATE_ATTESTATION_SECRET
      || (!production ? process.env.AI_SAFETY_IDENTIFIER_SECRET : '')
      || '',
  ).trim();
  if (value.length < 32) {
    throw new EstimateAttestationError(
      'ESTIMATE_ATTESTATION_CONFIG_MISSING',
      503,
    );
  }
  return value;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 500);
}

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .sort();
}

function normalizeList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return values
    .map((item) => {
      if (typeof item === 'string') return normalizeText(item);
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return normalizeText([record.brand, record.model].filter(Boolean).join(' '));
      }
      return '';
    })
    .filter(Boolean)
    .sort()
    .slice(0, 20);
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function estimateInputFingerprint(input: EstimateInputLike): string {
  const payload = {
    itemType: normalizeText(input.itemType),
    brand: normalizeText(input.brand),
    model: normalizeText(input.model),
    capacity: normalizeText(input.capacity),
    color: normalizeText(input.color),
    screenSize: normalizeText(input.screenSize),
    watchSize: normalizeText(input.watchSize),
    watchConnectivity: normalizeText(input.watchConnectivity),
    cpu: normalizeText(input.cpu ?? input.processor),
    ram: normalizeText(input.ram),
    storage: normalizeText(input.storage),
    gpu: normalizeText(input.gpu),
    accessories: normalizeList(input.accessories ?? input.appleAccessories),
    defects: normalizeText(input.defects),
    note: normalizeText(input.note ?? input.notes),
    lenses: normalizeList(input.lenses),
    images: normalizeImages(input.images ?? input.imageUrls),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function ownerFingerprint(lineId: string, signingSecret: string): string {
  return crypto
    .createHmac('sha256', signingSecret)
    .update(`owner:${lineId.trim()}`)
    .digest('hex');
}

function sign(encodedPayload: string, signingSecret: string): string {
  return crypto
    .createHmac('sha256', signingSecret)
    .update(encodedPayload)
    .digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function ttlSeconds(): number {
  const parsed = Number(process.env.ESTIMATE_ATTESTATION_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed >= 300 && parsed <= 24 * 60 * 60
    ? Math.floor(parsed)
    : DEFAULT_TTL_SECONDS;
}

export function getMinimumEstimateConfidence(): number {
  const parsed = Number(process.env.MIN_ESTIMATE_CONFIDENCE_FOR_SUBMISSION);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_MIN_CONFIDENCE;
}

export function estimateRequiresManualReview(confidence: number): boolean {
  return !Number.isFinite(confidence)
    || confidence < getMinimumEstimateConfidence();
}

/**
 * Below this the platform declines to quote at all.
 *
 * Between this floor and MIN_ESTIMATE_CONFIDENCE_FOR_SUBMISSION the estimate is
 * shown but needs an operator to confirm it. Below the floor the evidence is so
 * thin that publishing a number would invite a loan against collateral we
 * cannot value - the investor carries that risk, so the safe answer is to stop
 * and hand the item to a human rather than guess.
 */
export function getConfidenceFloorToQuote(): number {
  const parsed = Number(process.env.MIN_ESTIMATE_CONFIDENCE_TO_QUOTE);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_CONFIDENCE_FLOOR_TO_QUOTE;
}

export function estimateTooUncertainToQuote(confidence: number): boolean {
  return !Number.isFinite(confidence) || confidence < getConfidenceFloorToQuote();
}

export function issueEstimateAttestation(input: {
  referenceId: string;
  lineId: string;
  request: EstimateInputLike;
  result: Pick<EstimateResponse, 'estimatedPrice' | 'condition' | 'confidence'>
    & { marketPrice?: number | null };
  aiCondition?: unknown;
  source?: 'AI' | 'MANUAL';
}): string {
  const signingSecret = secret();
  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload: EstimateAttestationPayload = {
    v: TOKEN_VERSION,
    referenceId: input.referenceId,
    owner: ownerFingerprint(input.lineId, signingSecret),
    input: estimateInputFingerprint(input.request),
    estimatedPrice: Math.round(finite(input.result.estimatedPrice)),
    marketPrice: Number.isFinite(Number(input.result.marketPrice)) && Number(input.result.marketPrice) > 0
      ? Math.round(Number(input.result.marketPrice))
      : null,
    condition: Math.min(1, Math.max(0, finite(input.result.condition))),
    aiCondition: input.aiCondition === null || input.aiCondition === undefined
      ? null
      : Math.min(1, Math.max(0, finite(input.aiCondition))),
    confidence: Math.min(1, Math.max(0, finite(input.result.confidence))),
    issuedAt,
    expiresAt: issuedAt + ttlSeconds(),
    source: input.source || 'AI',
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded, signingSecret)}`;
}

function payloadIsValid(value: unknown): value is EstimateAttestationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<EstimateAttestationPayload>;
  return payload.v === TOKEN_VERSION
    && typeof payload.referenceId === 'string'
    && /^[0-9a-f-]{16,64}$/i.test(payload.referenceId)
    && typeof payload.owner === 'string'
    && /^[a-f0-9]{64}$/.test(payload.owner)
    && typeof payload.input === 'string'
    && /^[a-f0-9]{64}$/.test(payload.input)
    && Number.isFinite(payload.estimatedPrice)
    && Number(payload.estimatedPrice) > 0
    // Optional on purpose: tokens issued before this field existed must keep
    // verifying, so absent and null are both accepted.
    && (payload.marketPrice === null
      || payload.marketPrice === undefined
      || (Number.isFinite(payload.marketPrice) && Number(payload.marketPrice) > 0))
    && Number.isFinite(payload.condition)
    && Number(payload.condition) >= 0
    && Number(payload.condition) <= 1
    && (payload.aiCondition === null
      || (Number.isFinite(payload.aiCondition) && Number(payload.aiCondition) >= 0 && Number(payload.aiCondition) <= 1))
    && Number.isFinite(payload.confidence)
    && Number(payload.confidence) >= 0
    && Number(payload.confidence) <= 1
    && Number.isInteger(payload.issuedAt)
    && Number.isInteger(payload.expiresAt)
    && (payload.source === 'AI' || payload.source === 'MANUAL');
}

export function verifyEstimateAttestation(
  token: unknown,
  options: { lineId: string; itemData: EstimateInputLike },
): EstimateAttestationPayload {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_REQUIRED', 400);
  }
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_INVALID', 400);
  }

  const signingSecret = secret();
  if (!safeEqual(signature, sign(encoded, signingSecret))) {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_INVALID', 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_INVALID', 400);
  }
  if (!payloadIsValid(parsed)) {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_INVALID', 400);
  }

  const now = Math.floor(Date.now() / 1_000);
  if (parsed.expiresAt <= now || parsed.issuedAt > now + 60) {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_EXPIRED', 409);
  }
  if (!safeEqual(parsed.owner, ownerFingerprint(options.lineId, signingSecret))) {
    throw new EstimateAttestationError('ESTIMATE_ATTESTATION_INVALID', 400);
  }
  if (!safeEqual(parsed.input, estimateInputFingerprint(options.itemData))) {
    throw new EstimateAttestationError('ESTIMATE_INPUT_MISMATCH', 409);
  }
  // No confidence gate here any more. A low-confidence estimate is not a
  // reason to block a pawn request: the pricing ladder now always produces a
  // number - live market evidence, then the new-price anchor, then a fixed
  // floor price set below the lowest observed p20 for the model - so the
  // quote is safe to lend against at every rung. The investor still sees the
  // collateral value on the offer and decides for themselves whether to fund
  // it, which is where that judgement belongs. Blocking here instead left the
  // pawner on a dead form with no way forward.
  // Tokens predating marketPrice verify with the field absent. Normalise it to
  // null here so every caller sees one shape and cannot accidentally write
  // `undefined` into a numeric column.
  return { ...parsed, marketPrice: parsed.marketPrice ?? null };
}

export function estimateAttestationErrorResponse(error: EstimateAttestationError) {
  const message = error.code === 'ESTIMATE_ATTESTATION_CONFIG_MISSING'
    ? 'ระบบยืนยันราคาประเมินยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง'
    : error.code === 'ESTIMATE_ATTESTATION_EXPIRED'
      ? 'ราคาประเมินหมดอายุแล้ว กรุณาประเมินสินค้าใหม่อีกครั้ง'
      : error.code === 'ESTIMATE_INPUT_MISMATCH'
        ? 'ข้อมูลสินค้าเปลี่ยนจากตอนประเมิน กรุณาประเมินสินค้าใหม่อีกครั้ง'
        : error.code === 'ESTIMATE_REQUIRES_MANUAL_REVIEW'
          ? 'ข้อมูลราคาตลาดยังมีความเชื่อมั่นไม่เพียงพอ กรุณารอเจ้าหน้าที่ตรวจสอบราคา'
          : 'ไม่สามารถยืนยันราคาประเมินได้ กรุณาประเมินสินค้าใหม่อีกครั้ง';
  return {
    error: message,
    code: error.code.toLowerCase(),
    retryable: error.status === 503,
  };
}
