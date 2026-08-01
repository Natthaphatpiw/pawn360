import { NextResponse } from 'next/server';

/**
 * Retired Mongo-era financial mutation endpoint.
 *
 * It mixed Mongo ObjectIds with the current Supabase UUID contracts and could
 * not provide an atomic, auditable state transition. Active callers now use
 * the typed contract-action/redemption state machines instead. Keep this
 * endpoint fail-closed so stale clients cannot write an unaudited transaction
 * history or send duplicate store notifications.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'รายการรูปแบบเดิมถูกยกเลิก กรุณาเปิดหน้าสัญญาแล้วทำรายการใหม่',
      code: 'LEGACY_CONTRACT_ACTION_RETIRED',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
