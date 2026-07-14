// Condition-scoring pipeline (image precheck + AI condition assessment).
//
// Extracted from app/api/analyze-condition/route.ts so it runs BOTH
// synchronously (POST /api/analyze-condition) and as a background job
// (/api/analyze-condition/jobs — see lib/services/analyze-condition-jobs.ts).
//
// Scoring runs on OpenAI gpt-5.6-luna vision (Responses API); Claude vision is
// the resilience fallback. The image precheck stays on Claude. No Next.js
// request/response types in here.

import {
  anthropicStructured,
  hasAnthropicKeys,
  getAnthropicVisionModel,
} from '@/lib/services/anthropic-llm';
import {
  hasOpenAIKeys,
  getOpenAIVisionModel,
  openaiVisionJson,
} from '@/lib/services/openai-llm';

export const MAX_IMAGE_COUNT = 6;
export const MAX_TOTAL_IMAGE_MB = 10;
const MIN_AI_CONDITION_SCORE = 0.3;

export interface AnalyzeConditionRequest {
  images: string[];
  itemType: string;
  brand?: string;
  model?: string;
  appleCategory?: string;
}

export type ConditionResult = {
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

export type AnalyzeConditionRunResult =
  | { ok: true; payload: ConditionResult }
  | { ok: false; status: number; error: string; code?: string };

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

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildExpectedTypeLabel(itemType: string, appleCategory?: string) {
  if (itemType === 'Apple') {
    if (appleCategory) return `Apple ${appleCategory}`;
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

// ---------------------------------------------------------------------------
// Image precheck (Claude): type match + same-item consistency
// ---------------------------------------------------------------------------

async function precheckImages(options: AnalyzeConditionRequest): Promise<ImagePrecheckResult> {
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

  const parsed = await anthropicStructured<ImagePrecheckResult>({
    userText: prompt,
    images: options.images.slice(0, MAX_IMAGE_COUNT),
    model: getAnthropicVisionModel(),
    toolName: 'image_precheck',
    toolDescription: 'Return the image precheck result.',
    maxTokens: 1024,
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
  });

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

  return { ...parsed, pass, expectedType: parsed.expectedType || expectedType };
}

// ---------------------------------------------------------------------------
// Condition scoring: OpenAI gpt-5.6-luna primary, Claude vision fallback
// ---------------------------------------------------------------------------

const CONDITION_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    totalScore: { type: 'number' },
    grade: { type: 'string' },
    reason: { type: 'string' },
    assessable: { type: 'boolean' },
    assessmentStatus: { type: 'string' },
    assessmentIssue: { type: 'string' },
    detailedBreakdown: {
      type: 'object',
      properties: {
        screen: { type: 'object', properties: { score: { type: 'number' }, description: { type: 'string' } } },
        body: { type: 'object', properties: { score: { type: 'number' }, description: { type: 'string' } } },
        buttons: { type: 'object', properties: { score: { type: 'number' }, description: { type: 'string' } } },
        camera: { type: 'object', properties: { score: { type: 'number' }, description: { type: 'string' } } },
        overall: { type: 'object', properties: { score: { type: 'number' }, description: { type: 'string' } } },
      },
    },
    recommendation: { type: 'string' },
    imageQuality: { type: 'string' },
  },
  required: ['totalScore', 'reason'],
};

async function scoreConditionWithClaudeVision(
  images: string[],
  options: AnalyzeConditionRequest
): Promise<ConditionResult | null> {
  return anthropicStructured<ConditionResult>({
    userText: buildConditionPrompt(options),
    images: images.slice(0, MAX_IMAGE_COUNT),
    model: getAnthropicVisionModel(),
    toolName: 'condition_assessment',
    toolDescription: 'Return the device condition assessment in the exact JSON structure described.',
    maxTokens: 1500,
    schema: CONDITION_RESULT_SCHEMA,
  });
}

async function analyzeCondition(
  images: string[],
  options: AnalyzeConditionRequest
): Promise<ConditionResult> {
  const canUseOpenAI = hasOpenAIKeys();
  const canUseClaude = hasAnthropicKeys();
  if (!canUseOpenAI && !canUseClaude) {
    throw new Error('No vision provider configured (OPENAI_API_KEY / ANTHROPIC_API_KEY)');
  }

  const boundedImages = images.slice(0, MAX_IMAGE_COUNT);
  let parsed: ConditionResult | null = null;

  if (canUseOpenAI) {
    try {
      console.log(`🔎 Scoring condition with OpenAI (${getOpenAIVisionModel()})...`);
      parsed = await openaiVisionJson<ConditionResult>({
        userText: buildConditionPrompt(options),
        images: boundedImages,
        maxOutputTokens: 3500,
      });
      if (!parsed) throw new Error('OpenAI returned no parseable condition JSON');
    } catch (error) {
      if (!canUseClaude) throw error;
      console.warn('🔁 OpenAI condition scoring failed — falling back to Claude vision:', error);
      parsed = null;
    }
  }

  if (!parsed) {
    console.log('🔍 Scoring condition with Claude vision (same rubric)...');
    parsed = await scoreConditionWithClaudeVision(boundedImages, options);
  }

  if (!parsed) {
    throw new Error('Condition scoring failed on all providers');
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

// ---------------------------------------------------------------------------
// Rejection heuristics (unchanged from the original route)
// ---------------------------------------------------------------------------

function isAssessmentInsufficient(result: ConditionResult): boolean {
  if (result.assessable === false) return true;

  if (typeof result.assessmentStatus === 'string') {
    const status = result.assessmentStatus.toLowerCase();
    if (['insufficient', 'not_assessable', 'unassessable', 'failed'].includes(status)) return true;
  }

  const reasonText = `${result.reason || ''} ${result.assessmentIssue || ''}`.toLowerCase();
  const qualityText = `${result.imageQuality || ''}`.toLowerCase();
  const insufficientPattern = /ไม่เพียงพอ|ไม่สามารถประเมิน|ต้องการภาพเพิ่มเติม|ภาพไม่ชัด|ไม่ครบ|อุปกรณ์ผิดประเภท|ไม่ตรงกับประเภท|คนละสินค้า|insufficient|unable to assess|cannot assess|wrong device|mismatch/;

  if (insufficientPattern.test(reasonText)) return true;

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
  if (Number.isFinite(totalScore) && totalScore >= 0 && totalScore <= MIN_AI_CONDITION_SCORE * 100) return true;
  if (Number.isFinite(score) && score >= 0 && score <= MIN_AI_CONDITION_SCORE) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function estimateBase64Size(base64String: string): number {
  if (!base64String || typeof base64String !== 'string') return 0;
  if (base64String.startsWith('http://') || base64String.startsWith('https://')) return 0;
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  return Math.ceil(base64Data.length * 0.75);
}

function normalizeImageInput(value: string): string {
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('data:')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `data:image/jpeg;base64,${value}`;
}

// ---------------------------------------------------------------------------
// Pipeline entry
// ---------------------------------------------------------------------------

export async function runAnalyzeConditionPipeline(
  body: AnalyzeConditionRequest
): Promise<AnalyzeConditionRunResult> {
  try {
    const { images, itemType, brand, model, appleCategory } = body || ({} as AnalyzeConditionRequest);

    if (!hasAnthropicKeys()) {
      return { ok: false, status: 500, error: 'Anthropic API key not configured' };
    }
    if (!hasOpenAIKeys() && !hasAnthropicKeys()) {
      return { ok: false, status: 500, error: 'No vision provider configured' };
    }
    if (!images || !Array.isArray(images) || images.length === 0) {
      return { ok: false, status: 400, error: 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป' };
    }
    if (!itemType || typeof itemType !== 'string') {
      return { ok: false, status: 400, error: 'กรุณาเลือกประเภทสินค้าให้ถูกต้อง' };
    }

    const normalizedImages = images.map((img: string) => normalizeImageInput(img)).filter(Boolean);
    const originalSizeMB =
      normalizedImages.reduce((sum: number, img: string) => sum + estimateBase64Size(img), 0) / (1024 * 1024);
    console.log(`📊 Original images size: ${originalSizeMB.toFixed(2)}MB (${normalizedImages.length} images)`);

    if (originalSizeMB > MAX_TOTAL_IMAGE_MB) {
      return {
        ok: false,
        status: 413,
        error: 'รูปภาพมีขนาดใหญ่เกินไป กรุณาถ่ายใหม่หรือบีบอัดให้เล็กลงก่อนอัปโหลด',
        code: 'image_too_large',
      };
    }

    const options = { images: normalizedImages, itemType, brand, model, appleCategory };

    console.log('🔍 Prechecking images with Claude...');
    const precheck = await precheckImages(options);
    if (!precheck.pass) {
      const recommendation = precheck.recommendation ? `คำแนะนำ: ${precheck.recommendation}` : '';
      return {
        ok: false,
        status: 400,
        error: `รูปภาพไม่ผ่านการตรวจสอบ: ${precheck.reason}${recommendation ? `\n${recommendation}` : ''}`,
        code: 'precheck_failed',
      };
    }

    console.log('🔄 Analyzing condition...');
    const conditionResult = await analyzeCondition(normalizedImages, options);
    console.log('✅ Condition analysis complete:', {
      score: conditionResult.score,
      totalScore: conditionResult.totalScore,
      grade: conditionResult.grade,
    });

    if (isAssessmentInsufficient(conditionResult)) {
      const recommendation = conditionResult.recommendation ? `คำแนะนำ: ${conditionResult.recommendation}` : '';
      return {
        ok: false,
        status: 400,
        error: `ไม่สามารถประเมินสภาพได้: ${conditionResult.reason}${recommendation ? `\n${recommendation}` : ''}`,
        code: 'assessment_insufficient',
      };
    }
    if (isConditionScoreSuspicious(conditionResult)) {
      return {
        ok: false,
        status: 400,
        error: 'ไม่สามารถประเมินสภาพได้: คะแนนสภาพต่ำผิดปกติ กรุณาถ่ายรูปหรืออัปโหลดรูปใหม่อีกครั้ง',
        code: 'score_suspicious',
      };
    }

    return { ok: true, payload: conditionResult };
  } catch (error) {
    console.error('Error analyzing condition:', error);
    return { ok: false, status: 500, error: 'เกิดข้อผิดพลาดในการวิเคราะห์สภาพ' };
  }
}
