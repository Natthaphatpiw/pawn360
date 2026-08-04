/**
 * Fixed-price floor, used only when everything else has failed.
 *
 * The pricing ladder is: live market search -> new-price anchor -> this. It
 * exists for the case the other two cannot cover - an AI or search provider
 * outage, a model with no findable listings - where the alternative is telling
 * a pawner their item cannot be priced at all.
 *
 * The values are DELIBERATELY LOW. Every measured one sits below the lowest
 * p20 of real Thai listings for that model, because a fallback fires exactly
 * when we know nothing: storage tier, colour and condition are all unknown, so
 * the number has to be safe for the worst variant in its bucket. That keeps the
 * same asymmetry the rest of the pricing follows - under-valuing costs a pawner
 * some borrowing headroom, over-valuing hands an investor collateral worth less
 * than the loan.
 *
 * What it returns is a marketPrice (ราคากลาง), not a loan amount. The loan is
 * derived from it exactly like any other estimate: x 0.6 LTV, x condition.
 */

import fallbackTable from '@/lib/data/fallback-prices.json';
import type { AnchorCategory } from '@/lib/services/anchor-pricing';

export interface FallbackPriceResult {
  marketPrice: number;
  /** Rule id, or the category name when only the category default applied. */
  source: string;
  /** False when the value is extrapolated rather than backed by an observation. */
  measured: boolean;
  confidence: number;
  note: string;
}

interface FallbackRule {
  id: string;
  patterns: string[];
  price: number;
  measured: boolean;
}

/**
 * Low by construction. High enough to clear the quoting floor - a fallback
 * price is still a usable answer - but far below the bar at which anything
 * here would look like a confident valuation.
 */
const FALLBACK_CONFIDENCE = 0.3;
const FALLBACK_CONFIDENCE_UNMEASURED = 0.26;

const normalize = (value: string): string => String(value || '')
  .toLowerCase()
  .normalize('NFKC')
  // Fold punctuation to spaces so "iPhone-12" and "iPhone 12" match one rule.
  .replace(/[^a-z0-9ก-๙]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Rules are evaluated in file order and the first hit wins, so the table lists
 * the most specific variant first - "iphone 15 pro max" has to be tested before
 * "iphone 15 pro", which has to be tested before "iphone 15".
 */
function matchRule(productName: string, brand?: string, model?: string): FallbackRule | null {
  const haystack = normalize([brand, model, productName].filter(Boolean).join(' '));
  if (!haystack) return null;
  // Padded so patterns match whole tokens only. A plain substring test made
  // "watch se" match "Apple Watch Series 9", pricing a Series 9 as an SE.
  const padded = ` ${haystack} `;
  const rules = (fallbackTable as { rules: FallbackRule[] }).rules || [];
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => padded.includes(` ${normalize(pattern)} `))) return rule;
  }
  return null;
}

function categoryDefault(category: AnchorCategory): number {
  const defaults = (fallbackTable as { categoryDefaults: Record<string, number> }).categoryDefaults || {};
  const value = Number(defaults[category] ?? defaults.default);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Resolves the floor price for an item. Returns null only when even the
 * category default is unusable, which means the table is misconfigured.
 *
 * @param productName normalized product name, e.g. "Apple iPhone 14 Pro 256GB"
 * @param category    the same bucket the anchor rung uses
 */
export function resolveFallbackPrice(
  productName: string,
  category: AnchorCategory,
  brand?: string,
  model?: string,
): FallbackPriceResult | null {
  const rule = matchRule(productName, brand, model);
  if (rule && Number.isFinite(rule.price) && rule.price > 0) {
    return {
      marketPrice: Math.round(rule.price),
      source: rule.id,
      measured: rule.measured,
      confidence: rule.measured ? FALLBACK_CONFIDENCE : FALLBACK_CONFIDENCE_UNMEASURED,
      note: `ราคาอ้างอิงขั้นต่ำสำหรับรุ่นนี้ (${Math.round(rule.price).toLocaleString()} บาท) เนื่องจากระบบค้นหาราคาตลาดไม่พร้อมใช้งานชั่วคราว`,
    };
  }

  const fallback = categoryDefault(category);
  if (!fallback) return null;
  return {
    marketPrice: Math.round(fallback),
    source: `category:${category}`,
    // A category default is by definition not tied to an observation of THIS
    // model, so it never claims to be measured.
    measured: false,
    confidence: FALLBACK_CONFIDENCE_UNMEASURED,
    note: `ราคาอ้างอิงขั้นต่ำตามประเภทสินค้า (${Math.round(fallback).toLocaleString()} บาท) เนื่องจากระบบค้นหาราคาตลาดไม่พร้อมใช้งานชั่วคราว`,
  };
}
