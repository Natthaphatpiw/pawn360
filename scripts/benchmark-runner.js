// Standalone JS port of computeRepresentativeUsedPriceTHB.
// Mirrors pawnline/lib/services/price-representative.ts exactly.
const fs = require('fs');

function clamp(x, lo, hi) {
  if (lo > hi) [lo, hi] = [hi, lo];
  return Math.min(hi, Math.max(lo, x));
}
function safeDiv(a, b) { return b === 0 ? Infinity : a / b; }
function mean(xs) { let s = 0; for (const x of xs) s += x; return s / xs.length; }
function median(xs) {
  const arr = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}
function percentile(xs, p) {
  const arr = xs.slice().sort((a, b) => a - b);
  const pp = clamp(p, 0, 100) / 100;
  const idx = (arr.length - 1) * pp;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const w = idx - lo;
  return arr[lo] * (1 - w) + arr[hi] * w;
}
function selectByPercentileRange(xs, lowPct, highPct) {
  const lo = percentile(xs, lowPct);
  const hi = percentile(xs, highPct);
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
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

const DEFAULTS = {
  winsorizeLowPct: 10, winsorizeHighPct: 90,
  dispersionThreshold: 0.45,
  hiDispWindowLow: 20, hiDispWindowHighStart: 30, hiDispWindowHighMax: 50, hiDispWindowExpandStep: 10,
  loDispWindowLow: 20, loDispWindowHigh: 40,
  minCountAbs: 4, minCountFrac: 0.15,
  hiDispMeanWeight: 0.7, hiDispMedianWeight: 0.3,
  hiDispClampLowPct: 20, hiDispClampHighPct: 50,
  loDispClampLowPct: 25, loDispClampHighPct: 55,
};

function computeRepresentativeUsedPriceTHB(items) {
  const c = DEFAULTS;
  const rawPrices = items.map((it) => typeof it === 'number' ? it : it.price_thb)
    .filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);
  if (rawPrices.length === 0) throw new Error('no prices');
  const n = rawPrices.length;

  const p10 = percentile(rawPrices, c.winsorizeLowPct);
  const p90 = percentile(rawPrices, c.winsorizeHighPct);
  const winsorized = rawPrices.map((x) => clamp(x, p10, p90));

  const p25 = percentile(winsorized, 25);
  const p50 = percentile(winsorized, 50);
  const p75 = percentile(winsorized, 75);
  const iqr = p75 - p25;
  const dispersion = safeDiv(iqr, p50);

  const minCount = Math.max(c.minCountAbs, Math.ceil(c.minCountFrac * n));

  if (dispersion > c.dispersionThreshold) {
    let low = c.hiDispWindowLow, high = c.hiDispWindowHighStart;
    let window = selectByPercentileRange(winsorized, low, high);
    while (window.length < minCount && high < c.hiDispWindowHighMax) {
      high += c.hiDispWindowExpandStep;
      window = selectByPercentileRange(winsorized, low, high);
    }
    const m = mean(window), med = median(window);
    let rep = c.hiDispMeanWeight * m + c.hiDispMedianWeight * med;
    const clampLow = percentile(winsorized, c.hiDispClampLowPct);
    const clampHigh = percentile(winsorized, c.hiDispClampHighPct);
    rep = clamp(rep, clampLow, clampHigh);
    return {
      representativePrice: Math.round(rep),
      dispersionScore: dispersion, mode: 'high_dispersion',
      usedWindowPct: { low, high }, windowCount: window.length,
      stats: { n, p10, p25, p50, p75, p90, iqr },
    };
  }

  const low = c.loDispWindowLow, high = c.loDispWindowHigh;
  const window = selectByPercentileRange(winsorized, low, high);
  let rep = median(window);
  const clampLow = percentile(winsorized, c.loDispClampLowPct);
  const clampHigh = percentile(winsorized, c.loDispClampHighPct);
  rep = clamp(rep, clampLow, clampHigh);
  return {
    representativePrice: Math.round(rep),
    dispersionScore: dispersion, mode: 'low_dispersion',
    usedWindowPct: { low, high }, windowCount: window.length,
    stats: { n, p10, p25, p50, p75, p90, iqr },
  };
}

const items = JSON.parse(fs.readFileSync(process.argv[2] || 'benchmark-input.json', 'utf8'));

const rows = items.map((item) => {
  const prices = item.listings.map((l) => l.price_thb);
  let analysis;
  try { analysis = computeRepresentativeUsedPriceTHB(item.listings); }
  catch (e) { return { id: item.id, label: item.label, n: prices.length, error: e.message }; }
  const pawnPrice = Math.round(analysis.representativePrice * 0.6);
  const baseAt100 = Math.max(pawnPrice, 100);
  const rem = baseAt100 % 1000;
  const finalAt100 = baseAt100 - rem + (rem >= 500 ? 500 : 0);
  return {
    id: item.id, category: item.category, label: item.label,
    model: item.model, storage: item.storage || '', ram: item.ram || '', cpu: item.cpu || '',
    screen_size: item.screen_size || '', watch_size: item.watch_size || '',
    connectivity: item.connectivity || '', year: item.year || '',
    n: prices.length,
    min: Math.min(...prices), max: Math.max(...prices),
    p10: Math.round(analysis.stats.p10), p25: Math.round(analysis.stats.p25),
    p50: Math.round(analysis.stats.p50), p75: Math.round(analysis.stats.p75),
    p90: Math.round(analysis.stats.p90), iqr: Math.round(analysis.stats.iqr),
    dispersion: Number(analysis.dispersionScore.toFixed(3)),
    regime: analysis.mode,
    window_pct: `${analysis.usedWindowPct.low}-${analysis.usedWindowPct.high}`,
    window_count: analysis.windowCount,
    market_price: analysis.representativePrice,
    pawn_price_60pct: pawnPrice,
    final_at_cond_100: finalAt100,
  };
});

console.log(JSON.stringify(rows, null, 2));
