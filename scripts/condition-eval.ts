import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const IMAGE_INPUTS = [
  'https://example.com/your-image-1.jpg',
  'https://example.com/your-image-2.jpg',
];

const OUTPUT_PATH = path.join('scripts', 'output', 'condition_result.json');

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const getResponseText = (response: any): string => {
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
};

const toImageInput = async (value: string) => {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return { type: 'input_image', image_url: value, detail: 'low' as const };
  }

  const filePath = path.resolve(value);
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  const ext = path.extname(filePath).replace('.', '') || 'jpeg';
  const dataUrl = `data:image/${ext};base64,${base64}`;
  return { type: 'input_image', image_url: dataUrl, detail: 'low' as const };
};

async function main() {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const prompt = `# Phone Condition Assessment Prompt

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

  const input: any[] = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
      ],
    },
  ];

  const maxImages = Math.min(IMAGE_INPUTS.length, 4);
  for (let i = 0; i < maxImages; i += 1) {
    const imageInput = await toImageInput(IMAGE_INPUTS[i]);
    input[0].content.push(imageInput);
  }

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input,
    temperature: 0,
    max_output_tokens: 400,
    text: { format: { type: 'json_object' } },
  });

  const content = getResponseText(response);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { error: 'Failed to parse JSON', raw: content };
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(parsed, null, 2), 'utf-8');

  console.log(`Saved condition analysis to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
