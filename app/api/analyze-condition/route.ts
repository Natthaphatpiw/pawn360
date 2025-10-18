import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'กรุณาอัพโหลดรูปภาพอย่างน้อย 1 รูป' }, { status: 400 });
    }

    // For now, return a mock condition analysis
    // In production, this would use OpenAI Vision API to analyze the images
    const mockConditionScore = 0.85; // 85% condition
    const mockReason = 'สินค้าอยู่ในสภาพดีมาก มีร่องรอยการใช้งานเล็กน้อยที่ปกติ แต่ไม่มีตำหนิที่สำคัญ หน้าจอและตัวเครื่องอยู่ในสภาพสมบูรณ์';

    const conditionResult = {
      score: mockConditionScore,
      reason: mockReason
    };

    return NextResponse.json(conditionResult);
  } catch (error) {
    console.error('Error analyzing condition:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการวิเคราะห์สภาพ' }, { status: 500 });
  }
}
