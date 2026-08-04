-- Allow 'แท็บเล็ต' as an item type.
--
-- The tablet type was added to the app (the estimate form, the AI job input
-- allowlist, the anchor pricing categories) but items.item_type carries a CHECK
-- constraint listing the permitted values, and that was not updated. Every
-- tablet insert therefore failed the constraint and surfaced as
-- POST /api/items/draft 500.
--
-- The constraint name differs between the two schema snapshots in this repo
-- (database/schema.sql declares it inline, database.sql via ARRAY), so this
-- drops whatever constraint currently guards the column and recreates it with
-- the full list rather than assuming a name.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'items'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%item_type%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.items DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.items
  ADD CONSTRAINT items_item_type_check CHECK (
    item_type IN (
      'โทรศัพท์มือถือ',
      'แท็บเล็ต',
      'อุปกรณ์เสริมโทรศัพท์',
      'กล้อง',
      'Apple',
      'โน้ตบุค',
      'อุปกรณ์คอมพิวเตอร์'
    )
  );

COMMENT ON CONSTRAINT items_item_type_check ON public.items IS
  'Keep in sync with AI_JOB_ITEM_TYPES in lib/security/ai-job-input.ts and ITEM_TYPES in app/estimate/page.tsx. Adding a type in the app without adding it here fails every insert for that type.';
