import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'รายการรูปแบบเดิมถูกยกเลิก กรุณาทำรายการต่อดอกเบี้ยจากหน้าสัญญา',
      code: 'LEGACY_EXTENSION_RETIRED',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
