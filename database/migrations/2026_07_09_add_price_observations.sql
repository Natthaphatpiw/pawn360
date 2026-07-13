-- Comps database for the notebook price-estimation ladder (NOTEBOOK_PRICING.md).
-- Every notebook estimate stores its harvested market listings + final result;
-- later estimates for the same family reuse recent rows as comparables.

CREATE TABLE IF NOT EXISTS price_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  item_type TEXT NOT NULL,                -- e.g. 'โน้ตบุค'
  brand TEXT,
  family TEXT,                            -- marketing family, e.g. 'IdeaPad 3 15'
  family_norm TEXT,                       -- lowercase/collapsed key used for lookups
  product_name TEXT,

  listing_title TEXT,
  listing_url TEXT,
  source TEXT,                            -- marketplace/site name
  origin TEXT NOT NULL,                   -- web_search | serpapi | manual | estimate_result
  listing_kind TEXT NOT NULL,             -- used | new_current | launch_msrp | estimate
  match_level TEXT,                       -- exact | family | same_brand | cross_brand
  price_thb NUMERIC NOT NULL,

  cpu TEXT,
  cpu_score NUMERIC,
  ram_gb NUMERIC,
  storage_gb NUMERIC,
  storage_type TEXT,
  gpu TEXT,
  gpu_score NUMERIC,
  release_year INT,
  segment TEXT,

  estimate_level TEXT,                    -- L1..L5 (rows with origin = estimate_result)
  confidence NUMERIC,
  line_id TEXT,
  spec JSONB
);

CREATE INDEX IF NOT EXISTS idx_price_obs_family_created
  ON price_observations (family_norm, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_obs_brand_created
  ON price_observations (brand, created_at DESC);
