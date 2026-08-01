import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'รายการรูปแบบเดิมถูกยกเลิก กรุณาทำรายการไถ่ถอนจากหน้าสัญญา',
      code: 'LEGACY_REDEMPTION_RETIRED',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
