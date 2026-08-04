/**
 * Guards on the fixed-price fallback table.
 *
 *   npx tsx scripts/fallback-pricing-check.ts
 *
 * The fallback is the only rung that can price an item with no evidence behind
 * it at all, so two properties are policy rather than implementation detail:
 *
 *   1. No fallback may sit above the real second-hand floor. Each price below
 *      is checked against the lowest p20 of actual Thai listings measured for
 *      that model in the 72-product benchmark. Over-valuing here is the one
 *      failure that costs an investor money.
 *
 *   2. Rule matching must be ordered and whole-token. A plain substring test
 *      made "watch se" match "Apple Watch Series 9", pricing a Series 9 as an
 *      SE; the specific-before-general ordering matters just as much.
 */

import { resolveFallbackPrice } from '@/lib/services/fallback-pricing';
import type { AnchorCategory } from '@/lib/services/anchor-pricing';

let failures = 0;
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`);
  if (!pass) failures += 1;
};

/** [product name, category, p20 of real Thai listings]. */
const OBSERVED: Array<[string, AnchorCategory, number]> = [
  ['Apple iPhone 11 128GB', 'apple_phone', 5900],
  ['Apple iPhone 12 128GB', 'apple_phone', 7990],
  ['Apple iPhone 13 128GB', 'apple_phone', 9900],
  ['Apple iPhone 14 128GB', 'apple_phone', 14000],
  ['Apple iPhone 14 Pro 256GB', 'apple_phone', 20900],
  ['Apple iPhone 15 Pro 256GB', 'apple_phone', 21400],
  ['Apple iPhone 15 Pro Max 256GB', 'apple_phone', 24000],
  ['Apple iPad 10 64GB', 'tablet', 7590],
  ['Apple iPad Air 5 64GB', 'tablet', 9900],
  ['Apple iPad mini 6 64GB', 'tablet', 11890],
  ['Apple iPad Pro 11 M2 128GB', 'tablet', 26990],
  ['Apple MacBook Air M1 256GB', 'laptop', 13900],
  ['Apple MacBook Pro 14 M1 Pro', 'laptop', 29900],
  ['Apple Watch SE 2 44mm', 'accessory', 3300],
  ['Apple Watch Ultra', 'accessory', 15990],
  ['Apple AirPods Pro 2', 'accessory', 4500],
  ['Apple AirPods Max', 'accessory', 11900],
  ['Samsung Galaxy A54', 'phone', 4000],
  ['ASUS Vivobook 14', 'laptop', 8390],
  ['GoPro HERO12', 'camera', 6500],
  ['Anker 737 PowerBank', 'accessory', 2023],
];

console.log('--- never above the real second-hand floor ---');
for (const [name, category, observedFloor] of OBSERVED) {
  const result = resolveFallbackPrice(name, category);
  const price = result?.marketPrice ?? 0;
  check(
    name,
    price > 0 && price <= observedFloor,
    `fallback ${price} vs observed p20 ${observedFloor}`,
  );
}

console.log('\n--- rule matching is ordered and whole-token ---');
const EXPECT: Array<[string, string]> = [
  // The specific variant must win over the general one.
  ['Apple iPhone 15 Pro Max 256GB', 'iphone-15-pro-max'],
  ['Apple iPhone 15 Pro 256GB', 'iphone-15-pro'],
  ['Apple iPhone 15 128GB', 'iphone-15'],
  ['Apple iPhone 12 Pro 128GB', 'iphone-12-pro'],
  ['Apple iPhone 12 128GB', 'iphone-12'],
  ['Apple iPad Pro 11 M2', 'ipad-pro'],
  ['Apple iPad mini 6', 'ipad-mini'],
  ['Apple iPad Air 5', 'ipad-air'],
  ['Apple iPad 10', 'ipad'],
  ['Apple MacBook Pro 14', 'macbook-pro'],
  ['Apple MacBook Air M2', 'macbook'],
  ['Apple AirPods Max', 'airpods-max'],
  ['Apple AirPods Pro 2', 'airpods-pro'],
  ['Apple AirPods 4', 'airpods'],
  ['Apple Watch Ultra 2', 'apple-watch-ultra'],
  ['Apple Watch SE 2 44mm', 'apple-watch-se'],
  // The one a substring test got wrong: "watch se" inside "watch series".
  ['Apple Watch Series 9 45mm', 'apple-watch'],
];
for (const [name, expected] of EXPECT) {
  const result = resolveFallbackPrice(name, 'default');
  check(`${name} -> ${expected}`, result?.source === expected, `got ${result?.source}`);
}

console.log('\n--- unknown models fall back to the category ---');
for (const [name, category] of [
  ['Xiaomi Redmi Note 14', 'phone'],
  ['Huawei MatePad 11', 'tablet'],
  ['Nikon Z50', 'camera'],
] as Array<[string, AnchorCategory]>) {
  const result = resolveFallbackPrice(name, category);
  check(
    `${name} [${category}]`,
    result?.source === `category:${category}` && (result?.marketPrice ?? 0) > 0,
    `${result?.marketPrice}`,
  );
}

console.log('\n--- a fallback quote is never presented as confident ---');
for (const name of ['Apple iPhone 12 128GB', 'Xiaomi Redmi Note 14']) {
  const result = resolveFallbackPrice(name, 'phone');
  check(`${name} stays low-confidence`, (result?.confidence ?? 1) <= 0.35, `${result?.confidence}`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exitCode = failures ? 1 : 0;
