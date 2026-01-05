ALTER TABLE public.contract_action_requests
  ADD COLUMN IF NOT EXISTS pawner_signature_url text;
