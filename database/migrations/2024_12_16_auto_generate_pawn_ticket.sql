-- =====================================================
-- AUTO-GENERATE PAWN TICKET ON CONTRACT CONFIRMATION
-- Creates trigger to automatically generate pawn ticket
-- when contract status changes to CONFIRMED
-- =====================================================

-- =====================================================
-- 1. CREATE FUNCTION TO CALL WEBHOOK
-- =====================================================

CREATE OR REPLACE FUNCTION notify_contract_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT;
  payload JSON;
BEGIN
  -- Only trigger when status changes TO 'CONFIRMED'
  IF NEW.contract_status = 'CONFIRMED' AND
     (OLD.contract_status IS NULL OR OLD.contract_status != 'CONFIRMED') THEN

    -- Get webhook URL from environment or use default
    webhook_url := current_setting('app.webhook_url', true);
    IF webhook_url IS NULL THEN
      webhook_url := 'https://pawn360.vercel.app/api/contracts/auto-generate-ticket';
    END IF;

    -- Prepare payload
    payload := json_build_object(
      'contractId', NEW.contract_id,
      'type', 'contract_confirmed',
      'contract_status', NEW.contract_status,
      'timestamp', NOW()
    );

    -- Log the event
    RAISE NOTICE 'Contract confirmed: % - Sending to webhook: %', NEW.contract_id, webhook_url;

    -- Call webhook using pg_net extension (if available)
    -- Note: Supabase has pg_net extension for HTTP requests
    -- If pg_net is not available, you'll need to handle this via application layer
    PERFORM
      net.http_post(
        url := webhook_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := payload::jsonb
      );

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. CREATE TRIGGER ON contracts TABLE
-- =====================================================

DROP TRIGGER IF EXISTS trigger_contract_confirmed ON contracts;

CREATE TRIGGER trigger_contract_confirmed
  AFTER INSERT OR UPDATE OF contract_status
  ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION notify_contract_confirmed();

-- =====================================================
-- 3. ADD COMMENT FOR DOCUMENTATION
-- =====================================================

COMMENT ON FUNCTION notify_contract_confirmed() IS
  'Automatically calls webhook to generate pawn ticket when contract status becomes CONFIRMED';

COMMENT ON TRIGGER trigger_contract_confirmed ON contracts IS
  'Triggers pawn ticket generation when contract is confirmed';

-- =====================================================
-- ALTERNATIVE: If pg_net is not available
-- Use this simpler approach without HTTP calls
-- =====================================================

-- Drop the above function and trigger, then use this:
/*
CREATE OR REPLACE FUNCTION log_contract_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log when status changes TO 'CONFIRMED'
  IF NEW.contract_status = 'CONFIRMED' AND
     (OLD.contract_status IS NULL OR OLD.contract_status != 'CONFIRMED') THEN

    RAISE NOTICE 'Contract confirmed: % - Pawn ticket should be generated', NEW.contract_id;

    -- You can insert into a queue table instead
    -- INSERT INTO pawn_ticket_generation_queue (contract_id, status, created_at)
    -- VALUES (NEW.contract_id, 'PENDING', NOW());

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contract_confirmed ON contracts;

CREATE TRIGGER trigger_contract_confirmed
  AFTER INSERT OR UPDATE OF contract_status
  ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION log_contract_confirmed();
*/

-- =====================================================
-- 4. OPTIONAL: Create queue table for async processing
-- =====================================================

CREATE TABLE IF NOT EXISTS pawn_ticket_generation_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(contract_id),
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  CONSTRAINT unique_contract_queue UNIQUE (contract_id)
);

CREATE INDEX IF NOT EXISTS idx_pawn_ticket_queue_status ON pawn_ticket_generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_pawn_ticket_queue_created ON pawn_ticket_generation_queue(created_at);

COMMENT ON TABLE pawn_ticket_generation_queue IS
  'Queue for async pawn ticket generation when contracts are confirmed';

-- =====================================================
-- 5. FUNCTION TO ADD TO QUEUE
-- =====================================================

CREATE OR REPLACE FUNCTION queue_pawn_ticket_generation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue when status changes TO 'CONFIRMED' and ticket doesn't exist
  IF NEW.contract_status = 'CONFIRMED' AND
     (OLD.contract_status IS NULL OR OLD.contract_status != 'CONFIRMED') AND
     NEW.contract_file_url IS NULL THEN

    -- Add to queue (ignore if already exists)
    INSERT INTO pawn_ticket_generation_queue (contract_id, status)
    VALUES (NEW.contract_id, 'PENDING')
    ON CONFLICT (contract_id) DO NOTHING;

    RAISE NOTICE 'Contract % queued for pawn ticket generation', NEW.contract_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace trigger with queue-based approach
DROP TRIGGER IF EXISTS trigger_contract_confirmed ON contracts;

CREATE TRIGGER trigger_queue_pawn_ticket
  AFTER INSERT OR UPDATE OF contract_status
  ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION queue_pawn_ticket_generation();

-- =====================================================
-- END OF MIGRATION
-- =====================================================
