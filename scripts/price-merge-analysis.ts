import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import { computeRepresentativeUsedPriceTHB } from '../lib/services/price-representative';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const WEB_SEARCH_PATH = path.join('scripts', 'output', 'web_search_prices.json');
const SERPAPI_PATH = path.join('scripts', 'output', 'serpapi_prices.json');
const OUTPUT_PATH = path.join('scripts', 'output', 'combined_price_analysis.json');

const INCLUDE_DEBUG = true;
const USE_TH_WEIGHTS = false;
const TH_WEIGHT = 2;
const NON_TH_WEIGHT = 1;

type WebSearchItem = {
  title: string;
  price_thb: number;
  source: string;
  url: string;
};

type WebSearchResult = {
  query?: string;
  items: WebSearchItem[];
};

type SerpapiItem = {
  title: string;
  source: string;
  url: string | null;
  price_usd: number;
  price_thb: number;
};

type SerpapiResult = {
  query?: string;
  exchange_rate_thb_per_usd?: number;
  fetched_at?: string;
  items: SerpapiItem[];
};

type CombinedItem = {
  title: string;
  price_thb: number;
  source: string;
  url?: string;
  origin: 'web_search' | 'serpapi';
  price_usd?: number;
};

const readJsonFile = <T,>(filePath: string): T => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
};

const toCombinedItemFromWeb = (item: WebSearchItem): CombinedItem | null => {
  if (!item?.title || !Number.isFinite(item.price_thb)) return null;
  return {
    title: item.title,
    price_thb: item.price_thb,
    source: item.source ?? 'Unknown',
    url: item.url,
    origin: 'web_search',
  };
};

const toCombinedItemFromSerpapi = (item: SerpapiItem): CombinedItem | null => {
  if (!item?.title || !Number.isFinite(item.price_thb)) return null;
  return {
    title: item.title,
    price_thb: item.price_thb,
    source: item.source ?? 'Unknown',
    url: item.url ?? undefined,
    origin: 'serpapi',
    price_usd: item.price_usd,
  };
};

const buildWeights = (items: CombinedItem[]): number[] => (
  items.map((item) => (item.origin === 'web_search' ? TH_WEIGHT : NON_TH_WEIGHT))
);

async function main() {
  const web = readJsonFile<WebSearchResult>(WEB_SEARCH_PATH);
  const serpapi = readJsonFile<SerpapiResult>(SERPAPI_PATH);

  const webItems = (web.items || [])
    .map(toCombinedItemFromWeb)
    .filter(Boolean) as CombinedItem[];
  const serpItems = (serpapi.items || [])
    .map(toCombinedItemFromSerpapi)
    .filter(Boolean) as CombinedItem[];

  const combinedItems = [...webItems, ...serpItems];
  const weights = USE_TH_WEIGHTS ? buildWeights(combinedItems) : undefined;

  const analysis = computeRepresentativeUsedPriceTHB(combinedItems, {
    weights,
    includeDebug: INCLUDE_DEBUG,
  });

  const outputPayload = {
    generated_at: new Date().toISOString(),
    inputs: {
      web_search: {
        path: WEB_SEARCH_PATH,
        query: web.query ?? null,
        item_count: webItems.length,
      },
      serpapi: {
        path: SERPAPI_PATH,
        query: serpapi.query ?? null,
        fetched_at: serpapi.fetched_at ?? null,
        item_count: serpItems.length,
      },
    },
    combined: {
      item_count: combinedItems.length,
      items: combinedItems,
    },
    analysis,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputPayload, null, 2), 'utf-8');

  console.log(`Saved combined analysis to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
