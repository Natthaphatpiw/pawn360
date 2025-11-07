import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface EstimateRequest {
  itemType: string;
  brand: string;
  model: string;
  serialNo: string;
  accessories: string;
  condition: number;
  defects: string;
  note: string;
  images: string[];
  lineId: string;
}

interface EstimateResponse {
  success: boolean;
  estimatedPrice: number;
  condition: number;
  marketPrice: number;
  pawnPrice: number;
  confidence: number;
  normalizedInput: string;
  calculation: {
    marketPrice: string;
    pawnPrice: string;
    finalPrice: string;
  };
}

// Agent 1: Normalize input data
async function normalizeInput(input: EstimateRequest): Promise<string> {
  const prompt = `Normalize and clean the following product information for accurate pricing. Correct any typos, standardize formatting, and make the description suitable for market research:

Product Type: ${input.itemType}
Brand: ${input.brand}
Model: ${input.model}
Serial Number: ${input.serialNo}
Accessories: ${input.accessories}
Condition: ${input.condition}%
Defects: ${input.defects}
Additional Notes: ${input.note}

Please provide a clean, standardized description that would be suitable for searching second-hand market prices. Focus on key specifications and condition details.`;

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
    // max_tokens: 300,
    // temperature: 0.1,
  });

  return response.output_text || '';
}

// Agent 2: Get market price using simple prompt engineering
async function getMarketPrice(normalizedInput: string): Promise<number> {
  const prompt = `You are a professional pawn shop appraiser in Thailand with 15+ years of experience in second-hand electronics valuation. Your task is to provide the most accurate median market price for second-hand items based on current Thai market data.

Analyze this item and provide the MEDIAN selling price (not minimum or maximum price) that this item would realistically sell for on Thai marketplaces.

${normalizedInput}

IMPORTANT CONSIDERATIONS FOR ACCURATE VALUATION:

1. **Market Position**: Provide the MEDIAN price (50th percentile) of actual selling prices on platforms like Kaidee, Facebook Marketplace, Shopee, and local second-hand stores in Thailand.

2. **Current Market Conditions**:
   - Economic situation in Thailand
   - Demand for this specific item type
   - Availability of new vs used alternatives
   - Seasonal demand fluctuations

3. **Item-Specific Factors**:
   - Age and depreciation (newer = higher value)
   - Brand reputation and reliability
   - Model popularity and after-sales support
   - Technical specifications and performance
   - Market saturation of similar models

4. **Condition Impact**: The condition score will be applied separately, so provide the market price assuming GOOD condition unless otherwise specified in the item details.

5. **Regional Pricing**: Focus on Bangkok and major cities in Thailand. Avoid international prices.

6. **Real Transaction Data**: Base your estimate on actual completed sales, not asking prices or inflated listings.

METHODOLOGY:
- Research similar items currently listed/sold
- Calculate the median of realistic selling prices
- Adjust for current market trends
- Consider bulk market data, not individual outliers

OUTPUT FORMAT:
Provide ONLY a single number representing the median market price in Thai Baht (THB), without any currency symbols, commas, or additional text.

Example: If similar items sell for 12000, 15000, 18000, and 22000 baht, the median would be around 16500, so output: 16500

Your response should be just the number, nothing else.`;

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    tools: [{ type: "web_search_preview" }],
    input: prompt,
    // max_tokens: 100,
    // temperature: 0.2,
  });

  const priceText = response.output_text || '0';
  console.log('🤖 AI Response Text:', priceText);

  let marketPrice = parseInt(priceText.replace(/[^\d]/g, '')) || 0;

  console.log('📊 Raw market price from AI:', marketPrice);

  // ตรวจสอบและแก้ไขราคาที่ผิดปกติ
  // 1. ถ้าราคามากกว่า 1 ล้านบาท อาจจะเป็น satang หรือ AI ให้ราคาผิดปกติ
  if (marketPrice > 1000000) {
    console.warn('⚠️ Market price extremely high, attempting conversion...');

    // ถ้ามากกว่า 10 ล้าน แปลงจาก satang
    if (marketPrice > 10000000) {
      marketPrice = Math.round(marketPrice / 100);
      console.log('📊 Converted from satang to baht:', marketPrice);
    }

    // ถ้ายังมากกว่า 500k หลังแปลง ให้ cap ที่ 500k
    if (marketPrice > 500000) {
      console.warn('⚠️ Still too high after conversion, capping at 500,000 THB');
      marketPrice = 500000;
    }
  }

  // 2. ตรวจสอบค่าที่สมเหตุสมผลสำหรับสินค้ามือสอง
  // สินค้าอิเล็กทรอนิกส์มือสองทั่วไปไม่ควรเกิน 300,000 บาท
  if (marketPrice > 300000) {
    console.warn('⚠️ Market price unusually high for second-hand electronics, capping at 300,000 THB');
    marketPrice = 300000;
  }

  // 3. ตรวจสอบราคาต่ำสุด (ไม่ควรต่ำกว่า 100 บาท)
  if (marketPrice < 100) {
    console.warn('⚠️ Market price too low, setting minimum at 100 THB');
    marketPrice = 100;
  }

  console.log('✅ Final validated market price:', marketPrice);

  return marketPrice;
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

    // Validate required fields
    if (!body.itemType || !body.brand || !body.model || !body.lineId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Agent 1: Normalize input
    console.log('🔄 Normalizing input...');
    const normalizedInput = await normalizeInput(body);
    console.log('✅ Input normalized:', normalizedInput);

    // Agent 2: Get market price using simple prompt engineering
    console.log('🔄 Getting market price...');
    const marketPrice = await getMarketPrice(normalizedInput);
    console.log('✅ Market price:', marketPrice);

    // Calculate pawn price: market price * 0.6 (for pawn shop pricing)
    const pawnPrice = Math.round(marketPrice * 0.6);
    console.log('🏦 Pawn price (60% of market):', pawnPrice);

    // Use condition score from AI analysis (already done in analyze-condition API)
    const conditionScore = body.condition; // This comes from the analyze-condition API result (0-1 scale)
    console.log('✅ Using condition score from AI analysis:', conditionScore);

    // Calculate final estimate: pawn price * condition score
    const estimatedPrice = Math.round(pawnPrice * conditionScore);
    console.log('💰 Final estimated price:', estimatedPrice);

    // Ensure minimum price
    const finalPrice = Math.max(estimatedPrice, 100);

    return NextResponse.json({
      success: true,
      estimatedPrice: finalPrice,
      condition: conditionScore,
      marketPrice: marketPrice,
      pawnPrice: pawnPrice,
      confidence: 0.85, // Fixed confidence score for simple method
      normalizedInput: normalizedInput,
      calculation: {
        marketPrice: `ราคาตลาดมือสองที่ประเมินโดย AI`,
        pawnPrice: `ราคาจำนำ = ราคาตลาด × 0.6`,
        finalPrice: `ราคาประเมิน = ราคาจำนำ × สภาพสินค้า (${conditionScore})`
      }
    });

  } catch (error: any) {
    console.error('Error in AI estimation:', error);
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    );
  }
}