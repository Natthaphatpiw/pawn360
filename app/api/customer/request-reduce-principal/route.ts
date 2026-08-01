import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'รายการรูปแบบเดิมถูกยกเลิก กรุณาทำรายการลดเงินต้นจากหน้าสัญญา',
      code: 'LEGACY_PRINCIPAL_REDUCTION_RETIRED',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
