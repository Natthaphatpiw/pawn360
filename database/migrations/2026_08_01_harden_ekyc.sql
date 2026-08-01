BEGIN;

-- One row per eKYC attempt. The polymorphic actor_id deliberately has no FK;
-- actor_type determines whether it references pawners or investors.
CREATE TABLE IF NOT EXISTS public.ekyc_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('PAWNER', 'INVESTOR')),
  actor_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING', 'ACTIVE', 'COMPLETED', 'REJECTED', 'ABANDONED', 'FAILED', 'SUPERSEDED')),
  uppass_slug VARCHAR(255),
  form_slug VARCHAR(255),
  last_error_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ekyc_attempts_uppass_slug_unique UNIQUE (uppass_slug)
);

-- Serializes interactive initiation per actor. Concurrent requests either
-- reuse the existing URL or receive a bounded Retry-After response.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ekyc_attempts_one_active_actor
  ON public.ekyc_attempts(actor_type, actor_id)
  WHERE status IN ('CREATING', 'ACTIVE');

CREATE INDEX IF NOT EXISTS idx_ekyc_attempts_actor_created
  ON public.ekyc_attempts(actor_type, actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ekyc_attempts_slug
  ON public.ekyc_attempts(uppass_slug)
  WHERE uppass_slug IS NOT NULL;

-- Durable webhook inbox/outbox. It intentionally stores only normalized
-- status fields and opaque provider identifiers, never UpPass answers,
-- document images, biometric payloads, hosted form URLs, or LINE IDs.
CREATE TABLE IF NOT EXISTS public.ekyc_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_key CHAR(64) NOT NULL UNIQUE,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('PAWNER', 'INVESTOR')),
  event_type VARCHAR(80) NOT NULL CHECK (event_type IN (
    'submit_form',
    'update_status',
    'drop_off',
    'ekyc_front_card_reached_max_attempts',
    'ekyc_liveness_reached_max_attempt'
  )),
  uppass_slug VARCHAR(255) NOT NULL,
  application_status VARCHAR(64),
  ekyc_status VARCHAR(64),
  provider_event_at TIMESTAMPTZ,
  target_status VARCHAR(20) CHECK (target_status IN ('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')),
  processing_status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER')),
  processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  notification_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (notification_status IN ('NOT_REQUIRED', 'PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED')),
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  last_error_code VARCHAR(100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  notification_queued_at TIMESTAMPTZ,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_processing
  ON public.ekyc_webhook_events(processing_status, created_at);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_processing_updated
  ON public.ekyc_webhook_events(processing_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_notification
  ON public.ekyc_webhook_events(notification_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_processed_notification
  ON public.ekyc_webhook_events(processing_status, notification_status, updated_at);

CREATE INDEX IF NOT EXISTS idx_ekyc_webhook_slug
  ON public.ekyc_webhook_events(actor_type, uppass_slug, created_at DESC);

-- These tables are server-only. RLS plus explicit privilege revocation is a
-- backstop; the application accesses them only with the service-role client.
ALTER TABLE public.ekyc_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekyc_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ekyc_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.ekyc_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.ekyc_attempts TO service_role;
GRANT ALL ON TABLE public.ekyc_webhook_events TO service_role;

COMMENT ON TABLE public.ekyc_attempts IS
  'Server-only UpPass attempt ledger used for admission control and single-active-session idempotency.';
COMMENT ON TABLE public.ekyc_webhook_events IS
  'Server-only normalized UpPass webhook inbox/outbox. Contains no raw eKYC answers or biometric media.';

COMMIT;
