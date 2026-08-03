-- Persist ราคากลาง (the representative second-hand market price) on items.
--
-- WHY
-- The investor offer card pushed by /api/contracts/create shows an investor the
-- loan principal, the term and their return - but nothing about what the
-- collateral is worth. An investor funding a loan cannot see that the item
-- backing it is worth materially more than the money they are putting in.
--
-- The number already exists: the estimate pipeline computes marketPrice, then
-- derives pawnPrice = marketPrice * 0.6 and estimatedPrice = pawnPrice *
-- condition. Only estimatedPrice was ever persisted (items.estimated_value);
-- marketPrice reached the browser and died there. This column is where it lands
-- so the card - and any investor-facing surface - can read it back.
--
-- WHAT THIS COLUMN IS, PRECISELY
-- It is a REFERENCE price derived from ADVERTISED second-hand listings, not an
-- achieved sale price. computeRepresentativeUsedPriceTHB deliberately targets
-- the p20-p40 window of those asking prices (clamped into p20-p55), so it sits
-- low in the range on purpose. The platform holds no realized-resale data at
-- all, so nothing here has been validated against what an item actually sold
-- for. Anything rendered from this column must be worded as an estimate.
--
-- NULLABLE ON PURPOSE
--   - every item created before this migration
--   - every manual-estimate item: an operator supplies a final price and a
--     condition score, never a market survey, so ราคากลาง does not exist for it
-- Readers must suppress the whole display block when this is null rather than
-- falling back to estimated_value - that field is the LOAN CEILING, and showing
-- it as collateral value would imply ~100% LTV when the truth is 40-60%.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS market_price numeric;

COMMENT ON COLUMN public.items.market_price IS
  'ราคากลาง: representative second-hand market reference price in THB, from the p20-p40 window of advertised Thai listings. NOT an achieved sale price and never validated against one. Null for manual estimates and for items created before 2026-08-03. Loan principal is capped at estimated_value, which is this figure x 0.6 x condition.';
