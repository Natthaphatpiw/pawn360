import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'รายการรูปแบบเดิมถูกยกเลิก กรุณาทำรายการเพิ่มเงินต้นจากหน้าสัญญา',
      code: 'LEGACY_PRINCIPAL_INCREASE_RETIRED',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
