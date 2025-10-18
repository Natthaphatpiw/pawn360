import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Agent 3: Analyze condition from images
async function analyzeConditionFromImages(images: string[], userCondition?: number): Promise<{ score: number; reason: string }> {
  if (images.length === 0) {
    // If no images, use user-reported condition (convert to 0-1 scale)
    const score = (userCondition || 50) / 100;
    return {
      score,
      reason: `สภาพสินค้าประเมินเบื้องต้นที่ ${Math.round(score * 100)}% ตามที่ผู้ใช้ระบุ (ไม่มีรูปภาพประกอบ)`
    };
  }

  // Use OpenAI Vision to analyze condition from images
  const prompt = `วิเคราะห์สภาพของสินค้าจากรูปภาพที่ให้มา และให้คะแนนสภาพจาก 0.0 ถึง 1.0 พร้อมเหตุผลสั้นๆ

คะแนนสภาพ:
- 1.0 = สภาพดีเยี่ยม ไม่มีร่องรอยการใช้งาน
- 0.8 = สภาพดีมาก มีร่องรอยเล็กน้อยที่ปกติ
- 0.6 = สภาพดี มีร่องรอยการใช้งานเห็นได้ชัดแต่ใช้งานได้ปกติ
- 0.4 = สภาพพอใช้ มีร่องรอยและตำหนิที่เห็นได้ชัด
- 0.2 = สภาพไม่ดี มีตำหนิและร่องรอยมาก
- 0.0 = สภาพเลวมาก แทบใช้งานไม่ได้

ให้เหตุผลสั้นๆ และให้คะแนนที่สมจริง (ผู้ใช้มักจะประเมินสภาพของตนเองสูงกว่าความเป็นจริง)

ตอบในรูปแบบ JSON:
{
  "score": 0.85,
  "reason": "สินค้าอยู่ในสภาพดีมาก..."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use vision-capable model
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            // Note: In production, you would include image URLs here
            // For now, we'll simulate with text-based analysis
          ]
        }
      ],
      max_tokens: 200,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content || '';

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(content);
      return {
        score: Math.max(0, Math.min(1, parsed.score || 0.5)),
        reason: parsed.reason || 'ไม่สามารถวิเคราะห์ได้'
      };
    } catch {
      // If JSON parsing fails, extract score and reason from text
      const scoreMatch = content.match(/score["\s:]+([0-9.]+)/i);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;

      return {
        score: Math.max(0, Math.min(1, score)),
        reason: content.replace(/score["\s:]+[0-9.]+/i, '').trim() || 'วิเคราะห์จากรูปภาพแล้ว'
      };
    }
  } catch (error) {
    console.error('Error analyzing condition:', error);
    // Fallback to mock analysis
    return {
      score: 0.5,
      reason: 'ไม่สามารถวิเคราะห์สภาพจากรูปภาพได้ ใช้ค่าประเมินเบื้องต้น'
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, userCondition } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log('🔄 Analyzing condition from images...');
    const conditionResult = await analyzeConditionFromImages(images, userCondition);
    console.log('✅ Condition analysis complete:', conditionResult);

    return NextResponse.json(conditionResult);
  } catch (error) {
    console.error('Error analyzing condition:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการวิเคราะห์สภาพ' }, { status: 500 });
  }
}
