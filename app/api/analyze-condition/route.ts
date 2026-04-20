import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const collectEnvKeys = (values: Array<string | undefined>) => (
  values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
);

const OPENAI_KEYS = collectEnvKeys([
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4,
]);

const GEMINI_KEYS = collectEnvKeys([
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
]);

const openaiClients = OPENAI_KEYS.map((apiKey) => new OpenAI({ apiKey }));
const geminiClients = GEMINI_KEYS.map((apiKey) => new GoogleGenerativeAI(apiKey));

const PRECHECK_MODEL = 'gpt-4.1-mini';
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';
const MAX_IMAGE_COUNT = 6;
const MAX_TOTAL_IMAGE_MB = 10;
const MIN_AI_CONDITION_SCORE = 0.3;

const hasOpenAIKeys = () => openaiClients.length > 0;
const hasGeminiKeys = () => geminiClients.length > 0;

const isOpenAIRateLimitError = (error: any): boolean => {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const code = `${error?.code || error?.error?.code || ''}`.toLowerCase();
  const message = `${error?.message || ''} ${error?.error?.message || ''}`.toLowerCase();
  return (
    code.includes('rate_limit') ||
    code.includes('insufficient_quota') ||
    message.includes('rate limit') ||
    message.includes('insufficient quota') ||
    message.includes('quota') ||
    message.includes('429')
  );
};

const isGeminiRateLimitError = (error: any): boolean => {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true;
  const message = `${error?.message || ''}`.toLowerCase();
  return (
    message.includes('resource has been exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('429')
  );
};

async function runWithOpenAIFallback<T>(task: (client: OpenAI) => Promise<T>): Promise<T> {
  if (!hasOpenAIKeys()) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  let lastError: any;
  for (let i = 0; i < openaiClients.length; i++) {
    const client = openaiClients[i];
    try {
      return await task(client);
    } catch (error) {
      lastError = error;
      if (isOpenAIRateLimitError(error) && i < openaiClients.length - 1) {
        console.warn(`⚠️ OpenAI rate limit hit. Switching to fallback key ${i + 2}.`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function runWithGeminiFallback<T>(task: (client: GoogleGenerativeAI) => Promise<T>): Promise<T> {
  if (!hasGeminiKeys()) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  let lastError: any;
  for (let i = 0; i < geminiClients.length; i++) {
    const client = geminiClients[i];
    try {
      return await task(client);
    } catch (error) {
      lastError = error;
      if (isGeminiRateLimitError(error) && i < geminiClients.length - 1) {
        console.warn(`⚠️ Gemini rate limit hit. Switching to fallback key ${i + 2}.`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
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

type ConditionResult = {
  score: number;
  totalScore: number;
  grade: string;
  reason: string;
  assessable?: boolean;
  assessmentStatus?: string;
  assessmentIssue?: string;
  detailedBreakdown: {
    screen: { score: number; maxScore: number; description: string };
    body: { score: number; maxScore: number; description: string };
    buttons: { score: number; maxScore: number; description: string };
    camera: { score: number; maxScore: number; description: string };
    overall: { score: number; maxScore: number; description: string };
  };
  recommendation: string;
  imageQuality: string;
};

type ImagePrecheckResult = {
  pass: boolean;
  reason: string;
  expectedType: string;
  consistentItem: boolean;
  imageChecks: Array<{
    index: number;
    detectedType: string;
    matchesExpected: boolean;
    note: string;
  }>;
  recommendation: string;
};

const buildConditionPrompt = (options: {
  itemType: string;
  brand?: string;
  model?: string;
  appleCategory?: string;
}) => {
  const deviceLabel = buildExpectedTypeLabel(options.itemType, options.appleCategory);
  const productLine = [
    `- ประเภท: ${options.itemType}`,
    options.appleCategory ? `- หมวด Apple: ${options.appleCategory}` : null,
    options.brand ? `- แบรนด์: ${options.brand}` : null,
    options.model ? `- รุ่น: ${options.model}` : null,
  ].filter(Boolean).join('\n');

  return `# IT Device Condition Assessment Prompt

## บทบาทและหน้าที่
คุณคือผู้เชี่ยวชาญด้านการประเมินสภาพอุปกรณ์ไอทีสำหรับธุรกิจสินเชื่อที่มีทรัพย์สินค้ำประกัน มีประสบการณ์ในการตรวจสอบอุปกรณ์อิเล็กทรอนิกส์มากกว่า 10 ปี คุณต้องวิเคราะห์รูปภาพสินค้าที่ได้รับอย่างละเอียดและให้คะแนนสภาพที่แม่นยำ เป็นกลาง และอธิบายเหตุผลได้ชัดเจน

## ข้อมูลสินค้า (จากผู้ใช้)
${productLine}
- คาดว่าเป็น: ${deviceLabel}

## กติกาสำคัญ
1) หากรูปภาพไม่ตรงกับประเภทสินค้า หรือเป็นคนละสินค้า/คนละประเภทกัน ให้ตอบว่า "ไม่สามารถประเมินได้" พร้อมเหตุผล
2) หากภาพไม่ชัดเจน/ไม่ครบ ให้ระบุข้อจำกัดและแนะนำให้ถ่ายใหม่
3) ให้ประเมินจากภาพเท่านั้น ห้ามเดาข้อมูลที่ไม่เห็น
4) หากประเมินได้ ให้ระบุว่า "assessable": true

## หมวดหมู่การประเมิน (100 คะแนนเต็ม)
ใช้โครงสร้างคะแนนคงที่ตามนี้ แต่ปรับคำอธิบายให้สอดคล้องกับประเภทสินค้า:

#### A. สภาพหน้าจอ/พื้นผิวหลัก (35 คะแนน)
- โทรศัพท์/แท็บเล็ต: หน้าจอ, กระจก, รอยแตก/รอยขีดข่วน
- โน้ตบุค/จอภาพ: จอแสดงผล, dead pixel, รอยขีดข่วน
- กล้อง: หน้าจอหลัง/ช่องมองภาพ (ถ้ามี)
- สมาร์ทวอทช์: กระจกหน้าปัด
- อุปกรณ์เสริม/หูฟัง/ชาร์จเจอร์: สภาพพื้นผิวหลัก (ถ้าไม่มีจอ ให้ประเมินพื้นผิวตัวเครื่องแทน)

#### B. สภาพตัวเครื่อง/โครงสร้าง (30 คะแนน)
- โครงสร้างหลัก, ฝาหลัง/บอดี้, บานพับ (สำหรับโน้ตบุค), รอยบุบ/แตก

#### C. ปุ่มกด/พอร์ต/คีย์บอร์ด/คอนเน็กเตอร์ (20 คะแนน)
- ปุ่มกด, ช่องพอร์ต, คีย์บอร์ด/ทัชแพด, ช่องชาร์จ, ขั้วต่อ

#### D. กล้อง/เซ็นเซอร์/ชิ้นส่วนสำคัญเฉพาะรุ่น (10 คะแนน)
- โทรศัพท์/แท็บเล็ต: กล้องและเลนส์
- โน้ตบุค: กล้องเว็บแคม/ไมค์/ลำโพง
- กล้อง: เลนส์/เซ็นเซอร์/เมาท์
- สมาร์ทวอทช์: เซ็นเซอร์สุขภาพ/ปุ่ม crown
- อุปกรณ์เสริม: ขั้วต่อ, หัวปลั๊ก, จุดสำคัญของอุปกรณ์

#### E. ความสมบูรณ์โดยรวม (5 คะแนน)
- ความสมบูรณ์ของอุปกรณ์, อุปกรณ์เสริมที่เห็นในภาพ, ความสะอาดโดยรวม

> หากหมวดใด "ไม่เกี่ยวข้องกับอุปกรณ์" ให้ระบุว่าไม่เกี่ยวข้องใน description และให้คะแนนเต็มในหมวดนั้น (ไม่หักคะแนน)

## การจัดเกรดตามคะแนน
- **Grade A+ (95-100 คะแนน)**: สภาพใหม่ เหมือนเพิ่งแกะกล่อง
- **Grade A (90-94 คะแนน)**: สภาพดีมาก มีร่องรอยการใช้งานน้อยมาก
- **Grade A- (85-89 คะแนน)**: สภาพดี มีรอยการใช้งานเล็กน้อย
- **Grade B+ (80-84 คะแนน)**: สภาพดีพอใช้ มีรอยขีดข่วนเล็กน้อย
- **Grade B (70-79 คะแนน)**: สภาพปานกลาง มีรอยใช้งานชัดเจน
- **Grade C (60-69 คะแนน)**: สภาพพอใช้ มีความเสียหายบางส่วน
- **Grade D (50-59 คะแนน)**: สภาพค่อนข้างแย่ มีความเสียหายหลายจุด
- **Grade F (ต่ำกว่า 50 คะแนน)**: สภาพแย่ ไม่เหมาะสำหรับการขอสินเชื่อ

## รูปแบบการตอบกลับ (JSON เท่านั้น)
{
  "assessable": true,
  "assessmentStatus": "OK",
  "assessmentIssue": "",
  "score": 0.XX,
  "totalScore": XX,
  "grade": "A+",
  "reason": "คำอธิบายสั้นๆ",
  "detailedBreakdown": {
    "screen": { "score": XX, "maxScore": 35, "description": "รายละเอียด" },
    "body": { "score": XX, "maxScore": 30, "description": "รายละเอียด" },
    "buttons": { "score": XX, "maxScore": 20, "description": "รายละเอียด" },
    "camera": { "score": XX, "maxScore": 10, "description": "รายละเอียด" },
    "overall": { "score": XX, "maxScore": 5, "description": "รายละเอียด" }
  },
  "recommendation": "ข้อเสนอแนะ",
  "imageQuality": "คุณภาพของภาพ"
}

**คำอธิบาย score:** totalScore / 100 (0.0 - 1.0)
**คำอธิบาย totalScore:** คะแนนรวมจากทุกหมวด (0-100)
**assessable:** หากประเมินได้ให้เป็น true, หากประเมินไม่ได้ให้เป็น false
**assessmentStatus:** ใช้ค่า "OK" เมื่อประเมินได้, ใช้ค่า "INSUFFICIENT" เมื่อประเมินไม่ได้
**assessmentIssue:** ใส่เหตุผลสั้นๆ เมื่อประเมินไม่ได้, ถ้าประเมินได้ให้เป็นค่าว่าง

### ข้อความปฏิเสธความรับผิดชอบ:
"การประเมินนี้อิงจากภาพถ่ายที่ได้รับเท่านั้น ผลลัพธ์อาจคลาดเคลื่อนและควรมีการตรวจสอบด้วยตนเอง รวมถึงการทดสอบฟังก์ชันการทำงานที่ไม่เห็นจากภาพถ่าย"
`;
};

const toGeminiImagePart = (value: string) => {
  if (typeof value === 'string' && value.startsWith('data:')) {
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        inlineData: {
          data: match[2],
          mimeType: match[1],
        },
      };
    }
  }

  return {
    inlineData: {
      data: value,
      mimeType: 'image/jpeg',
    },
  };
};

function buildExpectedTypeLabel(itemType: string, appleCategory?: string) {
  if (itemType === 'Apple') {
    if (appleCategory) {
      return `Apple ${appleCategory}`;
    }
    return 'Apple product (iPhone/iPad/MacBook/Apple Watch/AirPods/iMac/Mac mini/Mac Studio/Mac Pro)';
  }

  const normalized = itemType.trim();
  const labelMap: Record<string, string> = {
    'โทรศัพท์มือถือ': 'Mobile phone / smartphone',
    'โน้ตบุค': 'Laptop / notebook',
    'กล้อง': 'Camera (digital camera, DSLR, mirrorless)',
    'อุปกรณ์เสริมโทรศัพท์': 'Phone accessory (charger, cable, case, power bank, earphones)',
  };

  return labelMap[normalized] || normalized;
}

// Agent 1: Image precheck with OpenAI (type match + consistency)
async function precheckImages(options: {
  images: string[];
  itemType: string;
  brand?: string;
  model?: string;
  appleCategory?: string;
}): Promise<ImagePrecheckResult> {
  if (!hasOpenAIKeys()) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const expectedType = buildExpectedTypeLabel(options.itemType, options.appleCategory);
  const prompt = `คุณเป็นระบบตรวจสอบความถูกต้องของรูปภาพก่อนประเมินสภาพสินค้า
เป้าหมาย: ตรวจว่ารูปที่อัปโหลด "ตรงกับประเภทสินค้า" และ "เป็นสินค้าเดียวกันทุกภาพ"

ข้อมูลที่ผู้ใช้เลือก:
- itemType: ${options.itemType}
- brand: ${options.brand || '-'}
- model: ${options.model || '-'}
- appleCategory: ${options.appleCategory || '-'}

กติกา:
1) ถ้ารูปไม่ตรงกับประเภทสินค้า ให้ fail
2) ถ้ารูปเป็นคนละสินค้า/คนละประเภทกัน ให้ fail
3) ถ้าคลุมเครือหรือมองไม่ชัด ให้ fail และแนะนำถ่ายใหม่
4) ให้ระบุประเภทที่เห็นในแต่ละรูป (เช่น โทรศัพท์, กล้อง, โน้ตบุค, อุปกรณ์เสริม, หูฟัง, นาฬิกา, แท็บเล็ต, อื่นๆ)

expectedType: ${expectedType}

ตอบกลับ JSON เท่านั้น:
{
  "pass": boolean,
  "reason": "สรุปสั้นๆ",
  "expectedType": "${expectedType}",
  "consistentItem": boolean,
  "imageChecks": [
    { "index": 1, "detectedType": "string", "matchesExpected": boolean, "note": "string" }
  ],
  "recommendation": "คำแนะนำให้ผู้ใช้ถ่ายภาพใหม่หรือเพิ่มเติม"
}`;

  const input: any[] = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
      ],
    },
  ];

  const maxImages = Math.min(options.images.length, MAX_IMAGE_COUNT);
  for (let i = 0; i < maxImages; i++) {
    input[0].content.push({
      type: 'input_image',
      image_url: options.images[i],
      detail: 'low',
    });
  }

  const response = await runWithOpenAIFallback((client) => client.responses.create({
    model: PRECHECK_MODEL,
    input,
    max_output_tokens: 400,
    temperature: 0,
    text: {
      format: {
        type: 'json_schema',
        name: 'image_precheck',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pass: { type: 'boolean' },
            reason: { type: 'string' },
            expectedType: { type: 'string' },
            consistentItem: { type: 'boolean' },
            imageChecks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  index: { type: 'number' },
                  detectedType: { type: 'string' },
                  matchesExpected: { type: 'boolean' },
                  note: { type: 'string' },
                },
                required: ['index', 'detectedType', 'matchesExpected', 'note'],
              },
            },
            recommendation: { type: 'string' },
          },
          required: ['pass', 'reason', 'expectedType', 'consistentItem', 'imageChecks', 'recommendation'],
        },
      },
    },
  }));

  const content = getResponseText(response);
  const parsed = parseJsonFromText<ImagePrecheckResult>(content);

  if (!parsed) {
    return {
      pass: false,
      reason: 'ไม่สามารถตรวจสอบรูปภาพได้',
      expectedType,
      consistentItem: false,
      imageChecks: [],
      recommendation: 'กรุณาถ่ายรูปใหม่ให้ชัดเจน และถ่ายเฉพาะสินค้าที่เลือก',
    };
  }

  const allMatch = parsed.imageChecks.length > 0 && parsed.imageChecks.every((check) => check.matchesExpected);
  const pass = Boolean(parsed.pass && parsed.consistentItem && allMatch);

  return {
    ...parsed,
    pass,
    expectedType: parsed.expectedType || expectedType,
  };
}

// Agent 2: Analyze condition with Gemini
async function analyzeConditionWithGemini(
  images: string[],
  options: {
    itemType: string;
    brand?: string;
    model?: string;
    appleCategory?: string;
  }
): Promise<ConditionResult> {
  if (!hasGeminiKeys()) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const parts: any[] = [{ text: buildConditionPrompt(options) }];
  const maxImages = Math.min(images.length, MAX_IMAGE_COUNT);
  for (let i = 0; i < maxImages; i++) {
    parts.push(toGeminiImagePart(images[i]));
  }

  const content = await runWithGeminiFallback(async (client) => {
    const model = client.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
  });
  const parsed = parseJsonFromText<ConditionResult>(content);

  if (!parsed) {
    throw new Error('Failed to parse Gemini response');
  }

  const totalScore = Math.max(0, Math.min(100, Number(parsed.totalScore) || 50));
  const rawScore = Number.isFinite(parsed.score) ? parsed.score : totalScore / 100;
  const score = Math.max(0, Math.min(1, rawScore));
  const assessable = typeof parsed.assessable === 'boolean' ? parsed.assessable : undefined;
  const assessmentStatus = typeof parsed.assessmentStatus === 'string' ? parsed.assessmentStatus : undefined;
  const assessmentIssue = typeof parsed.assessmentIssue === 'string' ? parsed.assessmentIssue : '';

  return {
    score,
    totalScore,
    grade: parsed.grade || 'F',
    reason: parsed.reason || 'วิเคราะห์จากรูปภาพแล้ว',
    assessable,
    assessmentStatus,
    assessmentIssue,
    detailedBreakdown: {
      screen: {
        score: parsed.detailedBreakdown?.screen?.score ?? 0,
        maxScore: 35,
        description: parsed.detailedBreakdown?.screen?.description || 'ไม่สามารถประเมินได้',
      },
      body: {
        score: parsed.detailedBreakdown?.body?.score ?? 0,
        maxScore: 30,
        description: parsed.detailedBreakdown?.body?.description || 'ไม่สามารถประเมินได้',
      },
      buttons: {
        score: parsed.detailedBreakdown?.buttons?.score ?? 0,
        maxScore: 20,
        description: parsed.detailedBreakdown?.buttons?.description || 'ไม่สามารถประเมินได้',
      },
      camera: {
        score: parsed.detailedBreakdown?.camera?.score ?? 0,
        maxScore: 10,
        description: parsed.detailedBreakdown?.camera?.description || 'ไม่สามารถประเมินได้',
      },
      overall: {
        score: parsed.detailedBreakdown?.overall?.score ?? 0,
        maxScore: 5,
        description: parsed.detailedBreakdown?.overall?.description || 'ไม่สามารถประเมินได้',
      },
    },
    recommendation: parsed.recommendation || 'ปานกลาง',
    imageQuality: parsed.imageQuality || 'พอใช้',
  };
}

function isAssessmentInsufficient(result: ConditionResult): boolean {
  if (result.assessable === false) return true;

  if (typeof result.assessmentStatus === 'string') {
    const status = result.assessmentStatus.toLowerCase();
    if (['insufficient', 'not_assessable', 'unassessable', 'failed'].includes(status)) {
      return true;
    }
  }

  const reasonText = `${result.reason || ''} ${result.assessmentIssue || ''}`.toLowerCase();
  const qualityText = `${result.imageQuality || ''}`.toLowerCase();
  const insufficientPattern = /ไม่เพียงพอ|ไม่สามารถประเมิน|ต้องการภาพเพิ่มเติม|ภาพไม่ชัด|ไม่ครบ|อุปกรณ์ผิดประเภท|ไม่ตรงกับประเภท|คนละสินค้า|insufficient|unable to assess|cannot assess|wrong device|mismatch/;

  if (insufficientPattern.test(reasonText)) {
    return true;
  }

  if (insufficientPattern.test(qualityText)) {
    const totalScore = Number(result.totalScore ?? 0);
    const score = Number(result.score ?? 0);
    return totalScore <= 60 || score <= 0.6;
  }

  return false;
}

function isConditionScoreSuspicious(result: ConditionResult): boolean {
  const totalScore = Number(result.totalScore ?? 0);
  const score = Number(result.score ?? 0);
  if (Number.isFinite(totalScore) && totalScore >= 0 && totalScore <= MIN_AI_CONDITION_SCORE * 100) {
    return true;
  }
  if (Number.isFinite(score) && score >= 0 && score <= MIN_AI_CONDITION_SCORE) {
    return true;
  }
  return false;
}
// Helper function to estimate base64 image size in bytes
function estimateBase64Size(base64String: string): number {
  if (!base64String || typeof base64String !== 'string') return 0;
  if (base64String.startsWith('http://') || base64String.startsWith('https://')) return 0;
  // Remove data URL prefix if present
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  // Base64 string length * 0.75 gives approximate size in bytes (accounting for padding)
  return Math.ceil(base64Data.length * 0.75);
}

function normalizeImageInput(value: string): string {
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('data:')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `data:image/jpeg;base64,${value}`;
}

// Configure route to accept larger payloads
export const maxDuration = 60; // Maximum execution time: 60 seconds
export const dynamic = 'force-dynamic'; // Always run dynamically

export async function POST(request: NextRequest) {
  try {
    if (!hasOpenAIKeys()) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    if (!hasGeminiKeys()) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { images, itemType, brand, model, appleCategory } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป' }, { status: 400 });
    }
    if (!itemType || typeof itemType !== 'string') {
      return NextResponse.json({ error: 'กรุณาเลือกประเภทสินค้าให้ถูกต้อง' }, { status: 400 });
    }

    // Normalize image payloads for OpenAI/Gemini (data URL or https)
    const normalizedImages = images.map((img: string) => normalizeImageInput(img)).filter(Boolean);

    // Check total payload size to avoid invalid/truncated images
    const originalTotalSize = normalizedImages.reduce((sum: number, img: string) => sum + estimateBase64Size(img), 0);
    const originalSizeMB = originalTotalSize / (1024 * 1024);

    console.log(`📊 Original images size: ${originalSizeMB.toFixed(2)}MB (${normalizedImages.length} images)`);

    if (originalSizeMB > MAX_TOTAL_IMAGE_MB) {
      return NextResponse.json(
        { error: 'รูปภาพมีขนาดใหญ่เกินไป กรุณาถ่ายใหม่หรือบีบอัดให้เล็กลงก่อนอัปโหลด' },
        { status: 413 }
      );
    }

    const processedImages = normalizedImages;

    console.log(`✅ Processed size: ${originalSizeMB.toFixed(2)}MB`);

    console.log('🔍 Prechecking images with OpenAI...');
    const precheck = await precheckImages({
      images: processedImages,
      itemType,
      brand,
      model,
      appleCategory,
    });

    if (!precheck.pass) {
      const recommendation = precheck.recommendation ? `คำแนะนำ: ${precheck.recommendation}` : '';
      const errorMessage = `รูปภาพไม่ผ่านการตรวจสอบ: ${precheck.reason}${recommendation ? `\n${recommendation}` : ''}`;
      return NextResponse.json(
        { error: errorMessage, details: precheck },
        { status: 400 }
      );
    }

    console.log('🔄 Analyzing condition with Gemini...');
    const conditionResult = await analyzeConditionWithGemini(processedImages, {
      itemType,
      brand,
      model,
      appleCategory,
    });
    console.log('✅ Condition analysis complete:', conditionResult);

    if (isAssessmentInsufficient(conditionResult)) {
      const recommendation = conditionResult.recommendation ? `คำแนะนำ: ${conditionResult.recommendation}` : '';
      const errorMessage = `ไม่สามารถประเมินสภาพได้: ${conditionResult.reason}${recommendation ? `\n${recommendation}` : ''}`;
      return NextResponse.json(
        { error: errorMessage, details: conditionResult },
        { status: 400 }
      );
    }
    if (isConditionScoreSuspicious(conditionResult)) {
      const errorMessage = 'ไม่สามารถประเมินสภาพได้: คะแนนสภาพต่ำผิดปกติ กรุณาถ่ายรูปหรืออัปโหลดรูปใหม่อีกครั้ง';
      return NextResponse.json(
        { error: errorMessage, details: conditionResult },
        { status: 400 }
      );
    }

    // Add warning message if images were compressed
    const result: any = {
      ...conditionResult
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error analyzing condition:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการวิเคราะห์สภาพ' }, { status: 500 });
  }
}
