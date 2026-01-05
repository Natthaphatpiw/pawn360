ALTER TABLE public.contract_action_requests
  ADD COLUMN IF NOT EXISTS pawner_bank_name character varying,
  ADD COLUMN IF NOT EXISTS pawner_bank_account_no character varying,
  ADD COLUMN IF NOT EXISTS pawner_bank_account_name character varying;

UPDATE public.contract_action_requests AS car
SET
  pawner_bank_name = p.bank_name,
  pawner_bank_account_no = p.bank_account_no,
  pawner_bank_account_name = p.bank_account_name
FROM public.contracts AS c
JOIN public.pawners AS p
  ON p.customer_id = c.customer_id
WHERE car.contract_id = c.contract_id
  AND (
    car.pawner_bank_name IS NULL
    OR car.pawner_bank_account_no IS NULL
    OR car.pawner_bank_account_name IS NULL
  );
