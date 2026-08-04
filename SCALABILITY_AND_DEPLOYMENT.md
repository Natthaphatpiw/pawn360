# Astly - Scalability and Deployment Plan

Status: Living document, prepared for investor technical due diligence
Scope: How the Astly platform scales across every tier, where its ceilings are, the capacity and cost model, performance and availability targets, and the full deployment, release, and change-management process.
Companion documents: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md), and [`docs/diagrams/`](docs/diagrams).

> Reviewer note: figures for provider limits and prices are accurate to their primary sources as of mid-2026 and are detailed (with citations) in `INFRASTRUCTURE.md`. Capacity figures in this document are engineering estimates derived from those limits and the application's measured behavior; they are presented as planning models, not guarantees. Items dependent on the live account are marked "confirm".

---

## Table of Contents

1. Executive Summary
2. Scaling Design Principles
3. Current Baseline and Known Characteristics
4. Scalability by Layer
5. Bottleneck Analysis and Headroom
6. Capacity Model and Worked Example
7. Performance Targets and Service-Level Objectives
8. Staged Scaling Roadmap (with trigger thresholds)
9. Deployment Architecture and Pipeline (CI/CD)
10. Environments, Configuration, and Secrets
11. Database Change Management and Zero-Downtime Migrations
12. Release Management, Rollback, and Continuity
13. Reliability Engineering for Scale
14. Observability, SLOs, and Load Testing
15. Scaling and Deployment Risk Register
16. Recommendations and Prioritized Roadmap
17. Appendix - Thresholds, Formulas, and Provider Limits

---

## 1. Executive Summary

Astly is engineered to scale on a serverless, fully managed cloud foundation. The deliberate consequence of this design is that the platform scales horizontally and automatically with demand, with no servers, clusters, or load balancers to provision, and with cost that tracks usage rather than peak capacity.

The scaling thesis in one paragraph: the stateless compute tier (Vercel Functions) auto-scales to tens of thousands of concurrent executions with zero operator action; the content and edge tier is a global anycast CDN with automatic failover; the stateful tiers (Supabase PostgreSQL, MongoDB Atlas, Vercel Blob, Upstash Redis) are independently scalable managed services; and the most expensive workload - AI inference - is shielded by a content-addressed cache, model tiering, multi-key rate-limit resilience, and a provider abstraction that allows a future in-house model to be substituted without touching business logic. The system's primary scaling lever is therefore database compute sizing (connection capacity), and its primary cost lever is AI inference per transaction - both well understood and individually adjustable.

Deployment maturity in one paragraph: every change ships through a Git-integrated pipeline that produces immutable, atomically promoted deployments with per-pull-request preview environments, instant one-click rollback, per-environment secret isolation, and declaratively scheduled background jobs. There are no manual server operations, no mutable production hosts, and no snowflake configuration. Production promotion is zero-downtime by construction.

This document quantifies the above, identifies the precise points that bottleneck first, and presents a staged roadmap with concrete trigger metrics for each upgrade, so that scaling is a planned, budgeted progression rather than a reactive scramble.

> **Deep dive.** `PRODUCTION_READINESS_LLM_SEARCH_QUEUE_EKYC.md` (Thai) is the implementation-level companion: queue topology and recovery semantics, the provider-capacity limiter, measured per-workflow AI cost, the user-facing error taxonomy, and the deploy gates and their current pass/fail state.

---

## 2. Scaling Design Principles

1. Stateless compute. Every request handler is a pure function of its inputs plus managed state; no in-process session or sticky state. This is what makes horizontal autoscaling free and instant.
2. Managed state, independently scalable. Each datastore is a managed service scaled on its own axis (compute size, tier, replicas), decoupling read/write capacity from application deployment.
3. Cache the expensive, idempotent work. The price-estimation pipeline - the most compute- and cost-intensive path - is cached by content hash, so repeat demand is served without re-incurring AI cost or latency.
4. Provider-abstracted intelligence. All AI/OCR runs behind thin abstractions, so models, vendors, and eventually an in-house model can be swapped by configuration. This decouples unit cost from any single vendor's pricing or limits.
5. Asynchronous, idempotent workflows. Financial lifecycle operations are mediated by durable envelopes and advanced by webhooks and scheduled jobs, with idempotency keys and bounded retries - so throughput is not gated by synchronous fan-out.
6. Graceful degradation over hard failure. Every external dependency has a defined fallback (cache miss -> recompute; AI rate limit -> next key; AI unavailable -> minimum price / unreadable verdict; SlipOK -> Claude vision), so partial provider failure degrades quality rather than causing outage.
7. Configuration over redeploy. Models, providers, feature flags, exchange rates, and cache TTLs are environment-driven, so behavior and capacity can be tuned without a code release.

---

## 3. Current Baseline and Known Characteristics

| Dimension | Current state |
|---|---|
| Compute | Vercel Functions, Node.js runtime, Fluid compute; auto-scales to 30,000 concurrent (Pro) |
| Application surface | Next.js route handlers and LIFF pages, 4 Vercel Queue consumers, 3 cron schedules |
| Heavy endpoints | AI Queue consumers use `maxDuration = 300s`; eKYC consumer uses 60s |
| Primary DB | Supabase PostgreSQL (Pro); default Micro compute = 60 direct / 200 pooled connections (confirm live size) |
| Operational DB | MongoDB Atlas (confirm dedicated M10+); client cached across warm invocations |
| Cache | Upstash Redis; estimate responses + image-hash, 30-day TTL, content-hash keyed |
| Object storage | Vercel Blob (managed object storage), private signed-URL access |
| AI providers | OpenAI Luna/Terra primary; Anthropic Sonnet/Haiku emergency fallback; Parallel search with Exa fallback |

Known performance characteristics (honest baseline):
- Cached estimate: sub-second (Redis hit short-circuits the whole pipeline).
- Cold estimate (cache miss): asynchronous and provider-bound; the LIFF receives a job ID, polls status, and can wait through bounded provider backoff without holding an HTTP request open.
- Condition analysis: Luna performs image/type consistency precheck and rubric scoring, with Anthropic vision only when OpenAI fails.
- Standard CRUD endpoints: dominated by a single database round-trip; sub-second.

---

## 4. Scalability by Layer

### 4.1 Edge and ingress

Vercel's anycast Edge Network terminates all traffic at the nearest point of presence and serves static assets and cached responses directly. It scales transparently with global traffic, requires no configuration, and provides automatic cross-region failover (AWS Global Accelerator + anycast). There is no ingress component for the team to scale. WAF and DDoS controls operate at this layer (Section 9 of `INFRASTRUCTURE.md`).

### 4.2 Compute (Vercel Functions)

- Horizontal autoscaling to 30,000 concurrent executions on Pro, with no provisioning. Fluid compute additionally serves multiple concurrent invocations per instance for I/O-bound handlers (the dominant pattern here, since most handlers await a database or an AI provider), which improves throughput-per-instance and reduces cold starts and cost.
- No capacity planning is required for compute itself; the constraint moves downstream to whatever the function calls (database connections, AI rate limits).
- Cold-start exposure is minimized by Fluid pre-warming and bytecode caching and by reusing module-level database and Redis clients across warm invocations; Blob access uses stateless HTTPS calls.

### 4.3 Data tier

This is the platform's primary scaling lever and is handled by vertical scaling of managed databases plus connection pooling.

- Supabase PostgreSQL: connection capacity scales with compute size - Micro 60 direct / 200 pooled; Small 90 / 400; Medium 120 / 600; Large 160 / 800; XL 240 / 1,000, and upward to 16XL. The Supavisor transaction-mode pooler is the correct entry point for a high-fan-out serverless front end and multiplies usable concurrency. Scaling is a billing-tier change applied with minimal disruption; the database can be resized as load grows. Read replicas (add-on) offload read traffic and can be placed in other regions.
- MongoDB Atlas: scales by cluster tier (M10 -> M20 -> M30 ...), each a larger replica set, with automatic in-cluster failover and the option of multi-region/multi-cloud node distribution. The application reuses a single cached driver connection per warm instance to bound connection growth.
- Both stores scale independently; the dual-store split (customer-facing on MongoDB, investor/finance/logistics on Supabase) also spreads write load across two engines.

### 4.4 Cache (Upstash Redis)

Serverless and per-request priced, so it scales with demand without provisioning. Its value compounds with scale: a higher cache hit rate on estimates directly reduces AI spend and tail latency. A Global (multi-region) configuration is available if read locality becomes important.

### 4.5 AI and LLM tier (the cost-and-rate scaling axis)

- Throughput resilience: Vercel Queues, a shared Redis provider-capacity guard, bounded concurrency and `Retry-After` backoff absorb bursts. Key rotation occurs only on an explicit per-key rate-limit response; quota/billing and ambiguous network failures do not fan out duplicate paid requests.
- Cost control by model tiering: Luna handles constrained vision/classification; Terra handles canonicalization and evidence extraction. Defaults are `none`/`low`, with one `medium` quality retry only where deterministic validation fails; Anthropic is incident fallback, not the normal path.
- Cost control by caching: the estimate cache removes repeat AI cost entirely for identical inputs.
- Structural cost reduction on the roadmap: the planned in-house, open-source condition model (see `SYSTEM_ARCHITECTURE.md` Section 14) replaces per-call third-party vision inference with owned inference, converting a per-transaction variable cost into a largely fixed GPU cost and removing per-request egress of sensitive media. Because AI runs behind a provider abstraction, this is a configuration-level substitution.

#### How a provider rate limit is absorbed rather than surfaced as an error

This is the specific behaviour a reviewer should test under load. When the platform reaches the provider's requests-per-minute, tokens-per-minute, or concurrency ceiling, the user does not receive a failure:

1. **Admission at the call boundary.** `lib/services/provider-capacity.ts` checks RPM, TPM and concurrency in one atomic Redis Lua operation, at both provider and provider+model level, before any billable request leaves the platform. Tokens are reserved as an upper bound and reconciled against actual usage after the call.
2. **Typed backpressure, not an exception.** Exhaustion raises a retryable `RATE_LIMITED` error carrying `retryAfterMs` - time to the next minute bucket for an RPM limit, or the earliest in-flight lease expiry for a concurrency limit.
3. **The job returns to the queue.** The worker moves the job to `RETRYING` with `nextRetryAtMs`, and the polling client shows a Thai "the provider is busy, your job is still queued" message with an approximate wait. Backoff is exponential with full jitter, bounded to 5-300 seconds, and honours a provider-supplied `Retry-After` when present.
4. **The user waits inside the queue, not inside an HTTP request.** The LIFF client polls a job id and can wait up to 15 minutes without holding a connection open, so a provider throttle never becomes a function timeout.
5. **Keys are not burned.** API-key rotation happens only on a genuine per-key provider 429. The platform's own capacity error and any billing/quota exhaustion (`BUDGET_EXHAUSTED`) deliberately do **not** rotate keys, because neither is fixed by trying a different key.
6. **Ambiguous outcomes stay reserved.** If a call times out with no response, the token reservation is retained rather than refunded, so a provider that already charged us cannot be double-spent by an immediate retry.

Sizing note: the limiter defaults (OpenAI 240 rpm / 1M tpm / 16 concurrent, Anthropic 120 / 500k / 8) are placeholders and must be set from the negotiated account tier via `PROVIDER_CAPACITY_*` before load testing, otherwise the load test measures our placeholder rather than the provider.

### 4.6 Object storage and integrations

- Vercel Blob is managed object storage and is not a near-term capacity constraint. Current server uploads do transit Function request bodies; large-file growth should switch those paths to Blob client uploads.
- Third-party integration quotas (LINE messaging, SerpAPI, UPPASS eKYC, SlipOK) scale per their commercial agreements; these are budget/quota items to negotiate as volume grows rather than architectural limits.

---

## 5. Bottleneck Analysis and Headroom

Honest "what breaks first" assessment, in the order it is likely to bind:

| Rank | Bottleneck | Why it binds first | Headroom / remedy |
|---|---|---|---|
| 1 | Supabase database connections | Serverless can fan out wider than Postgres accepts; pooled cap is tied to compute size (200 on Micro) | Scale compute tier (200 -> 12,000 pooled across sizes); rely on Supavisor transaction pooling; add read replicas for read-heavy load |
| 2 | AI/search provider rate limits and cost | Estimate/condition flows are provider-bound; TPM/RPM and per-call cost grow with cache misses | Queue backpressure; shared call-boundary limiter; cache/single-flight; budget ceilings; negotiate higher limits; deploy in-house model |
| 3 | Cold-estimate latency (15-35s) | Live third-party web-search pricing is inherently slow | Cache; async/progressive UX; in-house pricing/condition model; pre-computation for popular items |
| 4 | Single-region database latency/availability | Supabase is single-region; any cross-region split with the Blob store adds latency | Co-locate function + DB + Blob regions; read replicas; Atlas multi-region if RTO requires |
| 5 | Reconciliation/cron throughput | Crons are repair loops and can be missed or duplicated | Idempotent handlers; durable Queue/inbox/outbox; alert on stale work; never use cron as the primary AI work queue |
| 6 | Function payload limit (4.5 MB) | Large media cannot transit function bodies | Move uploads above the limit to Vercel Blob client uploads; align the current 10 MB app cap |

Compute concurrency (30,000) and Blob capacity are effectively non-binding at any realistic near-term scale. The genuine scaling work is database sizing, Function upload limits, and AI capacity/cost - all adjustable with known patterns.

---

## 6. Capacity Model and Worked Example

The platform's load is parameterizable by a small number of business drivers. Define:

- E = price estimates per day
- C = condition analyses per day
- T = new contracts per day
- H = estimate cache hit rate (0-1)
- P = peak concurrency factor (peak requests/sec relative to daily average)

Derived demand:
- Live AI estimate pipelines/day = E x (1 - H)
- Peak concurrent DB-touching requests ~ (daily DB requests / 86,400) x P
- AI cost/day ~ E x (1 - H) x (cost per estimate pipeline) + C x (cost per condition analysis)

Illustrative worked example (planning figures, not guarantees):

| Driver | Stage 0 (today) | Stage 1 (growth) | Stage 2 (scale) |
|---|---|---|---|
| Estimates/day (E) | 1,000 | 10,000 | 100,000 |
| Condition analyses/day (C) | 300 | 3,000 | 30,000 |
| New contracts/day (T) | 100 | 1,000 | 10,000 |
| Cache hit rate (H) | 0.4 | 0.6 | 0.7 |
| Live AI pipelines/day | 600 | 4,000 | 30,000 |
| Peak concurrency (est.) | tens | low hundreds | hundreds-low thousands |
| Vercel compute | Comfortable (cap 30,000) | Comfortable | Comfortable |
| Supabase compute | Micro/Small | Medium/Large + read replica | Large/XL + replicas |
| Mongo Atlas | M10 | M20-M30 | M30-M50 |
| AI posture | Third-party | Third-party + cache tuning | In-house model primary, third-party fallback |

Interpretation: across a 100x growth in estimates, the compute and storage tiers absorb the load without architectural change; the scaling actions are (a) increasing database compute size a few steps, (b) adding read replicas, and (c) bringing the in-house AI model online to cap AI unit cost. None of these require re-architecture or downtime.

Unit economics are clean to compute: because the system is per-transaction (one estimate, one condition analysis, one contract), per-transaction infrastructure and AI cost can be modeled directly and trends downward with cache hit rate and the in-house model.

### 6.1 AI cost at each stage (measured, not estimated)

Using the measured per-workflow figures in `INFRASTRUCTURE.md` Section 14.1 and the stage drivers above, at 32 THB/USD:

| Driver | Stage 0 | Stage 1 | Stage 2 |
|---|---:|---:|---:|
| Estimates/day (E) | 1,000 | 10,000 | 100,000 |
| Cache hit rate (H) | 0.4 | 0.6 | 0.7 |
| Live AI pipelines/day | 600 | 4,000 | 30,000 |
| Estimate AI + search / day | ≈$5.5 (≈฿176) | ≈$37 (≈฿1,180) | ≈$276 (≈฿8,830) |
| Condition analysis / day | ≈$0.5 (≈฿16) | ≈$4.9 (≈฿157) | ≈$49 (≈฿1,570) |
| **AI + search / month** | **≈$180 (≈฿5,760)** | **≈$1,257 (≈฿40,200)** | **≈$9,750 (≈฿312,000)** |
| AI cost per estimate | ≈฿0.19 | ≈฿0.13 | ≈฿0.10 |

Two properties matter more than the absolute numbers:

1. **Cost per estimate falls as volume grows**, because a higher cache hit rate is the natural consequence of more users pricing the same popular models. This is the opposite of the usual "AI cost scales linearly" concern and is a direct result of keying the market cache on canonical product identity rather than on the user's own photos.
2. **The ceiling is enforced, not projected.** `AI_MONTHLY_BUDGET_USD`, `AI_MAX_OWNER_DAILY_COST_USD` and `AI_MAX_JOB_COST_USD` abort before a provider call, so an unexpected traffic pattern or an abusive account degrades to a queued/manual state instead of producing an unbounded invoice. Under the previous `xhigh`/`max` configuration the Stage 2 line would have been roughly ฿4.1M/month rather than ฿312k.

### 6.2 Measured throughput and latency (August 2026)

Measured end to end over 72 products with the cache forced off, so these are
cache-miss figures - the worst case, not the average a live user sees.

| | Value |
|---|---:|
| Estimate latency p50 / p75 / p90 | 17.3s / 25.8s / 29.9s |
| Slowest observed | 49.6s |
| AI + search cost per cache-missed estimate | $0.0353 (≈฿1.13) |

Worker throughput at the configured job concurrency (generic 6, notebook 2,
condition 8):

| Workload | Per minute | Per hour |
|---|---:|---:|
| Generic estimate | ~21 | ~1,260 |
| Notebook estimate | ~7 | ~420 |
| Condition analysis | ~27 | ~1,620 |

**The budget cap binds roughly 64x before concurrency does.** At the configured
`AI_MONTHLY_BUDGET_USD=500` the platform is allowed ~472 cache-missed estimates
per day, while the workers could serve ~30,000. Raising job concurrency
therefore buys nothing until the budget moves; the default of 6 generic workers
already absorbs a peak of ~21/minute, which is around 6,000 estimates/day if
peak hour is a fifth of daily traffic. Concurrency is not the scaling lever at
any volume this business plausibly reaches in the near term - the budget is,
and it is a single number.

Note the per-estimate figure above is ~4x the $0.009 implied by the Stage 0
line in 6.1. The difference is real and postdates that table: the market-extract
retry rung added in the search-escalation work fires on most items and accounts
for ~29% of LLM spend on its own, and the anchor and deep-search rungs add more.
6.1 remains the right shape for how cost per estimate falls with cache hit rate;
its absolute per-pipeline figure should be re-derived from the number here.

A bottoms-up cost-per-transaction sheet keyed to these drivers, plus the eKYC per-verification vendor fee, should accompany this document in the data room.

---

## 7. Performance Targets and Service-Level Objectives

Proposed internal SLOs (targets to formalize and instrument):

| Surface | Target (p95) | Notes |
|---|---|---|
| Cached estimate | < 600 ms | Redis hit path |
| Standard CRUD / read endpoints | < 800 ms | Single DB round-trip |
| Condition analysis | < 60 s (hard cap) | Vision + scoring; typically a few seconds |
| Cold estimate (cache miss) | 15-35 s (characteristic, not an SLO to tighten without the in-house model) | Bounded by third-party AI web search; managed via UX + cache |
| Webhook acknowledgement | < 2 s | Signature verify + enqueue |
| Availability (internal target) | 99.9% | Note: contractual SLA requires Enterprise tiers on Vercel and Supabase |

Error-budget approach: adopt a 99.9% monthly availability objective with an explicit error budget; gate risky releases on remaining budget. Track the four golden signals (latency, traffic, errors, saturation) per surface, with database connection saturation and AI provider error rate as leading indicators of scaling pressure.

Honest framing for reviewers: the cold-estimate latency is an inherent property of doing real-time market pricing via third-party AI search, not a platform performance defect. The mitigations (content-hash caching, progressive UX, and the planned in-house pricing/condition model) are explicit and on the roadmap, and the cached and CRUD paths already meet sub-second targets.

---

## 8. Staged Scaling Roadmap (with trigger thresholds)

Each stage lists the trigger metric, the actions taken, and the rationale, so scaling is metric-driven.

### Stage 0 - Current / Foundation
- Trigger: present state.
- Actions: confirm and co-locate the Vercel function region with the primary databases (target Singapore `sin1`); enable Supabase PITR; verify MongoDB Atlas is dedicated (M10+) with continuous backup; confirm AI providers' no-training/ZDR posture; add baseline observability (error tracking, structured logs, uptime checks).
- Rationale: close the durability and data-residency gaps before scaling, at negligible cost.

### Stage 1 - Growth (~10x estimates/day, low-hundreds peak concurrency)
- Trigger: Supabase pooled-connection utilization sustained > 60%, or estimate p95 latency degradation, or AI rate-limit incidents.
- Actions: step Supabase compute to Medium/Large; add a Supabase read replica for read-heavy investor/reporting traffic; step MongoDB Atlas to M20-M30; tune cache TTL and key coverage to raise hit rate; add Log Drains to a SIEM and an LLM-call audit trail; introduce a CI test suite around pricing, calculations, and state machines.
- Rationale: relieve the first-binding bottleneck (DB connections) and harden observability before the next order of magnitude.

### Stage 2 - Scale (~100x, hundreds-to-low-thousands peak concurrency)
- Trigger: AI spend becoming a material cost line, or DB read load exceeding a single primary, or contractual availability/compliance requirements from partners.
- Actions: bring the in-house, open-source condition/pricing model online (shadow -> canary -> primary, with third-party fallback) to cap AI unit cost and remove sensitive-media egress; add read replicas (and multi-region replicas if user latency requires); upgrade Supabase to Large/XL and Atlas to M30-M50; evaluate Vercel Enterprise for a contractual uptime SLA, multi-region functions, managed WAF rulesets, and SSO/SCIM; formalize a dedicated async queue/worker if cron-driven processing approaches its window.
- Rationale: convert variable AI cost to fixed, secure data egress, and obtain the contractual guarantees enterprise customers and investors expect.

### Stage 3 - High scale / Enterprise
- Trigger: enterprise partnerships, regulatory commitments, or multi-market expansion.
- Actions: Enterprise tiers on Vercel and Supabase with signed SLAs; automatic database failover (Supabase Enterprise) and multi-region active configurations; infrastructure-as-code for all providers; formal DR drills with measured RTO/RPO; data partitioning/sharding if any single store approaches its tier ceiling.
- Rationale: institutional-grade reliability and governance.

---

## 9. Deployment Architecture and Pipeline (CI/CD)

Deployment is Git-native and fully managed, with no manual server steps.

- Source of truth: a single Git repository. Every push triggers a build on Vercel.
- Immutable builds: each deployment is a content-addressed, immutable artifact. Production is an alias that points at one immutable deployment; promotion is atomic (the alias flips), so there is no half-deployed state and no downtime window.
- Preview deployments: every pull request and non-production branch builds its own isolated Preview Deployment with a unique URL and its own environment scope. This means every change is fully runnable and reviewable in a production-like environment before merge - a strong control for a financial codebase.
- Build characteristics (Pro): up to 12 concurrent builds, 45-minute max build time; build with `next build` (production) and `next dev --turbopack` (local). Build logs are retained indefinitely per deployment.
- Rollback: Instant Rollback re-points the production alias to any previous immutable deployment in seconds. Operational caveat (documented in runbook): Instant Rollback does not revert cron-job definitions, which continue on the latest configuration until manually changed.
- Scheduled jobs: cron jobs are declared declaratively in [`vercel.json`](vercel.json) and versioned with the codebase; they deploy atomically with the application.

Recommended hardening for scale (Section 16): add an automated CI test gate before deploy; add deployment smoke checks; codify provider configuration as infrastructure-as-code.

---

## 10. Environments, Configuration, and Secrets

- Three environment scopes: Production, Preview, and Development. Each has its own isolated set of environment variables.
- Secrets management: all credentials are Vercel environment variables, encrypted at rest, never committed to source. Only `NEXT_PUBLIC_*` values are bundled to the browser; everything else is server-only. AI provider keys are provisioned in sets of four per provider to support rotation under rate limits.
- Configuration as control surface: feature flags, reviewed model names, per-task effort, provider capacity, budgets, exchange rate, cache TTLs and LIFF identifiers are environment-driven. Parallel → Exa → stale cache and OpenAI → Anthropic fallback order remain fixed in code so a typo cannot silently bypass controls.
- Least privilege: database access uses scoped credentials; Blob uses a project-connected store token plus pathname/operation-scoped signed URLs; provider keys are per-service. A periodic credential-rotation and least-privilege review is recommended as a process control.

---

## 11. Database Change Management and Zero-Downtime Migrations

The dual-store design (PostgreSQL via Supabase, document store via MongoDB Atlas) is the most nuanced part of change management and is handled as follows.

- Supabase (PostgreSQL) migrations: schema changes are expressed as SQL migrations (the repository carries `DATABASE_CHANGES.sql` and `database.sql` as the migration record). The standard practice is the expand-contract (parallel-change) pattern for zero downtime: (1) expand - add new columns/tables backward-compatibly; (2) migrate - backfill and dual-write; (3) contract - switch reads, then remove the old shape. Because production promotion is atomic and instantly reversible, application changes can be coordinated with each migration phase safely. Recommendation: adopt a migration tool (Supabase CLI migrations) and run migrations as a gated CI step with review.
- MongoDB (schema-on-write): document schema evolves in application code; new fields are additive and tolerated by readers. Backfills run as idempotent one-off jobs. Field-meaning caveats (for example, the notification envelope's `contractId` holding an item id) are documented to prevent migration errors.
- Cross-store consistency: concepts that exist in both stores are written in both at the same logical step (there is no replication layer). At scale this is managed by (a) strict write-ordering and idempotency, (b) a reconciliation/audit job to detect and repair divergence, and (c) treating one store as authoritative per concept (customer-visible vs investor/finance). Formalizing the reconciliation job is a Stage 1 recommendation.
- Cache versioning: the estimate cache key is versioned (`estimate:global:v1`); changing the cached payload shape requires bumping the version to invalidate cleanly - a built-in, safe cache-migration mechanism.

Net: schema and data migrations are performed without downtime via expand-contract on Postgres and additive evolution on MongoDB, with atomic, reversible application deploys coordinating each step.

### 11.1 The migration gate (`npm run preflight:production`)

Because production promotion on Vercel is atomic and the application and database are versioned separately, the failure mode this architecture is most exposed to is *code deployed ahead of its migration*. Several subsystems fail closed in exactly that state: the UpPass webhook returns 503 without `ekyc_webhook_events`, and the market-observation cache silently disables itself without the price-evidence columns.

The preflight script is therefore both an environment gate and a schema gate:

- it validates every required environment variable, secret length, HTTPS URL, role-separation invariant (for example seller and Asset Funding UpPass keys must differ) and fail-closed flag (`ALLOW_SYNCHRONOUS_AI_ROUTES`, `ALLOW_AI_SLIP_AUTO_APPROVAL`, `UPPASS_WEBHOOK_AUTH_MODE`, `NEXT_PUBLIC_LIFF_MOCK`) without ever printing a secret value;
- it then probes the live Supabase REST endpoint for the specific tables and columns each hardening migration introduces, and names the exact migration file for anything missing;
- it exits non-zero on any failure, so it can be wired as a required CI step before promotion. `--skip-schema` / `PREFLIGHT_SKIP_SCHEMA=true` exists only for network-isolated environments and should never be used on a release run.

Migrations must be applied in this order, and `2026_08_01_harden_transaction_integrity.sql` must run with autocommit because it uses `CREATE INDEX CONCURRENTLY`:

```bash
npm run preflight:production
```

Current status (verified 1 August 2026): the four Supabase hardening migrations are **not yet applied** to the configured project, so this gate fails by design until they are run.

---

## 12. Release Management, Rollback, and Continuity

- Cadence: continuous deployment - small, frequent, immutable releases, each independently reviewable via its preview deployment.
- Change control: pull-request review plus preview-environment verification before merge to the production branch; production promotion is atomic.
- Hotfix path: a fix is a normal fast-tracked deployment; if a regression ships, Instant Rollback restores the previous known-good deployment in seconds.
- Progressive delivery: because providers and models are environment-flagged, risky changes (for example a new AI model) can be rolled out behind a flag and reverted without a redeploy; the planned in-house model uses an explicit shadow -> canary -> primary rollout with automatic fallback.
- Continuity: application code and configuration are fully reconstructible from Git plus Vercel's immutable deployment history; data continuity is covered by the backup/PITR posture in `INFRASTRUCTURE.md` Section 11.

---

## 13. Reliability Engineering for Scale

- Idempotency: the customer webhook maintains an event-deduplication cache; the ticket queue bounds retries (failed after three attempts); cron handlers are designed to be safely re-runnable. These properties make best-effort delivery and at-least-once semantics safe at volume.
- Graceful degradation: defined fallbacks at every external boundary (cache, AI, slip verification) keep the system serving under partial dependency failure.
- Asynchronous decoupling: financial lifecycle operations are mediated by durable envelopes (the notification collection and the contract-action tables) and advanced by webhooks and cron, so user-facing latency is decoupled from downstream processing and the system absorbs spikes by queueing rather than blocking.
- Connection discipline: cached database clients and pooled Postgres connections prevent connection exhaustion as concurrency rises.
- Backpressure and limits: provider key rotation, per-endpoint dynamic markers, and the WAF rate-limiting capability provide backpressure against abuse and runaway cost.

---

## 14. Observability, SLOs, and Load Testing

- Current: Vercel runtime logs (1-day retention on Pro; 30 days with Observability Plus), build logs (indefinite), firewall traffic views and alerts; Supabase and MongoDB Atlas native metrics dashboards.
- Recommended for scale: centralized structured logging and error tracking; an LLM-call audit trail (model, tokens, latency, fallback path, provider, cost) for cost governance; synthetic/uptime checks on the estimate path and both cron endpoints; dashboards and alerts for the leading scaling indicators - Supabase connection saturation, AI provider error/throttle rate, cache hit rate, and cold-estimate latency; Log Drains to a SIEM for security and audit.
- Load testing plan: before each major stage, run a load test that drives the capacity-model drivers (estimates/sec, condition analyses/sec, contract writes/sec) to validate the next database tier and connection headroom, and to confirm AI fallback behavior under provider throttling. Capture p50/p95/p99 latency and saturation, and set the next tier's trigger thresholds from the results.

---

## 15. Scaling and Deployment Risk Register

| # | Risk | Severity | Mitigation / status |
|---|---|---|---|
| S1 | Database connection saturation under high fan-out | Medium | Supavisor pooling in place; scale compute tier; add read replicas; monitor utilization (Stage 1 trigger) |
| S2 | AI cost grows linearly with volume | Medium | Cache, model tiering, key rotation in place; in-house model on roadmap to cap unit cost (Stage 2) |
| S3 | Cold-estimate latency (third-party-bound) | Medium | Caching + UX today; in-house pricing/condition model structurally reduces it |
| S4 | No contractual uptime SLA on Pro tiers | High | Internal 99.9% target now; Enterprise upgrade path defined (Stage 3) |
| S5 | Supabase single-region, no auto-failover on Pro | High | PITR + read replicas (Stage 1); Enterprise auto-failover (Stage 3); tested restore runbook |
| S6 | Dual-store write consistency at scale | Medium | Write-ordering + idempotency; add reconciliation job (Stage 1) |
| S7 | No automated test suite | Medium | Introduce CI test gate around pricing/calculations/state machines (Stage 1) |
| S8 | Cron best-effort delivery / Instant Rollback cron caveat | Low | Idempotent handlers; documented runbook; dedicated queue if volume demands |
| S9 | Infrastructure configuration not yet codified (IaC) | Low/Medium | Codify Supabase/Atlas/AWS/Vercel config as IaC at Stage 2-3 |
| S10 | Provider quota ceilings (LINE, SerpAPI, eKYC, slip) | Low/Medium | Negotiate commercial limits ahead of each growth stage |

---

## 16. Recommendations and Prioritized Roadmap

Immediate (Stage 0, low effort, high assurance):
1. Confirm and co-locate the Vercel function region with the primary databases (Singapore).
2. Enable Supabase PITR; verify MongoDB Atlas dedicated tier + continuous backup.
3. Confirm AI providers' no-training / ZDR / paid-tier posture for media-bearing calls.
4. Stand up baseline observability (error tracking, structured logs, uptime checks) and an LLM-cost audit trail.

Near term (Stage 1):
5. Introduce a CI automated-test gate (pricing, calculations, state machines) and deployment smoke checks.
6. Add a cross-store reconciliation/audit job.
7. Add Log Drains to a SIEM; instrument the leading scaling indicators with alerts.
8. Right-size Supabase compute and add a read replica as connection utilization rises.

Medium term (Stage 2-3):
9. Bring the in-house condition/pricing model online behind the provider abstraction (shadow -> canary -> primary).
10. Codify all provider configuration as infrastructure-as-code.
11. Evaluate Enterprise tiers (Vercel, Supabase) for contractual SLAs, automatic failover, multi-region, and managed WAF; run formal DR drills with measured RTO/RPO.

The throughline: the architecture already scales; the roadmap is about (a) closing durability/compliance gaps cheaply now, (b) hardening observability and testing before each order-of-magnitude, and (c) converting variable AI cost to owned, fixed cost as volume justifies it - all without re-architecture or downtime.

---

## 17. Appendix - Thresholds, Formulas, and Provider Limits

Scaling trigger thresholds (proposed):
- Supabase pooled-connection utilization sustained > 60% -> step compute size.
- Estimate p95 latency regression or AI throttle incidents -> tune cache / add keys / negotiate limits.
- AI spend exceeding target cost-per-transaction -> accelerate in-house model.
- Read load exceeding single-primary headroom -> add read replica.
- Partner/regulatory SLA requirement -> Enterprise upgrade.

Capacity formulas:
- Live AI pipelines/day = Estimates/day x (1 - cache_hit_rate)
- Peak concurrent DB requests ~ (daily DB requests / 86,400) x peak_factor
- AI cost/day ~ live_pipelines x cost_per_pipeline + condition_analyses x cost_per_analysis

Key provider limits referenced (full detail and sources in `INFRASTRUCTURE.md`):
- Vercel Pro: function concurrency 30,000; duration 300s default / 800s max; memory up to 4 GB / 2 vCPU; 12 concurrent builds; 100 cron jobs/project at per-minute granularity; payload 4.5 MB.
- Supabase Pro: connection caps by compute size (Micro 60/200 up to 16XL 500/12,000); 8 GB disk included with autoscaling; daily backups 7 days; PITR and read replicas as add-ons; single region per project.
- MongoDB Atlas: tier-based scaling (M10+ dedicated), replica-set auto-failover, continuous backup with PITR.
- Vercel Blob: managed object storage; 11-nines durability and 99.99% documented availability.
- Upstash Redis: serverless, per-request scaling.

All figures are planning references as of mid-2026 and should be re-verified against the live provider pricing/limits pages at diligence time.
