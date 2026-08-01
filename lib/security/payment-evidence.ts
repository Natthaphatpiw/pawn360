import { supabaseAdmin } from '@/lib/supabase/client';
import { TransactionRequestError } from '@/lib/security/transaction-request';

type SupabaseAdminClient = ReturnType<typeof supabaseAdmin>;

/**
 * Checks every payment-evidence store used by the transactional routes. Calls
 * must hold the shared `payment-evidence` distributed lock for this fingerprint
 * so two different workflows cannot both pass the lookup concurrently.
 */
export async function paymentEvidenceWasUsed(
  supabase: SupabaseAdminClient,
  fingerprint: string,
): Promise<boolean> {
  const [payment, penalty, delivery, redemption] = await Promise.all([
    supabase
      .from('payments')
      .select('payment_id')
      .eq('transaction_ref', fingerprint)
      .limit(1),
    supabase
      .from('penalty_payments')
      .select('penalty_id')
      .contains('slip_verification_details', { fingerprint })
      .limit(1),
    supabase
      .from('pawn_delivery_requests')
      .select('delivery_request_id')
      .contains('slip_verification_details', { fingerprint })
      .limit(1),
    supabase
      .from('slip_verifications')
      .select('verification_id')
      .contains('ai_response', { fingerprint })
      .limit(1),
  ]);

  if (payment.error || penalty.error || delivery.error || redemption.error) {
    throw new TransactionRequestError(
      'EVIDENCE_CHECK_UNAVAILABLE',
      503,
      'ไม่สามารถตรวจสอบการใช้สลิปซ้ำได้ กรุณาลองใหม่',
    );
  }

  return [payment.data, penalty.data, delivery.data, redemption.data]
    .some((rows) => Boolean(rows?.length));
}

