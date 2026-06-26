-- Add explicit return-method choices for redemption logistics.
ALTER TABLE IF EXISTS redemption_requests
  DROP CONSTRAINT IF EXISTS redemption_requests_delivery_method_check;

ALTER TABLE IF EXISTS redemption_requests
  ADD CONSTRAINT redemption_requests_delivery_method_check
  CHECK (delivery_method IN (
    'SELF_PICKUP',
    'SELF_ARRANGE',
    'PLATFORM_ARRANGE',
    'DROPPOINT_SELF_PICKUP',
    'DROPPOINT_SELF_RIDER',
    'CENTRAL_SCHEDULE_7D',
    'CENTRAL_SELF_PICKUP_TODAY',
    'DROPPOINT_NEXT_DAY_PICKUP'
  ));
