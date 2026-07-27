BEGIN;

ALTER TABLE public.contract_action_requests
  ADD COLUMN IF NOT EXISTS overdue_interest_amount NUMERIC(12,2);

ALTER TABLE public.contract_action_requests
  ALTER COLUMN overdue_interest_amount SET DEFAULT 0;

-- Existing NULL rows are intentionally preserved. They identify requests
-- created before the late-charge breakdown was stored, so the application can
-- derive the historical split without treating the whole amount as a penalty.

NOTIFY pgrst, 'reload schema';

COMMIT;
