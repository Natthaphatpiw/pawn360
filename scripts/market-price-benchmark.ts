/**
 * Offline accuracy benchmark for ราคากลาง (the representative market price).
 *
 *   tsx scripts/market-price-benchmark.ts scripts/market-price-benchmark-set.json
 *
 * Runs the production Agent 1 (normalize) and Agent 2 (search -> extract ->
 * representative price) for each product in the set and scores the result
 * against hand-collected Thai used-listing prices.
 *
 * READ THIS BEFORE TUNING ANYTHING FROM THE OUTPUT
 * ------------------------------------------------
 * 1. Score against the design target, not the median asking price.
 *    computeRepresentativeUsedPriceTHB deliberately returns a low-but-fair
 *    central value (the p20-p40 window, or p20-p30 when dispersion is high).
 *    Comparing it to the median of the listings makes a correctly-calibrated
 *    engine look like it undervalues by ~16%. `truthLow` in the set is the
 *    p20/p25 of real listings and is the number to score against.
 *
 * 2. Live runs are noisy. The same configuration measured 18.4% and 23.6%
 *    median absolute error on consecutive runs, because the search provider
 *    returns different pages each time. Any difference smaller than roughly
 *    6 percentage points on a set this size is noise. To compare parameters,
 *    capture the evidence pool once (each row carries `evidence`) and replay
 *    it offline so only the parameter changes.
 *
 * 3. Median absolute error is unstable at this sample size - it steps whenever
 *    a single item crosses the middle. Read the mean alongside it.
 *
 * A larger set is the main thing that would make this benchmark stronger;
 * treat conclusions from ~17 products as directional.
 */

import fs from 'node:fs';
import {
  getRepresentativeMarketPrice,
  normalizeInput,
  type EstimateRequest,
} from '@/lib/services/estimate-pipeline';

interface BenchmarkProduct {
  id: string;
  label: string;
  group: string;
  itemType: string;
  brand: string;
  model: string;
  appleCategory?: string;
  capacity?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  /** p20/p25 of real listings - the estimator's design target. */
  truthLow: number;
  /** Median of real listings, for reference only. */
  truthMid: number;
  truthHigh: number;
  truthN: number;
}

interface BenchmarkRow {
  id: string;
  group: string;
  productName?: string;
  marketPrice?: number;
  web?: number;
  serpapi?: number;
  errorVsTargetPct?: number;
  errorVsMedianPct?: number;
  evidence?: Array<{ price_thb: number; source: string; weight: number }>;
  failure?: string;
  ms: number;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

async function main() {
  const setPath = process.argv[2] || 'scripts/market-price-benchmark-set.json';
  const products: BenchmarkProduct[] = JSON.parse(fs.readFileSync(setPath, 'utf8'));
  const only = process.argv[3];
  const selected = only ? products.filter((p) => p.id === only || p.group === only) : products;

  const rows: BenchmarkRow[] = [];
  for (const product of selected) {
    const request: EstimateRequest = {
      itemType: product.itemType,
      brand: product.brand,
      model: product.model,
      capacity: product.capacity,
      storage: product.storage,
      ram: product.ram,
      cpu: product.cpu,
      gpu: product.gpu,
      appleCategory: product.appleCategory,
      condition: 0.9,
      images: ['benchmark'],
      lineId: 'benchmark',
    };
    const startedAt = Date.now();
    const row: BenchmarkRow = { id: product.id, group: product.group, ms: 0 };
    try {
      const normalized = await normalizeInput(request);
      row.productName = normalized.productName;
      const market = await getRepresentativeMarketPrice(request, normalized.productName);
      row.marketPrice = market.marketPrice;
      row.web = market.sourceCounts.web;
      row.serpapi = market.sourceCounts.serpapi;
      row.evidence = market.evidence;
      row.errorVsTargetPct = round1(((market.marketPrice - product.truthLow) / product.truthLow) * 100);
      row.errorVsMedianPct = round1(((market.marketPrice - product.truthMid) / product.truthMid) * 100);
    } catch (error: any) {
      row.failure = error?.kind || error?.message || String(error);
    }
    row.ms = Date.now() - startedAt;
    rows.push(row);
    console.log(
      `${product.id.padEnd(26)} ${String(row.marketPrice ?? '-').padStart(9)}`
      + `  vs target ${String(row.errorVsTargetPct ?? '-').padStart(7)}%`
      + `  web=${row.web ?? '-'} serp=${row.serpapi ?? '-'}`
      + `${row.failure ? '  FAILED ' + row.failure : ''}`,
    );
  }

  const priced = rows.filter((row) => typeof row.errorVsTargetPct === 'number');
  const signed = priced.map((row) => row.errorVsTargetPct as number);
  const absolute = signed.map(Math.abs);
  const mean = absolute.reduce((sum, value) => sum + value, 0) / (absolute.length || 1);

  console.log(`\npriced ${priced.length}/${rows.length}`);
  console.log(`bias   median signed error vs design target: ${round1(median(signed) ?? 0)}%`
    + `  (${signed.filter((v) => v < 0).length} low / ${signed.filter((v) => v > 0).length} high)`);
  console.log(`spread median absolute ${round1(median(absolute) ?? 0)}%  mean absolute ${round1(mean)}%`
    + `  within±20% ${absolute.filter((v) => v <= 20).length}/${absolute.length}`);
  const failures = rows.filter((row) => row.failure);
  if (failures.length) {
    console.log(`\nno price produced (${failures.length}):`);
    for (const row of failures) console.log(`  ${row.group.padEnd(10)} ${row.id.padEnd(26)} ${row.failure}`);
  }

  const outPath = process.env.BENCHMARK_OUT || 'scripts/output/market-price-benchmark.json';
  fs.mkdirSync('scripts/output', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nrows written to ${outPath}`);
}

main().catch((error) => {
  console.error('benchmark failed:', error?.message || error);
  process.exitCode = 1;
});
