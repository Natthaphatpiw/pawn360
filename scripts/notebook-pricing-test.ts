// Offline tests for the notebook pricing ladder (no network, no API keys).
// Run: npx tsx scripts/notebook-pricing-test.ts

import {
  resolveCpu,
  resolveGpu,
  parseRamGb,
  parseStorage,
  parseScreen,
  inferSegment,
  NotebookSpec,
} from '../lib/services/notebook-spec';
import {
  computeNotebookPrice,
  NotebookListingInput,
  DEFAULT_NOTEBOOK_PRICING_CONFIG,
} from '../lib/services/notebook-pricing';

let failures = 0;
const check = (name: string, condition: boolean, detail?: unknown) => {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

const NOW_YEAR = 2026;

const baseTarget: NotebookSpec = {
  brand: 'Lenovo',
  family: 'IdeaPad Gaming 3 15',
  variant: null,
  productName: 'Lenovo IdeaPad Gaming 3 15 i5-12450H RTX 3050 16GB 512GB',
  cpuModel: 'Intel Core i5-12450H',
  cpuScore: resolveCpu('i5-12450H').score,
  cpuScoreSource: 'table',
  cpuYear: 2022,
  ramGb: 16,
  storageGb: 512,
  storageType: 'nvme',
  gpuModel: 'RTX 3050 Laptop',
  gpuScore: resolveGpu('RTX 3050 Laptop').score,
  gpuClass: resolveGpu('RTX 3050 Laptop').gpuClass,
  gpuScoreSource: 'table',
  screenSizeIn: 15.6,
  panel: 'ips',
  refreshHz: 120,
  releaseYear: 2022,
  segment: 'gaming',
};

const usedListing = (over: Partial<NotebookListingInput>): NotebookListingInput => ({
  title: 'Lenovo IdeaPad Gaming 3 15 i5-12450H RTX 3050 16/512',
  price_thb: 14500,
  source: 'kaidee',
  url: 'https://example.com',
  listing_kind: 'used',
  match: 'exact',
  cpu: 'i5-12450H',
  ram_gb: 16,
  storage_gb: 512,
  storage_type: 'nvme',
  gpu: 'RTX 3050',
  condition_note: null,
  origin: 'web_search',
  ...over,
});

console.log('— resolveCpu —');
{
  const hit = resolveCpu('Intel Core i5-12450H');
  check('table hit i5-12450H score 16000', hit.score === 16000 && hit.source === 'table', hit);
  const sloppy = resolveCpu('i5 gen12 12450h');
  check('sloppy alias still matches', sloppy.score === 16000, sloppy);
  const ryzen = resolveCpu('Ryzen 5 5500U');
  check('ryzen 5 5500u from table', ryzen.source === 'table' && (ryzen.score ?? 0) > 8000, ryzen);
  const heuristic = resolveCpu('Intel Core i7-6820HQ');
  check('unknown chip falls to heuristic', heuristic.source === 'heuristic' && (heuristic.score ?? 0) > 3000, heuristic);
  const unknown = resolveCpu('Intel Inside');
  check('garbage → unknown', unknown.source === 'unknown' && unknown.score === null, unknown);
}

console.log('— resolveGpu —');
{
  const rtx = resolveGpu('NVIDIA GeForce RTX 4060 Laptop');
  check('rtx 4060 table hit, class high+', rtx.source === 'table' && (rtx.gpuClass === 'high' || rtx.gpuClass === 'ultra'), rtx);
  const iris = resolveGpu('Intel Iris Xe Graphics');
  check('iris xe → integrated', iris.gpuClass === 'integrated', iris);
  const unknown = resolveGpu('');
  check('empty gpu → unknown/integrated', unknown.source === 'unknown' && unknown.gpuClass === 'integrated', unknown);
}

console.log('— field parsers —');
{
  check('parseRamGb "16 GB" = 16', parseRamGb('16 GB') === 16);
  check('parseStorage "512GB SSD NVMe"', JSON.stringify(parseStorage('512GB SSD NVMe')) === JSON.stringify({ sizeGb: 512, type: 'nvme' }));
  check('parseStorage "1TB HDD"', JSON.stringify(parseStorage('1TB HDD')) === JSON.stringify({ sizeGb: 1024, type: 'hdd' }));
  check('parseStorage bare "512"', parseStorage('512').sizeGb === 512);
  check('parseStorage bare "1" → 1TB', parseStorage('1').sizeGb === 1024);
  const screen = parseScreen('15.6" IPS 144Hz');
  check('parseScreen 15.6 ips 144', screen.sizeIn === 15.6 && screen.panel === 'ips' && screen.refreshHz === 144, screen);
  check('segment: legion + high gpu → gaming', inferSegment('lenovo legion 5', 'high') === 'gaming');
  check('segment: zenbook + integrated → ultrabook', inferSegment('asus zenbook 14', 'integrated') === 'ultrabook');
}

console.log('— L1: enough exact comps —');
{
  const listings = [
    usedListing({ price_thb: 14500 }),
    usedListing({ price_thb: 15200 }),
    usedListing({ price_thb: 13900 }),
    usedListing({ price_thb: 16000 }),
  ];
  const result = computeNotebookPrice(baseTarget, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  check('level L1', result?.level === 'L1', result?.level);
  check('price within listing range', !!result && result.marketPrice >= 13900 && result.marketPrice <= 16000, result?.marketPrice);
  check('confidence ≥ 0.6', !!result && result.confidence >= 0.6, result?.confidence);
}

console.log('— L2: family comps get adjusted toward target —');
{
  // Target has 16GB; family comps are the 8GB config → adjusted price must rise.
  const listings = [
    usedListing({ price_thb: 13000 }),
    usedListing({
      title: 'IdeaPad Gaming 3 15 i5-12450H RTX 3050 8/512',
      match: 'family',
      ram_gb: 8,
      price_thb: 12000,
    }),
    usedListing({
      title: 'IdeaPad Gaming 3 15 i5-12450H RTX 3050 8/512 มือสอง',
      match: 'family',
      ram_gb: 8,
      price_thb: 12400,
    }),
  ];
  const result = computeNotebookPrice(baseTarget, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  check('level L2', result?.level === 'L2', result?.level);
  const familyComp = result?.comps.find((c) => c.listing.ram_gb === 8);
  check('8GB comp adjusted upward', !!familyComp && familyComp.adjustedPrice > familyComp.listing.price_thb, familyComp?.breakdown);
  check('ram factor ≈ 1.15', !!familyComp && Math.abs(familyComp.breakdown.ram - 1.15) < 0.01, familyComp?.breakdown.ram);
}

console.log('— tier demotion: labeled exact but different CPU —');
{
  const listings = [
    usedListing({
      title: 'Lenovo IdeaPad 3 15 i3-1115G4 8/256',
      match: 'exact', // lying label — config says otherwise
      cpu: 'i3-1115G4',
      ram_gb: 8,
      storage_gb: 256,
      gpu: 'Intel UHD Graphics',
      price_thb: 6500,
    }),
  ];
  const result = computeNotebookPrice(baseTarget, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  // i3+integrated vs i5+RTX3050: adjustment factor likely exceeds the cap → dropped, or demoted to family.
  const demotedOrDropped =
    !result || result.level === 'L4' || result.comps.every((c) => c.tier !== 'exact');
  check('exact label demoted or comp dropped', demotedOrDropped, result?.comps.map((c) => c.tier));
}

console.log('— L5: anchors only (no used market data) —');
{
  const target: NotebookSpec = { ...baseTarget, releaseYear: NOW_YEAR - 2 };
  const listings: NotebookListingInput[] = [
    usedListing({
      title: 'Lenovo IdeaPad Gaming 3 ราคาใหม่ JIB',
      listing_kind: 'new_current',
      price_thb: 30000,
      source: 'jib',
    }),
  ];
  const result = computeNotebookPrice(target, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  check('level L5', result?.level === 'L5', result?.level);
  // age 2 → factor 0.78 - 0.03*2 = 0.72 → 21600
  check('depreciated value ≈ 21600', !!result && Math.abs(result.marketPrice - 21600) < 300, result?.marketPrice);
  check('L5 confidence < 0.5', !!result && result.confidence < 0.5, result?.confidence);
}

console.log('— anchor guardrail clamps runaway comps —');
{
  const target: NotebookSpec = { ...baseTarget, releaseYear: NOW_YEAR - 2 };
  const listings = [
    usedListing({ price_thb: 39000 }),
    usedListing({ price_thb: 40000 }),
    usedListing({ price_thb: 41000 }),
    usedListing({
      title: 'ราคาใหม่ JIB',
      listing_kind: 'new_current',
      price_thb: 30000,
    }),
  ];
  const result = computeNotebookPrice(target, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  // L5 value = 21600; band hi = 1.2 × 21600 = 25920 → comps ~40k must clamp down.
  check('clampedByAnchor', result?.clampedByAnchor === true, result);
  check('price ≤ 1.2×anchor', !!result && result.marketPrice <= 25920 + 1, result?.marketPrice);
}

console.log('— junk listings are filtered —');
{
  const listings = [
    usedListing({ title: 'ขายซาก IdeaPad Gaming 3 จอแตก อะไหล่', price_thb: 3000 }),
    usedListing({ price_thb: 300 }), // below min price
  ];
  const result = computeNotebookPrice(baseTarget, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  check('no usable data → null (→ 422 in route)', result === null, result?.level);
}

console.log('— shorthand config parsing from titles (8/512) —');
{
  const listings = [
    usedListing({
      title: 'IdeaPad Gaming 3 15 i5-12450H RTX3050 8/512 สภาพสวย',
      match: 'family',
      cpu: null,
      ram_gb: null,
      storage_gb: null,
      storage_type: null,
      gpu: null,
      price_thb: 12000,
    }),
  ];
  const result = computeNotebookPrice(baseTarget, listings, DEFAULT_NOTEBOOK_PRICING_CONFIG, NOW_YEAR);
  const comp = result?.comps[0];
  check('ram parsed from title → factor ≈ 1.15', !!comp && Math.abs(comp.breakdown.ram - 1.15) < 0.01, comp?.breakdown);
  check('cpu parsed from title → factor 1.0', !!comp && Math.abs(comp.breakdown.cpu - 1) < 0.001, comp?.breakdown);
}

console.log('');
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed`);
  process.exit(1);
}
console.log('✅ all notebook-pricing tests passed');
