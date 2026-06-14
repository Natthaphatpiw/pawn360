// Calls the LIVE /api/estimate endpoint for each item in benchmark-input.json
// and stores the system's actual response (marketPrice, pawnPrice, estimatedPrice).
//
// Usage:
//   node scripts/system-benchmark.js [port] [output_path]
//
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || '3001';
const IN = process.argv[3] || path.resolve(__dirname, 'benchmark-input.json');
const OUT = process.argv[4] || path.resolve(__dirname, 'benchmark-system-results.json');
const URL = `http://localhost:${PORT}/api/estimate`;

// 1x1 transparent gif as data URL → handled inline by image-hash path (no network fetch)
const DUMMY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const LINE_ID = 'benchmark-runner';

const items = JSON.parse(fs.readFileSync(IN, 'utf8'));

function buildPayload(item) {
  const itemTypeMap = {
    iPhone: 'โทรศัพท์มือถือ',
    iPad: 'แท็บเล็ต',
    MacBook: 'โน้ตบุ๊ก',
    AppleWatch: 'สมาร์ทวอทช์',
    AirPods: 'หูฟัง',
  };

  return {
    itemType: itemTypeMap[item.category] || 'อิเล็กทรอนิกส์',
    brand: 'Apple',
    model: item.model,
    capacity: item.storage || undefined,
    storage: item.storage || undefined,
    ram: item.ram || undefined,
    cpu: item.cpu || undefined,
    screenSize: item.screen_size || undefined,
    watchSize: item.watch_size || undefined,
    watchConnectivity: item.connectivity && item.category === 'AppleWatch' ? item.connectivity : undefined,
    appleCategory: item.category,
    condition: 1.0,            // 100% — isolate algorithm output (no condition discount)
    accessories: '',
    defects: '',
    note: `benchmark id=${item.id}`,
    images: [DUMMY_IMAGE],
    lineId: LINE_ID,
  };
}

async function postEstimate(payload) {
  const t0 = Date.now();
  let res, body;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    body = await res.json();
  } catch (e) {
    return { ok: false, error: String(e), latency_ms: Date.now() - t0 };
  }
  return { ok: res.ok, status: res.status, body, latency_ms: Date.now() - t0 };
}

(async () => {
  const out = [];
  for (const item of items) {
    process.stderr.write(`[${item.id}] calling /api/estimate ... `);
    const payload = buildPayload(item);
    const r = await postEstimate(payload);
    if (!r.ok) {
      process.stderr.write(`FAIL (${r.status || 'err'}) ${r.error || JSON.stringify(r.body)}\n`);
      out.push({ id: item.id, label: item.label, n_raw: item.listings.length, error: r.error || r.body });
      continue;
    }
    const b = r.body;
    process.stderr.write(
      `market=${b.marketPrice} pawn=${b.pawnPrice} final=${b.estimatedPrice} ` +
      `cond=${(b.condition * 100).toFixed(0)}% (${r.latency_ms}ms)\n`
    );
    out.push({
      id: item.id,
      label: item.label,
      category: item.category,
      model: item.model,
      storage: item.storage || '',
      ram: item.ram || '',
      cpu: item.cpu || '',
      watch_size: item.watch_size || '',
      connectivity: item.connectivity || '',
      year: item.year || '',
      n_raw_local: item.listings?.length ?? 0,
      system_market_price: b.marketPrice,
      system_pawn_price: b.pawnPrice,
      system_estimated_price: b.estimatedPrice,
      system_condition: b.condition,
      normalized_product_name: b.normalizedInput?.productName,
      calculation_market: b.calculation?.marketPrice,
      calculation_pawn: b.calculation?.pawnPrice,
      calculation_final: b.calculation?.finalPrice,
      latency_ms: r.latency_ms,
    });
    // brief pause between calls
    await new Promise((r) => setTimeout(r, 500));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  process.stderr.write(`\nSaved ${out.length} results to ${OUT}\n`);
  console.log(JSON.stringify(out, null, 2));
})();
