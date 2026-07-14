// Notebook (laptop) market-price engine: comps + multiplicative adjustments.
//
// Pure functions — no network/DB access — so the whole ladder is unit-testable
// offline (scripts/notebook-pricing-test.ts). The orchestration (web-search
// harvest, SerpAPI, observations DB) lives in app/api/estimate/route.ts.
// Method doc: NOTEBOOK_PRICING.md.

import { computeRepresentativeUsedPriceTHB } from '@/lib/services/price-representative';
import {
  GpuClass,
  NotebookSpec,
  ResolvedCpu,
  ResolvedGpu,
  StorageType,
  parseRamGb,
  parseStorage,
  resolveCpu,
  resolveGpu,
} from '@/lib/services/notebook-spec';

export type ListingKind = 'used' | 'new_current' | 'launch_msrp';
export type MatchTier = 'exact' | 'family' | 'same_brand' | 'cross_brand';
export type ListingOrigin = 'web_search' | 'serpapi' | 'observation';

export interface NotebookListingInput {
  title: string;
  price_thb: number;
  source?: string | null;
  url?: string | null;
  listing_kind: ListingKind;
  match?: MatchTier | null;
  cpu?: string | null;
  ram_gb?: number | null;
  storage_gb?: number | null;
  storage_type?: string | null;
  gpu?: string | null;
  condition_note?: string | null;
  origin: ListingOrigin;
}

export interface NotebookPricingConfig {
  cpuElasticity: number;
  gpuElasticity: number;
  cpuFactorClamp: [number, number];
  gpuFactorClamp: [number, number];
  cpuExactRatioTolerance: number;
  ramFactorPoints: Array<[number, number]>; // [GB, factor]
  storageSizeFactorPoints: Array<[number, number]>;
  storageTypeFactors: Record<StorageType, number>;
  panelFactors: Record<'tn' | 'ips' | 'oled', number>;
  highRefreshFactor: number;
  yearFactorPerYear: number;
  yearDiffClamp: number;
  gpuClassMults: Record<GpuClass, number>;
  brandTiers: Record<string, number>;
  brandTierDefault: number;
  totalAdjustmentCap: [number, number];
  minListingPriceThb: number;
  maxListingPriceThb: number;
  badListingKeywords: string[];
  ladderMinExact: number; // L1
  ladderMinPool: number; // L2/L3
  tierWeights: Record<MatchTier, number>;
  newCurrentBaseFactor: number;
  newCurrentPerYearDrop: number;
  newCurrentMaxAgeYears: number;
  retentionByAge: number[]; // index = age in years
  retentionLateDecay: number;
  retentionFloor: number;
  segmentRetentionAdj: Record<string, number>;
  defaultAgeYears: number;
  anchorGuardBand: [number, number];
  anchorClampConfidencePenalty: number;
  confidenceBase: Record<NotebookPricingLevel, number>;
  confidenceClamp: [number, number];
}

export type NotebookPricingLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export const DEFAULT_NOTEBOOK_PRICING_CONFIG: NotebookPricingConfig = {
  cpuElasticity: 0.35,
  gpuElasticity: 0.4,
  cpuFactorClamp: [0.7, 1.45],
  gpuFactorClamp: [0.65, 1.55],
  cpuExactRatioTolerance: 0.12,
  ramFactorPoints: [
    [4, 0.9],
    [8, 1.0],
    [16, 1.15],
    [32, 1.3],
    [64, 1.4],
  ],
  storageSizeFactorPoints: [
    [128, 0.95],
    [256, 1.0],
    [512, 1.06],
    [1024, 1.14],
    [2048, 1.22],
  ],
  storageTypeFactors: { hdd: 0.92, sata: 1.0, nvme: 1.03 },
  panelFactors: { tn: 0.98, ips: 1.0, oled: 1.06 },
  highRefreshFactor: 1.03,
  yearFactorPerYear: 1.04,
  yearDiffClamp: 3,
  gpuClassMults: { integrated: 1.0, entry: 1.08, mid: 1.22, high: 1.38, ultra: 1.55 },
  brandTiers: {
    apple: 1.15,
    microsoft: 1.05,
    dell: 1.0,
    hp: 1.0,
    lenovo: 1.0,
    asus: 1.0,
    acer: 1.0,
    msi: 1.0,
    samsung: 1.0,
    lg: 1.0,
    huawei: 1.0,
    razer: 1.05,
  },
  brandTierDefault: 0.95,
  totalAdjustmentCap: [0.62, 1.6],
  minListingPriceThb: 800,
  maxListingPriceThb: 500000,
  badListingKeywords: [
    'อะไหล่', 'ซาก', 'จอแตก', 'จอเสีย', 'เครื่องเสีย', 'เปิดไม่ติด', 'เมนบอร์ดเสีย', 'ขายเป็นอะไหล่',
    'for parts', 'parts only', 'broken', 'not working', 'spares or repair',
  ],
  ladderMinExact: 3,
  ladderMinPool: 3,
  tierWeights: { exact: 3, family: 2, same_brand: 1.5, cross_brand: 1 },
  newCurrentBaseFactor: 0.78,
  newCurrentPerYearDrop: 0.03,
  newCurrentMaxAgeYears: 4,
  retentionByAge: [0.82, 0.65, 0.52, 0.42, 0.34, 0.28, 0.23],
  retentionLateDecay: 0.85,
  retentionFloor: 0.15,
  segmentRetentionAdj: { office: 0.95, workstation: 0.9, gaming: 1.0, ultrabook: 1.0 },
  defaultAgeYears: 4,
  anchorGuardBand: [0.55, 1.2],
  anchorClampConfidencePenalty: 0.85,
  confidenceBase: { L1: 0.88, L2: 0.78, L3: 0.65, L4: 0.55, L5: 0.45 },
  confidenceClamp: [0.2, 0.95],
};

export interface AdjustedComp {
  listing: NotebookListingInput;
  tier: MatchTier;
  adjustedPrice: number;
  totalFactor: number;
  breakdown: Record<string, number>;
  unknowns: number;
}

export interface NotebookPricingResult {
  marketPrice: number;
  level: NotebookPricingLevel;
  confidence: number;
  usedCompCount: number;
  anchorCount: number;
  dispersionScore: number | null;
  clampedByAnchor: boolean;
  anchorValue: number | null;
  notes: string[];
  comps: AdjustedComp[];
  droppedComps: number;
}

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const median = (xs: number[]): number => {
  const arr = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
};

// Piecewise-linear interpolation in log2 space over [value, factor] points.
const interpolateLog2 = (points: Array<[number, number]>, value: number): number => {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (value <= sorted[0][0]) return sorted[0][1];
  if (value >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];
  const x = Math.log2(value);
  for (let i = 1; i < sorted.length; i++) {
    const [v0, f0] = sorted[i - 1];
    const [v1, f1] = sorted[i];
    if (value <= v1) {
      const x0 = Math.log2(v0);
      const x1 = Math.log2(v1);
      const t = (x - x0) / (x1 - x0);
      return f0 + t * (f1 - f0);
    }
  }
  return sorted[sorted.length - 1][1];
};

// ---------------------------------------------------------------------------
// Listing config resolution & sanitation
// ---------------------------------------------------------------------------

interface ResolvedListingConfig {
  cpu: ResolvedCpu;
  gpu: ResolvedGpu;
  ramGb: number | null;
  storageGb: number | null;
  storageType: StorageType | null;
}

// Thai sellers often write configs as "8/512" or "16/512GB" in listing titles.
const parseRamStorageShorthand = (title: string): { ramGb: number | null; storageGb: number | null } => {
  const match = title.match(/(\d{1,2})\s*\/\s*(\d{3,4})/);
  if (!match) return { ramGb: null, storageGb: null };
  const ram = Number(match[1]);
  const storage = Number(match[2]);
  return {
    ramGb: ram >= 2 && ram <= 64 ? ram : null,
    storageGb: storage >= 120 && storage <= 4096 ? storage : null,
  };
};

export function resolveListingConfig(listing: NotebookListingInput): ResolvedListingConfig {
  const shorthand = parseRamStorageShorthand(listing.title || '');

  const cpu = resolveCpu(listing.cpu || listing.title);
  const gpu = resolveGpu(listing.gpu || listing.title);

  const ramGb =
    listing.ram_gb && listing.ram_gb > 0 && listing.ram_gb <= 256
      ? listing.ram_gb
      : shorthand.ramGb ?? parseRamGb(listing.title);

  let storageGb: number | null = null;
  let storageType: StorageType | null = null;
  if (listing.storage_gb && listing.storage_gb >= 16 && listing.storage_gb <= 16384) {
    storageGb = listing.storage_gb;
  } else if (shorthand.storageGb) {
    storageGb = shorthand.storageGb;
  } else {
    const parsed = parseStorage(listing.title);
    storageGb = parsed.sizeGb;
    storageType = parsed.type;
  }
  if (listing.storage_type && ['nvme', 'sata', 'hdd'].includes(listing.storage_type)) {
    storageType = listing.storage_type as StorageType;
  }

  return { cpu, gpu, ramGb: ramGb ?? null, storageGb, storageType };
}

const isBadListing = (listing: NotebookListingInput, cfg: NotebookPricingConfig): boolean => {
  if (!Number.isFinite(listing.price_thb)) return true;
  if (listing.price_thb < cfg.minListingPriceThb || listing.price_thb > cfg.maxListingPriceThb) return true;
  const haystack = `${listing.title || ''} ${listing.condition_note || ''}`.toLowerCase();
  return cfg.badListingKeywords.some((k) => haystack.includes(k.toLowerCase()));
};

// ---------------------------------------------------------------------------
// Tier classification (never trust the harvest LLM's label upward)
// ---------------------------------------------------------------------------

const TIER_ORDER: MatchTier[] = ['exact', 'family', 'same_brand', 'cross_brand'];
const tierRank = (tier: MatchTier) => TIER_ORDER.indexOf(tier);

function classifyTier(
  target: NotebookSpec,
  config: ResolvedListingConfig,
  labeled: MatchTier | null | undefined,
  cfg: NotebookPricingConfig
): MatchTier {
  const llmTier: MatchTier = labeled && TIER_ORDER.includes(labeled) ? labeled : 'family';

  // Config-level verification: can this listing really be "exact"?
  let cpuMatch: boolean | null = null;
  if (target.cpuScore && config.cpu.score && target.cpuScoreSource !== 'unknown' && config.cpu.source !== 'unknown') {
    const ratio = config.cpu.score / target.cpuScore;
    cpuMatch = Math.abs(ratio - 1) <= cfg.cpuExactRatioTolerance;
  }

  const ramMatch: boolean | null =
    target.ramGb && config.ramGb ? target.ramGb === config.ramGb : null;
  const storageMatch: boolean | null =
    target.storageGb && config.storageGb ? target.storageGb === config.storageGb : null;
  const gpuMatch: boolean | null =
    target.gpuScoreSource !== 'unknown' && config.gpu.source !== 'unknown'
      ? target.gpuClass === config.gpu.gpuClass
      : null;

  const canBeExact = cpuMatch !== false && ramMatch !== false && storageMatch !== false && gpuMatch !== false;

  // A spec-blind target (no usable CPU score, no RAM, no storage) can't verify
  // any "exact" claim — cap such listings at family so a junk-spec input can
  // never assemble a fake high-confidence L1 out of generic listings.
  const targetBlind =
    (!target.cpuScore || target.cpuScoreSource === 'unknown') && !target.ramGb && !target.storageGb;

  let computedFloor: MatchTier = 'exact';
  if (!canBeExact || targetBlind) computedFloor = 'family';

  // Demote-only: final tier is the weaker of the LLM label and our verification.
  return TIER_ORDER[Math.max(tierRank(llmTier), tierRank(computedFloor))];
}

// ---------------------------------------------------------------------------
// Per-comp multiplicative adjustment
// ---------------------------------------------------------------------------

const listingBrandTier = (listing: NotebookListingInput, cfg: NotebookPricingConfig): number => {
  const title = (listing.title || '').toLowerCase();
  for (const [brand, tier] of Object.entries(cfg.brandTiers)) {
    if (title.includes(brand)) return tier;
  }
  return cfg.brandTierDefault;
};

const targetBrandTier = (target: NotebookSpec, cfg: NotebookPricingConfig): number => {
  const brand = (target.brand || '').toLowerCase();
  return cfg.brandTiers[brand] ?? cfg.brandTierDefault;
};

export function adjustCompPrice(
  target: NotebookSpec,
  listing: NotebookListingInput,
  config: ResolvedListingConfig,
  tier: MatchTier,
  cfg: NotebookPricingConfig = DEFAULT_NOTEBOOK_PRICING_CONFIG
): AdjustedComp | null {
  const breakdown: Record<string, number> = {};
  let unknowns = 0;

  // CPU
  let fCpu = 1;
  if (target.cpuScore && config.cpu.score && config.cpu.source !== 'unknown' && target.cpuScoreSource !== 'unknown') {
    fCpu = clamp(Math.pow(target.cpuScore / config.cpu.score, cfg.cpuElasticity), cfg.cpuFactorClamp[0], cfg.cpuFactorClamp[1]);
  } else {
    unknowns += 1;
  }
  breakdown.cpu = fCpu;

  // GPU
  let fGpu = 1;
  const targetHasDgpu = target.gpuClass !== 'integrated';
  const compHasDgpu = config.gpu.gpuClass !== 'integrated';
  if (target.gpuScoreSource === 'unknown' || config.gpu.source === 'unknown') {
    unknowns += 1;
  } else if (targetHasDgpu && compHasDgpu && target.gpuScore && config.gpu.score) {
    fGpu = clamp(Math.pow(target.gpuScore / config.gpu.score, cfg.gpuElasticity), cfg.gpuFactorClamp[0], cfg.gpuFactorClamp[1]);
  } else {
    fGpu = cfg.gpuClassMults[target.gpuClass] / cfg.gpuClassMults[config.gpu.gpuClass];
  }
  breakdown.gpu = fGpu;

  // RAM
  let fRam = 1;
  if (target.ramGb && config.ramGb) {
    fRam = interpolateLog2(cfg.ramFactorPoints, target.ramGb) / interpolateLog2(cfg.ramFactorPoints, config.ramGb);
  } else {
    unknowns += 1;
  }
  breakdown.ram = fRam;

  // Storage
  let fStorage = 1;
  if (target.storageGb && config.storageGb) {
    const typeF = (t: StorageType | null | undefined) => (t ? cfg.storageTypeFactors[t] : 1);
    const targetF = interpolateLog2(cfg.storageSizeFactorPoints, target.storageGb) * typeF(target.storageType);
    const compF = interpolateLog2(cfg.storageSizeFactorPoints, config.storageGb) * typeF(config.storageType);
    fStorage = targetF / compF;
  } else {
    unknowns += 1;
  }
  breakdown.storage = fStorage;

  // Screen (minor; no unknown penalty). An exact-match comp is the same
  // machine, so its panel/refresh already match — no factor to apply.
  let fScreen = 1;
  if (tier !== 'exact') {
    if (target.panel) {
      // Comps rarely disclose panel type; assume ips/60Hz baseline for the comp.
      fScreen = cfg.panelFactors[target.panel] / cfg.panelFactors.ips;
    }
    if (target.refreshHz && target.refreshHz >= 120) fScreen *= cfg.highRefreshFactor;
  }
  breakdown.screen = fScreen;

  // Year / generation gap — compare like-for-like: CPU launch year on BOTH
  // sides (comparing the laptop's release year against the comp CPU's launch
  // year would wrongly inflate machines that ship older CPUs).
  let fYear = 1;
  if (target.cpuYear && config.cpu.year) {
    const diff = clamp(target.cpuYear - config.cpu.year, -cfg.yearDiffClamp, cfg.yearDiffClamp);
    fYear = Math.pow(cfg.yearFactorPerYear, diff);
  }
  breakdown.year = fYear;

  // Brand (cross-brand comps only)
  let fBrand = 1;
  if (tier === 'cross_brand') {
    fBrand = targetBrandTier(target, cfg) / listingBrandTier(listing, cfg);
  }
  breakdown.brand = fBrand;

  const totalFactor = fCpu * fGpu * fRam * fStorage * fScreen * fYear * fBrand;
  // NaN guard: a poisoned factor must drop the comp, not flow into the
  // estimator (NaN passes every < / > comparison as false).
  if (!Number.isFinite(totalFactor)) {
    return null;
  }
  if (totalFactor < cfg.totalAdjustmentCap[0] || totalFactor > cfg.totalAdjustmentCap[1]) {
    return null; // too dissimilar to adjust honestly
  }

  return {
    listing,
    tier,
    adjustedPrice: Math.round(listing.price_thb * totalFactor),
    totalFactor,
    breakdown,
    unknowns,
  };
}

// ---------------------------------------------------------------------------
// Level 5: new-price / MSRP anchors + depreciation
// ---------------------------------------------------------------------------

function anchorUsedValue(
  target: NotebookSpec,
  comp: AdjustedComp,
  nowYear: number,
  cfg: NotebookPricingConfig
): number {
  const age = clamp(
    target.releaseYear ? nowYear - target.releaseYear : cfg.defaultAgeYears,
    0,
    12
  );

  if (comp.listing.listing_kind === 'new_current') {
    const factor = cfg.newCurrentBaseFactor - cfg.newCurrentPerYearDrop * Math.min(age, cfg.newCurrentMaxAgeYears);
    return comp.adjustedPrice * factor;
  }

  // launch_msrp
  let retention: number;
  if (age < cfg.retentionByAge.length) {
    retention = cfg.retentionByAge[age];
  } else {
    const last = cfg.retentionByAge[cfg.retentionByAge.length - 1];
    retention = Math.max(
      cfg.retentionFloor,
      last * Math.pow(cfg.retentionLateDecay, age - (cfg.retentionByAge.length - 1))
    );
  }
  const segmentAdj = cfg.segmentRetentionAdj[target.segment] ?? 1;
  return comp.adjustedPrice * retention * segmentAdj;
}

// ---------------------------------------------------------------------------
// Main entry: classify → adjust → ladder → representative price → confidence
// ---------------------------------------------------------------------------

export function computeNotebookPrice(
  target: NotebookSpec,
  listings: NotebookListingInput[],
  cfg: NotebookPricingConfig = DEFAULT_NOTEBOOK_PRICING_CONFIG,
  nowYear: number = new Date().getFullYear()
): NotebookPricingResult | null {
  const sane = (listings || []).filter((l) => l && l.title && !isBadListing(l, cfg));

  const usedComps: AdjustedComp[] = [];
  const anchorComps: AdjustedComp[] = [];
  let dropped = 0;

  for (const listing of sane) {
    const config = resolveListingConfig(listing);
    const isAnchor = listing.listing_kind !== 'used';
    const tier = isAnchor ? 'exact' : classifyTier(target, config, listing.match, cfg);
    const adjusted = adjustCompPrice(target, listing, config, tier, cfg);
    if (!adjusted) {
      dropped += 1;
      continue;
    }
    if (isAnchor) anchorComps.push(adjusted);
    else usedComps.push(adjusted);
  }

  const byTier = (tiers: MatchTier[]) => usedComps.filter((c) => tiers.includes(c.tier));
  const exact = byTier(['exact']);
  const upToFamily = byTier(['exact', 'family']);
  const upToBrand = byTier(['exact', 'family', 'same_brand']);

  let level: NotebookPricingLevel | null = null;
  let pool: AdjustedComp[] = [];
  if (exact.length >= cfg.ladderMinExact) {
    level = 'L1';
    pool = exact;
  } else if (upToFamily.length >= cfg.ladderMinPool) {
    level = 'L2';
    pool = upToFamily;
  } else if (upToBrand.length >= cfg.ladderMinPool) {
    level = 'L3';
    pool = upToBrand;
  } else if (usedComps.length >= 1) {
    level = 'L4';
    pool = usedComps;
  } else if (anchorComps.length >= 1) {
    level = 'L5';
  } else {
    return null;
  }

  const anchorValues = anchorComps.map((a) => anchorUsedValue(target, a, nowYear, cfg));
  const anchorValue = anchorValues.length > 0 ? median(anchorValues) : null;

  const notes: string[] = [];
  let marketPrice: number;
  let dispersionScore: number | null = null;
  let meanAbsLnFactor = 0;
  let avgUnknowns = 0;
  let clampedByAnchor = false;

  if (level === 'L5') {
    marketPrice = Math.round(anchorValue as number);
    const age = target.releaseYear ? clamp(nowYear - target.releaseYear, 0, 12) : cfg.defaultAgeYears;
    avgUnknowns = anchorComps.reduce((s, c) => s + c.unknowns, 0) / anchorComps.length;
    notes.push(`อิงราคาของใหม่/ราคาเปิดตัว ${anchorComps.length} รายการ หักค่าเสื่อมตามอายุ ~${age} ปี`);
  } else {
    const weights = pool.map((c) => cfg.tierWeights[c.tier]);
    const analysis = computeRepresentativeUsedPriceTHB(
      pool.map((c) => ({ price_thb: c.adjustedPrice })),
      { weights }
    );
    marketPrice = analysis.representativePrice;
    dispersionScore = analysis.dispersionScore;
    meanAbsLnFactor = pool.reduce((s, c) => s + Math.abs(Math.log(c.totalFactor)), 0) / pool.length;
    avgUnknowns = pool.reduce((s, c) => s + c.unknowns, 0) / pool.length;

    const exactN = pool.filter((c) => c.tier === 'exact').length;
    const adjustedN = pool.length - exactN;
    if (level === 'L1') notes.push(`ราคาประกาศขายรุ่นตรง ${exactN} รายการ`);
    else if (level === 'L2') notes.push(`รุ่นตรง ${exactN} รายการ + รุ่นเดียวกันสเปคใกล้เคียง ${adjustedN} รายการ (ปรับสเปคแล้ว)`);
    else if (level === 'L3') notes.push(`เทียบเคียงรุ่นตรง/ตระกูลเดียวกัน/แบรนด์เดียวกัน ${pool.length} รายการ (ปรับสเปคแล้ว)`);
    else notes.push(`เทียบเคียงจากรุ่นใกล้เคียงในตลาด ${pool.length} รายการ (ปรับสเปคแล้ว)`);

    // Cross-level guardrail: keep the comp-based result inside a generous band
    // around the depreciated-new-price estimate, when we have anchors.
    if (anchorValue !== null && anchorValue > 0) {
      const lo = cfg.anchorGuardBand[0] * anchorValue;
      const hi = cfg.anchorGuardBand[1] * anchorValue;
      if (marketPrice < lo || marketPrice > hi) {
        marketPrice = Math.round(clamp(marketPrice, lo, hi));
        clampedByAnchor = true;
        notes.push('ปรับเข้ากรอบราคาอ้างอิงจากราคาของใหม่');
      }
    }
  }

  // Confidence
  const n = level === 'L5' ? anchorComps.length : pool.length;
  const fN = Math.min(1, 0.5 + n / 8);
  const gD = dispersionScore === null || dispersionScore <= 0.45 ? 1 : Math.max(0.75, 1 - (dispersionScore - 0.45));
  const hAdj = 1 - Math.min(0.3, meanAbsLnFactor * 0.5);

  let unknownCount = Math.round(avgUnknowns);
  if (target.cpuScoreSource !== 'table') unknownCount += 1;
  if (!target.ramGb) unknownCount += 1;
  if (!target.storageGb) unknownCount += 1;
  if (target.gpuScoreSource === 'unknown') unknownCount += 1;
  if (!target.releaseYear) unknownCount += 1;
  const kUnknown = Math.pow(0.95, unknownCount);

  let confidence = cfg.confidenceBase[level] * fN * gD * hAdj * kUnknown;
  if (clampedByAnchor) confidence *= cfg.anchorClampConfidencePenalty;
  confidence = Math.round(clamp(confidence, cfg.confidenceClamp[0], cfg.confidenceClamp[1]) * 100) / 100;

  return {
    marketPrice,
    level,
    confidence,
    usedCompCount: usedComps.length,
    anchorCount: anchorComps.length,
    dispersionScore,
    clampedByAnchor,
    anchorValue: anchorValue !== null ? Math.round(anchorValue) : null,
    notes,
    comps: [...usedComps, ...anchorComps],
    droppedComps: dropped,
  };
}
