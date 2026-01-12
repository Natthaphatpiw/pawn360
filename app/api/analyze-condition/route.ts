import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const PRECHECK_MODEL = 'gpt-4.1-mini';
const GEMINI_MODEL = 'gemini-3-pro-preview';
const MAX_IMAGE_COUNT = 6;

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

const CONDITION_PROMPT = `# Phone Condition Assessment Prompt

## บทบาทและหน้าที่
คุณคือผู้เชี่ยวชาญด้านการประเมินสภาพโทรศัพท์มือถือสำหรับธุรกิจจำนำ มีประสบการณ์ในการตรวจสอบอุปกรณ์อิเล็กทรอนิกส์มากกว่า 10 ปี คุณต้องวิเคราะห์รูปภาพโทรศัพท์ที่ได้รับอย่างละเอียดและให้คะแนนสภาพที่แม่นยำ เป็นกลาง และสามารถอธิบายเหตุผลได้อย่างชัดเจน

## ขั้นตอนการประเมิน

### 1. การตรวจสอบเบื้องต้น
- ระบุยี่ห้อและรุ่นของโทรศัพท์ (ถ้าสามารถระบุได้จากภาพ)
- ตรวจสอบความครบถ้วนของภาพที่ได้รับ (ด้านหน้า, ด้านหลัง, ด้านข้าง, มุมต่างๆ)
- ประเมินคุณภาพของภาพถ่าย (แสงสว่าง, ความชัด, มุมกล้อง)

### 2. หมวดหมู่การประเมิน (100 คะแนนเต็ม)

#### A. สภาพหน้าจอ (35 คะแนน)
- **ไม่มีรอยแตกร้าว** (35 คะแนน)
- **รอยขีดข่วนเล็กน้อย** (25-34 คะแนน) - รอยขีดข่วนผิวเผิน มองเห็นเมื่อส่องแสง
- **รอยขีดข่วนปานกลาง** (15-24 คะแนน) - รอยขีดข่วนที่เห็นชัดเจน แต่ไม่กระทบการใช้งาน
- **แตกร้าวเล็กน้อย** (5-14 คะแนน) - มีรอยแตกร้าว 1-2 จุด ขนาดเล็ก
- **แตกร้าวมาก** (0-4 คะแนน) - รอยแตกร้าวหลายจุด หรือแตกร้าวทั่วทั้งจอ

#### B. สภาพตัวเครื่อง (30 คะแนน)
- **ตัวเครื่องด้านหลัง** (15 คะแนน)
  - สภาพสมบูรณ์: 15 คะแนน
  - รอยขีดข่วนเล็กน้อย: 10-14 คะแนน
  - รอยขีดข่วนชัดเจน: 5-9 คะแนน
  - แตกร้าว/บุบ: 0-4 คะแนน

- **กรอบและขอบเครื่อง** (15 คะแนน)
  - ไม่มีรอยบุบ/รอยขีดข่วน: 15 คะแนน
  - รอยขีดข่วนเล็กน้อย: 10-14 คะแนน
  - มีรอยบุบเล็กน้อย: 5-9 คะแนน
  - บุบ/เสียหายมาก: 0-4 คะแนน

#### C. ปุ่มกดและพอร์ต (20 คะแนน)
- **ปุ่มกด** (10 คะแนน)
  - ครบถ้วน ไม่หลุด: 10 คะแนน
  - มีรอยใช้งาน: 7-9 คะแนน
  - ปุ่มหลวม: 4-6 คะแนน
  - ปุ่มหายหรือเสียหาย: 0-3 คะแนน

- **พอร์ตชาร์จและช่องเสียบหูฟัง** (10 คะแนน)
  - สะอาด ไม่มีรอยเสียหาย: 10 คะแนน
  - มีฝุ่นหรือสิ่งสกปรกเล็กน้อย: 7-9 คะแนน
  - มีรอยสนิม/ความเสียหาย: 4-6 คะแนน
  - เสียหายมาก: 0-3 คะแนน

#### D. กล้องและเลนส์ (10 คะแนน)
- **สภาพสมบูรณ์** ไม่มีรอยขีดข่วน: 10 คะแนน
- **รอยขีดข่วนเล็กน้อย**: 7-9 คะแนน
- **รอยขีดข่วนชัดเจน**: 4-6 คะแนน
- **แตกร้าว**: 0-3 คะแนน

#### E. ความสมบูรณ์โดยรวม (5 คะแนน)
- **ดูใหม่** ไม่มีร่องรอยการใช้งาน: 5 คะแนน
- **มีร่องรอยการใช้งานปกติ**: 3-4 คะแนน
- **มีร่องรอยการใช้งานมาก**: 1-2 คะแนน
- **สภาพเก่ามาก**: 0 คะแนน

### 3. การจัดเกรดตามคะแนน

- **Grade A+ (95-100 คะแนน)**: สภาพใหม่ เหมือนเพิ่งแกะกล่อง
- **Grade A (90-94 คะแนน)**: สภาพดีมาก มีร่องรอยการใช้งานน้อยมาก
- **Grade A- (85-89 คะแนน)**: สภาพดี มีรอยการใช้งานเล็กน้อย
- **Grade B+ (80-84 คะแนน)**: สภาพดีพอใช้ มีรอยขีดข่วนเล็กน้อย
- **Grade B (70-79 คะแนน)**: สภาพปานกลาง มีรอยใช้งานชัดเจน
- **Grade C (60-69 คะแนน)**: สภาพพอใช้ มีความเสียหายบางส่วน
- **Grade D (50-59 คะแนน)**: สภาพค่อนข้างแย่ มีความเสียหายหลายจุด
- **Grade F (ต่ำกว่า 50 คะแนน)**: สภาพแย่ ไม่เหมาะสำหรับการจำนำ

## รูปแบบการตอบกลับ

คุณต้องตอบในรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:

{
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

**คำอธิบาย score:**
- คำนวณเป็นเปอร์เซ็นต์ (totalScore / 100)
- ใช้คะแนนเต็ม 100 คะแนนแล้วแปลงเป็น 0.0-1.0

**คำอธิบาย totalScore:**
- คะแนนรวมจากทุกหมวดหมู่ (0-100)

**คำอธิบาย grade:**
- Grade ตามเกณฑ์ที่กำหนด

**คำอธิบาย reason:**
- สรุปสภาพโดยรวมสั้นๆ

**คำอธิบาย detailedBreakdown:**
- แยกคะแนนแต่ละหมวดพร้อมรายละเอียด

**คำอธิบาย recommendation:**
- ระดับความเหมาะสมในการจำนำ (สูง/ปานกลาง/ต่ำ)

**คำอธิบาย imageQuality:**
- ประเมินคุณภาพภาพที่ใช้ในการวิเคราะห์

## หมายเหตุเพิ่มเติม

### สิ่งที่ต้องระวังในการประเมิน:
1. **อย่าให้คะแนนสูงเกินจริง** - ต้องประเมินอย่างเป็นกลางเพื่อประโยชน์ของทั้งสองฝ่าย
2. **ระบุข้อจำกัด** - หากภาพไม่ชัดเจนหรือไม่ครบถ้วน ให้แจ้งว่าอาจมีความคลาดเคลื่อน
3. **ข้อสงสัย** - หากพบสิ่งผิดปกติ (เช่น อาจเป็นของปลอม, มีการดัดแปลง) ให้ระบุไว้
4. **การทดสอบเพิ่มเติม** - แนะนำการทดสอบฟังก์ชันที่ไม่สามารถประเมินจากภาพได้

### ข้อความปฏิเสธความรับผิดชอบ:
"การประเมินนี้อิงจากภาพถ่ายที่ได้รับเท่านั้น การประเมินสภาพจริงอาจต้องมีการตรวจสอบด้วยตนเอง รวมถึงการทดสอบฟังก์ชันการทำงานต่างๆ ที่ไม่สามารถประเมินจากภาพถ่ายได้"

## ตัวอย่างการตอบกลับเมื่อภาพไม่เพียงพอ:

{
  "score": 0.5,
  "totalScore": 50,
  "grade": "F",
  "reason": "ภาพไม่เพียงพอสำหรับการประเมิน",
  "detailedBreakdown": {
    "screen": { "score": 0, "maxScore": 35, "description": "ไม่สามารถประเมินได้" },
    "body": { "score": 0, "maxScore": 30, "description": "ไม่สามารถประเมินได้" },
    "buttons": { "score": 0, "maxScore": 20, "description": "ไม่สามารถประเมินได้" },
    "camera": { "score": 0, "maxScore": 10, "description": "ไม่สามารถประเมินได้" },
    "overall": { "score": 0, "maxScore": 5, "description": "ไม่สามารถประเมินได้" }
  },
  "recommendation": "ต้องการภาพเพิ่มเติม",
  "imageQuality": "ภาพไม่เพียงพอ - ต้องการภาพด้านหน้า, ด้านหลัง, ด้านข้าง, พอร์ตชาร์จ, ปุ่มกด"
}`;

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

const buildExpectedTypeLabel = (itemType: string, appleCategory?: string) => {
  if (itemType === 'Apple') {
    if (appleCategory) {
      return `Apple ${appleCategory}`;
    }
    return 'Apple product (iPhone/iPad/MacBook/Apple Watch/AirPods/iMac/Mac mini/Mac Studio/Mac Pro)';
  }
  return itemType;
};

// Agent 1: Image precheck with OpenAI (type match + consistency)
async function precheckImages(options: {
  images: string[];
  itemType: string;
  brand?: string;
  model?: string;
  appleCategory?: string;
}): Promise<ImagePrecheckResult> {
  if (!openai) {
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

  const response = await openai.responses.create({
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
  });

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
async function analyzeConditionWithGemini(images: string[]): Promise<ConditionResult> {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const parts: any[] = [{ text: CONDITION_PROMPT }];
  const maxImages = Math.min(images.length, MAX_IMAGE_COUNT);
  for (let i = 0; i < maxImages; i++) {
    parts.push(toGeminiImagePart(images[i]));
  }

  const result = await model.generateContent(parts);
  const response = await result.response;
  const content = response.text();
  const parsed = parseJsonFromText<ConditionResult>(content);

  if (!parsed) {
    throw new Error('Failed to parse Gemini response');
  }

  const totalScore = Math.max(0, Math.min(100, Number(parsed.totalScore) || 50));
  const rawScore = Number.isFinite(parsed.score) ? parsed.score : totalScore / 100;
  const score = Math.max(0, Math.min(1, rawScore));

  return {
    score,
    totalScore,
    grade: parsed.grade || 'F',
    reason: parsed.reason || 'วิเคราะห์จากรูปภาพแล้ว',
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
  const combined = `${result.reason} ${result.recommendation} ${result.imageQuality}`.toLowerCase();
  return /ไม่เพียงพอ|ไม่สามารถประเมิน|ต้องการภาพเพิ่มเติม|ภาพไม่ชัด|ไม่ครบ|insufficient|unable to assess|cannot assess/.test(combined);
}
// Helper function to estimate base64 image size in bytes
function estimateBase64Size(base64String: string): number {
  // Remove data URL prefix if present
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  // Base64 string length * 0.75 gives approximate size in bytes (accounting for padding)
  return Math.ceil(base64Data.length * 0.75);
}

// Helper function to reduce image quality by truncating base64 data
function reduceImageQuality(base64Image: string, targetSizeKB: number = 500): string {
  const targetBytes = targetSizeKB * 1024;
  const currentSize = estimateBase64Size(base64Image);

  if (currentSize <= targetBytes) {
    return base64Image;
  }

  // Calculate reduction ratio
  const ratio = targetBytes / currentSize;
  const [prefix, base64Data] = base64Image.includes(',') ? base64Image.split(',') : ['', base64Image];

  // Truncate base64 data
  const newLength = Math.floor(base64Data.length * ratio);
  const safeLength = newLength - (newLength % 4);
  const reducedData = base64Data.substring(0, safeLength);
  const padding = '='.repeat((4 - (reducedData.length % 4)) % 4);
  const payload = `${reducedData}${padding}`;

  return prefix ? `${prefix},${payload}` : payload;
}

// Configure route to accept larger payloads
export const maxDuration = 60; // Maximum execution time: 60 seconds
export const dynamic = 'force-dynamic'; // Always run dynamically

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    if (!process.env.GEMINI_API_KEY) {
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

    // 🔥 Check if images are too large and need compression
    const originalTotalSize = images.reduce((sum: number, img: string) => sum + estimateBase64Size(img), 0);
    const originalSizeMB = originalTotalSize / (1024 * 1024);

    console.log(`📊 Original images size: ${originalSizeMB.toFixed(2)}MB (${images.length} images)`);

    // Target: 2.5MB total for safety margin (including JSON overhead)
    const targetSizePerImage = Math.floor(2500 / images.length);
    let imagesWereCompressed = false;

    const processedImages = images.map((img: string) => {
      const originalSize = estimateBase64Size(img) / 1024;
      const compressed = reduceImageQuality(img, targetSizePerImage);
      const compressedSize = estimateBase64Size(compressed) / 1024;

      if (compressedSize < originalSize * 0.9) { // If reduced by more than 10%
        imagesWereCompressed = true;
      }

      return compressed;
    });

    const totalSize = processedImages.reduce((sum: number, img: string) => sum + estimateBase64Size(img), 0);
    const totalSizeMB = totalSize / (1024 * 1024);

    console.log(`✅ Processed size: ${totalSizeMB.toFixed(2)}MB${imagesWereCompressed ? ' (compressed)' : ''}`);

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
    const conditionResult = await analyzeConditionWithGemini(processedImages);
    console.log('✅ Condition analysis complete:', conditionResult);

    if (isAssessmentInsufficient(conditionResult)) {
      const recommendation = conditionResult.recommendation ? `คำแนะนำ: ${conditionResult.recommendation}` : '';
      const errorMessage = `ไม่สามารถประเมินสภาพได้: ${conditionResult.reason}${recommendation ? `\n${recommendation}` : ''}`;
      return NextResponse.json(
        { error: errorMessage, details: conditionResult },
        { status: 400 }
      );
    }

    // Add warning message if images were compressed
    const result: any = {
      ...conditionResult
    };

    if (imagesWereCompressed) {
      result.warning = 'รูปภาพของคุณมีขนาดใหญ่เกินไป ระบบได้ลดคุณภาพรูปภาพเพื่อให้สามารถวิเคราะห์ได้ กรุณาถ่ายรูปที่มีขนาดเล็กกว่านี้เพื่อผลลัพธ์ที่ดีขึ้น';
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error analyzing condition:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการวิเคราะห์สภาพ' }, { status: 500 });
  }
}
