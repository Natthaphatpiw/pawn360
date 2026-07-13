// Comps database ("price observations") for the notebook pricing flywheel.
//
// Every notebook estimate writes its harvested listings + final result here;
// later estimates for the same family read recent observations back as extra
// comparable listings (Level 0 of the ladder in NOTEBOOK_PRICING.md).
// All calls are fail-safe: DB errors are logged and swallowed so the estimate
// flow never breaks if the table is missing.

import { supabaseAdmin } from '@/lib/supabase/client';
import type { ListingKind, MatchTier, NotebookListingInput } from '@/lib/services/notebook-pricing';

export interface PriceObservationRow {
  item_type: string;
  brand?: string | null;
  family?: string | null;
  family_norm?: string | null;
  product_name?: string | null;
  listing_title?: string | null;
  listing_url?: string | null;
  source?: string | null;
  origin: 'web_search' | 'serpapi' | 'manual' | 'estimate_result';
  listing_kind: ListingKind | 'estimate';
  match_level?: MatchTier | null;
  price_thb: number;
  cpu?: string | null;
  cpu_score?: number | null;
  ram_gb?: number | null;
  storage_gb?: number | null;
  storage_type?: string | null;
  gpu?: string | null;
  gpu_score?: number | null;
  release_year?: number | null;
  segment?: string | null;
  estimate_level?: string | null;
  confidence?: number | null;
  line_id?: string | null;
  spec?: Record<string, unknown> | null;
}

export const normalizeFamilyKey = (family: string | null | undefined): string =>
  (family || '').toLowerCase().replace(/\s+/g, ' ').trim();

const OBSERVATION_TABLE = 'price_observations';
const INSERT_CHUNK_SIZE = 50;

export async function saveNotebookObservations(rows: PriceObservationRow[]): Promise<void> {
  const valid = (rows || []).filter((r) => r && Number.isFinite(r.price_thb) && r.price_thb > 0);
  if (valid.length === 0) return;
  try {
    const client = supabaseAdmin();
    for (let i = 0; i < valid.length; i += INSERT_CHUNK_SIZE) {
      const chunk = valid.slice(i, i + INSERT_CHUNK_SIZE);
      const { error } = await client.from(OBSERVATION_TABLE).insert(chunk);
      if (error) {
        console.warn('⚠️ Failed to save price observations:', error.message);
        return;
      }
    }
  } catch (error) {
    console.warn('⚠️ Failed to save price observations:', error);
  }
}

// Reads recent real-market observations (never our own estimate outputs, to
// avoid a feedback loop) for the same brand+family and returns them shaped as
// harvest listings. match is left null so notebook-pricing re-verifies the
// tier from the stored config instead of trusting a stale label.
export async function fetchRecentNotebookObservations(
  brand: string,
  family: string,
  days = 90,
  limit = 40
): Promise<NotebookListingInput[]> {
  const familyKey = normalizeFamilyKey(family);
  if (!familyKey) return [];
  try {
    const client = supabaseAdmin();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from(OBSERVATION_TABLE)
      .select(
        'listing_title, listing_url, source, origin, listing_kind, price_thb, cpu, ram_gb, storage_gb, storage_type, gpu'
      )
      .eq('family_norm', familyKey)
      .ilike('brand', brand || '%')
      .in('origin', ['web_search', 'serpapi', 'manual'])
      .in('listing_kind', ['used', 'new_current', 'launch_msrp'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('⚠️ Failed to read price observations:', error.message);
      return [];
    }

    return (data || [])
      .filter((row: any) => row && Number.isFinite(Number(row.price_thb)) && Number(row.price_thb) > 0)
      .map((row: any): NotebookListingInput => ({
        title: row.listing_title || '',
        price_thb: Number(row.price_thb),
        source: row.source || 'observation',
        url: row.listing_url || null,
        listing_kind: (row.listing_kind as ListingKind) || 'used',
        match: null,
        cpu: row.cpu || null,
        ram_gb: row.ram_gb !== null && row.ram_gb !== undefined ? Number(row.ram_gb) : null,
        storage_gb: row.storage_gb !== null && row.storage_gb !== undefined ? Number(row.storage_gb) : null,
        storage_type: row.storage_type || null,
        gpu: row.gpu || null,
        condition_note: null,
        origin: 'observation',
      }));
  } catch (error) {
    console.warn('⚠️ Failed to read price observations:', error);
    return [];
  }
}
