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

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
    // max_tokens: 300,
    // temperature: 0.1,
  });

  return response.output_text || '';
}

// Agent 2: Estimate pricing based on GPT knowledge
async function getMarketPrice(normalizedInput: string): Promise<number> {
  const prompt = `Based on current Thai market data and general knowledge of second-hand electronics prices in Thailand, estimate the market value of this item. Consider current market conditions, typical depreciation, and regional pricing.

${normalizedInput}

Provide only a numerical estimate in Thai Baht (THB) without any additional text or formatting. Consider:
- Current market demand for this type of product
- Typical depreciation based on condition
- Local Thai market pricing (not international prices)
- Average selling prices on platforms like Kaidee, Facebook Marketplace, etc.

Please use web search to get the latest market price.
- important: include the source of the price in the response must be from Kaidee, Facebook Marketplace, etc in Thailand region only.

Return only the number, for example: 15000`;

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    tools: [{ type: "web_search_preview" }],
    input: prompt,
    // max_tokens: 300,
    // temperature: 0.1,
  });

  const price = parseInt(response.output_text?.replace(/[^\d]/g, '') || '0') || 0;

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

    // Use condition score from AI analysis (already done in analyze-condition API)
    const conditionScore = body.condition; // This comes from the analyze-condition API result
    console.log('✅ Using condition score from AI analysis:', conditionScore);

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
