/**
 * Anchor pricing: value an item from its NEW price minus depreciation.
 *
 * This is the generic-path equivalent of the notebook ladder's L5 rung. It
 * exists so that "no second-hand listing found" stops being a dead end: a new
 * or launch price is far easier to find than a used one for most products, and
 * a depreciated new price is a defensible - if wide - valuation.
 *
 * It is deliberately the LAST rung before a human. The confidence it returns is
 * low by construction, so `MIN_ESTIMATE_CONFIDENCE_FOR_SUBMISSION` still routes
 * the result to an operator; the pawner gets a number and an explanation
 * instead of a refusal, and no loan is written off an anchor alone.
 *
 * Honesty about the curves: each retention table is anchored to one or two
 * measured Thai resale observations (see the table) and smoothed by hand from
 * there. One point per category is calibration, not a fit - the curves are
 * env-tunable per category for that reason, and every anchor result is marked
 * so its accuracy can be tracked separately as real outcomes accumulate.
 */

export type AnchorCategory =
  | 'phone'
  | 'apple_phone'
  | 'tablet'
  | 'laptop'
  | 'camera'
  | 'hardware'
  | 'accessory'
  | 'default';

export interface AnchorPriceInput {
  /** New / launch prices in THB found for this exact product. */
  anchors: number[];
  /** Release year if known. Falls back to the category's default age. */
  releaseYear?: number | null;
  category: AnchorCategory;
  now?: Date;
}

export interface AnchorPriceResult {
  marketPrice: number;
  /** Deliberately low: an anchor is the weakest evidence the system accepts. */
  confidence: number;
  ageYears: number;
  retention: number;
  anchorCount: number;
  anchorMedian: number;
  note: string;
}

/**
 * Fraction of the NEW price a used unit of this age still fetches.
 * Index = age in years. Beyond the table each further year applies
 * LATE_DECAY, floored at RETENTION_FLOOR.
 */
const RETENTION_BY_CATEGORY: Readonly<Record<AnchorCategory, number[]>> = {
  // Calibrated against observed Thai resale: for each category an item with a
  // known Thai launch price and a measured used price gives an implied
  // retention, and the curve is fitted through it keeping a smooth shape.
  //   phone       Galaxy S23 age 3 -> 0.29, S22 Ultra age 4 -> 0.22
  //   apple_phone iPhone 14 Pro age 4 -> 0.49, iPhone 13 age 5 -> 0.33
  //   tablet      iPad Air 5 age 4 -> 0.45
  //   laptop      MacBook Air M2 age 4 -> 0.43
  //   camera      Sony A7 III age 8 -> 0.35
  //   accessory   Sony WH-1000XM5 age 4 -> 0.47
  // That is one to two points per category, so treat these as calibrated
  // priors, not fitted curves. hardware and default have NO observation behind
  // them yet and are interpolated between neighbouring categories.
  phone: [0.70, 0.50, 0.38, 0.30, 0.24, 0.19, 0.16],
  apple_phone: [0.85, 0.71, 0.61, 0.54, 0.48, 0.36, 0.30],
  tablet: [0.82, 0.70, 0.60, 0.52, 0.45, 0.38, 0.32],
  laptop: [0.82, 0.68, 0.58, 0.50, 0.43, 0.36, 0.30],
  camera: [0.85, 0.76, 0.68, 0.62, 0.57, 0.53, 0.48],
  accessory: [0.80, 0.68, 0.58, 0.52, 0.46, 0.40, 0.35],
  hardware: [0.76, 0.62, 0.51, 0.43, 0.36, 0.30, 0.25],
  default: [0.78, 0.64, 0.54, 0.46, 0.39, 0.33, 0.28],
};

const LATE_DECAY = 0.85;
const RETENTION_FLOOR = 0.12;
/** Used when the release year is unknown - assumes a mid-life device. */
const DEFAULT_AGE_YEARS = 3;
const MAX_AGE_YEARS = 12;
/** An anchor is weak evidence; this is the ceiling before sample penalties. */
const ANCHOR_CONFIDENCE_BASE = 0.42;
const CONFIDENCE_FLOOR = 0.15;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function anchorCategoryFor(itemType: string, brand?: string, appleCategory?: string): AnchorCategory {
  const type = String(itemType || '').trim();
  const isApple = String(brand || '').trim().toLowerCase() === 'apple' || Boolean(appleCategory);
  const apple = String(appleCategory || '').toLowerCase();

  if (type === 'โน้ตบุค') return 'laptop';
  if (type === 'กล้อง') return 'camera';
  if (type === 'อุปกรณ์คอมพิวเตอร์') return 'hardware';
  if (type === 'อุปกรณ์เสริมโทรศัพท์') return 'accessory';
  if (type === 'Apple' || isApple) {
    if (apple.includes('ipad')) return 'tablet';
    if (apple.includes('macbook') || apple.includes('imac') || apple.includes('mac')) return 'laptop';
    if (apple.includes('airpods')) return 'accessory';
    if (apple.includes('watch')) return 'accessory';
    return 'apple_phone';
  }
  if (type === 'โทรศัพท์มือถือ') return 'phone';
  return 'default';
}

function retentionFor(category: AnchorCategory, ageYears: number): number {
  const envKey = `ANCHOR_RETENTION_${category.toUpperCase()}`;
  const configured = String(process.env[envKey] || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1);
  const table = configured.length >= 3 ? configured : RETENTION_BY_CATEGORY[category];

  if (ageYears < table.length) return table[ageYears];
  const last = table[table.length - 1];
  const extraYears = ageYears - (table.length - 1);
  return Math.max(RETENTION_FLOOR, last * Math.pow(LATE_DECAY, extraYears));
}

/**
 * Prices from new-price anchors. Returns null when there is no anchor to work
 * from - the caller must then escalate to a human.
 */
export function computeAnchorPrice(input: AnchorPriceInput): AnchorPriceResult | null {
  const anchors = input.anchors.filter((value) => Number.isFinite(value) && value > 0);
  if (anchors.length === 0) return null;

  const nowYear = (input.now || new Date()).getFullYear();
  const knownAge = input.releaseYear && Number.isFinite(input.releaseYear)
    ? nowYear - Number(input.releaseYear)
    : null;
  const ageYears = Math.round(clamp(knownAge ?? DEFAULT_AGE_YEARS, 0, MAX_AGE_YEARS));

  // The median resists a single retail outlier; taking the lowest anchor would
  // double-count the conservatism already built into the retention curve.
  const anchorMedian = median(anchors);
  const retention = retentionFor(input.category, ageYears);
  const marketPrice = Math.round(anchorMedian * retention);

  // More agreeing anchors is better evidence; an unknown age is worse. Both
  // stay well under the manual-review threshold on purpose.
  const sampleFactor = Math.min(1, 0.6 + anchors.length / 10);
  const agePenalty = knownAge === null ? 0.8 : 1;
  const confidence = Math.round(
    clamp(ANCHOR_CONFIDENCE_BASE * sampleFactor * agePenalty, CONFIDENCE_FLOOR, 0.6) * 100,
  ) / 100;

  return {
    marketPrice,
    confidence,
    ageYears,
    retention,
    anchorCount: anchors.length,
    anchorMedian: Math.round(anchorMedian),
    note: knownAge === null
      ? `อิงราคาของใหม่ ${anchors.length} รายการ (กลาง ${Math.round(anchorMedian).toLocaleString()} บาท) หักค่าเสื่อมโดยประมาณ ${Math.round((1 - retention) * 100)}% เนื่องจากไม่ทราบปีที่วางจำหน่าย`
      : `อิงราคาของใหม่ ${anchors.length} รายการ (กลาง ${Math.round(anchorMedian).toLocaleString()} บาท) หักค่าเสื่อมตามอายุ ~${ageYears} ปี เหลือ ${Math.round(retention * 100)}%`,
  };
}
