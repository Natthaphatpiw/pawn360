-- =====================================================
-- Migration: Add Draft Support and Enhanced Apple Product Fields
-- Date: 2025-12-22
-- Description:
--   1. Add line_id column to items table for draft support without registration
--   2. Update item_status to include 'DRAFT' status
--   3. Add Apple product specific fields (color, screen_size, watch_size, watch_connectivity)
--   4. Make customer_id nullable to allow drafts without registration
-- =====================================================

-- Step 1: Add new columns to items table
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS line_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS color VARCHAR(50),
  ADD COLUMN IF NOT EXISTS screen_size VARCHAR(20),
  ADD COLUMN IF NOT EXISTS watch_size VARCHAR(20),
  ADD COLUMN IF NOT EXISTS watch_connectivity VARCHAR(20);

-- Step 2: Create index on line_id for better query performance
CREATE INDEX IF NOT EXISTS idx_items_line_id ON items(line_id);

-- Step 3: Make customer_id nullable (if it's currently NOT NULL)
-- This allows saving drafts without registration
ALTER TABLE items
  ALTER COLUMN customer_id DROP NOT NULL;

-- Step 4: Drop existing CHECK constraint on item_status
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_item_status_check;

-- Step 5: Add new CHECK constraint with 'DRAFT' status
ALTER TABLE items
  ADD CONSTRAINT items_item_status_check
  CHECK (item_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'IN_CONTRACT', 'RETURNED', 'LIQUIDATED'));

-- Step 6: Add comment to explain line_id column
COMMENT ON COLUMN items.line_id IS 'LINE user ID - allows draft items to be saved without full registration';

-- Step 7: Add comment to explain new fields
COMMENT ON COLUMN items.color IS 'Product color - mainly for Apple products';
COMMENT ON COLUMN items.screen_size IS 'Screen size - for MacBook and iPad';
COMMENT ON COLUMN items.watch_size IS 'Watch case size - for Apple Watch (e.g., 41mm, 45mm)';
COMMENT ON COLUMN items.watch_connectivity IS 'Watch connectivity type - GPS or GPS+Cellular';

-- =====================================================
-- Verification Queries (Run after migration)
-- =====================================================

-- Verify new columns exist
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'items'
-- AND column_name IN ('line_id', 'color', 'screen_size', 'watch_size', 'watch_connectivity');

-- Verify CHECK constraint
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'items'::regclass
-- AND contype = 'c';

-- Verify indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'items';

-- =====================================================
-- Rollback Script (Use if needed)
-- =====================================================

-- To rollback this migration:
/*
-- Drop new columns
ALTER TABLE items
  DROP COLUMN IF EXISTS line_id,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS screen_size,
  DROP COLUMN IF EXISTS watch_size,
  DROP COLUMN IF EXISTS watch_connectivity;

-- Drop index
DROP INDEX IF EXISTS idx_items_line_id;

-- Make customer_id NOT NULL again (only if your business logic requires it)
-- ALTER TABLE items
--   ALTER COLUMN customer_id SET NOT NULL;

-- Restore old CHECK constraint (without DRAFT)
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_item_status_check;

ALTER TABLE items
  ADD CONSTRAINT items_item_status_check
  CHECK (item_status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_CONTRACT', 'RETURNED', 'LIQUIDATED'));
*/
