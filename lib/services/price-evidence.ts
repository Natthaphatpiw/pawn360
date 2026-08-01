import crypto from 'node:crypto';

export type PriceEvidenceCurrency = 'THB' | 'USD';

export interface PriceEvidenceMatch {
  amount: number;
  currency: PriceEvidenceCurrency;
  priceThb: number;
  evidenceText: string;
  fingerprint: string;
}

export interface PriceOutlierPartition<T> {
  accepted: T[];
  quarantined: T[];
}

const MAX_EVIDENCE_TEXT_LENGTH = 8_000;
const MIN_PRICE = 1;
const MAX_PRICE_THB = 100_000_000;
const GENERIC_IDENTITY_TOKENS = new Set([
  'laptop', 'notebook', 'computer', 'โน้ตบุ๊ก', 'โน้ตบุค', 'คอมพิวเตอร์',
]);

function normalizedEvidenceText(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EVIDENCE_TEXT_LENGTH);
}

function parseMoneyNumber(raw: string): number | null {
  const compact = raw.replace(/\s/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  const value = Number(compact.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value >= MIN_PRICE ? value : null;
}

function toThb(amount: number, currency: PriceEvidenceCurrency, exchangeRate: number): number {
  const value = currency === 'USD' ? amount * exchangeRate : amount;
  return Math.round(value * 100) / 100;
}

function fingerprint(text: string, amount: number, currency: PriceEvidenceCurrency): string {
  return crypto
    .createHash('sha256')
    .update(`${currency}|${amount}|${text.toLowerCase()}`)
    .digest('hex');
}

function collectMatches(
  text: string,
  pattern: RegExp,
  currency: PriceEvidenceCurrency,
  exchangeRate: number,
  output: PriceEvidenceMatch[],
): void {
  for (const match of text.matchAll(pattern)) {
    const rawAmount = match.groups?.amount || match[1] || '';
    const amount = parseMoneyNumber(rawAmount);
    if (amount === null) continue;
    const priceThb = toThb(amount, currency, exchangeRate);
    if (!Number.isFinite(priceThb) || priceThb <= 0 || priceThb > MAX_PRICE_THB) continue;
    const evidenceText = String(match[0] || '').trim().slice(0, 200);
    output.push({
      amount,
      currency,
      priceThb,
      evidenceText,
      fingerprint: fingerprint(evidenceText, amount, currency),
    });
  }
}

/**
 * Extracts only explicitly-priced values. Bare model/storage/year numbers are
 * deliberately ignored; a number must have a currency marker or Thai price
 * context. This is the deterministic boundary after an LLM extraction.
 */
export function extractExplicitPriceEvidence(
  values: Array<string | null | undefined>,
  exchangeRate: number,
): PriceEvidenceMatch[] {
  const text = normalizedEvidenceText(values);
  if (!text || !Number.isFinite(exchangeRate) || exchangeRate <= 0) return [];

  const output: PriceEvidenceMatch[] = [];
  // The digit guards stop a longer identifier (order id, IMEI, 9+ digit number)
  // from being truncated into a plausible-looking price. Without them
  // "999999999 บาท" would silently yield 99,999,999 THB of "evidence".
  const number = '(?<![\\d.,])(?<amount>\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d{2,8}(?:\\.\\d{1,2})?)(?!\\d)';

  collectMatches(text, new RegExp(`(?:฿|THB\\s*)${number}`, 'giu'), 'THB', exchangeRate, output);
  collectMatches(text, new RegExp(`${number}\\s*(?:บาท|THB|฿)`, 'giu'), 'THB', exchangeRate, output);
  collectMatches(text, new RegExp(`(?:ราคา(?:ขาย)?|ราคาเพียง)\\s*[:=~-]?\\s*${number}`, 'giu'), 'THB', exchangeRate, output);
  collectMatches(text, new RegExp(`(?:US\\$|USD\\s*|\\$)${number}`, 'giu'), 'USD', exchangeRate, output);
  collectMatches(text, new RegExp(`${number}\\s*(?:USD|US\\$)`, 'giu'), 'USD', exchangeRate, output);

  const seen = new Set<string>();
  return output.filter((candidate) => {
    const key = `${candidate.currency}:${candidate.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pricesClose(left: number, right: number): boolean {
  const tolerance = Math.max(2, Math.min(left, right) * 0.015);
  return Math.abs(left - right) <= tolerance;
}

/** Accepts an extracted THB value only when source text independently proves it. */
export function validateExtractedPriceThb(
  priceThb: number,
  values: Array<string | null | undefined>,
  exchangeRate: number,
): PriceEvidenceMatch | null {
  if (!Number.isFinite(priceThb) || priceThb <= 0 || priceThb > MAX_PRICE_THB) return null;
  return extractExplicitPriceEvidence(values, exchangeRate)
    .find((candidate) => pricesClose(candidate.priceThb, priceThb)) || null;
}

/**
 * Resolves a provider's structured price without assuming its currency.
 * Currency must be explicit in the provider field or price text.
 */
export function resolveStructuredPriceEvidence(input: {
  extractedPrice?: unknown;
  priceText?: unknown;
  currencyHint?: unknown;
  title?: unknown;
  excerpt?: unknown;
  exchangeRate: number;
}): PriceEvidenceMatch | null {
  const priceText = typeof input.priceText === 'string' ? input.priceText : '';
  const title = typeof input.title === 'string' ? input.title : '';
  const excerpt = typeof input.excerpt === 'string' ? input.excerpt : '';
  const hint = String(input.currencyHint || '').trim().toUpperCase();
  const extracted = typeof input.extractedPrice === 'number'
    ? input.extractedPrice
    : Number(input.extractedPrice);
  const evidence = extractExplicitPriceEvidence([priceText, title, excerpt], input.exchangeRate);

  if (Number.isFinite(extracted) && extracted > 0) {
    const explicitCurrency: PriceEvidenceCurrency | null = /^(THB|฿|BAHT)$/.test(hint)
      ? 'THB'
      : /^(USD|US\$|\$)$/.test(hint)
        ? 'USD'
        : null;
    if (explicitCurrency) {
      const priceThb = toThb(extracted, explicitCurrency, input.exchangeRate);
      const textProof = evidence.find((candidate) => (
        candidate.currency === explicitCurrency && pricesClose(candidate.amount, extracted)
      ));
      if (textProof) return textProof;
      // A provider-owned price field plus an explicit provider currency field
      // is deterministic evidence even when the formatted field omits a sign.
      if (priceText && new RegExp(String(extracted).replace('.', '\\.')).test(priceText.replace(/,/g, ''))) {
        const evidenceText = priceText.slice(0, 200);
        return {
          amount: extracted,
          currency: explicitCurrency,
          priceThb,
          evidenceText,
          fingerprint: fingerprint(evidenceText, extracted, explicitCurrency),
        };
      }
      return null;
    }
    return evidence.find((candidate) => pricesClose(candidate.amount, extracted)) || null;
  }

  return evidence[0] || null;
}

function identityTokens(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^a-z0-9ก-๙]+/)
    .filter((token) => token.length >= 2 && !GENERIC_IDENTITY_TOKENS.has(token));
}

function provesIdentityPart(titleTokens: Set<string>, titleCompact: string, value: string): boolean {
  const expected = identityTokens(value);
  if (expected.length === 0) return false;
  if (expected.every((token) => titleTokens.has(token))) return true;

  // Handles joined product names such as "MacBookAir" without allowing very
  // short brand tokens (for example HP) to match inside unrelated words.
  const compactExpected = expected.join('');
  return compactExpected.length >= 4 && titleCompact.includes(compactExpected);
}

/**
 * Proves that a listing title itself names the requested brand and family.
 * Excerpts and LLM labels are deliberately not enough because only the title
 * is persisted and can be independently revalidated on historical reuse.
 */
export function hasDeterministicProductIdentity(
  listingTitle: string,
  brand: string,
  family: string,
): boolean {
  const titleTokensList = identityTokens(listingTitle);
  if (titleTokensList.length === 0) return false;
  const titleTokens = new Set(titleTokensList);
  const titleCompact = titleTokensList.join('');
  return provesIdentityPart(titleTokens, titleCompact, brand)
    && provesIdentityPart(titleTokens, titleCompact, family);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Robustly quarantines extreme prices before they can strengthen a pool. */
export function partitionPriceOutliers<T>(
  items: T[],
  getPrice: (item: T) => number,
): PriceOutlierPartition<T> {
  const valid = items.filter((item) => {
    const price = getPrice(item);
    return Number.isFinite(price) && price > 0;
  });
  if (valid.length < 4) return { accepted: valid, quarantined: [] };

  const prices = valid.map(getPrice);
  const center = median(prices);
  const mad = median(prices.map((price) => Math.abs(price - center)));
  const accepted: T[] = [];
  const quarantined: T[] = [];

  for (const item of valid) {
    const price = getPrice(item);
    const ratio = center > 0 ? price / center : Number.POSITIVE_INFINITY;
    const robustZ = mad > 0 ? Math.abs(price - center) / (1.4826 * mad) : 0;
    const extremeRatio = ratio < 0.35 || ratio > 2.85;
    const extremeDeviation = mad > 0 && robustZ > 4.5;
    (extremeRatio || extremeDeviation ? quarantined : accepted).push(item);
  }
  return { accepted, quarantined };
}
