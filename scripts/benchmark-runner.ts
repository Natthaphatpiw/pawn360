import {
  computeRepresentativeUsedPriceTHB,
  type PriceItem,
} from '../lib/services/price-representative';

type RawListing = {
  price_thb: number;
  source: string;
  title?: string;
  url?: string;
  listing_date?: string;
  condition_hint?: string;
};

type BenchmarkItem = {
  id: string;
  category: 'iPhone' | 'iPad' | 'MacBook' | 'AppleWatch' | 'AirPods';
  label: string;
  model: string;
  storage?: string;
  ram?: string;
  cpu?: string;
  screen_size?: string;
  watch_size?: string;
  connectivity?: string;
  year?: number;
  listings: RawListing[];
};

const items: BenchmarkItem[] = JSON.parse(
  require('fs').readFileSync(process.argv[2] ?? 'benchmark-input.json', 'utf8'),
);

const rows = items.map((item) => {
  const prices: PriceItem[] = item.listings.map((l) => ({
    price_thb: l.price_thb,
    source: l.source,
    title: l.title,
    url: l.url,
  }));

  let analysis;
  try {
    analysis = computeRepresentativeUsedPriceTHB(prices, { includeDebug: true });
  } catch (err) {
    return {
      id: item.id,
      label: item.label,
      category: item.category,
      n: prices.length,
      error: (err as Error).message,
    };
  }

  const pawnPrice = Math.round(analysis.representativePrice * 0.6);
  const estimatedAt100Pct = Math.max(pawnPrice, 100);
  const rem = estimatedAt100Pct % 1000;
  const finalAt100 = estimatedAt100Pct - rem + (rem >= 500 ? 500 : 0);

  return {
    id: item.id,
    label: item.label,
    category: item.category,
    model: item.model,
    storage: item.storage ?? '',
    ram: item.ram ?? '',
    cpu: item.cpu ?? '',
    screen_size: item.screen_size ?? '',
    watch_size: item.watch_size ?? '',
    connectivity: item.connectivity ?? '',
    year: item.year ?? '',
    n: prices.length,
    min: Math.min(...prices.map((p) => p.price_thb)),
    max: Math.max(...prices.map((p) => p.price_thb)),
    p10: Math.round(analysis.stats.p10),
    p25: Math.round(analysis.stats.p25),
    p50: Math.round(analysis.stats.p50),
    p75: Math.round(analysis.stats.p75),
    p90: Math.round(analysis.stats.p90),
    iqr: Math.round(analysis.stats.iqr),
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

const headers = [
  'id', 'category', 'label', 'model', 'storage', 'ram', 'cpu',
  'screen_size', 'watch_size', 'connectivity', 'year',
  'n', 'min', 'max', 'p10', 'p25', 'p50', 'p75', 'p90', 'iqr',
  'dispersion', 'regime', 'window_pct', 'window_count',
  'market_price', 'pawn_price_60pct', 'final_at_cond_100',
];

console.error('\n--- CSV ---');
console.error(headers.join(','));
for (const r of rows as any[]) {
  console.error(headers.map((h) => r[h] ?? '').join(','));
}
