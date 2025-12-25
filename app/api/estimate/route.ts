import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

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

// Agent 1: Normalize input data และประเมิน price range
async function normalizeInput(input: EstimateRequest): Promise<NormalizedData> {
  if (!openai) {
    // Return fallback values if OpenAI is not available
    return {
      productName: `${input.brand} ${input.model}`.trim(),
      priceRange: {
        min: 100,
        max: 10000
      }
    };
  }

  const prompt = `คุณเป็นผู้เชี่ยวชาญด้านการประเมินราคาสินค้ามือสองในประเทศไทย วิเคราะห์ข้อมูลสินค้าต่อไปนี้และทำ 2 สิ่ง:

1. **Normalize ชื่อสินค้า**: สร้างชื่อสินค้าที่สะอาด กระชับ เหมาะสำหรับค้นหาราคาตลาด
2. **ประเมิน Price Range**: คาดการณ์ช่วงราคาขั้นต่ำและสูงสุดที่สินค้าชิ้นนี้น่าจะมีในตลาดมือสองไทย

ข้อมูลสินค้า:
- ประเภท: ${input.itemType}
- ยี่ห้อ: ${input.brand}
- รุ่น: ${input.model}
- Serial Number: ${input.serialNo}
- อุปกรณ์เสริม: ${input.accessories}
- สภาพ: ${input.condition}%
- ตำหนิ: ${input.defects}
- หมายเหตุ: ${input.note}

**คำแนะนำ**:
- ชื่อสินค้าควรรวม Brand + Model + ข้อมูลสำคัญ (ความจุ, สี, รุ่นปี ถ้ามี)
- Price Range ให้พิจารณาจาก:
  - ราคาใหม่ของสินค้ารุ่นนี้ (ถ้ายังขายอยู่)
  - อายุการใช้งานโดยประมาณ
  - ความนิยมของรุ่นนี้ในตลาด
  - ตลาดมือสองปัจจุบันใน Kaidee, Facebook Marketplace, Shopee
  - ราคาขั้นต่ำ = สภาพแย่ที่สุดที่ยังขายได้
  - ราคาสูงสุด = สภาพดีมาก พร้อมอุปกรณ์ครบ

**ตอบกลับในรูปแบบ JSON เท่านั้น**:
{
  "productName": "ชื่อสินค้าที่ normalize แล้ว",
  "priceRange": {
    "min": ราคาขั้นต่ำ (ตัวเลข),
    "max": ราคาสูงสุด (ตัวเลข)
  }
}

ตัวอย่าง:
{
  "productName": "iPhone 12 Pro 128GB",
  "priceRange": {
    "min": 8000,
    "max": 18000
  }
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  return {
    productName: parsed.productName || `${input.brand} ${input.model}`,
    priceRange: {
      min: parsed.priceRange?.min || 100,
      max: parsed.priceRange?.max || 10000
    }
  };
}

// Agent 2: Get market price using simple prompt engineering - ใช้เฉพาะชื่อสินค้า
async function getMarketPrice(productName: string, priceRange: { min: number; max: number }): Promise<number> {
  if (!openai) {
    // Return average of price range if OpenAI is not available
    return Math.round((priceRange.min + priceRange.max) / 2);
  }

  const prompt = `คุณเป็นผู้เชี่ยวชาญประเมินราคาสินค้ามือสองในประเทศไทย มีประสบการณ์มากกว่า 15 ปี

**งาน**: หาราคากลาง (median price) ของสินค้ามือสองนี้ในตลาดไทยปัจจุบัน

**สินค้า**: ${productName}

**ช่วงราคาที่คาดการณ์**: ${priceRange.min.toLocaleString()} - ${priceRange.max.toLocaleString()} บาท

**วิธีการประเมิน**:
1. ค้นหาราคาขายจริงในตลาดมือสองไทย (Kaidee, Facebook Marketplace, Shopee, ร้านมือสอง)
2. รวบรวมราคาที่พบ 5-10 ราคา
3. คำนวณค่ากลาง (median) ของราคาเหล่านั้น
4. ตรวจสอบว่าราคาอยู่ในช่วงที่สมเหตุสมผล (${priceRange.min.toLocaleString()} - ${priceRange.max.toLocaleString()} บาท)

**ข้อควรพิจารณา**:
- ใช้ราคาขายจริง ไม่ใช่ราคาเปิดขาย
- เน้นตลาดไทย โดยเฉพาะกรุงเทพและปริมณฑล
- พิจารณาสภาพทั่วไป (ไม่ใช่สภาพดีเยี่ยมหรือแย่มาก)
- ไม่รวมราคาที่ผิดปกติ (outliers)
- พิจารณาความนิยมและอุปสงค์ปัจจุบัน

**ตอบเฉพาะตัวเลข**: ให้ตอบเป็นตัวเลขราคากลางเท่านั้น ไม่ต้องมีสกุลเงิน เครื่องหมาย หรือคำอธิบายใดๆ

ตัวอย่าง: หากพบราคา 12000, 15000, 18000, 22000 บาท ค่ากลางคือ 16500 ให้ตอบ: 16500`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 50,
  });

  const priceText = response.choices[0]?.message?.content || '0';
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

    // Agent 1: Normalize input และประเมิน price range
    console.log('🔄 Agent 1: Normalizing input and estimating price range...');
    const normalizedData = await normalizeInput(body);
    console.log('✅ Normalized product name:', normalizedData.productName);
    console.log('✅ Estimated price range:', normalizedData.priceRange);

    // Agent 2: Get market price โดยใช้เฉพาะชื่อสินค้าที่ normalize แล้ว
    console.log('🔄 Agent 2: Getting median market price...');
    const marketPrice = await getMarketPrice(normalizedData.productName, normalizedData.priceRange);
    console.log('✅ Market price (median):', marketPrice);

    // ตรวจสอบว่าราคาอยู่ในช่วงที่เหมาะสม
    if (marketPrice < normalizedData.priceRange.min || marketPrice > normalizedData.priceRange.max) {
      console.warn(`⚠️ Market price ${marketPrice} is outside range ${normalizedData.priceRange.min}-${normalizedData.priceRange.max}`);
      // ถ้าราคานอกช่วง ให้ใช้ค่ากลางของ range
      const adjustedPrice = Math.round((normalizedData.priceRange.min + normalizedData.priceRange.max) / 2);
      console.log(`📊 Adjusted to mid-range: ${adjustedPrice}`);
    }

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
      normalizedInput: normalizedData,
      calculation: {
        marketPrice: `ราคาตลาดมือสอง (median) จากช่วง ${normalizedData.priceRange.min.toLocaleString()}-${normalizedData.priceRange.max.toLocaleString()} บาท`,
        pawnPrice: `ราคาจำนำ = ${marketPrice.toLocaleString()} × 0.6 = ${pawnPrice.toLocaleString()} บาท`,
        finalPrice: `ราคาประเมิน = ${pawnPrice.toLocaleString()} × สภาพ ${(conditionScore * 100).toFixed(0)}% = ${finalPrice.toLocaleString()} บาท`
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