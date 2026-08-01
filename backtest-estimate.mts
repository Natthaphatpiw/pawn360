/**
 * Retired on 2026-08-01.
 *
 * This legacy backtest called obsolete models and hosted search directly,
 * bypassing the production Queue, AI budget guard, provider capacity limits,
 * evidence validator, and Parallel -> Exa search router. Keeping it runnable
 * would produce neither production-equivalent prices nor trustworthy costs.
 *
 * Use `npm run cost:llm-smoke` for a deliberately scoped paid cost probe. A
 * future dataset backtest must invoke the current queued estimate pipeline
 * with synthetic/de-identified inputs and an explicit spend ceiling.
 */

throw new Error(
  'LEGACY_BACKTEST_RETIRED: use the current queued estimate pipeline and cost:llm-smoke',
);
