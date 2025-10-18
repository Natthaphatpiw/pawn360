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
  conditionScore: number; // AI-analyzed condition score (0-1)
  conditionReason: string; // AI-analyzed condition reason
  defects: string;
  note: string;
  images: string[];
  lineId: string;
}

// Agent 1: Normalize input data
async function normalizeInput(input: EstimateRequest): Promise<string> {
  const prompt = `Normalize and clean the following product information for accurate pricing. Correct any typos, standardize formatting, and make the description suitable for market research:

Product Type: ${input.itemType}
Brand: ${input.brand}
Model: ${input.model}
Serial Number: ${input.serialNo}
Accessories: ${input.accessories}
Condition: ${Math.round(input.conditionScore * 100)}% (${input.conditionReason})
Defects: ${input.defects}
Additional Notes: ${input.note}

Please provide a clean, standardized description that would be suitable for searching second-hand market prices. Focus on key specifications and condition details.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || '';
}

// Agent 2: Market price estimation with web search simulation
async function getMarketPrice(normalizedInput: string): Promise<number> {
  const prompt = `คุณเป็นผู้เชี่ยวชาญด้านราคาสินค้าอิเล็กทรอนิกส์มือสองในตลาดไทย คุณเพิ่งค้นหาข้อมูลล่าสุดจาก Kaidee.com และ Facebook Marketplace

ให้ประเมินราคาจำหน่ายเฉลี่ยของสินค้านี้ในตลาดไทย (เป็นราคาที่ผู้ขายตั้งขาย ไม่ใช่ราคาจำนำ)

${normalizedInput}

พิจารณา:
- ราคาจำหน่ายจริงใน Kaidee.com และ Facebook Marketplace
- สภาวะตลาดปัจจุบันและความต้องการสินค้า
- การปรับราคาตามสภาพสินค้า
- ราคาท้องถิ่นในไทย (ไม่ใช่ราคานานาชาติ)

ให้คำตอบเป็นตัวเลขจำนวนเต็มในหน่วยบาทไทย เท่านั้น ไม่มีคำอธิบายเพิ่มเติม

ตัวอย่าง: 15000`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 20,
    temperature: 0.4,
  });

  const priceText = response.choices[0]?.message?.content?.trim() || '0';
  const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;

  console.log('✅ Estimated market price:', price);
  return price;
}


export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: EstimateRequest = await request.json();

    // Validate required fields
    if (!body.itemType || !body.brand || !body.model || !body.lineId || body.conditionScore === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Agent 1: Normalize input
    console.log('🔄 Normalizing input...');
    const normalizedInput = await normalizeInput(body);
    console.log('✅ Input normalized:', normalizedInput);

    // Agent 2: Get market price using web search
    console.log('🔄 Getting market price...');
    const marketPrice = await getMarketPrice(normalizedInput);
    console.log('✅ Market price:', marketPrice);

    // Use condition score from AI analysis (already provided)
    const conditionScore = body.conditionScore;
    console.log('✅ Using condition score:', conditionScore);

    // Calculate final estimate: market price * condition score
    const estimatedPrice = Math.round(marketPrice * conditionScore);

    // Ensure minimum price
    const finalPrice = Math.max(estimatedPrice, 100);

    return NextResponse.json({
      success: true,
      estimatedPrice: finalPrice,
      condition: conditionScore,
      conditionReason: body.conditionReason,
      marketPrice: marketPrice,
      confidence: 0.85, // Placeholder confidence score
      normalizedInput: normalizedInput
    });

  } catch (error: any) {
    console.error('Error in AI estimation:', error);
    return NextResponse.json(
      { error: 'Failed to estimate price' },
      { status: 500 }
    );
  }
}
