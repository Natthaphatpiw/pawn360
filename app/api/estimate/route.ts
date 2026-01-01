import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const MODEL = 'gpt-4.1-mini';
const DEFAULT_EXCHANGE_RATE_THB_PER_USD = 32;
const MIN_ESTIMATE_PRICE = 100;

interface EstimateRequest {
  itemType: string;
  brand: string;
  model: string;
  capacity?: string;
  serialNo?: string;
  accessories?: string;
  condition: number;
  defects?: string;
  note?: string;
  images: string[];
  lineId: string;
  appleCategory?: string;
  appleSpecs?: string;
  color?: string;
  screenSize?: string;
  watchSize?: string;
  watchConnectivity?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  gpu?: string;
  lenses?: string[];
}

interface EstimateResponse {
  success: boolean;
  estimatedPrice: number;
  condition: number;
  marketPrice: number;
  pawnPrice: number;
  confidence: number;
  normalizedInput: NormalizedData;
  calculation: {
    marketPrice: string;
    pawnPrice: string;
    finalPrice: string;
  };
}

interface NormalizedData {
  productName: string;
  priceRange: {
    min: number;
    max: number;
  };
}

interface SerpapiShoppingItem {
  title: string | null;
  source: string | null;
  price_thb: number;
}

interface SerpapiShoppingResults {
  query: string;
  exchange_rate_thb_per_usd: number;
  currency_from: 'USD';
  currency_to: 'THB';
  fetched_at: string;
  items: SerpapiShoppingItem[];
}

function getResponseText(response: any): string {
  if (typeof response?.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return '';
  }

  return response.output
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === 'output_text' && typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n');
}

function parseJsonFromText<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function normalizeRange(range?: { min?: number; max?: number }): { min: number; max: number } {
  const rawMin = Number(range?.min);
  const rawMax = Number(range?.max);

  const safeMin = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : MIN_ESTIMATE_PRICE;
  const safeMax = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : Math.max(safeMin * 2, safeMin + 1000);

  const min = Math.min(safeMin, safeMax);
  const max = Math.max(safeMin, safeMax);

  return {
    min: Math.round(Math.max(MIN_ESTIMATE_PRICE, min)),
    max: Math.round(Math.max(MIN_ESTIMATE_PRICE, max)),
  };
}

function clampToRange(value: number, range: { min: number; max: number }): number {
  if (!Number.isFinite(value)) {
    return Math.round((range.min + range.max) / 2);
  }

  if (value < range.min || value > range.max) {
    return Math.round((range.min + range.max) / 2);
  }

  return Math.round(value);
}

function isSerpapiEnabled(): boolean {
  const value = (process.env.SERPAPI_ENABLED || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

function getExchangeRate(): number {
  const parsed = Number(process.env.SERPAPI_EXCHANGE_RATE_THB_PER_USD);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_EXCHANGE_RATE_THB_PER_USD;
}

function buildSerpapiQuery(productName: string): string {
  const hasThai = /[ก-๙]/.test(productName);
  return hasThai ? `${productName} มือสอง` : `${productName} second-hand`;
}

function extractUsdPrice(item: any): number | null {
  if (typeof item?.extracted_price === 'number' && Number.isFinite(item.extracted_price)) {
    return item.extracted_price;
  }

  const priceStr = String(item?.price || '');
  const match = priceStr.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function usdToThb(usd: number, exchangeRate: number): number {
  return Math.round(usd * exchangeRate * 100) / 100;
}

async function fetchSerpapiShoppingResults(productName: string): Promise<SerpapiShoppingResults | null> {
  if (!isSerpapiEnabled()) {
    return null;
  }

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ SERPAPI_API_KEY not configured, skipping SerpAPI');
    return null;
  }

  const query = buildSerpapiQuery(productName);
  const params = new URLSearchParams({
    engine: 'google_shopping_light',
    q: query,
    api_key: apiKey,
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!response.ok) {
      console.warn('⚠️ SerpAPI request failed:', response.status, response.statusText);
      return null;
    }

    const json = await response.json();
    const shoppingResults = Array.isArray(json.shopping_results) ? json.shopping_results : [];
    const exchangeRate = getExchangeRate();

    const items = shoppingResults
      .map((result: any) => {
        const usd = extractUsdPrice(result);
        if (usd === null) return null;
        return {
          title: result.title ?? null,
          source: result.source ?? result.store ?? result.seller ?? null,
          price_thb: usdToThb(usd, exchangeRate),
        };
      })
      .filter(Boolean)
      .slice(0, 12) as SerpapiShoppingItem[];

    return {
      query,
      exchange_rate_thb_per_usd: exchangeRate,
      currency_from: 'USD',
      currency_to: 'THB',
      fetched_at: new Date().toISOString(),
      items,
    };
  } catch (error) {
    console.warn('⚠️ SerpAPI error:', error);
    return null;
  }
}

// Agent 1: Normalize input data และประเมิน price range
async function normalizeInput(input: EstimateRequest): Promise<NormalizedData> {
  if (!openai) {
    return {
      productName: `${input.brand} ${input.model}`.trim(),
      priceRange: {
        min: MIN_ESTIMATE_PRICE,
        max: 10000,
      },
    };
  }

  const conditionPercent = input.condition <= 1 ? Math.round(input.condition * 100) : Math.round(input.condition);
  const extraLines = [
    input.capacity ? `- ความจุ: ${input.capacity}` : null,
    input.color ? `- สี: ${input.color}` : null,
    input.screenSize ? `- ขนาดจอ: ${input.screenSize}` : null,
    input.watchSize ? `- ขนาดนาฬิกา: ${input.watchSize}` : null,
    input.watchConnectivity ? `- การเชื่อมต่อ: ${input.watchConnectivity}` : null,
    input.appleCategory ? `- หมวด Apple: ${input.appleCategory}` : null,
    input.appleSpecs ? `- สเปค Apple: ${input.appleSpecs}` : null,
    input.cpu ? `- CPU: ${input.cpu}` : null,
    input.ram ? `- RAM: ${input.ram}` : null,
    input.storage ? `- Storage: ${input.storage}` : null,
    input.gpu ? `- GPU: ${input.gpu}` : null,
    input.lenses && input.lenses.length > 0 ? `- เลนส์: ${input.lenses.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `คุณเป็นผู้เชี่ยวชาญประเมินราคาสินค้ามือสองในประเทศไทย ทำ 2 งาน:
1) Normalize ชื่อสินค้าให้ชัดเจนและใช้ค้นหาแล้วเจอสินค้าจริง
2) สร้าง price range ที่ "กว้างพอสมควร" เพื่อกันราคาเวอร์/ผิดพลาด (ไม่ต้องแคบ)

ข้อกำหนด:
- ชื่อสินค้า (productName) ต้องรวม Brand + Model + รายละเอียดสำคัญที่ช่วยค้นหา (เช่น ความจุ/สี/สเปค/ปี)
- ห้ามใส่ Serial Number ในชื่อสินค้า
- Price range เป็น THB และควรกว้างพอสำหรับตลาดมือสองในไทย

ข้อมูลสินค้า:
- ประเภท: ${input.itemType}
- ยี่ห้อ: ${input.brand}
- รุ่น: ${input.model}
- Serial: ${input.serialNo || '-'}
- อุปกรณ์เสริม: ${input.accessories || '-'}
- สภาพ (AI): ${conditionPercent}%
- ตำหนิ: ${input.defects || '-'}
- หมายเหตุ: ${input.note || '-'}
${extraLines ? `\nข้อมูลเพิ่มเติม:\n${extraLines}` : ''}

ตอบกลับเป็น JSON เท่านั้น:
{
  "productName": "ชื่อสินค้า",
  "priceRange": { "min": 0, "max": 0 }
}`;

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: 300,
    text: {
      format: {
        type: 'json_schema',
        name: 'normalized_item',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            productName: { type: 'string' },
            priceRange: {
              type: 'object',
              additionalProperties: false,
              properties: {
                min: { type: 'number' },
                max: { type: 'number' },
              },
              required: ['min', 'max'],
            },
          },
          required: ['productName', 'priceRange'],
        },
      },
    },
  });

  const content = getResponseText(response);
  const parsed = parseJsonFromText<NormalizedData>(content);
  const fallbackName = `${input.brand} ${input.model}`.trim();
  const priceRange = normalizeRange(parsed?.priceRange);

  return {
    productName: parsed?.productName?.trim() || fallbackName,
    priceRange,
  };
}

// Agent 2: Get market price using web search + optional SerpAPI
async function getMarketPrice(
  productName: string,
  priceRange: { min: number; max: number },
  serpapiResults: SerpapiShoppingResults | null
): Promise<number> {
  const normalizedRange = normalizeRange(priceRange);

  if (!openai) {
    return Math.round((normalizedRange.min + normalizedRange.max) / 2);
  }

  const searchQuery = `${productName} มือสอง`;
  const serpapiPayload = serpapiResults && serpapiResults.items.length > 0 ? serpapiResults : null;
  const exchangeRate = getExchangeRate();

  const prompt = `คุณเป็นผู้เชี่ยวชาญประเมินราคาสินค้ามือสองในไทย

อินพุต:
productName: ${productName}
priceRangeTHB: ${normalizedRange.min} - ${normalizedRange.max}
serpapiResults: ${serpapiPayload ? JSON.stringify(serpapiPayload) : 'null'}

งานที่ต้องทำ:
1) ต้องเรียก web_search อย่างน้อย 1 ครั้ง โดยใช้ query: "${searchQuery}"
2) โฟกัสตลาดไทยก่อน หากข้อมูลน้อยให้ขยายไปต่างประเทศ
3) ใช้ข้อมูลไม่เกิน 7 ปี และตัดผลลัพธ์ที่ไม่เกี่ยวข้องกับสินค้าออก
4) คัดกรองรายการจาก serpapiResults ให้เกี่ยวข้องจริง (ตรวจชื่อสินค้า/รุ่น)
5) รวมราคาจาก web search + serpapi ที่คัดแล้ว และคำนวณ "ราคาตลาดกลาง" (median) เป็น THB
6) ถ้าต้องแปลงสกุลเงิน ให้ใช้อัตรา 1 USD = ${exchangeRate} THB
7) ราคาสุดท้ายต้องอยู่ใน priceRangeTHB (ถ้าเกินให้ปรับเข้ากลางช่วง)

ตอบกลับเป็น JSON เท่านั้น:
{ "marketPrice": 0 }`;

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: 300,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'medium',
        user_location: {
          type: 'approximate',
          country: 'TH',
          city: 'Bangkok',
          timezone: 'Asia/Bangkok',
        },
      },
    ],
    tool_choice: 'required',
    text: {
      format: {
        type: 'json_schema',
        name: 'market_price',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            marketPrice: { type: 'number' },
          },
          required: ['marketPrice'],
        },
      },
    },
  });

  const content = getResponseText(response);
  const parsed = parseJsonFromText<{ marketPrice: number }>(content);
  const marketPrice = Number(parsed?.marketPrice);
  const clamped = clampToRange(marketPrice, normalizedRange);

  return Math.max(clamped, MIN_ESTIMATE_PRICE);
}

export async function POST(request: NextRequest): Promise<NextResponse<EstimateResponse | { error: string }>> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: EstimateRequest = await request.json();

    if (!body.itemType || !body.brand || !body.model || !body.lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('🔄 Agent 1: Normalizing input and estimating price range...');
    const normalizedData = await normalizeInput(body);
    console.log('✅ Normalized product name:', normalizedData.productName);
    console.log('✅ Estimated price range:', normalizedData.priceRange);

    const serpapiResults = await fetchSerpapiShoppingResults(normalizedData.productName);
    if (serpapiResults) {
      console.log('🔍 SerpAPI items fetched:', serpapiResults.items.length);
    } else {
      console.log('ℹ️ SerpAPI disabled or unavailable');
    }

    console.log('🔄 Agent 2: Getting median market price via web search...');
    const marketPrice = await getMarketPrice(normalizedData.productName, normalizedData.priceRange, serpapiResults);
    console.log('✅ Market price (median):', marketPrice);

    const pawnPrice = Math.round(marketPrice * 0.6);
    console.log('🏦 Pawn price (60% of market):', pawnPrice);

    const rawCondition = body.condition;
    const conditionScore = rawCondition > 1 ? rawCondition / 100 : rawCondition;
    const normalizedCondition = Math.min(1, Math.max(0, conditionScore));
    console.log('✅ Using condition score from AI analysis:', normalizedCondition);

    const estimatedPrice = Math.round(pawnPrice * normalizedCondition);
    console.log('💰 Final estimated price:', estimatedPrice);

    const finalPrice = Math.max(estimatedPrice, MIN_ESTIMATE_PRICE);

    return NextResponse.json({
      success: true,
      estimatedPrice: finalPrice,
      condition: normalizedCondition,
      marketPrice: marketPrice,
      pawnPrice: pawnPrice,
      confidence: 0.85,
      normalizedInput: normalizedData,
      calculation: {
        marketPrice: `ราคาตลาดกลางจาก web search ${serpapiResults ? '+ SerpAPI' : ''} (ช่วง ${normalizedData.priceRange.min.toLocaleString()}-${normalizedData.priceRange.max.toLocaleString()} บาท)`,
        pawnPrice: `ราคาจำนำ = ${marketPrice.toLocaleString()} × 0.6 = ${pawnPrice.toLocaleString()} บาท`,
        finalPrice: `ราคาประเมิน = ${pawnPrice.toLocaleString()} × สภาพ ${(normalizedCondition * 100).toFixed(0)}% = ${finalPrice.toLocaleString()} บาท`,
      },
    });

  } catch (error: any) {
    console.error('Error in AI estimation:', error);
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    );
  }
}
