-- =====================================================
-- Migration: 2026_06_11 Add pawn_delivery_requests table
-- =====================================================

-- Create pawn_delivery_requests to support delivery request lifecycle for Drop Point flows.
CREATE TABLE IF NOT EXISTS public.pawn_delivery_requests (
  delivery_request_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id uuid NOT NULL,
  loan_request_id uuid,
  customer_id uuid NOT NULL,
  drop_point_id uuid,
  pawner_line_id character varying NOT NULL,
  drop_point_line_id character varying,
  delivery_fee numeric DEFAULT 0,
  status character varying DEFAULT 'DRIVER_SEARCH' CHECK (status::text = ANY (ARRAY[
    'DRIVER_SEARCH'::character varying,
    'PAYMENT_VERIFIED'::character varying,
    'AWAITING_PAYMENT'::character varying,
    'PAYMENT_REJECTED'::character varying,
    'SLIP_UPLOADED'::character varying,
    'DRIVER_ASSIGNED'::character varying,
    'ITEM_PICKED'::character varying,
    'ARRIVED'::character varying
  ]::text[])),
  address_house_no character varying,
  address_village character varying,
  address_street character varying,
  address_sub_district character varying,
  address_district character varying,
  address_province character varying,
  address_postcode character varying,
  address_full text,
  contact_phone character varying,
  notes text,
  payment_verified_at timestamp without time zone,
  driver_assigned_at timestamp without time zone,
  item_picked_at timestamp without time zone,
  arrived_at timestamp without time zone,
  slip_url text,
  slip_uploaded_at timestamp without time zone,
  slip_amount_detected numeric,
  slip_verification_result character varying CHECK (slip_verification_result::text = ANY (ARRAY[
    'MATCHED'::character varying,
    'UNDERPAID'::character varying,
    'OVERPAID'::character varying,
    'UNREADABLE'::character varying,
    'INVALID'::character varying
  ]::text[])),
  slip_verification_details jsonb,
  slip_attempt_count integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT pawn_delivery_requests_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(contract_id),
  CONSTRAINT pawn_delivery_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.pawners(customer_id),
  CONSTRAINT pawn_delivery_requests_drop_point_id_fkey FOREIGN KEY (drop_point_id) REFERENCES public.drop_points(drop_point_id),
  CONSTRAINT pawn_delivery_requests_loan_request_id_fkey FOREIGN KEY (loan_request_id) REFERENCES public.loan_requests(request_id)
);

CREATE INDEX IF NOT EXISTS idx_pawn_delivery_requests_contract_id ON public.pawn_delivery_requests (contract_id);
CREATE INDEX IF NOT EXISTS idx_pawn_delivery_requests_status ON public.pawn_delivery_requests (status);
CREATE INDEX IF NOT EXISTS idx_pawn_delivery_requests_pawner_line_id ON public.pawn_delivery_requests (pawner_line_id);
CREATE INDEX IF NOT EXISTS idx_pawn_delivery_requests_drop_point_line_id ON public.pawn_delivery_requests (drop_point_line_id);
