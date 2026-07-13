## Table `pawners`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `customer_id` | `uuid` | Primary |
| `line_id` | `varchar` |  Unique |
| `firstname` | `varchar` |  |
| `lastname` | `varchar` |  |
| `customer_signature_id` | `varchar` |  Nullable |
| `phone_number` | `varchar` |  |
| `national_id` | `varchar` |  Nullable Unique |
| `email` | `varchar` |  Nullable |
| `addr_house_no` | `varchar` |  Nullable |
| `addr_village` | `varchar` |  Nullable |
| `addr_street` | `varchar` |  Nullable |
| `addr_sub_district` | `varchar` |  Nullable |
| `addr_district` | `varchar` |  Nullable |
| `addr_province` | `varchar` |  Nullable |
| `addr_country` | `varchar` |  Nullable |
| `addr_postcode` | `varchar` |  Nullable |
| `kyc_status` | `varchar` |  Nullable |
| `uppass_slug` | `varchar` |  Nullable Unique |
| `kyc_verified_at` | `timestamp` |  Nullable |
| `kyc_rejection_reason` | `text` |  Nullable |
| `kyc_data` | `jsonb` |  Nullable |
| `bank_name` | `varchar` |  Nullable |
| `bank_account_no` | `varchar` |  Nullable |
| `bank_account_type` | `varchar` |  Nullable |
| `bank_account_name` | `varchar` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `is_blocked` | `bool` |  Nullable |
| `blocked_reason` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |
| `last_login_at` | `timestamp` |  Nullable |
| `promptpay_number` | `varchar` |  Nullable |
| `ekyc_url` | `text` |  Nullable |
| `signature_url` | `text` |  Nullable |
| `last_location_lat` | `numeric` |  Nullable |
| `last_location_lng` | `numeric` |  Nullable |
| `last_location_accuracy` | `int4` |  Nullable |
| `last_location_source` | `varchar` |  Nullable |
| `last_location_at` | `timestamp` |  Nullable |
| `default_drop_point_id` | `uuid` |  Nullable |
| `default_drop_point_source` | `varchar` |  Nullable |
| `default_drop_point_updated_at` | `timestamp` |  Nullable |

## Table `investors`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `investor_id` | `uuid` | Primary |
| `line_id` | `varchar` |  Unique |
| `firstname` | `varchar` |  |
| `lastname` | `varchar` |  |
| `investor_signature_id` | `varchar` |  Nullable |
| `phone_number` | `varchar` |  |
| `national_id` | `varchar` |  Nullable Unique |
| `email` | `varchar` |  Nullable |
| `addr_house_no` | `varchar` |  Nullable |
| `addr_village` | `varchar` |  Nullable |
| `addr_street` | `varchar` |  Nullable |
| `addr_sub_district` | `varchar` |  Nullable |
| `addr_district` | `varchar` |  Nullable |
| `addr_province` | `varchar` |  Nullable |
| `addr_country` | `varchar` |  Nullable |
| `addr_postcode` | `varchar` |  Nullable |
| `kyc_status` | `varchar` |  Nullable |
| `uppass_slug` | `varchar` |  Nullable Unique |
| `kyc_verified_at` | `timestamp` |  Nullable |
| `kyc_rejection_reason` | `text` |  Nullable |
| `kyc_data` | `jsonb` |  Nullable |
| `bank_name` | `varchar` |  Nullable |
| `bank_account_no` | `varchar` |  Nullable |
| `bank_account_type` | `varchar` |  Nullable |
| `bank_account_name` | `varchar` |  Nullable |
| `auto_invest_enabled` | `bool` |  Nullable |
| `preferred_loan_types` | `_varchar` |  Nullable |
| `min_investment_amount` | `numeric` |  Nullable |
| `max_investment_amount` | `numeric` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `is_blocked` | `bool` |  Nullable |
| `blocked_reason` | `text` |  Nullable |
| `investor_tier` | `varchar` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |
| `last_login_at` | `timestamp` |  Nullable |
| `promptpay_number` | `varchar` |  Nullable |
| `promptpay_name` | `varchar` |  Nullable |
| `ekyc_url` | `text` |  Nullable |
| `total_active_principal` | `numeric` |  Nullable |
| `investment_preferences` | `jsonb` |  Nullable |
| `auto_liquidation_enabled` | `bool` |  Nullable |

## Table `drop_points`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `drop_point_id` | `uuid` | Primary |
| `drop_point_name` | `varchar` |  |
| `drop_point_code` | `varchar` |  Unique |
| `phone_number` | `varchar` |  |
| `email` | `varchar` |  Nullable |
| `addr_house_no` | `varchar` |  Nullable |
| `addr_village` | `varchar` |  Nullable |
| `addr_street` | `varchar` |  Nullable |
| `addr_sub_district` | `varchar` |  Nullable |
| `addr_district` | `varchar` |  Nullable |
| `addr_province` | `varchar` |  Nullable |
| `addr_country` | `varchar` |  Nullable |
| `addr_postcode` | `varchar` |  Nullable |
| `google_map_url` | `text` |  Nullable |
| `latitude` | `numeric` |  Nullable |
| `longitude` | `numeric` |  Nullable |
| `opening_hours` | `jsonb` |  Nullable |
| `capacity` | `int4` |  Nullable |
| `current_items_count` | `int4` |  Nullable |
| `manager_name` | `varchar` |  Nullable |
| `manager_phone` | `varchar` |  Nullable |
| `manager_line_id` | `varchar` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `is_accepting_items` | `bool` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |
| `line_id` | `varchar` |  Nullable Unique |
| `map_embed` | `text` |  Nullable |

## Table `admin_users`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `admin_id` | `uuid` | Primary |
| `username` | `varchar` |  Unique |
| `email` | `varchar` |  Unique |
| `password_hash` | `varchar` |  |
| `firstname` | `varchar` |  Nullable |
| `lastname` | `varchar` |  Nullable |
| `phone_number` | `varchar` |  Nullable |
| `role` | `varchar` |  |
| `permissions` | `jsonb` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `last_login_at` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |

## Table `wallets`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `wallet_id` | `uuid` | Primary |
| `investor_id` | `uuid` |  Unique |
| `available_balance` | `numeric` |  Nullable |
| `committed_balance` | `numeric` |  Nullable |
| `total_balance` | `numeric` |  Nullable |
| `maximum_commitment` | `numeric` |  Nullable |
| `total_invested` | `numeric` |  Nullable |
| `total_earned` | `numeric` |  Nullable |
| `total_withdrawn` | `numeric` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |

## Table `wallet_transactions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `transaction_id` | `uuid` | Primary |
| `wallet_id` | `uuid` |  |
| `transaction_type` | `varchar` |  |
| `amount` | `numeric` |  |
| `balance_before` | `numeric` |  |
| `balance_after` | `numeric` |  |
| `reference_type` | `varchar` |  Nullable |
| `reference_id` | `uuid` |  Nullable |
| `description` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `item_id` | `uuid` | Primary |
| `customer_id` | `uuid` |  Nullable |
| `item_type` | `varchar` |  |
| `brand` | `varchar` |  |
| `model` | `varchar` |  |
| `capacity` | `varchar` |  Nullable |
| `serial_number` | `varchar` |  Nullable |
| `cpu` | `varchar` |  Nullable |
| `ram` | `varchar` |  Nullable |
| `storage` | `varchar` |  Nullable |
| `gpu` | `varchar` |  Nullable |
| `item_condition` | `int4` |  Nullable |
| `ai_condition_score` | `numeric` |  Nullable |
| `ai_condition_reason` | `text` |  Nullable |
| `estimated_value` | `numeric` |  |
| `ai_confidence` | `numeric` |  Nullable |
| `accessories` | `text` |  Nullable |
| `defects` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `image_urls` | `_text` |  |
| `item_status` | `varchar` |  Nullable |
| `drop_point_id` | `uuid` |  Nullable |
| `received_at_drop_point` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |
| `verified_by_drop_point` | `bool` |  Nullable |
| `drop_point_verified_at` | `timestamp` |  Nullable |
| `drop_point_verification_notes` | `text` |  Nullable |
| `drop_point_photos` | `_text` |  Nullable |
| `drop_point_condition_score` | `int4` |  Nullable |
| `line_id` | `varchar` |  Nullable |
| `color` | `varchar` |  Nullable |
| `screen_size` | `varchar` |  Nullable |
| `watch_size` | `varchar` |  Nullable |
| `watch_connectivity` | `varchar` |  Nullable |

## Table `item_lenses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `lens_id` | `uuid` | Primary |
| `item_id` | `uuid` |  |
| `lens_model` | `varchar` |  |
| `lens_serial_number` | `varchar` |  Nullable |
| `lens_condition` | `int4` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `item_valuations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `valuation_id` | `uuid` | Primary |
| `item_id` | `uuid` |  |
| `valuation_type` | `varchar` |  |
| `valuated_by` | `varchar` |  Nullable |
| `estimated_value` | `numeric` |  |
| `condition_score` | `int4` |  Nullable |
| `notes` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `loan_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `request_id` | `uuid` | Primary |
| `item_id` | `uuid` |  |
| `customer_id` | `uuid` |  |
| `requested_amount` | `numeric` |  |
| `requested_duration_days` | `int4` |  |
| `drop_point_id` | `uuid` |  Nullable |
| `delivery_method` | `varchar` |  Nullable |
| `delivery_fee` | `numeric` |  Nullable |
| `request_status` | `varchar` |  Nullable |
| `expires_at` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |

## Table `loan_offers`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `offer_id` | `uuid` | Primary |
| `request_id` | `uuid` |  |
| `investor_id` | `uuid` |  |
| `offer_amount` | `numeric` |  |
| `interest_rate` | `numeric` |  |
| `duration_days` | `int4` |  |
| `offer_status` | `varchar` |  Nullable |
| `expires_at` | `timestamp` |  Nullable |
| `accepted_at` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |

## Table `contracts`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `contract_id` | `uuid` | Primary |
| `contract_number` | `varchar` |  Unique |
| `customer_id` | `uuid` |  |
| `investor_id` | `uuid` |  Nullable |
| `drop_point_id` | `uuid` |  Nullable |
| `item_id` | `uuid` |  |
| `loan_request_id` | `uuid` |  Nullable |
| `loan_offer_id` | `uuid` |  Nullable |
| `contract_start_date` | `timestamp` |  |
| `contract_end_date` | `timestamp` |  |
| `contract_duration_days` | `int4` |  |
| `loan_principal_amount` | `numeric` |  |
| `interest_rate` | `numeric` |  |
| `interest_amount` | `numeric` |  |
| `total_amount` | `numeric` |  |
| `platform_fee_rate` | `numeric` |  |
| `platform_fee_amount` | `numeric` |  |
| `amount_paid` | `numeric` |  Nullable |
| `interest_paid` | `numeric` |  Nullable |
| `principal_paid` | `numeric` |  Nullable |
| `contract_status` | `varchar` |  Nullable |
| `funding_status` | `varchar` |  Nullable |
| `parent_contract_id` | `uuid` |  Nullable |
| `original_contract_id` | `uuid` |  Nullable |
| `contract_file_url` | `text` |  Nullable |
| `signed_contract_url` | `text` |  Nullable |
| `funded_at` | `timestamp` |  Nullable |
| `disbursed_at` | `timestamp` |  Nullable |
| `completed_at` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |
| `item_delivery_status` | `varchar` |  Nullable |
| `item_received_at` | `timestamp` |  Nullable |
| `item_verified_at` | `timestamp` |  Nullable |
| `payment_slip_url` | `text` |  Nullable |
| `payment_confirmed_at` | `timestamp` |  Nullable |
| `payment_status` | `varchar` |  Nullable |
| `redemption_status` | `varchar` |  Nullable |
| `original_principal_amount` | `numeric` |  Nullable |
| `current_principal_amount` | `numeric` |  Nullable |
| `total_interest_paid` | `numeric` |  Nullable |
| `total_principal_reduced` | `numeric` |  Nullable |
| `total_principal_increased` | `numeric` |  Nullable |
| `extension_count` | `int4` |  Nullable |
| `last_action_date` | `timestamptz` |  Nullable |
| `last_action_type` | `varchar` |  Nullable |
| `investor_rate` | `numeric` |  Nullable |

## Table `payments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `payment_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `payment_type` | `varchar` |  |
| `amount` | `numeric` |  |
| `principal_portion` | `numeric` |  Nullable |
| `interest_portion` | `numeric` |  Nullable |
| `fee_portion` | `numeric` |  Nullable |
| `payment_method` | `varchar` |  Nullable |
| `payment_status` | `varchar` |  Nullable |
| `transaction_ref` | `varchar` |  Nullable |
| `payment_slip_url` | `text` |  Nullable |
| `bank_name` | `varchar` |  Nullable |
| `verified_by` | `uuid` |  Nullable |
| `verified_at` | `timestamp` |  Nullable |
| `payment_date` | `timestamp` |  Nullable |
| `notes` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `payer_type` | `varchar` |  Nullable |
| `payer_id` | `uuid` |  Nullable |
| `confirmed_by_recipient` | `bool` |  Nullable |
| `confirmed_at` | `timestamp` |  Nullable |
| `confirmation_deadline` | `timestamp` |  Nullable |
| `paid_by_investor_id` | `uuid` |  Nullable |
| `redemption_id` | `uuid` |  Nullable |

## Table `repayment_schedules`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `schedule_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `due_date` | `date` |  |
| `amount_due` | `numeric` |  |
| `principal_due` | `numeric` |  |
| `interest_due` | `numeric` |  |
| `amount_paid` | `numeric` |  Nullable |
| `schedule_status` | `varchar` |  Nullable |
| `paid_at` | `timestamp` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `platform_revenue`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `revenue_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  Nullable |
| `revenue_type` | `varchar` |  |
| `amount` | `numeric` |  |
| `description` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `notifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `notification_id` | `uuid` | Primary |
| `recipient_type` | `varchar` |  |
| `recipient_id` | `uuid` |  |
| `notification_type` | `varchar` |  |
| `title` | `varchar` |  |
| `message` | `text` |  |
| `related_entity_type` | `varchar` |  Nullable |
| `related_entity_id` | `uuid` |  Nullable |
| `is_read` | `bool` |  Nullable |
| `read_at` | `timestamp` |  Nullable |
| `sent_via` | `_varchar` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `activity_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `log_id` | `uuid` | Primary |
| `actor_type` | `varchar` |  |
| `actor_id` | `uuid` |  Nullable |
| `action` | `varchar` |  |
| `entity_type` | `varchar` |  |
| `entity_id` | `uuid` |  Nullable |
| `description` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `ip_address` | `inet` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |

## Table `drop_point_verifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `verification_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `drop_point_id` | `uuid` |  |
| `item_id` | `uuid` |  |
| `brand_correct` | `bool` |  Nullable |
| `model_correct` | `bool` |  Nullable |
| `capacity_correct` | `bool` |  Nullable |
| `color_match` | `bool` |  Nullable |
| `functionality_ok` | `bool` |  Nullable |
| `mdm_lock_status` | `bool` |  Nullable |
| `condition_score` | `int4` |  Nullable |
| `verification_photos` | `_text` |  Nullable |
| `notes` | `text` |  Nullable |
| `verification_result` | `varchar` |  Nullable |
| `rejection_reason` | `text` |  Nullable |
| `verified_by_line_id` | `varchar` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `updated_at` | `timestamp` |  Nullable |

## Table `redemption_requests`

ตารางเก็บคำขอไถ่ถอน ต่อดอกเบี้ย ลดเงินต้น และเพิ่มเงินต้น

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `redemption_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `request_type` | `varchar` |  |
| `principal_amount` | `numeric` |  |
| `interest_amount` | `numeric` |  |
| `delivery_fee` | `numeric` |  Nullable |
| `total_amount` | `numeric` |  |
| `reduction_amount` | `numeric` |  Nullable |
| `increase_amount` | `numeric` |  Nullable |
| `delivery_method` | `varchar` |  Nullable |
| `delivery_address_full` | `text` |  Nullable |
| `delivery_addr_house_no` | `varchar` |  Nullable |
| `delivery_addr_village` | `varchar` |  Nullable |
| `delivery_addr_street` | `varchar` |  Nullable |
| `delivery_addr_sub_district` | `varchar` |  Nullable |
| `delivery_addr_district` | `varchar` |  Nullable |
| `delivery_addr_province` | `varchar` |  Nullable |
| `delivery_addr_postcode` | `varchar` |  Nullable |
| `delivery_contact_phone` | `varchar` |  Nullable |
| `delivery_notes` | `text` |  Nullable |
| `payment_slip_url` | `text` |  Nullable |
| `payment_slip_uploaded_at` | `timestamptz` |  Nullable |
| `request_status` | `varchar` |  Nullable |
| `verified_by_drop_point_id` | `uuid` |  Nullable |
| `verified_by_line_id` | `varchar` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `verification_notes` | `text` |  Nullable |
| `actual_amount_received` | `numeric` |  Nullable |
| `amount_difference` | `numeric` |  Nullable |
| `mismatch_type` | `varchar` |  Nullable |
| `mismatch_resolved` | `bool` |  Nullable |
| `mismatch_resolved_at` | `timestamptz` |  Nullable |
| `tracking_number` | `varchar` |  Nullable |
| `courier_name` | `varchar` |  Nullable |
| `pawner_confirmed_at` | `timestamptz` |  Nullable |
| `investor_confirmed_at` | `timestamptz` |  Nullable |
| `investor_interest_earned` | `numeric` |  Nullable |
| `platform_fee_deducted` | `numeric` |  Nullable |
| `investor_net_profit` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `pawner_receipt_photos` | `_text` |  Nullable |
| `pawner_receipt_uploaded_at` | `timestamptz` |  Nullable |
| `pawner_receipt_verified` | `bool` |  Nullable |
| `support_contact_used` | `varchar` |  Nullable |
| `item_return_confirmed_at` | `timestamptz` |  Nullable |
| `final_completion_at` | `timestamptz` |  Nullable |
| `item_return_confirmed_by_drop_point_id` | `uuid` |  Nullable |
| `item_return_confirmed_by_line_id` | `varchar` |  Nullable |
| `drop_point_return_photos` | `_text` |  Nullable |
| `drop_point_return_photos_uploaded_at` | `timestamptz` |  Nullable |

## Table `company_bank_accounts`

บัญชีธนาคารของบริษัทสำหรับรับชำระเงินไถ่ถอน

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `account_id` | `uuid` | Primary |
| `account_name` | `varchar` |  |
| `account_number` | `varchar` |  |
| `bank_name` | `varchar` |  |
| `promptpay_number` | `varchar` |  Nullable |
| `is_active` | `bool` |  Nullable |
| `is_default` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `support_contacts`

ข้อมูลติดต่อฝ่ายสนับสนุนลูกค้า

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `contact_id` | `uuid` | Primary |
| `contact_type` | `varchar` |  |
| `contact_value` | `varchar` |  |
| `display_name` | `varchar` |  |
| `is_active` | `bool` |  Nullable |
| `priority` | `int4` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `contract_action_logs`

ตารางเก็บ log ทุก action ที่เกิดขึ้นกับสัญญา

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `log_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  Nullable |
| `customer_id` | `uuid` |  Nullable |
| `investor_id` | `uuid` |  Nullable |
| `action_request_id` | `uuid` |  Nullable |
| `action_type` | `varchar` |  |
| `action_status` | `varchar` |  Nullable |
| `amount` | `numeric` |  Nullable |
| `principal_before` | `numeric` |  Nullable |
| `principal_after` | `numeric` |  Nullable |
| `interest_before` | `numeric` |  Nullable |
| `interest_after` | `numeric` |  Nullable |
| `total_amount` | `numeric` |  Nullable |
| `contract_end_date_before` | `date` |  Nullable |
| `contract_end_date_after` | `date` |  Nullable |
| `slip_url` | `text` |  Nullable |
| `slip_amount_detected` | `numeric` |  Nullable |
| `slip_verification_result` | `varchar` |  Nullable |
| `slip_verification_details` | `jsonb` |  Nullable |
| `performed_by` | `varchar` |  Nullable |
| `performed_by_line_id` | `varchar` |  Nullable |
| `performed_by_name` | `varchar` |  Nullable |
| `description` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `error_message` | `text` |  Nullable |
| `ip_address` | `varchar` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `contract_action_requests`

ตารางเก็บคำขอ action ต่างๆ เช่น ต่อดอกเบี้ย ลดเงินต้น เพิ่มเงินต้น

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `request_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `request_type` | `varchar` |  |
| `request_status` | `varchar` |  Nullable |
| `principal_before` | `numeric` |  |
| `interest_rate` | `numeric` |  |
| `daily_interest_rate` | `numeric` |  Nullable |
| `contract_start_date` | `date` |  |
| `contract_end_date_before` | `date` |  |
| `days_in_contract` | `int4` |  |
| `days_elapsed` | `int4` |  |
| `days_remaining` | `int4` |  |
| `interest_accrued` | `numeric` |  |
| `interest_to_pay` | `numeric` |  Nullable |
| `new_end_date` | `date` |  Nullable |
| `reduction_amount` | `numeric` |  Nullable |
| `interest_for_period` | `numeric` |  Nullable |
| `total_to_pay_reduction` | `numeric` |  Nullable |
| `principal_after_reduction` | `numeric` |  Nullable |
| `new_interest_for_remaining` | `numeric` |  Nullable |
| `increase_amount` | `numeric` |  Nullable |
| `principal_after_increase` | `numeric` |  Nullable |
| `new_interest_for_remaining_increase` | `numeric` |  Nullable |
| `total_amount` | `numeric` |  Nullable |
| `slip_url` | `text` |  Nullable |
| `slip_uploaded_at` | `timestamptz` |  Nullable |
| `slip_amount_detected` | `numeric` |  Nullable |
| `slip_verification_result` | `varchar` |  Nullable |
| `slip_verification_details` | `jsonb` |  Nullable |
| `slip_attempt_count` | `int4` |  Nullable |
| `investor_slip_url` | `text` |  Nullable |
| `investor_slip_uploaded_at` | `timestamptz` |  Nullable |
| `investor_slip_amount_detected` | `numeric` |  Nullable |
| `investor_slip_verification_result` | `varchar` |  Nullable |
| `investor_slip_verification_details` | `jsonb` |  Nullable |
| `investor_slip_attempt_count` | `int4` |  Nullable |
| `signature_url` | `text` |  Nullable |
| `signed_at` | `timestamptz` |  Nullable |
| `investor_approved_at` | `timestamptz` |  Nullable |
| `investor_rejected_at` | `timestamptz` |  Nullable |
| `investor_rejection_reason` | `text` |  Nullable |
| `pawner_confirmed_at` | `timestamptz` |  Nullable |
| `pawner_rejected_at` | `timestamptz` |  Nullable |
| `terms_accepted` | `bool` |  Nullable |
| `terms_accepted_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `completed_at` | `timestamptz` |  Nullable |
| `voided_at` | `timestamptz` |  Nullable |
| `void_reason` | `text` |  Nullable |
| `pawner_bank_name` | `varchar` |  Nullable |
| `pawner_bank_account_no` | `varchar` |  Nullable |
| `pawner_bank_account_name` | `varchar` |  Nullable |
| `pawner_signature_url` | `text` |  Nullable |

## Table `slip_verifications`

ตารางเก็บประวัติการตรวจสอบสลิปด้วย AI

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `verification_id` | `uuid` | Primary |
| `action_request_id` | `uuid` |  Nullable |
| `redemption_id` | `uuid` |  Nullable |
| `slip_url` | `text` |  |
| `expected_amount` | `numeric` |  |
| `detected_amount` | `numeric` |  Nullable |
| `amount_difference` | `numeric` |  Nullable |
| `verification_result` | `varchar` |  Nullable |
| `confidence_score` | `numeric` |  Nullable |
| `ai_model` | `varchar` |  Nullable |
| `ai_response` | `jsonb` |  Nullable |
| `ai_raw_response` | `text` |  Nullable |
| `attempt_number` | `int4` |  Nullable |
| `verified_by` | `varchar` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `pawn_ticket_generation_queue`

Queue for async pawn ticket generation when contracts are confirmed

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `contract_id` | `uuid` |  Unique |
| `status` | `varchar` |  Nullable |
| `attempts` | `int4` |  Nullable |
| `error_message` | `text` |  Nullable |
| `created_at` | `timestamp` |  Nullable |
| `processed_at` | `timestamp` |  Nullable |

## Table `drop_point_bag_assignments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `assignment_id` | `uuid` | Primary |
| `drop_point_id` | `uuid` |  |
| `contract_id` | `uuid` |  |
| `item_id` | `uuid` |  |
| `bag_number` | `varchar` |  |
| `assigned_by_line_id` | `varchar` |  Nullable |
| `assigned_at` | `timestamptz` |  Nullable |
| `notes` | `text` |  Nullable |

## Table `user_security`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `security_id` | `uuid` | Primary |
| `role` | `varchar` |  |
| `line_id` | `varchar` |  |
| `pin_hash` | `text` |  Nullable |
| `failed_attempts` | `int4` |  Nullable |
| `locked_until` | `timestamptz` |  Nullable |
| `pin_updated_at` | `timestamptz` |  Nullable |
| `pin_session_token` | `varchar` |  Nullable |
| `pin_session_expires_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `manual_estimate_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `request_id` | `uuid` | Primary |
| `line_id` | `varchar` |  |
| `status` | `varchar` |  |
| `item_data` | `jsonb` |  |
| `image_urls` | `_text` |  |
| `estimated_price` | `numeric` |  Nullable |
| `condition_score` | `numeric` |  Nullable |
| `condition_note` | `text` |  Nullable |
| `admin_line_id` | `varchar` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |
| `completed_at` | `timestamptz` |  Nullable |

## Table `penalty_payments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `penalty_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `customer_id` | `uuid` |  |
| `investor_id` | `uuid` |  Nullable |
| `penalty_date` | `date` |  |
| `days_overdue` | `int4` |  |
| `penalty_amount` | `numeric` |  |
| `status` | `varchar` |  |
| `slip_url` | `text` |  Nullable |
| `slip_uploaded_at` | `timestamptz` |  Nullable |
| `slip_amount_detected` | `numeric` |  Nullable |
| `slip_verification_result` | `varchar` |  Nullable |
| `slip_verification_details` | `jsonb` |  Nullable |
| `slip_attempt_count` | `int4` |  Nullable |
| `verified_at` | `timestamptz` |  Nullable |
| `paid_through_date` | `date` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `pawn_delivery_requests`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `delivery_request_id` | `uuid` | Primary |
| `contract_id` | `uuid` |  |
| `loan_request_id` | `uuid` |  Nullable |
| `customer_id` | `uuid` |  Nullable |
| `drop_point_id` | `uuid` |  Nullable |
| `pawner_line_id` | `varchar` |  Nullable |
| `drop_point_line_id` | `varchar` |  Nullable |
| `delivery_fee` | `numeric` |  Nullable |
| `status` | `varchar` |  |
| `address_house_no` | `varchar` |  Nullable |
| `address_village` | `varchar` |  Nullable |
| `address_street` | `varchar` |  Nullable |
| `address_sub_district` | `varchar` |  Nullable |
| `address_district` | `varchar` |  Nullable |
| `address_province` | `varchar` |  Nullable |
| `address_postcode` | `varchar` |  Nullable |
| `address_full` | `text` |  Nullable |
| `contact_phone` | `varchar` |  Nullable |
| `notes` | `text` |  Nullable |
| `slip_url` | `text` |  Nullable |
| `slip_uploaded_at` | `timestamptz` |  Nullable |
| `slip_amount_detected` | `numeric` |  Nullable |
| `slip_verification_result` | `varchar` |  Nullable |
| `slip_verification_details` | `jsonb` |  Nullable |
| `slip_attempt_count` | `int4` |  Nullable |
| `payment_verified_at` | `timestamptz` |  Nullable |
| `driver_assigned_at` | `timestamptz` |  Nullable |
| `item_picked_at` | `timestamptz` |  Nullable |
| `arrived_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |
| `updated_at` | `timestamptz` |  Nullable |

## Table `drop_point_storage_boxes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `box_code` | `varchar` | Primary |
| `drop_point_id` | `uuid` |  |
| `branch_code` | `varchar` |  |
| `slot_sequence` | `int4` |  |
| `box_status` | `varchar` |  |
| `contract_id` | `uuid` |  Nullable |
| `item_id` | `uuid` |  Nullable |
| `customer_id` | `uuid` |  Nullable |
| `contract_number` | `varchar` |  Nullable |
| `item_brand` | `varchar` |  Nullable |
| `item_model` | `varchar` |  Nullable |
| `item_type` | `varchar` |  Nullable |
| `item_snapshot` | `jsonb` |  |
| `assigned_by_line_id` | `varchar` |  Nullable |
| `occupied_at` | `timestamptz` |  Nullable |
| `released_at` | `timestamptz` |  Nullable |
| `last_updated_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |

