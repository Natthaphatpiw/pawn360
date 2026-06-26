ALTER TABLE IF EXISTS items
ADD COLUMN IF NOT EXISTS condition_checklist JSONB;

ALTER TABLE IF EXISTS drop_point_verifications
ADD COLUMN IF NOT EXISTS condition_checklist JSONB;
