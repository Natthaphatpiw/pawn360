/**
 * Risk-policy checks for the anchor pricing layer.
 *
 *   npx tsx scripts/anchor-pricing-check.ts
 *
 * Anchor pricing values an item from its NEW price minus depreciation, and is
 * the last rung before handing a request to a human. Two properties of that
 * rung are policy, not implementation detail, so they are asserted here:
 *
 *   1. It must never price ABOVE what the item would really fetch. Over-valuing
 *      collateral leaves the investor under-secured; under-valuing only costs
 *      the pawner some borrowing headroom. The safety haircut is what enforces
 *      this, and it is checked against every calibration observation at several
 *      evidence strengths.
 *
 *   2. It may lend automatically ONLY when all four legs hold: a calibrated
 *      depreciation curve, several retail prices, those prices agreeing, and a
 *      known release year. Any missing leg must fall back to an operator, and
 *      the weakest case must be refused outright rather than guessed at.
 *
 * The observations below are the same ones the retention curves were calibrated
 * from, so this is a consistency check on the haircut - NOT an out-of-sample
 * accuracy measurement. For accuracy see scripts/market-price-benchmark.ts.
 */

import { computeAnchorPrice, type AnchorCategory } from '@/lib/services/anchor-pricing';

const NOW = new Date('2026-08-02T00:00:00Z');
const AUTO_GATE = 0.5;
const REJECT_FLOOR = 0.25;

let failures = 0;
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`);
  if (!pass) failures += 1;
};

const price = (anchors: number[], releaseYear: number | null, category: AnchorCategory) =>
  computeAnchorPrice({ anchors, releaseYear, category, now: NOW });

/** Thai launch price and a measured used price for the same model. */
const OBSERVATIONS: Array<[string, number, number, AnchorCategory, number]> = [
  ['Galaxy S23', 32900, 2023, 'phone', 9654],
  ['Galaxy S22 Ultra', 39900, 2022, 'phone', 8700],
  ['iPhone 14 Pro', 42900, 2022, 'apple_phone', 20900],
  ['iPhone 13', 29900, 2021, 'apple_phone', 9900],
  ['iPad Air 5', 21900, 2022, 'tablet', 9900],
  ['MacBook Air M2', 41900, 2022, 'laptop', 17900],
  ['Sony A7 III', 69990, 2018, 'camera', 24550],
  ['Sony WH-1000XM5', 13990, 2022, 'accessory', 6500],
];

console.log('--- must never price above the real resale value ---');
for (const anchorCount of [1, 3, 10]) {
  let over = 0;
  let biasSum = 0;
  for (const [, newPrice, year, category, truth] of OBSERVATIONS) {
    const result = computeAnchorPrice({
      anchors: Array(anchorCount).fill(newPrice),
      releaseYear: year,
      category,
      now: NOW,
    });
    if (!result) continue;
    if (result.marketPrice > truth) over += 1;
    biasSum += ((result.marketPrice - truth) / truth) * 100;
  }
  const bias = Math.round((biasSum / OBSERVATIONS.length) * 10) / 10;
  check(
    `${String(anchorCount).padStart(2)} anchors: none above the real value`,
    over === 0,
    `${over}/${OBSERVATIONS.length} over, mean margin ${bias}%`,
  );
}

console.log('\n--- may lend automatically only on all four legs ---');
const strong = price([30000, 30100, 29900, 30050, 30200], 2023, 'phone');
check('calibrated + known year + agreeing anchors reaches the auto gate',
  (strong?.confidence ?? 0) >= AUTO_GATE, `conf ${strong?.confidence}`);
check('unknown release year blocks auto',
  (price([30000, 30100, 29900, 30050], null, 'phone')?.confidence ?? 1) < AUTO_GATE);
check('uncalibrated category blocks auto however many anchors',
  (price(Array(10).fill(30000), 2023, 'default')?.confidence ?? 1) < AUTO_GATE);
check('anchors disagreeing ~50% block auto',
  (price([22000, 30000, 38000], 2023, 'phone')?.confidence ?? 1) < AUTO_GATE);
check('a single retail price blocks auto',
  (price([30000], 2023, 'phone')?.confidence ?? 1) < AUTO_GATE);

console.log('\n--- refuses rather than guesses ---');
check('one anchor, unknown year, uncalibrated is refused',
  (price([30000], null, 'default')?.confidence ?? 1) < REJECT_FLOOR);
check('no anchors returns null', price([], 2024, 'phone') === null);

console.log('\n--- depreciation shape ---');
check('unknown year assumes mid-life', price([30000], null, 'phone')?.ageYears === 3);
check('older is worth less',
  (price([30000], 2019, 'phone')?.marketPrice ?? 0) < (price([30000], 2024, 'phone')?.marketPrice ?? 0));
check('very old still floors above zero', (price([30000], 2008, 'phone')?.marketPrice ?? 0) > 0);
const haircut = price([30000], 2023, 'phone');
check('haircut is always applied',
  Boolean(haircut && haircut.safetyFactor < 1
    && haircut.marketPrice < 30000 * haircut.retention));

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exitCode = failures ? 1 : 0;
