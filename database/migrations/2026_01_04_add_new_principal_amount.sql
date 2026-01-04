ALTER TABLE public.contract_action_requests
  ADD COLUMN IF NOT EXISTS new_principal_amount numeric;

UPDATE public.contract_action_requests
SET new_principal_amount = CASE
  WHEN request_type = 'PRINCIPAL_INCREASE' THEN principal_after_increase
  WHEN request_type = 'PRINCIPAL_REDUCTION' THEN principal_after_reduction
  ELSE new_principal_amount
END
WHERE new_principal_amount IS NULL;
