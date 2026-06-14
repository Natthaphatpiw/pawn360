/**
 * Backtest: run the production /api/estimate pricing pipeline against the
 * Astly CM pawn-contract CSV, with condition forced to 100% for every row.
 *
 * Faithful to app/api/estimate/route.ts:
 *   normalizeInput (gpt-4.1-mini)  ->  productName
 *   fetchWebSearchPrices (gpt-4.1 + web_search, country TH)  ->  listings
 *   computeRepresentativeUsedPriceTHB (REAL import)          ->  marketPrice
 *   marketPrice * 0.6 -> pawnPrice ; * condition(=1.0) ; snap to 500
 *
 * SerpAPI is OFF (matches .env: no SERPAPI_ENABLED) and USE_TH_WEIGHTS=false,
 * so this is exactly the live config for this deployment.
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { computeRepresentativeUsedPriceTHB } from './lib/services/price-representative.ts';

// ---------- constants copied verbatim from route.ts ----------
const MODEL = 'gpt-4.1-mini';
const PRICE_SEARCH_MODEL = 'gpt-4.1';
const MIN_ESTIMATE_PRICE = 100;
const WEB_SEARCH_MIN_ITEMS = 4;
const WEB_SEARCH_MAX_ITEMS = 8;
const WEB_SEARCH_MAX_OUTPUT_TOKENS = 1200;

// ---------- env ----------
function loadOpenAIKey(): string {
  const dir = process.cwd();
  for (const f of ['.env.local', '.env']) {
    try {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      const m = txt.match(/^OPENAI_API_KEY=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* ignore */ }
  }
  throw new Error('OPENAI_API_KEY not found in .env.local/.env');
}
const client = new OpenAI({ apiKey: loadOpenAIKey() });

// ---------- helpers copied from route.ts ----------
function getResponseText(response: any): string {
  if (typeof response?.output_text === 'string') return response.output_text;
  if (!Array.isArray(response?.output)) return '';
  return response.output
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n');
}
function parseJsonFromText<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]) as T; } catch { return null; }
  }
}
function buildWebSearchQuery(productName: string): string {
  const hasThai = /[ก-๙]/.test(productName);
  return hasThai ? `${productName} ราคา มือสอง` : `${productName} used price Thailand`;
}

// ---------- Agent 1: normalizeInput (verbatim prompt) ----------
async function normalizeInput(brand: string, model: string, itemType: string): Promise<string> {
  const condition = 1.0;
  const conditionPercent = condition <= 1 ? Math.round(condition * 100) : Math.round(condition);
  const prompt = `คุณเป็นผู้เชี่ยวชาญประเมินราคาสินค้ามือสองในประเทศไทย ทำ 1 งาน:
1) Normalize ชื่อสินค้าให้ชัดเจนและใช้ค้นหาแล้วเจอสินค้าจริง

ข้อกำหนด:
- ชื่อสินค้า (productName) ต้องรวม Brand + Model + รายละเอียดสำคัญที่ช่วยค้นหา (เช่น ความจุ/สเปค/ปี)
- ห้ามใส่ "สี" ในชื่อสินค้า และไม่ต้องใช้สีในการประเมินราคา
- ห้ามใส่ Serial Number ในชื่อสินค้า

ข้อมูลสินค้า:
- ประเภท: ${itemType}
- ยี่ห้อ: ${brand}
- รุ่น: ${model}
- Serial: -
- อุปกรณ์เสริม: -
- สภาพ (รวมผู้ใช้+AI): ${conditionPercent}%
- ตำหนิ: -
- หมายเหตุ: -

ตอบกลับเป็น JSON เท่านั้น:
{
  "productName": "ชื่อสินค้า"
}`;
  const response = await client.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: 300,
    temperature: 0,
    text: {
      format: {
        type: 'json_schema', name: 'normalized_item', strict: true,
        schema: {
          type: 'object', additionalProperties: false,
          properties: { productName: { type: 'string' } },
          required: ['productName'],
        },
      },
    },
  } as any);
  const parsed = parseJsonFromText<{ productName: string }>(getResponseText(response));
  return parsed?.productName?.trim() || `${brand} ${model}`.trim();
}

// ---------- Agent 2: fetchWebSearchPrices (verbatim prompt/params) ----------
type WebSearchItem = { title: string; price_thb: number; source: string; url: string };
async function fetchWebSearchPrices(productName: string): Promise<WebSearchItem[]> {
  const query = buildWebSearchQuery(productName);
  const exchangeRate = 32;
  const prompt = `You are a pricing analyst. Use web_search at least once with this query: "${query}".
Return ONLY JSON with this shape:
{
  "query": "${query}",
  "items": [
    { "title": "string", "price_thb": number, "source": "string", "url": "string" }
  ]
}
Rules:
- Use only relevant items for the exact model and capacity.
- If price is not in THB, convert to THB using 1 USD = ${exchangeRate} THB.
- Keep ${WEB_SEARCH_MIN_ITEMS}-${WEB_SEARCH_MAX_ITEMS} items.
- Use canonical product URLs and remove tracking parameters when possible.`;

  const runSearch = (maxTokens: number) => client.responses.create({
    model: PRICE_SEARCH_MODEL,
    input: prompt,
    max_output_tokens: maxTokens,
    temperature: 0,
    tools: [{
      type: 'web_search', search_context_size: 'medium',
      user_location: { type: 'approximate', country: 'TH', city: 'Bangkok', timezone: 'Asia/Bangkok' },
    }],
    tool_choice: 'required',
    text: {
      format: {
        type: 'json_schema', name: 'web_search_prices', strict: true,
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            query: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  title: { type: 'string' }, price_thb: { type: 'number' },
                  source: { type: 'string' }, url: { type: 'string' },
                },
                required: ['title', 'price_thb', 'source', 'url'],
              },
            },
          },
          required: ['query', 'items'],
        },
      },
    },
  } as any);

  let response: any = await runSearch(WEB_SEARCH_MAX_OUTPUT_TOKENS);
  if (response?.status === 'incomplete' && response?.incomplete_details?.reason === 'max_output_tokens') {
    response = await runSearch(WEB_SEARCH_MAX_OUTPUT_TOKENS * 2);
  }
  const parsed = parseJsonFromText<{ items: WebSearchItem[] }>(getResponseText(response));
  if (!parsed || !Array.isArray(parsed.items)) return [];
  return parsed.items
    .filter((it) => it && it.title && Number.isFinite(it.price_thb) && it.price_thb > 0)
    .slice(0, WEB_SEARCH_MAX_ITEMS);
}

// ---------- final price math (verbatim from route.ts) ----------
function computeFinal(marketPriceRep: number) {
  const marketPrice = Math.max(marketPriceRep, MIN_ESTIMATE_PRICE);
  const pawnPrice = Math.round(marketPrice * 0.6);
  const condition = 1.0; // 100%
  const estimatedPrice = Math.round(pawnPrice * condition);
  const clampPrice = Math.max(estimatedPrice, MIN_ESTIMATE_PRICE);
  const remainder = clampPrice % 1000;
  const finalPrice = clampPrice - remainder + (remainder >= 500 ? 500 : 0);
  return { marketPrice, pawnPrice, finalPrice };
}

// ---------- RFC4180 CSV parser ----------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
function csvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function parsePriceTHB(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// ---------- concurrency pool ----------
async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------- main ----------
const INPUT = '/Users/natthaphat/Downloads/สัญญาจำนำ_Astly_CM - Sheet1.csv';
const OUTPUT = '/Users/natthaphat/Downloads/สัญญาจำนำ_Astly_CM_ผลประเมินระบบ.csv';
const CACHE = path.join(process.cwd(), 'backtest-cache.json');
const DEBUG = path.join(process.cwd(), 'backtest-debug.json');

const COL = { seq: 0, type: 7, model: 8, price: 9, redeemed: 10 };

type DeviceResult = {
  productName: string;
  listings: WebSearchItem[];
  n: number;
  marketPrice: number;
  pawnPrice: number;
  finalPrice: number;
  dispersionMode?: string;
  error?: string;
};

async function main() {
  const raw = fs.readFileSync(INPUT, 'utf8');
  const rows = parseCSV(raw);

  // data rows: seq column is a pure integer
  const dataRows = rows.filter((r) => /^\d+$/.test((r[COL.seq] || '').trim()));
  console.log(`Parsed ${dataRows.length} data rows.`);

  // unique devices keyed by type|model
  const keyOf = (r: string[]) => `${(r[COL.type] || '').trim()}|||${(r[COL.model] || '').trim()}`;
  const uniqueKeys = Array.from(new Set(dataRows.map(keyOf)));
  console.log(`${uniqueKeys.length} unique devices.`);

  // load cache
  let cache: Record<string, DeviceResult> = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* none */ }
  const FORCE = process.env.FORCE === '1';

  const toRun = uniqueKeys.filter((k) => FORCE || !cache[k] || cache[k].error || cache[k].n === 0);
  console.log(`Running ${toRun.length} devices (others cached).`);

  await pool(toRun, 4, async (key) => {
    const [itemType, model] = key.split('|||');
    try {
      const productName = await normalizeInput('Apple', model, itemType);
      let listings = await fetchWebSearchPrices(productName);
      // robustness: retry up to 2x only if web search returned nothing
      for (let attempt = 0; listings.length === 0 && attempt < 2; attempt++) {
        listings = await fetchWebSearchPrices(productName);
      }
      if (listings.length === 0) {
        cache[key] = { productName, listings: [], n: 0, marketPrice: 0, pawnPrice: 0, finalPrice: 0, error: 'no listings' };
        console.log(`✗ ${model} -> no listings`);
        return null;
      }
      const analysis = computeRepresentativeUsedPriceTHB(listings.map((l) => ({ price_thb: l.price_thb })));
      const { marketPrice, pawnPrice, finalPrice } = computeFinal(analysis.representativePrice);
      cache[key] = {
        productName, listings, n: listings.length,
        marketPrice, pawnPrice, finalPrice, dispersionMode: analysis.mode,
      };
      console.log(`✓ ${model} (${productName}) n=${listings.length} market=${marketPrice} -> pawn@100%=${finalPrice} [${analysis.mode}]`);
    } catch (e: any) {
      cache[key] = { productName: model, listings: [], n: 0, marketPrice: 0, pawnPrice: 0, finalPrice: 0, error: e?.message || String(e) };
      console.log(`✗ ${model} -> ERROR ${e?.message || e}`);
    }
    // persist cache incrementally
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    return null;
  });

  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  fs.writeFileSync(DEBUG, JSON.stringify(cache, null, 2));

  // ---------- build output CSV ----------
  const header = rows[0].slice(); // original header (row 0)
  // The original header row 0 ends at the price column having an embedded newline; rebuild cleanly:
  const baseHeaders = ['ลำดับ', 'ID บัตรประชาชน', 'วันทำสัญญา', 'วันครบกำหนด', 'ชื่อ-นามสกุลลูกค้า', 'เลขบัตรประชาชน', 'ที่อยู่', 'ประเภท', 'รุ่น/รายละเอียด', 'ราคารับจำนำ', 'รายการที่ไถ่ถอนแล้ว'];
  const newHeaders = ['ชื่อสินค้า (ระบบ normalize)', 'จำนวนรายการตลาดที่เจอ', 'ราคากลางระบบ (บาท)', 'ราคาจำนำระบบ @สภาพ100% (บาท)', 'ส่วนต่าง (จริง − ระบบ) (บาท)', 'ส่วนต่าง %', 'หมายเหตุ'];

  const outRows: string[][] = [];
  outRows.push([...baseHeaders, ...newHeaders]);

  const summary: Array<{ seq: string; model: string; actual: number | null; system: number; diff: number | null; pct: number | null; redeemed: boolean }> = [];

  for (const r of dataRows) {
    const key = keyOf(r);
    const dev = cache[key];
    const actual = parsePriceTHB(r[COL.price] || '');
    const base = [
      r[COL.seq] || '', r[1] || '', r[2] || '', r[3] || '', r[4] || '',
      r[5] || '', r[6] || '', r[COL.type] || '', r[COL.model] || '',
      r[COL.price] || '', r[COL.redeemed] || '',
    ];
    if (!dev || dev.error || dev.n === 0) {
      outRows.push([...base, dev?.productName || '', '0', '', '', '', '', dev?.error || 'no data']);
      continue;
    }
    const system = dev.finalPrice;
    const diff = actual === null ? null : actual - system;
    const pct = (actual === null || system === 0) ? null : Math.round(((actual - system) / system) * 1000) / 10;
    outRows.push([
      ...base,
      dev.productName,
      String(dev.n),
      String(dev.marketPrice),
      String(system),
      diff === null ? '' : String(diff),
      pct === null ? '' : pct.toFixed(1),
      dev.dispersionMode || '',
    ]);
    summary.push({
      seq: r[COL.seq], model: r[COL.model], actual, system, diff, pct,
      redeemed: (r[COL.redeemed] || '').includes('ไถ่ถอน'),
    });
  }

  const bom = '﻿';
  const csvText = bom + outRows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(OUTPUT, csvText);
  console.log(`\nWrote ${OUTPUT}`);

  // ---------- aggregate stats ----------
  const valid = summary.filter((s) => s.actual !== null && s.diff !== null);
  const diffs = valid.map((s) => s.diff as number);
  const absDiffs = diffs.map((d) => Math.abs(d));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
  const median = (a: number[]) => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const totalActual = sum(valid.map((s) => s.actual as number));
  const totalSystem = sum(valid.map((s) => s.system));
  const higher = valid.filter((s) => (s.diff as number) > 0).length; // actual > system
  const lower = valid.filter((s) => (s.diff as number) < 0).length;
  const equal = valid.filter((s) => (s.diff as number) === 0).length;

  console.log('\n================ SUMMARY ================');
  console.log(`Rows priced: ${valid.length}/${summary.length}`);
  console.log(`Total actual loaned:  ${totalActual.toLocaleString()} THB`);
  console.log(`Total system @100%:   ${totalSystem.toLocaleString()} THB`);
  console.log(`Total diff (actual-system): ${(totalActual - totalSystem).toLocaleString()} THB (${(((totalActual - totalSystem) / totalSystem) * 100).toFixed(1)}%)`);
  console.log(`Mean diff:   ${Math.round(mean(diffs)).toLocaleString()} THB`);
  console.log(`Median diff: ${Math.round(median(diffs)).toLocaleString()} THB`);
  console.log(`Mean |diff|: ${Math.round(mean(absDiffs)).toLocaleString()} THB`);
  console.log(`Median |diff|: ${Math.round(median(absDiffs)).toLocaleString()} THB`);
  console.log(`Actual > system: ${higher} | Actual < system: ${lower} | equal: ${equal}`);

  console.log('\nseq | model | actual | system@100% | diff | %');
  for (const s of summary) {
    console.log(
      `${s.seq.padStart(3)} | ${(s.model || '').padEnd(34).slice(0, 34)} | ` +
      `${(s.actual ?? 0).toLocaleString().padStart(8)} | ${s.system.toLocaleString().padStart(8)} | ` +
      `${(s.diff ?? 0).toLocaleString().padStart(8)} | ${s.pct === null ? '' : s.pct.toFixed(1)}`
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
