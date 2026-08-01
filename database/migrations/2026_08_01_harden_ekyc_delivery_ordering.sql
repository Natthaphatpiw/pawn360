BEGIN;

-- Every outbox publication receives a new generation. Queue messages from an
-- older generation become harmless even when Vercel delivers them later.
ALTER TABLE public.ekyc_webhook_events
  ADD COLUMN IF NOT EXISTS processing_generation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_message_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_generation INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_message_id TEXT,
  ADD COLUMN IF NOT EXISTS notification_published_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ekyc_webhook_processing_generation_nonnegative'
      AND conrelid = 'public.ekyc_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.ekyc_webhook_events
      ADD CONSTRAINT ekyc_webhook_processing_generation_nonnegative
      CHECK (processing_generation >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ekyc_webhook_notification_generation_nonnegative'
      AND conrelid = 'public.ekyc_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.ekyc_webhook_events
      ADD CONSTRAINT ekyc_webhook_notification_generation_nonnegative
      CHECK (notification_generation >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_processing_generation
  ON public.ekyc_webhook_events(processing_status, updated_at, processing_generation);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_notification_generation
  ON public.ekyc_webhook_events(processing_status, notification_status, updated_at, notification_generation);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_provider_order
  ON public.ekyc_webhook_events(
    actor_type,
    uppass_slug,
    provider_event_at DESC NULLS LAST,
    received_at DESC
  );

-- Actor-local watermarks make provider event ordering durable and serialize
-- concurrent webhook transitions through the existing updated_at CAS.
ALTER TABLE public.pawners
  ADD COLUMN IF NOT EXISTS kyc_last_provider_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_last_provider_event_key CHAR(64);

ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS kyc_last_provider_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_last_provider_event_key CHAR(64);

-- UpPass does not document an idempotency header or a create-session lookup
-- endpoint. Persist the known result before updating the actor and quarantine
-- ambiguous requests instead of issuing a potentially duplicate create call.
ALTER TABLE public.ekyc_attempts
  ADD COLUMN IF NOT EXISTS provider_request_key CHAR(64),
  ADD COLUMN IF NOT EXISTS provider_request_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_request_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_form_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ekyc_attempts_provider_request_key
  ON public.ekyc_attempts(provider_request_key)
  WHERE provider_request_key IS NOT NULL;

ALTER TABLE public.ekyc_attempts
  DROP CONSTRAINT IF EXISTS ekyc_attempts_status_check;

ALTER TABLE public.ekyc_attempts
  ADD CONSTRAINT ekyc_attempts_status_check CHECK (status IN (
    'CREATING',
    'ACTIVE',
    'RECOVERY_REQUIRED',
    'COMPLETED',
    'REJECTED',
    'ABANDONED',
    'FAILED',
    'SUPERSEDED'
  ));

DROP INDEX IF EXISTS public.idx_ekyc_attempts_one_active_actor;
CREATE UNIQUE INDEX idx_ekyc_attempts_one_active_actor
  ON public.ekyc_attempts(actor_type, actor_id)
  WHERE status IN ('CREATING', 'ACTIVE', 'RECOVERY_REQUIRED');

COMMENT ON COLUMN public.ekyc_attempts.provider_request_key IS
  'Application-generated request correlation key; not sent as an unsupported UpPass header.';
COMMENT ON COLUMN public.ekyc_attempts.provider_form_url IS
  'Server-only validated UpPass form URL retained for crash recovery.';

COMMIT;
