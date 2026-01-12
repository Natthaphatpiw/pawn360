export type PriceItem = {
  price_thb: number;
  source?: string;
  title?: string;
  url?: string;
};

export type RepresentativePriceConfig = {
  winsorizeLowPct?: number;
  winsorizeHighPct?: number;
  dispersionThreshold?: number;
  hiDispWindowLow?: number;
  hiDispWindowHighStart?: number;
  hiDispWindowHighMax?: number;
  hiDispWindowExpandStep?: number;
  loDispWindowLow?: number;
  loDispWindowHigh?: number;
  minCountAbs?: number;
  minCountFrac?: number;
  hiDispMeanWeight?: number;
  hiDispMedianWeight?: number;
  hiDispClampLowPct?: number;
  hiDispClampHighPct?: number;
  loDispClampLowPct?: number;
  loDispClampHighPct?: number;
  weights?: number[];
  includeDebug?: boolean;
};

export type RepresentativePriceResult = {
  representativePrice: number;
  dispersionScore: number;
  mode: 'high_dispersion' | 'low_dispersion';
  usedWindowPct: { low: number; high: number };
  windowCount: number;
  stats: {
    n: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    iqr: number;
  };
  debug?: {
    rawPrices: number[];
    winsorizedPrices: number[];
    windowPrices: number[];
  };
};

export function computeRepresentativeUsedPriceTHB(
  items: Array<number | PriceItem>,
  cfg: RepresentativePriceConfig = {}
): RepresentativePriceResult {
  const rawPrices = normalizePrices(items);
  if (rawPrices.length === 0) {
    throw new Error('No valid prices to compute representative price.');
  }

  const config = withDefaults(cfg);
  const n = rawPrices.length;

  const weights = config.weights
    ? validateWeights(config.weights, n)
    : undefined;

  const p10 = weights
    ? weightedPercentile(rawPrices, weights, config.winsorizeLowPct)
    : percentile(rawPrices, config.winsorizeLowPct);
  const p90 = weights
    ? weightedPercentile(rawPrices, weights, config.winsorizeHighPct)
    : percentile(rawPrices, config.winsorizeHighPct);

  const winsorizedPrices = rawPrices.map((x) => clamp(x, p10, p90));

  const p25 = weights
    ? weightedPercentile(winsorizedPrices, weights, 25)
    : percentile(winsorizedPrices, 25);
  const p50 = weights
    ? weightedPercentile(winsorizedPrices, weights, 50)
    : percentile(winsorizedPrices, 50);
  const p75 = weights
    ? weightedPercentile(winsorizedPrices, weights, 75)
    : percentile(winsorizedPrices, 75);

  const iqr = p75 - p25;
  const dispersionScore = safeDiv(iqr, p50);

  const minCount = Math.max(
    config.minCountAbs,
    Math.ceil(config.minCountFrac * n)
  );

  if (dispersionScore > config.dispersionThreshold) {
    let low = config.hiDispWindowLow;
    let high = config.hiDispWindowHighStart;

    let window = selectByPercentileRange(
      winsorizedPrices,
      low,
      high,
      weights
    );

    while (window.length < minCount && high < config.hiDispWindowHighMax) {
      high += config.hiDispWindowExpandStep;
      window = selectByPercentileRange(winsorizedPrices, low, high, weights);
    }

    const m = mean(window);
    const med = median(window);
    let rep = config.hiDispMeanWeight * m + config.hiDispMedianWeight * med;

    const clampLow = weights
      ? weightedPercentile(winsorizedPrices, weights, config.hiDispClampLowPct)
      : percentile(winsorizedPrices, config.hiDispClampLowPct);
    const clampHigh = weights
      ? weightedPercentile(winsorizedPrices, weights, config.hiDispClampHighPct)
      : percentile(winsorizedPrices, config.hiDispClampHighPct);

    rep = clamp(rep, clampLow, clampHigh);

    return {
      representativePrice: Math.round(rep),
      dispersionScore,
      mode: 'high_dispersion',
      usedWindowPct: { low, high },
      windowCount: window.length,
      stats: { n, p10, p25, p50, p75, p90, iqr },
      debug: config.includeDebug
        ? { rawPrices, winsorizedPrices, windowPrices: window }
        : undefined,
    };
  }

  const low = config.loDispWindowLow;
  const high = config.loDispWindowHigh;

  const window = selectByPercentileRange(
    winsorizedPrices,
    low,
    high,
    weights
  );

  let rep = median(window);

  const clampLow = weights
    ? weightedPercentile(winsorizedPrices, weights, config.loDispClampLowPct)
    : percentile(winsorizedPrices, config.loDispClampLowPct);
  const clampHigh = weights
    ? weightedPercentile(winsorizedPrices, weights, config.loDispClampHighPct)
    : percentile(winsorizedPrices, config.loDispClampHighPct);

  rep = clamp(rep, clampLow, clampHigh);

  return {
    representativePrice: Math.round(rep),
    dispersionScore,
    mode: 'low_dispersion',
    usedWindowPct: { low, high },
    windowCount: window.length,
    stats: { n, p10, p25, p50, p75, p90, iqr },
    debug: config.includeDebug
      ? { rawPrices, winsorizedPrices, windowPrices: window }
      : undefined,
  };
}

function withDefaults(cfg: RepresentativePriceConfig): Required<RepresentativePriceConfig> {
  return {
    winsorizeLowPct: cfg.winsorizeLowPct ?? 10,
    winsorizeHighPct: cfg.winsorizeHighPct ?? 90,
    dispersionThreshold: cfg.dispersionThreshold ?? 0.45,
    hiDispWindowLow: cfg.hiDispWindowLow ?? 20,
    hiDispWindowHighStart: cfg.hiDispWindowHighStart ?? 30,
    hiDispWindowHighMax: cfg.hiDispWindowHighMax ?? 50,
    hiDispWindowExpandStep: cfg.hiDispWindowExpandStep ?? 10,
    loDispWindowLow: cfg.loDispWindowLow ?? 20,
    loDispWindowHigh: cfg.loDispWindowHigh ?? 40,
    minCountAbs: cfg.minCountAbs ?? 4,
    minCountFrac: cfg.minCountFrac ?? 0.15,
    hiDispMeanWeight: cfg.hiDispMeanWeight ?? 0.7,
    hiDispMedianWeight: cfg.hiDispMedianWeight ?? 0.3,
    hiDispClampLowPct: cfg.hiDispClampLowPct ?? 20,
    hiDispClampHighPct: cfg.hiDispClampHighPct ?? 50,
    loDispClampLowPct: cfg.loDispClampLowPct ?? 25,
    loDispClampHighPct: cfg.loDispClampHighPct ?? 55,
    weights: cfg.weights ?? undefined,
    includeDebug: cfg.includeDebug ?? false,
  };
}

function normalizePrices(items: Array<number | PriceItem>): number[] {
  const out: number[] = [];
  for (const it of items) {
    const x = typeof it === 'number' ? it : it?.price_thb;
    if (typeof x !== 'number') continue;
    if (!Number.isFinite(x)) continue;
    if (x <= 0) continue;
    out.push(x);
  }
  return out;
}

function validateWeights(weights: number[], n: number): number[] {
  if (weights.length !== n) {
    throw new Error(`weights length (${weights.length}) must equal number of prices (${n}).`);
  }
  for (const w of weights) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
      throw new Error('All weights must be finite numbers > 0.');
    }
  }
  return weights.slice();
}

function clamp(x: number, lo: number, hi: number): number {
  if (lo > hi) [lo, hi] = [hi, lo];
  return Math.min(hi, Math.max(lo, x));
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? Infinity : a / b;
}

function mean(xs: number[]): number {
  if (xs.length === 0) throw new Error('mean() of empty array');
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) throw new Error('median() of empty array');
  const arr = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1
    ? arr[mid]
    : (arr[mid - 1] + arr[mid]) / 2;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) throw new Error('percentile() of empty array');
  const arr = xs.slice().sort((a, b) => a - b);
  const pp = clamp(p, 0, 100) / 100;
  const idx = (arr.length - 1) * pp;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const w = idx - lo;
  return arr[lo] * (1 - w) + arr[hi] * w;
}

function weightedPercentile(xs: number[], ws: number[], p: number): number {
  if (xs.length === 0) throw new Error('weightedPercentile() of empty array');
  if (xs.length !== ws.length) throw new Error('xs and ws must have same length');

  const pp = clamp(p, 0, 100) / 100;
  const pairs = xs.map((x, i) => ({ x, w: ws[i] }))
    .sort((a, b) => a.x - b.x);

  let total = 0;
  for (const t of pairs) total += t.w;

  const target = pp * total;
  let cum = 0;
  for (const t of pairs) {
    cum += t.w;
    if (cum >= target) return t.x;
  }
  return pairs[pairs.length - 1].x;
}

function selectByPercentileRange(
  xs: number[],
  lowPct: number,
  highPct: number,
  weights?: number[]
): number[] {
  const lo = weights
    ? weightedPercentile(xs, weights, lowPct)
    : percentile(xs, lowPct);
  const hi = weights
    ? weightedPercentile(xs, weights, highPct)
    : percentile(xs, highPct);

  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  const window = xs.filter((x) => x >= a && x <= b);

  if (window.length === 0) {
    const sorted = xs.slice().sort((x1, x2) => x1 - x2);
    const lowIdx = Math.floor(((sorted.length - 1) * clamp(lowPct, 0, 100)) / 100);
    const highIdx = Math.ceil(((sorted.length - 1) * clamp(highPct, 0, 100)) / 100);
    const i0 = Math.min(lowIdx, highIdx);
    const i1 = Math.max(lowIdx, highIdx);
    return sorted.slice(i0, i1 + 1);
  }

  return window;
}
