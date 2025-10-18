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

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
    temperature: 0.1,
  });

  return response.choices[0]?.message?.content || '';
}

// Agent 2: Web search for pricing (simulated with GPT knowledge)
async function getMarketPrice(normalizedInput: string): Promise<number> {
  const prompt = `Based on current Thai market data and general knowledge of second-hand electronics prices in Thailand, estimate the market value of this item. Consider current market conditions, typical depreciation, and regional pricing.

${normalizedInput}

Provide only a numerical estimate in Thai Baht (THB) without any additional text or formatting. Consider:
- Current market demand for this type of product
- Typical depreciation based on condition
- Local Thai market pricing (not international prices)
- Average selling prices on platforms like Kaidee, Facebook Marketplace, etc.

Return only the number, for example: 15000`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 50,
    temperature: 0.3,
  });

  const priceText = response.choices[0]?.message?.content?.trim() || '0';
  const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;

  return price;
}

// Agent 3: Analyze condition from images
async function analyzeConditionFromImages(images: string[], userCondition: number): Promise<number> {
  if (images.length === 0) {
    // If no images, use user-reported condition (convert to 0-1 scale)
    return userCondition / 100;
  }

  // For now, we'll use a combination of user input and basic analysis
  // In a real implementation, you would use vision models to analyze the actual images
  const prompt = `Analyze the condition of a ${images.length > 0 ? 'product with images provided' : 'product based on description'}.
User reported condition: ${userCondition}%

Based on typical second-hand item assessment, provide a condition score from 0.0 to 1.0 where:
- 1.0 = Like new, no visible wear
- 0.8 = Excellent condition, minimal wear
- 0.6 = Good condition, some wear but functional
- 0.4 = Fair condition, noticeable wear
- 0.2 = Poor condition, significant wear
- 0.0 = Very poor condition, barely functional

Consider that users tend to over-rate their items. Provide a realistic assessment.

Return only the numerical score (0.0 to 1.0) without any additional text.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 20,
    temperature: 0.2,
  });

  const conditionText = response.choices[0]?.message?.content?.trim() || '0.5';
  const condition = parseFloat(conditionText) || 0.5;

  // Ensure it's within bounds
  return Math.max(0, Math.min(1, condition));
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

    // Agent 2: Get market price
    console.log('🔄 Getting market price...');
    const marketPrice = await getMarketPrice(normalizedInput);
    console.log('✅ Market price:', marketPrice);

    // Agent 3: Analyze condition
    console.log('🔄 Analyzing condition...');
    const conditionScore = await analyzeConditionFromImages(body.images, body.condition);
    console.log('✅ Condition score:', conditionScore);

    // Calculate final estimate: market price * condition score
    const estimatedPrice = Math.round(marketPrice * conditionScore);

    // Ensure minimum price
    const finalPrice = Math.max(estimatedPrice, 100);

    return NextResponse.json({
      success: true,
      estimatedPrice: finalPrice,
      condition: conditionScore,
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
