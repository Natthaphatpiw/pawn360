# Astly - Technology Stack Inventory

Status: Living document, prepared for investor technical due diligence
Scope: A complete, itemized inventory of every language, runtime, framework, library, build tool, configuration, and external managed service that composes the Astly platform, with the role and version of each, and an honest set of stack-level observations.
Companion documents: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md), [`SCALABILITY_AND_DEPLOYMENT.md`](SCALABILITY_AND_DEPLOYMENT.md).

> Reviewer note: package versions are quoted verbatim from `package.json` (the committed manifest) as of writing. Caret (`^`) ranges resolve to the latest compatible version at install; the committed `package-lock.json` is the reproducible source of truth for exact installed versions and should be inspected in the data room for a precise bill of materials.

---

## Table of Contents

1. Stack at a Glance
2. Languages, Runtime, and Package Management
3. Application Framework and Frontend
4. Backend and Server Runtime
5. Data and Storage Clients
6. AI / ML Integration
7. Messaging and Channel (LINE)
8. Document, Media, and Asset Generation
9. Authentication and Security Libraries
10. HTTP, Utilities, and UI
11. Build, Tooling, and Quality
12. Configuration Files
13. External Managed Services and APIs
14. Full Dependency Manifest
15. Scripts
16. Notable Stack Decisions and Conventions
17. Stack Observations and Risks for Due Diligence
18. Appendix - Version Pinning Summary

---

## 1. Stack at a Glance

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Language | TypeScript | ^5 | Strict mode enabled |
| Web framework | Next.js (App Router) | ^16.2.12 | Frontend + API routes in one project |
| UI runtime | React / React DOM | 19.1.0 (pinned) | Latest major |
| Styling | Tailwind CSS v4 | ^4 | CSS-first config (no `tailwind.config.js`) |
| Server runtime | Node.js (Vercel Functions) | `>=22` (`engines`) | Serverless; not Edge runtime |
| Primary DB client | `@supabase/supabase-js` | ^2.86.0 | PostgreSQL via PostgREST, service role |
| Operational DB driver | `mongodb` | ^6.20.0 | Native MongoDB driver |
| Cache client | `@upstash/redis` | 1.36.3 | REST-based Redis |
| Object storage | `@vercel/blob` | 2.6.1 | Private Vercel Blob storage + signed URLs |
| AI - primary | OpenAI Responses API | `openai` 6.16.0 | Luna/Terra text, vision, and structured extraction |
| AI - fallback | Anthropic Claude | direct REST (no SDK) | Text and vision fallback |
| Market search | Parallel / Exa | `parallel-web` 1.1.0 / `exa-js` 2.16.3 | Parallel primary, Exa fallback, Redis fresh/stale cache |
| Durable queue | Vercel Queues | `@vercel/queue` 0.4.0 | At-least-once AI and eKYC work delivery; beta trigger API |
| Channel | `@line/bot-sdk`, `@line/liff` | ^10.3.0 / ^2.27.2 | Messaging + mini-app |
| Document rendering | `puppeteer` + `@sparticuz/chromium` | ^24.25.0 / ^141.0.0 | Serverless headless Chrome |
| Auth | `bcrypt` + Node `crypto` | ^6.0.0 | PIN hashing + tokens |
| Package manager | npm | `package-lock.json` | Single lockfile |
| Build tooling | Turbopack (dev), `next build` (prod), `tsx` | - | - |
| Linting | ESLint 9 + `eslint-config-next` | ^9 / ^16.0.7 | Flat config, relaxed rules |
| Automated tests | None | - | No test framework in manifest (see Section 17) |

Headline: a current-generation TypeScript stack (Next.js 16, React 19, Tailwind v4, Node >=22) deployed serverless with managed data, storage, messaging, search, queue, and AI services.

---

## 2. Languages, Runtime, and Package Management

- Primary language: TypeScript (`typescript` ^5), compiled to ES2017 target with `module: esnext`, `moduleResolution: bundler`, `strict: true`, and `jsx: react-jsx`. Path alias `@/*` maps to the project root.
- Secondary languages: SQL (PostgreSQL DDL/DML, captured in `DATABASE_CHANGES.sql` / `database.sql`); JSX/TSX for React components; CSS (Tailwind v4 utility layer).
- Runtime: Node.js on Vercel Functions, constrained by `package.json` to `>=22` (local development observed on Node 24). The application uses the Node.js runtime, not Edge, because of Node-only dependencies (MongoDB, Puppeteer/Chromium, bcrypt, and queue consumers).
- Package management: npm, with a committed `package-lock.json` as the reproducibility source of truth. A single lockfile per app; note the repository's nested-directory layout is documented in the project guide.

---

## 3. Application Framework and Frontend

| Package | Version | Role |
|---|---|---|
| `next` | ^16.2.12 | Full-stack framework (App Router): server-rendered pages, Route Handlers (API), image handling, build pipeline |
| `react` | 19.1.0 | UI component runtime |
| `react-dom` | 19.1.0 | DOM renderer |
| `tailwindcss` | ^4 | Utility-first CSS (v4, configured via PostCSS plugin and CSS, no JS config file) |
| `@tailwindcss/postcss` | ^4.2.2 | Tailwind v4 PostCSS integration |
| `lucide-react` | ^0.555.0 | Icon set used across the LIFF UIs |

The frontend is delivered as a set of LINE LIFF mini-apps (one route tree per actor), all within this single Next.js project. Actor theming is implemented with CSS custom properties and per-route layout wrappers.

---

## 4. Backend and Server Runtime

The backend is implemented as Next.js Route Handlers (~115 API endpoints) running as Vercel Functions on the Node.js runtime. There is no separate backend framework (no Express/Nest/Fastify); the Next.js Route Handler model is the server framework. Cross-cutting server logic lives in `lib/` modules. Background processing uses four Vercel Queue triggers plus three cron schedules declared in `vercel.json`.

---

## 5. Data and Storage Clients

| Package | Version | Role |
|---|---|---|
| `@supabase/supabase-js` | ^2.86.0 | PostgreSQL access (investor/finance/logistics store) via the service-role key; PostgREST + realtime-capable client |
| `mongodb` | ^6.20.0 | Native MongoDB driver for the customer-facing operational store; client cached across warm invocations |
| `@upstash/redis` | 1.36.3 | REST client for the estimate-response and image-hash cache (Vercel KV / Upstash) |
| `@vercel/blob` | 2.6.1 | Private object storage for images, contracts, tickets, QR codes, and time-limited signed read URLs |

The platform runs a deliberate dual datastore (PostgreSQL via Supabase + MongoDB Atlas), described in `SYSTEM_ARCHITECTURE.md`. All database access is server-side with privileged credentials.

---

## 6. AI / ML Integration

| Provider | Integration | Version | Role |
|---|---|---|---|
| OpenAI | `openai` SDK through `lib/services/openai-llm.ts` | 6.16.0 | Primary LLM. Luna handles vision/classification; Terra handles normalization/canonicalization/evidence extraction. Task defaults are none/low with one-level quality escalation, typed errors, usage/cost telemetry and Redis budget guards |
| Anthropic Claude | Direct REST to Messages API (`lib/services/anthropic-llm.ts`) | n/a (native `fetch`) | Automatic Sonnet 4.6 text / Haiku 4.5 vision fallback after the OpenAI path |
| Parallel Search | `parallel-web` through `lib/services/market-search.ts` | 1.1.0 | Primary bounded market search; no user identifiers, serials, or image URLs in queries |
| Exa Search | `exa-js` through `lib/services/market-search.ts` | 2.16.3 | Search fallback before stale Redis evidence |

LLM and search are separate abstractions: OpenAI Responses is attempted first for model work, Anthropic is the model fallback, while Parallel -> Exa -> stale cache supplies web evidence. Queue-level backpressure/retry owns transient-provider recovery so SDK retries do not create hidden duplicate spend.

### 6.1 Model and reasoning-effort policy (the cost-control surface)

Reasoning effort is the single largest cost lever in this stack. An earlier configuration ran every call at `xhigh`/`max`; a single notebook price search then burned ~11,200 reasoning tokens and ~123 seconds. The current policy assigns the lowest effort that passes the task's quality gate and escalates **once**, only when a deterministic gate fails.

| Pipeline step | Model | Default effort | Escalation trigger | Env override |
|---|---|---|---|---|
| Image precheck (type / same-item) | Luna (vision, low detail) | `none` | none - unclear photos are returned to the user | `OPENAI_LUNA_REASONING_EFFORT` |
| Condition scoring (<= 4 photos) | Luna (vision, high detail) | `low` | none - unassessable results go to manual review | `OPENAI_LUNA_REASONING_EFFORT` |
| Product-name normalization | Terra | `none` | `low` on schema/quality-gate failure | `OPENAI_TERRA_REASONING_EFFORT` |
| Notebook spec canonicalization | Terra | `low` | `medium` when family cannot be resolved | `OPENAI_NOTEBOOK_REASONING_EFFORT` |
| Missing notebook specs from photos | Luna (vision) | `none` | user correction, not a retry | `OPENAI_LUNA_REASONING_EFFORT` |
| Used-price evidence extraction (generic) | Terra | `low` | `medium` once when comparables are insufficient | `OPENAI_TERRA_REASONING_EFFORT` |
| Used-price evidence extraction (notebook) | Terra | `low` | `medium` once when exact/family/anchor evidence is short | `OPENAI_NOTEBOOK_REASONING_EFFORT` |
| Bank-slip OCR (SlipOK unavailable) | Luna (vision) | `low` | none - low confidence routes to manual review | `OPENAI_LUNA_REASONING_EFFORT` |
| Representative price, LTV, ladder, penalty, interest | **no LLM** | - | - | deterministic code in `lib/services/` |

`xhigh` and `max` are no longer used on any production path. They are reserved for offline investigation.

### 6.2 Model pricing used for in-app cost accounting

`OPENAI_MODEL_PRICING` in `lib/services/openai-llm.ts` is the single source of truth for cost telemetry and the budget guards. A model with no entry is **rejected at call time** rather than being billed silently, so adding a model requires a reviewed price entry.

| Model | Input / 1M | Cached input / 1M | Cache write / 1M | Output / 1M |
|---|---:|---:|---:|---:|
| `gpt-5.6-luna` | $0.20 | $0.02 | $0.25 | $1.20 |
| `gpt-5.6-terra` | $2.00 | $0.20 | $2.50 | $12.00 |

Cost figures per workflow and per traffic tier are in `SCALABILITY_AND_DEPLOYMENT.md` and `INFRASTRUCTURE.md`.

---

## 7. Messaging and Channel (LINE)

| Package | Version | Role |
|---|---|---|
| `@line/bot-sdk` | ^10.3.0 | LINE Messaging API: push/multicast/broadcast, webhook signature verification, Flex message construction, rich menus - across the customer, admin, investor, and drop-point Official Accounts |
| `@line/liff` | ^2.27.2 | LINE Front-end Framework SDK: in-LINE mini-app initialization, login, and profile (`userId`) retrieval |
| `@line/liff-mock` | ^1.0.4 (dev) | LIFF mocking for local development outside LINE |

---

## 8. Document, Media, and Asset Generation

| Package | Version | Role |
|---|---|---|
| `puppeteer` | ^24.25.0 | Headless Chromium automation for server-side rendering of contract and loan-ticket documents to PDF/image |
| `@sparticuz/chromium` | ^141.0.0 | A Chromium build packaged to run within the AWS Lambda / Vercel Function filesystem and memory limits, paired with Puppeteer |
| `html2canvas` | ^1.4.1 | Client-side DOM-to-canvas rendering for contract/ticket image capture |
| `qrcode` | ^1.5.4 | QR-code generation (item/contract QR assets) |
| `react-signature-canvas` | ^1.1.0-alpha.2 | Canvas-based signature capture for contract signing (note: a pre-release/alpha version - Section 17) |
| `browser-image-compression` | ^2.0.2 | Client-side image compression before upload, to keep media within size limits |

---

## 9. Authentication and Security Libraries

| Package | Version | Role |
|---|---|---|
| `bcrypt` | ^6.0.0 | One-way hashing of the six-digit user PIN (cost factor 10), stored in Supabase `user_security` |
| Node `crypto` (built-in) | runtime | Opaque tokens, event/safety hashes, constant-time Basic Auth comparison, and provider-specific HMAC verification |
| `@types/bcrypt` | ^6.0.0 | Type definitions for bcrypt |

Authentication and webhook-signature logic is custom and lives in `lib/security/`. End-user identity is delegated to LINE Login via LIFF; there is no separate user-credential framework (no NextAuth/Passport).

### 9.1 `lib/security/` module inventory

Every control below is a server-side module with no browser counterpart. A DD reviewer can read this directory as the platform's complete trust boundary.

| Module | Responsibility |
|---|---|
| `liff-auth.ts` | Verifies the LINE ID token server-side against LINE (issuer, audience, subject, expiry) per actor role. A `lineId` in a request body is never treated as identity |
| `request-auth.ts` | Shared role/identity resolution for API handlers |
| `job-owner.ts` | Binds an async AI job to the LINE subject that created it; polling another user's job is 403 |
| `contract-access.ts` / `drop-point-access.ts` | Database-derived ownership checks for contract and drop-point routes - no trust in `viewer`/`lineId` query parameters |
| `pin.ts` / `pin-access.ts` / `pin-session.ts` | Six-digit PIN step-up: bcrypt cost 10, opaque server-stored session token, lockout ladder |
| `estimate-attestation.ts` | HMAC attestation binding owner, item fingerprint, photos, price, condition, confidence and expiry, so a browser cannot alter an AI estimate before submitting a loan request |
| `payment-evidence.ts` | Slip fingerprint lookup across every payment-evidence store, preventing one slip from settling two workflows |
| `financial-lock.ts` / `transaction-lock.ts` | Distributed Redis locks around money-moving mutations |
| `transaction-request.ts` | Bounded JSON reader plus sanitized error mapping for transactional routes |
| `bounded-upload.ts` | Streaming multipart limits and magic-byte file-type validation |
| `queued-images.ts` | Rejects `data:` URLs and enforces that image references belong to the project's own private Blob store and path prefix (anti-SSRF) |
| `ai-job-input.ts` | Schema/size validation of AI job payloads before anything is enqueued |
| `actor-rate-limit.ts` / `job-rate-limit.ts` | Per-authenticated-subject admission control, so one logged-in account cannot drain the AI budget or the queue |
| `line.ts` / `webhook.ts` / `webhook-replay.ts` | LINE HMAC verification, Shop System HMAC scheme, and replay-window/nonce suppression |

Adjacent enforcement lives in `lib/services/provider-capacity.ts` (provider RPM/TPM/concurrency admission, fail-closed in production) and `lib/services/ai-usage.ts` (per-job, per-owner-per-day, and per-month spend ceilings).

---

## 10. HTTP, Utilities, and UI

| Package | Version | Role |
|---|---|---|
| `axios` | ^1.19.0 | HTTP client for several outbound third-party calls (alongside bounded native `fetch` integrations) |
| `dotenv` | ^17.2.3 | Environment-variable loading for the ad-hoc `tsx` scripts |
| `lucide-react` | ^0.555.0 | Icon components |

---

## 11. Build, Tooling, and Quality

| Package | Version | Role |
|---|---|---|
| `typescript` | ^5 | Type system and compiler |
| Turbopack (via `next dev --turbopack`) | bundled with Next 16 | Local development bundler |
| `next build` | bundled | Production build |
| `tsx` | ^4.20.6 (dev) | Executes the TypeScript operational scripts (rich-menu setup, Blob test, benchmarks) |
| `eslint` | ^9 (dev) | Linting (flat config) |
| `eslint-config-next` | ^16.0.7 (dev) | Next.js ESLint ruleset |
| `@eslint/eslintrc` | ^3 (dev) | Flat-config compatibility shim |
| `baseline-browser-mapping` | ^2.10.20 (dev) | Browser baseline target data |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/qrcode`, `@types/html2canvas` | various | Type definitions |

Testing: there is no automated test framework in the manifest (no Jest, Vitest, Playwright, Cypress, or Testing Library). This is an explicit gap noted across the diligence documents.

---

## 12. Configuration Files

| File | Purpose |
|---|---|
| `package.json` | Dependency manifest and npm scripts |
| `package-lock.json` | Exact, reproducible dependency tree (bill of materials) |
| `tsconfig.json` | TypeScript config: ES2017 target, esnext modules, bundler resolution, strict, `@/*` path alias |
| `next.config.ts` | Next.js config and production security headers |
| `eslint.config.mjs` | ESLint flat config; relaxes `no-explicit-any` (off), `no-require-imports` (off), and downgrades `no-unused-vars` and `no-img-element` to warnings |
| `postcss.config.mjs` | PostCSS pipeline (Tailwind v4 plugin) |
| `vercel.json` | Four Vercel Queue triggers plus eKYC reconciliation and business crons |
| `.env` / `.env.example` | Environment variables (secrets are not committed; `.env.example` documents the shape) |
| `tailwind` | v4 CSS-first configuration (no `tailwind.config.js`) |

---

## 13. External Managed Services and APIs

The runtime stack is as much about managed services as about libraries. Full infrastructure detail (plans, limits, SLAs, compliance) is in `INFRASTRUCTURE.md`; the inventory is:

| Category | Service | Role |
|---|---|---|
| Hosting / compute / edge | Vercel (Pro) | Edge network, serverless Functions, cron, CI/CD, WAF/DDoS, DNS/TLS |
| Relational database | Supabase (Pro, PostgreSQL) | Investor/finance/logistics store, RLS |
| Document database | MongoDB Atlas | Customer-facing operational store |
| Object storage | Vercel Blob (private store) | Images, contracts, tickets, QR (signed URLs) |
| Cache | Upstash Redis (via Vercel KV) | Estimate + image-hash cache |
| Durable queue | Vercel Queues (beta) | AI/eKYC at-least-once delivery; app idempotency, leases, retry and DLQ |
| Messaging / identity | LINE (Messaging API + LIFF) | Channels and mini-app auth |
| AI - primary | OpenAI Luna + Terra | Structured pricing reasoning, item-image analysis, missing notebook specs, slip OCR fallback |
| AI - fallback | Anthropic Claude | Automatic text and vision fallback |
| Market search | Parallel -> Exa -> stale Redis cache | Web evidence for pricing |
| Price data | SerpAPI (optional) | Independent Google Shopping candidates |
| eKYC | UPPASS | Identity verification |
| Slip verification | SlipOK | Bank-transfer slip validation |
| Adjacent system | Shop System (separate Vercel app) | Negotiation and payment verification (signed HTTP) |

---

## 14. Full Dependency Manifest

Production dependencies (25):

| Package | Version | Category | Role |
|---|---|---|---|
| `next` | ^16.2.12 | Framework | Full-stack web framework |
| `react` | 19.1.0 | Frontend | UI runtime |
| `react-dom` | 19.1.0 | Frontend | DOM renderer |
| `lucide-react` | ^0.555.0 | UI | Icons |
| `@supabase/supabase-js` | ^2.86.0 | Data | PostgreSQL client |
| `mongodb` | ^6.20.0 | Data | MongoDB driver |
| `@upstash/redis` | 1.36.3 | Data | Redis cache client |
| `@vercel/blob` | 2.6.1 | Storage | Private Blob uploads, reads, and signed URLs |
| `@vercel/queue` | 0.4.0 | Queue | Vercel Queue producer/consumer and retry callbacks (beta) |
| `openai` | `6.16.0` | AI | OpenAI Responses SDK (exactly pinned) |
| `parallel-web` | 1.1.0 | Search | Primary market-search SDK |
| `exa-js` | 2.16.3 | Search | Fallback market-search SDK |
| `@line/bot-sdk` | ^10.3.0 | Messaging | LINE Messaging API |
| `@line/liff` | ^2.27.2 | Messaging | LINE LIFF SDK |
| `puppeteer` | ^24.25.0 | Media | Headless Chromium |
| `@sparticuz/chromium` | ^141.0.0 | Media | Serverless Chromium binary |
| `html2canvas` | ^1.4.1 | Media | DOM-to-canvas |
| `qrcode` | ^1.5.4 | Media | QR generation |
| `react-signature-canvas` | ^1.1.0-alpha.2 | Media | Signature capture (alpha) |
| `browser-image-compression` | ^2.0.2 | Media | Client image compression |
| `bcrypt` | ^6.0.0 | Security | PIN hashing |
| `axios` | ^1.19.0 | Utility | HTTP client |
| `dotenv` | ^17.2.3 | Utility | Env loading (scripts) |
| `@types/bcrypt` | ^6.0.0 | Types | Type defs (belongs in dev) |
| `@types/html2canvas` | ^0.5.35 | Types | Type defs (belongs in dev) |

Development dependencies (13):

| Package | Version | Role |
|---|---|---|
| `typescript` | ^5 | Compiler / types |
| `eslint` | ^9 | Linter |
| `eslint-config-next` | ^16.0.7 | Next.js lint rules |
| `@eslint/eslintrc` | ^3 | Flat-config compat |
| `tsx` | ^4.20.6 | TS script runner |
| `tailwindcss` | ^4 | CSS framework (build-time) |
| `@tailwindcss/postcss` | ^4.2.2 | PostCSS plugin |
| `@line/liff-mock` | ^1.0.4 | LIFF mock (dev) |
| `baseline-browser-mapping` | ^2.10.20 | Browser baseline data |
| `@types/node` | ^20 | Node types |
| `@types/react` | ^19.2.14 | React types |
| `@types/react-dom` | ^19 | React DOM types |
| `@types/qrcode` | ^1.5.5 | qrcode types |

(Some `@types/*` packages are currently listed under production `dependencies`; this is a hygiene item, not a functional issue.)

---

## 15. Scripts

npm scripts (`package.json`):

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev --turbopack` | Local development server |
| `build` | `next build` | Production build |
| `start` | `next start` | Run the production build |
| `lint` | `eslint` | Lint the codebase |
| `setup-richmenu` | `tsx scripts/setup-richmenu.ts` | Provision LINE rich menus |
| `setup-richmenu-prod` | `tsx scripts/create-richmenu-production.ts` | Production rich-menu setup |
| `setup-richmenu-6` | `tsx scripts/create-richmenu-6-buttons.ts` | Six-button rich-menu variant |
| `test-blob` | `tsx scripts/test-blob.ts` | Vercel Blob connectivity check |

Ad-hoc scripts (run directly with `tsx`/`node`, not wired to npm): pricing/benchmark tooling (`benchmark-runner`, `system-benchmark`, `condition-eval`, `price-*`), and helpers (`check-liff-setup`, `fix-richmenu-urls`). These are operational/evaluation utilities, not part of the production build.

---

## 16. Notable Stack Decisions and Conventions

- Single full-stack codebase: frontend and API in one Next.js project, simplifying deployment and type sharing.
- Serverless-only runtime: no servers/containers; the Route Handler + Vercel Function model is the backend framework.
- Provider-abstracted AI: a shared OpenAI Responses client plus an Anthropic REST fallback, enabling model/vendor swaps and the future in-house model via configuration.
- Anthropic remains dependency-free via direct REST and is invoked only after the OpenAI primary path fails.
- Search-provider abstraction: Parallel is primary, Exa fallback, with bounded normalized evidence and a fresh/stale Redis cache.
- Durable backpressure: Vercel Queue messages carry only opaque ids; Redis supplies idempotency, leases, provider concurrency and an application DLQ because delivery is at least once.
- Dual datastore by design: PostgreSQL (Supabase) and MongoDB (Atlas) used together, each as a system of record for its domain.
- Custom, lightweight auth: server-verified LINE ID tokens plus bcrypt PIN; machine authentication is provider-specific (including fail-closed Basic Auth for UpPass).
- Modern versions: Next 16, React 19, Tailwind v4, TypeScript 5, Node >=22 - a current-generation stack with no legacy framework debt.
- Tailwind v4 CSS-first config: no `tailwind.config.js`; theme tokens are expressed in CSS.

---

## 17. Stack Observations and Risks for Due Diligence

Presented transparently; none are architecturally serious, and each has a low-effort remediation.

| # | Observation | Severity | Remediation |
|---|---|---|---|
| 1 | Model/provider SDK release drift | Low | `openai` is pinned to 6.16.0; upgrade deliberately with Responses API contract and cost smoke tests |
| 2 | `react-signature-canvas` is a pre-release (`1.1.0-alpha.2`) in a production signing flow | Medium | Evaluate stability; pin exactly; have a fallback signature component |
| 3 | No automated test framework in the manifest | Medium | Add Vitest/Jest + Playwright with CI coverage for pricing, calculations, and state machines (also flagged in the scalability plan) |
| 4 | `engines.node` permits any version >=22 rather than one Node major | Low | Align Vercel project runtime and CI to one tested Node major if stricter reproducibility is required |
| 5 | A few `@types/*` packages are under `dependencies` rather than `devDependencies` | Low | Move type-only packages to `devDependencies` |
| 6 | ESLint is relaxed (`no-explicit-any` off, unused-vars as warnings) | Low | Tighten rules incrementally; treat the lint step as a CI gate |
| 7 | Both `axios` and native `fetch` are used for outbound HTTP | Low | Standardize on one client for consistency in retries/timeouts/observability |

Strengths a reviewer should weigh against the above: the stack is current and mainstream (no end-of-life frameworks), the supply chain is moderate and well-known (no obscure or unmaintained core dependencies), the build is reproducible via a committed lockfile, type safety is enforced (`strict: true`), and the AI layer is deliberately abstracted and partly SDK-free.

---

## 18. Appendix - Version Pinning Summary

| Pinning style | Packages | Implication |
|---|---|---|
| Exact pin | `react` 19.1.0, `react-dom` 19.1.0 | Deterministic |
| Caret range (`^`) | Majority of dependencies | Latest compatible minor/patch at install; locked by `package-lock.json` |
| Exact pin | `openai` 6.16.0 | Reproducible Responses API behavior; upgrade deliberately |
| Pre-release | `react-signature-canvas` (alpha) | Stability risk; should be evaluated/pinned |

Definitive bill of materials: the committed `package-lock.json` resolves all of the above to exact versions and integrity hashes and is the authoritative artifact for a precise dependency audit. All version figures here reflect the manifest as of writing and should be reconciled against the lockfile at diligence time.
