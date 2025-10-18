import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { webSearchTool, RunContext, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Tool definitions for web search
const webSearchPreview = webSearchTool({
  userLocation: {
    type: "approximate",
    country: "TH",
    region: undefined,
    city: undefined,
    timezone: undefined
  },
  searchContextSize: "high",
  filters: {
    allowed_domains: [
      "www.kaidee.com",
      "www.facebook.com"
    ]
  }
})

const MyAgentSchema = z.object({ price: z.number() });

interface MyAgentContext {
  workflowInputAsText: string;
}

const myAgentInstructions = (runContext: RunContext<MyAgentContext>, _agent: Agent<MyAgentContext>) => {
  const { workflowInputAsText } = runContext.context;
  return `หาราคาสินค้ามือสองเฉลี่ยของรายการสินค้านี้ ${workflowInputAsText} `
}

const myAgent = new Agent({
  name: "My agent",
  instructions: myAgentInstructions,
  model: "gpt-4o-mini",
  tools: [
    webSearchPreview
  ],
  outputType: MyAgentSchema,
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

type WorkflowInput = { input_as_text: string };

// Main code entrypoint for web search workflow
const runWorkflow = async (workflow: WorkflowInput) => {
  return await withTrace("New workflow", async () => {
    const conversationHistory: AgentInputItem[] = [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: workflow.input_as_text
          }
        ]
      }
    ];
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: "wf_68f3345611008190a5ee4046725f0ea5028b80ddfe686f46"
      }
    });
    const myAgentResultTemp = await runner.run(
      myAgent,
      [
        ...conversationHistory
      ],
      {
        context: {
          workflowInputAsText: workflow.input_as_text
        }
      }
    );
    conversationHistory.push(...myAgentResultTemp.newItems.map((item) => item.rawItem));

    if (!myAgentResultTemp.finalOutput) {
        throw new Error("Agent result is undefined");
    }

    const myAgentResult = {
      output_text: JSON.stringify(myAgentResultTemp.finalOutput),
      output_parsed: myAgentResultTemp.finalOutput
    };

    return myAgentResult;
  });
}

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

// Agent 2: Web search for pricing using webSearchTool
async function getMarketPrice(normalizedInput: string): Promise<number> {
  try {
    console.log('🔍 Searching for market prices...');
    const workflowResult = await runWorkflow({ input_as_text: normalizedInput });

    if (workflowResult.output_parsed && workflowResult.output_parsed.price) {
      const price = workflowResult.output_parsed.price;
      console.log('✅ Found market price:', price);
      return price;
    } else {
      console.warn('⚠️ No price found in workflow result, using fallback');
      throw new Error('No price found');
    }
  } catch (error) {
    console.error('Error in web search workflow:', error);

    // Fallback to basic GPT estimation
    const prompt = `Based on current Thai market data and general knowledge of second-hand electronics prices in Thailand, estimate the market value of this item. Consider current market conditions, typical depreciation, and regional pricing.

${normalizedInput}

Provide only a numerical estimate in Thai Baht (THB) without any additional text or formatting. Consider:
- Current market demand for this type of product
- Typical depreciation based on condition
- Local Thai market pricing (not international prices)
- Average selling prices on platforms like Kaidee, Facebook Marketplace, etc.

Return only the number, for example: 15000`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      temperature: 0.3,
    });

    const priceText = response.choices[0]?.message?.content?.trim() || '0';
    const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;

    console.log('✅ Fallback market price:', price);
    return price;
  }
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
