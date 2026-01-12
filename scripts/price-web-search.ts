import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const INPUT = {
  brand: 'Apple',
  model: 'macbook air m1',
  capacity: '',
  storage: '256GB',
};

const OUTPUT_PATH = path.join('scripts', 'output', 'web_search_prices.json');
const DEBUG_PATH = path.join('scripts', 'output', 'web_search_debug.json');
const MODEL = 'gpt-4.1';
const MAX_OUTPUT_TOKENS = 1200;
const MIN_ITEMS = 4;
const MAX_ITEMS = 8;

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const buildQuery = () => {
  const parts = [INPUT.brand, INPUT.model, INPUT.capacity, INPUT.storage]
    .map((value) => value.trim())
    .filter(Boolean);
  return `${parts.join(' ')} used price Thailand`;
};

const getResponseText = (response: any): string => {
  if (typeof response?.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) {
    return '';
  }

  const chunks: string[] = [];

  for (const item of response.output) {
    if (item?.type === 'output_text' && typeof item.text === 'string') {
      chunks.push(item.text);
      continue;
    }

    if (item?.type === 'message') {
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') {
          chunks.push(part.text);
        }
      }
    }
  }

  return chunks.join('\n');
};

const parseJsonFromText = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

async function main() {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const query = buildQuery();
  const prompt = `You are a pricing analyst. Use web_search at least once with this query: "${query}".
Return ONLY JSON with this shape:
{
  "query": "${query}",
  "items": [
    { "title": "string", "price_thb": number, "source": "string", "url": "string" }
  ]
}
Rules:
- Use only relevant items for the exact model and capacity.
- If price is not in THB, convert to THB using 1 USD = 32 THB.
- Keep ${MIN_ITEMS}-${MAX_ITEMS} items.
- Use canonical product URLs and remove tracking parameters when possible.`;

  const runSearch = async (maxTokens: number) => openai.responses.create({
    model: MODEL,
    input: prompt,
    max_output_tokens: maxTokens,
    temperature: 0,
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
        name: 'web_search_prices',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  price_thb: { type: 'number' },
                  source: { type: 'string' },
                  url: { type: 'string' },
                },
                required: ['title', 'price_thb', 'source', 'url'],
              },
            },
          },
          required: ['query', 'items'],
        },
      },
    },
  });

  let response = await runSearch(MAX_OUTPUT_TOKENS);
  if (response?.status === 'incomplete' && response?.incomplete_details?.reason === 'max_output_tokens') {
    response = await runSearch(MAX_OUTPUT_TOKENS * 2);
  }

  const content = getResponseText(response);
  const parsed = parseJsonFromText(content);

  if (!parsed) {
    fs.mkdirSync(path.dirname(DEBUG_PATH), { recursive: true });
    fs.writeFileSync(DEBUG_PATH, JSON.stringify({ content, response }, null, 2), 'utf-8');
    throw new Error(`Failed to parse JSON response. Saved debug to ${DEBUG_PATH}`);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(parsed, null, 2), 'utf-8');

  console.log(`Saved web_search results to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
