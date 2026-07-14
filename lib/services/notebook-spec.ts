// Notebook (laptop) spec extraction + benchmark lookup.
//
// Turns the free-text form fields (brand/model/cpu/ram/storage/gpu) into a
// canonical NotebookSpec with numeric CPU/GPU benchmark scores, so that
// lib/services/notebook-pricing.ts can adjust comparable-listing prices
// between configs. See NOTEBOOK_PRICING.md.

import benchmarksJson from '@/lib/data/notebook-benchmarks.json';
import { anthropicStructured, getAnthropicVisionModel, hasAnthropicKeys } from '@/lib/services/anthropic-llm';

export type StorageType = 'nvme' | 'sata' | 'hdd';
export type PanelType = 'tn' | 'ips' | 'oled';
export type NotebookSegment = 'office' | 'ultrabook' | 'gaming' | 'workstation';
export type GpuClass = 'integrated' | 'entry' | 'mid' | 'high' | 'ultra';
export type ScoreSource = 'table' | 'heuristic' | 'unknown';

export interface BenchmarkEntry {
  id: string;
  kind: 'cpu' | 'gpu';
  brand: string;
  name: string;
  aliases: string[];
  score: number;
  year: number | null;
  tier: 'entry' | 'low' | 'mid' | 'high' | 'ultra';
}

export interface ResolvedCpu {
  model: string;
  score: number | null;
  year: number | null;
  source: ScoreSource;
  benchmarkId?: string;
}

export interface ResolvedGpu {
  model: string;
  score: number | null;
  gpuClass: GpuClass;
  source: ScoreSource;
  benchmarkId?: string;
}

export interface NotebookSpec {
  brand: string;
  family: string;
  variant?: string | null;
  productName: string;
  cpuModel?: string | null;
  cpuScore?: number | null;
  cpuScoreSource: ScoreSource;
  cpuYear?: number | null;
  ramGb?: number | null;
  storageGb?: number | null;
  storageType?: StorageType | null;
  gpuModel?: string | null;
  gpuScore?: number | null;
  gpuClass: GpuClass;
  gpuScoreSource: ScoreSource;
  screenSizeIn?: number | null;
  panel?: PanelType | null;
  refreshHz?: number | null;
  releaseYear?: number | null;
  segment: NotebookSegment;
}

const BENCHMARKS: BenchmarkEntry[] = (benchmarksJson as { entries: BenchmarkEntry[] }).entries;

// ---------------------------------------------------------------------------
// Alias matching
// ---------------------------------------------------------------------------

const normalizeHard = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

interface AliasIndexEntry {
  alias: string; // normalized
  entry: BenchmarkEntry;
}

const buildAliasIndex = (kind: 'cpu' | 'gpu'): AliasIndexEntry[] => {
  const seen = new Set<string>();
  const out: AliasIndexEntry[] = [];
  for (const entry of BENCHMARKS) {
    if (entry.kind !== kind) continue;
    const aliases = new Set<string>([entry.id, ...(entry.aliases || [])].map(normalizeHard));
    for (const alias of aliases) {
      if (!alias) continue;
      const key = `${alias}::${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ alias, entry });
    }
  }
  // Longest aliases first so the most specific match wins.
  return out.sort((a, b) => b.alias.length - a.alias.length);
};

const CPU_ALIAS_INDEX = buildAliasIndex('cpu');
const GPU_ALIAS_INDEX = buildAliasIndex('gpu');

// Very short aliases ("m1", "n100") only match as a whole token of the raw
// string, otherwise they would match inside unrelated model numbers.
const SHORT_ALIAS_MAX = 4;

function lookupBenchmark(kind: 'cpu' | 'gpu', raw: string): BenchmarkEntry | null {
  const normalized = normalizeHard(raw);
  if (!normalized) return null;
  const index = kind === 'cpu' ? CPU_ALIAS_INDEX : GPU_ALIAS_INDEX;
  const tokens = new Set(
    raw
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );

  for (const { alias, entry } of index) {
    if (alias.length > SHORT_ALIAS_MAX) {
      if (normalized.includes(alias)) return entry;
    } else if (tokens.has(alias)) {
      return entry;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Heuristic CPU scoring (last resort when the chip is not in the table)
// ---------------------------------------------------------------------------

const clampNumber = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function heuristicCpu(raw: string): { score: number; year: number | null } | null {
  const text = raw.toLowerCase();

  // Intel Core iX-XXXX(X) with optional suffix (8250U, 9750H, 10510U, 1135G7, 12450H...)
  const intel = text.match(/i([3579])[\s-]?(\d{4,5})\s?(g\d|hx|hk|hq|hs|h|p|u|y)?/);
  if (intel) {
    const familyDigit = Number(intel[1]);
    const digits = intel[2];
    const suffix = intel[3] || '';
    let gen: number;
    if (suffix.startsWith('g')) {
      gen = Number(digits.slice(0, 2));
    } else if (digits.length === 5) {
      gen = Number(digits.slice(0, 2));
    } else {
      gen = Number(digits[0]) >= 6 ? Number(digits[0]) : Number(digits.slice(0, 2));
    }
    gen = clampNumber(gen, 6, 16);
    const familyBase: Record<number, number> = { 3: 5500, 5: 7000, 7: 8300, 9: 9500 };
    const suffixFactor = suffix === 'hx' ? 1.85 : /^h/.test(suffix) ? 1.55 : suffix === 'p' ? 1.3 : 1.0;
    const score = familyBase[familyDigit] * Math.pow(1.11, gen - 8) * suffixFactor;
    return { score: Math.round(score), year: 2010 + gen };
  }

  // Intel Core Ultra 5/7/9 (100/200 series)
  const ultra = text.match(/ultra\s*([579])\s*(\d{3})\s?(v|u|h|hx)?/);
  if (ultra) {
    const base: Record<string, number> = { '5': 20000, '7': 23000, '9': 26000 };
    const suffix = ultra[3] || 'h';
    const factor = suffix === 'u' ? 0.65 : suffix === 'v' ? 0.85 : suffix === 'hx' ? 1.2 : 1.0;
    return { score: Math.round(base[ultra[1]] * factor), year: 2024 };
  }

  // AMD Ryzen AI 300 series
  const ryzenAi = text.match(/ryzen\s*ai\s*([579])/);
  if (ryzenAi) {
    const base: Record<string, number> = { '5': 20000, '7': 23000, '9': 27000 };
    return { score: base[ryzenAi[1]], year: 2024 };
  }

  // AMD Ryzen 3/5/7/9 XXXX with suffix
  const ryzen = text.match(/ryzen\s*([3579])[\s-]*(\d{4})\s?(hx|hs|h|u|c)?/);
  if (ryzen) {
    const familyDigit = Number(ryzen[1]);
    const series = clampNumber(Number(ryzen[2][0]), 2, 8);
    const suffix = ryzen[3] || 'u';
    const familyBase: Record<number, number> = { 3: 6000, 5: 7800, 7: 9200, 9: 11000 };
    const suffixFactor = suffix === 'hx' ? 1.6 : suffix === 'h' ? 1.35 : suffix === 'hs' ? 1.25 : 1.0;
    const score = familyBase[familyDigit] * Math.pow(1.2, series - 3) * suffixFactor;
    return { score: Math.round(score), year: 2016 + series };
  }

  // Apple M1-M4 (base / Pro / Max)
  const apple = text.match(/\bm([1-4])\s*(pro|max|ultra)?/);
  if (apple) {
    const n = Number(apple[1]);
    const variant = apple[2] || '';
    const variantFactor = variant === 'max' ? 1.75 : variant === 'pro' ? 1.45 : 1.0;
    const years: Record<number, number> = { 1: 2020, 2: 2022, 3: 2023, 4: 2024 };
    return { score: Math.round(15000 * Math.pow(1.22, n - 1) * variantFactor), year: years[n] };
  }

  // Intel N-series (N95/N100/N200/N305) — surprisingly capable budget chips
  if (/\bn\s?(\d{2,3})\b/.test(text) && /intel|celeron|processor|^n/.test(text)) {
    return { score: 5000, year: 2023 };
  }

  // Legacy budget chips
  if (/celeron|pentium|athlon|a[469][\s-]?9\d{3}/.test(text)) {
    return { score: 2200, year: null };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Heuristic GPU scoring / classification
// ---------------------------------------------------------------------------

export function gpuClassFromScore(score: number): GpuClass {
  if (score < 3200) return 'integrated';
  if (score < 8500) return 'entry';
  if (score < 16000) return 'mid';
  if (score < 24000) return 'high';
  return 'ultra';
}

const GPU_CLASS_REPRESENTATIVE_SCORE: Record<GpuClass, number> = {
  integrated: 2500,
  entry: 5500,
  mid: 12000,
  high: 19000,
  ultra: 28000,
};

const INTEGRATED_GPU_PATTERN =
  /iris|uhd|hd\s?graphics|intel\s?graphics|\bxe\b|vega\s?\d|radeon\s?(graphics|6\d0m|7\d0m|8\d0m)|integrated|onboard|ออนบอร์ด|การ์ดจอในตัว/;

function heuristicGpu(raw: string): { score: number; gpuClass: GpuClass } | null {
  const text = raw.toLowerCase();

  if (INTEGRATED_GPU_PATTERN.test(text)) {
    return { score: 2500, gpuClass: 'integrated' };
  }

  const rtx = text.match(/rtx\s*a?(\d{4})\s*(ti)?/);
  if (rtx) {
    const model = Number(rtx[1]);
    const tierDigit = Math.floor((model % 100) / 10); // 4060 -> 6
    const gen = Math.floor(model / 1000); // 2..5
    let gpuClass: GpuClass;
    if (tierDigit <= 5) gpuClass = gen >= 4 ? 'high' : 'mid';
    else if (tierDigit === 6) gpuClass = 'high';
    else gpuClass = 'ultra';
    return { score: GPU_CLASS_REPRESENTATIVE_SCORE[gpuClass], gpuClass };
  }

  const gtx = text.match(/gtx\s*(\d{3,4})\s*(ti)?/);
  if (gtx) {
    const model = Number(gtx[1]);
    const gpuClass: GpuClass = model >= 1660 ? 'mid' : model >= 1060 ? 'mid' : 'entry';
    return { score: GPU_CLASS_REPRESENTATIVE_SCORE[gpuClass], gpuClass };
  }

  if (/\bmx\s*\d{3}\b/.test(text)) {
    return { score: 3800, gpuClass: 'entry' };
  }

  if (/quadro|rtx\s*a\d{3,4}|t\d{3,4}\b|ada/.test(text)) {
    return { score: 8000, gpuClass: 'mid' };
  }

  const rx = text.match(/rx\s*(\d{4})m/);
  if (rx) {
    const model = Number(rx[1]);
    const gpuClass: GpuClass = model >= 6700 ? 'high' : 'mid';
    return { score: GPU_CLASS_REPRESENTATIVE_SCORE[gpuClass], gpuClass };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public resolvers (used for both the pawner's item and harvested listings)
// ---------------------------------------------------------------------------

export function resolveCpu(raw: string | null | undefined): ResolvedCpu {
  const model = (raw || '').trim();
  if (!model) return { model: '', score: null, year: null, source: 'unknown' };

  const entry = lookupBenchmark('cpu', model);
  if (entry) {
    return { model: entry.name, score: entry.score, year: entry.year, source: 'table', benchmarkId: entry.id };
  }

  const heuristic = heuristicCpu(model);
  if (heuristic) {
    return { model, score: heuristic.score, year: heuristic.year, source: 'heuristic' };
  }

  return { model, score: null, year: null, source: 'unknown' };
}

export function resolveGpu(raw: string | null | undefined): ResolvedGpu {
  const model = (raw || '').trim();
  if (!model) return { model: '', score: null, gpuClass: 'integrated', source: 'unknown' };

  const entry = lookupBenchmark('gpu', model);
  if (entry) {
    return {
      model: entry.name,
      score: entry.score,
      gpuClass: gpuClassFromScore(entry.score),
      source: 'table',
      benchmarkId: entry.id,
    };
  }

  const heuristic = heuristicGpu(model);
  if (heuristic) {
    return { model, score: heuristic.score, gpuClass: heuristic.gpuClass, source: 'heuristic' };
  }

  return { model, score: null, gpuClass: 'integrated', source: 'unknown' };
}

// ---------------------------------------------------------------------------
// Free-text field parsers
// ---------------------------------------------------------------------------

export function parseRamGb(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = String(raw).toLowerCase().match(/(\d{1,3})\s*(gb|g\b)?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 256) return null;
  return value;
}

export function parseStorage(raw: string | null | undefined): { sizeGb: number | null; type: StorageType | null } {
  if (!raw) return { sizeGb: null, type: null };
  const text = String(raw).toLowerCase();

  let sizeGb: number | null = null;
  const tb = text.match(/(\d+(?:\.\d+)?)\s*tb/);
  const gb = text.match(/(\d+(?:\.\d+)?)\s*gb/);
  if (tb) sizeGb = Math.round(Number(tb[1]) * 1024);
  else if (gb) sizeGb = Math.round(Number(gb[1]));
  else {
    const bare = text.match(/(\d+(?:\.\d+)?)/);
    if (bare) {
      const value = Number(bare[1]);
      if (value > 0 && value <= 8) sizeGb = Math.round(value * 1024); // "1" / "2" => TB
      else if (value >= 16 && value <= 8192) sizeGb = Math.round(value); // "512" => GB
    }
  }
  if (sizeGb !== null && (sizeGb < 16 || sizeGb > 16384)) sizeGb = null;

  let type: StorageType | null = null;
  if (/nvme|m\.?2|pcie/.test(text)) type = 'nvme';
  else if (/ssd/.test(text)) type = 'sata';
  else if (/hdd|harddisk|จานหมุน/.test(text)) type = 'hdd';

  return { sizeGb, type };
}

export function parseScreen(raw: string | null | undefined): { sizeIn: number | null; panel: PanelType | null; refreshHz: number | null } {
  if (!raw) return { sizeIn: null, panel: null, refreshHz: null };
  const text = String(raw).toLowerCase();

  let sizeIn: number | null = null;
  const size = text.match(/(\d{2}(?:\.\d)?)/);
  if (size) {
    const value = Number(size[1]);
    if (value >= 10 && value <= 21) sizeIn = value;
  }

  const panel: PanelType | null = /oled|amoled/.test(text) ? 'oled' : /ips/.test(text) ? 'ips' : /\btn\b/.test(text) ? 'tn' : null;

  let refreshHz: number | null = null;
  const refresh = text.match(/(\d{2,3})\s*hz/);
  if (refresh) {
    const value = Number(refresh[1]);
    if (value >= 60 && value <= 480) refreshHz = value;
  }

  return { sizeIn, panel, refreshHz };
}

// ---------------------------------------------------------------------------
// Segment inference
// ---------------------------------------------------------------------------

const GAMING_KEYWORDS = [
  'nitro', 'predator', 'helios', 'tuf', 'rog', 'strix', 'scar', 'zephyrus', 'legion', 'loq',
  'victus', 'omen', 'katana', 'sword', 'cyborg', 'raider', 'stealth', 'vector', 'crosshair',
  'pulse', 'alienware', 'gaming', 'gf63', 'gf65', 'thin gf',
];
const ULTRABOOK_KEYWORDS = [
  'zenbook', 'swift', 'gram', 'xps', 'spectre', 'yoga slim', 'yoga air', 'matebook',
  'magicbook', 'surface laptop', 'prestige', 'summit', 'vivobook s', 'macbook air',
];
const WORKSTATION_KEYWORDS = ['thinkpad p', 'zbook', 'precision', 'workstation'];

export function inferSegment(haystack: string, gpuClass: GpuClass): NotebookSegment {
  const text = haystack.toLowerCase();
  if (WORKSTATION_KEYWORDS.some((k) => text.includes(k))) return 'workstation';
  if (GAMING_KEYWORDS.some((k) => text.includes(k))) return 'gaming';
  if (gpuClass === 'mid' || gpuClass === 'high' || gpuClass === 'ultra') return 'gaming';
  if (ULTRABOOK_KEYWORDS.some((k) => text.includes(k))) return 'ultrabook';
  return 'office';
}

// ---------------------------------------------------------------------------
// Spec extraction (LLM canonicalization + local benchmark attach)
// ---------------------------------------------------------------------------

export interface NotebookSpecInput {
  brand: string;
  model: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  capacity?: string;
  gpu?: string;
  screenSize?: string;
  note?: string;
  defects?: string;
  // Uploaded item photos (data: or https URLs). Used to read specs off
  // "About" screens / spec stickers when the typed fields are missing/junk.
  images?: string[];
}

// ---------------------------------------------------------------------------
// Junk-input cleaning + vision rescue
// ---------------------------------------------------------------------------

// Values pawners type when they don't know a field ("ไม่รู้") — these must
// never reach search queries or the canonicalizer as if they were real specs
// (a "Dell ไม่รู้" target harvested generic cheap Dell listings as "exact").
const JUNK_INPUT_PATTERN = /^(ไม่รู้|ไม่ทราบ|ไม่แน่ใจ|ไม่รู้จัก|จำไม่ได้|ไม่มีข้อมูล|unknown|idk|n\/?a|none|-+|\.+|\?+)$/i;

export function cleanJunkValue(value?: string | null): string {
  const trimmed = (value || '').trim();
  if (!trimmed || JUNK_INPUT_PATTERN.test(trimmed)) return '';
  return trimmed;
}

// "ไม่มี" for the GPU field is information (no discrete GPU), not junk.
function normalizeGpuInput(value?: string | null): string {
  const trimmed = (value || '').trim();
  if (/^(ไม่มี|no|none|onboard|ออนบอร์ด|การ์ดจอในตัว)$/i.test(trimmed)) return 'integrated';
  return cleanJunkValue(trimmed);
}

export interface NotebookVisionSpec {
  brand: string | null;
  model: string | null;
  cpu: string | null;
  ramGb: number | null;
  storageGb: number | null;
  storageType: string | null;
  gpu: string | null;
}

const VISION_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brand: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
    cpu: { type: ['string', 'null'] },
    ramGb: { type: ['number', 'null'] },
    storageGb: { type: ['number', 'null'] },
    storageType: { type: ['string', 'null'] },
    gpu: { type: ['string', 'null'] },
  },
  required: ['brand', 'model', 'cpu', 'ramGb', 'storageGb', 'storageType', 'gpu'],
};

const MAX_VISION_SPEC_IMAGES = 4;

// Reads specs off the uploaded photos: Windows "About"/system screens, BIOS
// pages, spec stickers, chassis labels. Nulls for anything not actually
// visible — never guesses from the laptop's appearance alone.
export async function extractNotebookSpecFromImages(images: string[]): Promise<NotebookVisionSpec | null> {
  return anthropicStructured<NotebookVisionSpec>({
    userText: `These are photos of a laptop being pawned. Extract ONLY specs you can actually read in the images (system "About" screens, BIOS screens, spec stickers, chassis labels, retail boxes):
- brand (e.g. Dell, Lenovo, ASUS)
- model: the model/series shown (e.g. "Precision 5680", "IdeaPad Gaming 3 15ACH6") — NOT a random Windows device name unless it clearly states the model
- cpu (e.g. "Intel Core i7-13800H", "AMD Ryzen 5 5600H")
- ramGb (number, in GB)
- storageGb (number, in GB; 1TB = 1024)
- storageType ("nvme" | "sata" | "hdd") only if explicitly indicated
- gpu (discrete GPU model if shown)
Use null for anything not visible. Do NOT guess.`,
    images: images.slice(0, MAX_VISION_SPEC_IMAGES),
    model: getAnthropicVisionModel(),
    toolName: 'notebook_vision_spec',
    toolDescription: 'Return the specs readable in the photos.',
    maxTokens: 500,
    schema: VISION_SPEC_SCHEMA,
  });
}

interface LlmCanonicalSpec {
  family: string;
  variant: string | null;
  cpuModel: string | null;
  ramGb: number | null;
  storageGb: number | null;
  storageType: string | null;
  gpuModel: string | null;
  screenSizeIn: number | null;
  panel: string | null;
  refreshHz: number | null;
  releaseYear: number | null;
  segment: string | null;
}

const LLM_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    family: { type: 'string', description: 'Model family WITHOUT SKU/part-number suffixes, e.g. "IdeaPad 3 15" from "IdeaPad 3 15ALC6 82KU"' },
    variant: { type: ['string', 'null'], description: 'SKU/variant suffix if present, e.g. "15ALC6 82KU"' },
    cpuModel: { type: ['string', 'null'], description: 'Canonical CPU model, e.g. "Intel Core i5-12450H" or "AMD Ryzen 5 5500U"' },
    ramGb: { type: ['number', 'null'] },
    storageGb: { type: ['number', 'null'], description: 'Storage size in GB (1TB = 1024)' },
    storageType: { type: ['string', 'null'], enum: ['nvme', 'sata', 'hdd', null] },
    gpuModel: { type: ['string', 'null'], description: 'Discrete GPU model, or the integrated GPU name, e.g. "RTX 3050 Laptop", "Iris Xe"' },
    screenSizeIn: { type: ['number', 'null'] },
    panel: { type: ['string', 'null'], enum: ['tn', 'ips', 'oled', null] },
    refreshHz: { type: ['number', 'null'] },
    releaseYear: { type: ['number', 'null'], description: 'Year this laptop model was released, if known' },
    segment: { type: ['string', 'null'], enum: ['office', 'ultrabook', 'gaming', 'workstation', null] },
  },
  required: [
    'family', 'variant', 'cpuModel', 'ramGb', 'storageGb', 'storageType', 'gpuModel',
    'screenSizeIn', 'panel', 'refreshHz', 'releaseYear', 'segment',
  ],
} as const;

export async function extractNotebookSpec(input: NotebookSpecInput, productName?: string): Promise<NotebookSpec> {
  // 1) Strip junk values ("ไม่รู้", "-", "n/a") so they never masquerade as specs.
  const cleaned = {
    brand: cleanJunkValue(input.brand),
    model: cleanJunkValue(input.model),
    cpu: cleanJunkValue(input.cpu),
    ram: cleanJunkValue(input.ram),
    storage: cleanJunkValue(input.storage),
    capacity: cleanJunkValue(input.capacity),
    gpu: normalizeGpuInput(input.gpu),
    screenSize: cleanJunkValue(input.screenSize),
    note: (input.note || '').trim(),
  };
  const inputWasJunk = !cleaned.model || !cleaned.cpu;

  // 2) Vision rescue: read missing specs off the uploaded photos (About
  //    screens / spec stickers) instead of pricing a spec-less "Dell Notebook".
  const needVision =
    (input.images?.length ?? 0) > 0 &&
    (!cleaned.model || !cleaned.cpu || !cleaned.ram || !cleaned.storage);
  if (needVision && hasAnthropicKeys()) {
    try {
      const vision = await extractNotebookSpecFromImages(input.images!);
      if (vision) {
        console.log('💻 Vision spec extraction:', vision);
        if (!cleaned.brand && vision.brand) cleaned.brand = vision.brand.trim();
        if (!cleaned.model && vision.model) cleaned.model = vision.model.trim();
        if (!cleaned.cpu && vision.cpu) cleaned.cpu = vision.cpu.trim();
        if (!cleaned.ram && vision.ramGb && vision.ramGb > 0 && vision.ramGb <= 256) {
          cleaned.ram = `${vision.ramGb}GB`;
        }
        if (!cleaned.storage && vision.storageGb && vision.storageGb >= 16 && vision.storageGb <= 16384) {
          const type = ['nvme', 'sata', 'hdd'].includes(vision.storageType || '') ? ` ${vision.storageType!.toUpperCase()}` : '';
          cleaned.storage = `${vision.storageGb}GB${type}`;
        }
        if (!cleaned.gpu && vision.gpu) cleaned.gpu = vision.gpu.trim();
      }
    } catch (error) {
      console.warn('⚠️ Vision spec extraction failed:', error);
    }
  }

  const brandFinal = cleaned.brand || input.brand;
  const storageRaw = cleaned.storage || cleaned.capacity || '';
  const haystack = [brandFinal, cleaned.model, cleaned.cpu, cleaned.gpu, cleaned.note].filter(Boolean).join(' ');

  // Heuristic baseline (always computed; also the no-LLM fallback).
  const heuristicRam = parseRamGb(cleaned.ram);
  const heuristicStorage = parseStorage(storageRaw);
  const heuristicScreen = parseScreen(cleaned.screenSize || cleaned.model || '');

  let llm: LlmCanonicalSpec | null = null;
  if (hasAnthropicKeys()) {
    try {
      llm = await anthropicStructured<LlmCanonicalSpec>({
        userText: `Canonicalize this laptop's specs for a Thai used-laptop price-estimation system.
Input (free text typed by a pawner; photo-extracted values may be merged in):
- Brand: ${brandFinal}
- Model: ${cleaned.model || '-'}
- CPU: ${cleaned.cpu || '-'}
- RAM: ${cleaned.ram || '-'}
- Storage: ${storageRaw || '-'}
- GPU: ${cleaned.gpu || '-'}
- Screen: ${cleaned.screenSize || '-'}
- Notes: ${cleaned.note || '-'}

Rules:
- "family" is the marketing family + size, WITHOUT SKU/part codes (e.g. "Lenovo IdeaPad 3 15ALC6 82KU" -> family "IdeaPad 3 15", variant "15ALC6 82KU").
- Canonicalize sloppy CPU strings ("i5 gen12 12450h" -> "Intel Core i5-12450H").
- If the model name implies specs the user omitted (e.g. MacBook, ROG), fill what you are confident about; otherwise null.
- releaseYear: the laptop model's release year if you know it, else the CPU generation's typical year, else null.
- segment: gaming/ultrabook/workstation/office by product line.`,
        toolName: 'canonical_notebook_spec',
        toolDescription: 'Return the canonicalized laptop spec.',
        maxTokens: 700,
        schema: LLM_SPEC_SCHEMA as unknown as Record<string, any>,
      });
    } catch (error) {
      console.warn('⚠️ Notebook spec LLM canonicalization failed, using heuristics:', error);
    }
  }

  const cpu = resolveCpu(llm?.cpuModel || cleaned.cpu);
  const gpu = resolveGpu(llm?.gpuModel || cleaned.gpu);

  // Never trust LLM enum values blindly — an out-of-vocabulary string (e.g.
  // storageType "ssd") would later hit factor tables as undefined and poison
  // the price math with NaN.
  const asStorageType = (v: unknown): StorageType | null =>
    v === 'nvme' || v === 'sata' || v === 'hdd' ? v : null;
  const asPanel = (v: unknown): PanelType | null =>
    v === 'tn' || v === 'ips' || v === 'oled' ? v : null;
  const asSegment = (v: unknown): NotebookSegment | null =>
    v === 'office' || v === 'ultrabook' || v === 'gaming' || v === 'workstation' ? v : null;

  const ramGb = llm?.ramGb && llm.ramGb > 0 && llm.ramGb <= 256 ? llm.ramGb : heuristicRam;
  const storageGb = llm?.storageGb && llm.storageGb >= 16 && llm.storageGb <= 16384 ? llm.storageGb : heuristicStorage.sizeGb;
  const storageType = asStorageType(llm?.storageType) || heuristicStorage.type;
  const screenSizeIn = llm?.screenSizeIn && llm.screenSizeIn >= 10 && llm.screenSizeIn <= 21 ? llm.screenSizeIn : heuristicScreen.sizeIn;
  const panel = asPanel(llm?.panel) || heuristicScreen.panel;
  const refreshHz = llm?.refreshHz && llm.refreshHz >= 60 && llm.refreshHz <= 480 ? llm.refreshHz : heuristicScreen.refreshHz;

  const releaseYear =
    llm?.releaseYear && llm.releaseYear >= 2008 && llm.releaseYear <= 2030 ? llm.releaseYear : cpu.year;

  const gpuClass = gpu.gpuClass;
  const segment = asSegment(llm?.segment) || inferSegment(haystack, gpuClass);

  const family = (llm?.family || cleaned.model || '').trim() || cleaned.model || brandFinal;

  // 3) Compose a search-worthy product name from the canonical fields. When
  //    the typed input was junk, the caller's productName was derived from
  //    that junk ("Dell Notebook") — always prefer our composition then.
  const composedName = [
    // LLMs often fold the brand into the family ("Dell Precision 5680") —
    // don't produce "Dell Dell Precision 5680".
    family.toLowerCase().includes(brandFinal.toLowerCase()) ? null : brandFinal,
    family,
    llm?.variant || null,
    cpu.model || null,
    ramGb ? `${ramGb}GB` : null,
    storageGb ? (storageGb >= 1024 ? `${Math.round(storageGb / 1024)}TB` : `${storageGb}GB`) : null,
  ].filter(Boolean).join(' ');

  const finalProductName = inputWasJunk || !productName ? composedName : productName;

  return {
    brand: brandFinal,
    family,
    variant: llm?.variant || null,
    productName: finalProductName || `${brandFinal} ${cleaned.model || input.model}`.trim(),
    cpuModel: cpu.model || null,
    cpuScore: cpu.score,
    cpuScoreSource: cpu.source,
    cpuYear: cpu.year,
    ramGb: ramGb ?? null,
    storageGb: storageGb ?? null,
    storageType: storageType ?? null,
    gpuModel: gpu.model || null,
    gpuScore: gpu.score,
    gpuClass,
    gpuScoreSource: gpu.source,
    screenSizeIn: screenSizeIn ?? null,
    panel: panel ?? null,
    refreshHz: refreshHz ?? null,
    releaseYear: releaseYear ?? null,
    segment,
  };
}
