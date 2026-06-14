// Convert benchmark-system-results-full.json → CSV
const fs = require('fs');
const path = require('path');

const IN = process.argv[2] || path.resolve(__dirname, 'benchmark-system-results-full.json');
const OUT = process.argv[3] || path.resolve(__dirname, 'benchmark-system-results-full.csv');

const rows = JSON.parse(fs.readFileSync(IN, 'utf8'));

const headers = [
  'id',
  'category',
  'label',
  'model',
  'storage',
  'ram',
  'cpu',
  'watch_size',
  'connectivity',
  'year',
  'normalized_product_name',
  'market_price_thb',
  'pawn_price_60pct_thb',
  'final_price_at_cond100_thb',
  'condition',
  'calculation_market',
  'calculation_pawn',
  'calculation_final',
  'latency_ms',
];

const escape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // RFC 4180: wrap in quotes if contains comma, quote, or newline; escape quotes by doubling
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const lines = [headers.join(',')];
for (const r of rows) {
  lines.push([
    r.id,
    r.category,
    r.label,
    r.model,
    r.storage,
    r.ram,
    r.cpu,
    r.watch_size,
    r.connectivity,
    r.year,
    r.normalized_product_name,
    r.system_market_price,
    r.system_pawn_price,
    r.system_estimated_price,
    r.system_condition,
    r.calculation_market,
    r.calculation_pawn,
    r.calculation_final,
    r.latency_ms,
  ].map(escape).join(','));
}

// BOM so Excel/Numbers open Thai correctly
const BOM = '﻿';
fs.writeFileSync(OUT, BOM + lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} rows → ${OUT}`);
