ALTER TABLE public.contract_action_requests
  DROP CONSTRAINT IF EXISTS contract_action_requests_request_status_check;

ALTER TABLE public.contract_action_requests
  ADD CONSTRAINT contract_action_requests_request_status_check CHECK (
    request_status::text = ANY (
      ARRAY[
        'PENDING'::character varying,
        'AWAITING_PAYMENT'::character varying,
        'SLIP_UPLOADED'::character varying,
        'SLIP_VERIFIED'::character varying,
        'SLIP_REJECTED'::character varying,
        'SLIP_REJECTED_FINAL'::character varying,
        'AWAITING_SIGNATURE'::character varying,
        'AWAITING_INVESTOR_APPROVAL'::character varying,
        'PENDING_INVESTOR_APPROVAL'::character varying,
        'INVESTOR_APPROVED'::character varying,
        'INVESTOR_REJECTED'::character varying,
        'AWAITING_INVESTOR_PAYMENT'::character varying,
        'INVESTOR_SLIP_UPLOADED'::character varying,
        'INVESTOR_SLIP_VERIFIED'::character varying,
        'INVESTOR_SLIP_REJECTED'::character varying,
        'INVESTOR_SLIP_REJECTED_FINAL'::character varying,
        'INVESTOR_TRANSFERRED'::character varying,
        'AWAITING_PAWNER_CONFIRM'::character varying,
        'COMPLETED'::character varying,
        'CANCELLED'::character varying,
        'VOIDED'::character varying
      ]::text[]
    )
  );
