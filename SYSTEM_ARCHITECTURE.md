# Astly — System Architecture

Status: Living document
Audience: Engineering, DevOps, Security, and ML stakeholders
Scope: The customer-facing collateral-backed lending platform (this repository), its runtime on Vercel, all data stores and external integrations, the AI/LLM layer, and the planned self-hosted condition-assessment model.

---

## Table of Contents

1. System Context and Purpose
2. Architectural Principles
3. Actor and Channel Topology
4. Deployment and Infrastructure Architecture (Vercel)
5. Application Architecture (Next.js App Router)
6. External Integrations and Trust Boundaries
7. Data Architecture
8. AI and LLM Layer
9. Core Domain Workflows
10. Security Architecture
11. Reliability, Scalability, and Performance
12. Observability and Operations
13. Known Constraints and Technical Debt
14. Future Phase: Self-Hosted Open-Source Condition-Assessment Model
15. Appendices (environment, routes, glossary)

---

## 1. System Context and Purpose

Astly (brand domain `Astly.co`) is a peer-to-peer (P2P) collateral-backed lending platform operating in Thailand. It originates short-term loans secured by the borrower's valuables and connects three primary actors:

- Borrowers who pledge consumer electronics (phones, tablets, laptops, cameras, watches, accessories) as collateral for short-term secured loans.
- Investors (lenders) who fund those loans against the pledged collateral and earn tier-based monthly interest.
- Drop points (physical receiving and return branches) that take physical custody of the collateral, verify it, store it, and return it on redemption.

A separate Store/Shop SaaS subsystem (deployed independently) performs negotiation and payment verification and calls back into this platform.

The platform is delivered primarily as a set of LINE LIFF mini-applications (LINE is the dominant messaging platform in Thailand), backed by a Next.js application deployed on Vercel. The economic core of the product is a two-stage automated price derivation: a representative market reference price (ราคากลาง) is computed from live web data, then a loan principal (ราคาจำนำ) is derived from it and adjusted by an assessed item condition.

This document describes the complete runtime topology, data ownership, integration surface, security model, and the roadmap toward an in-house, open-source computer-vision model for item-condition assessment.

---

## 2. Architectural Principles

- Serverless-first. All compute is stateless HTTP handlers (Next.js Route Handlers) executed as Vercel Functions. No long-lived application servers are operated.
- Channel-native UX. The user interface is composed of LINE LIFF mini-apps, one page tree per actor, each bound to a dedicated LINE login channel.
- Dual system of record by design. MongoDB and Supabase (PostgreSQL) run side by side. This is intentional and not a migration in flight: MongoDB is the customer-facing operational store; Supabase is the investor/finance and logistics store. Consistency is maintained at write time in application code; there is no replication layer.
- Provider-abstracted intelligence. All LLM and OCR work is routed through thin provider abstractions so models and vendors can be swapped via configuration. This is the seam through which the future self-hosted model will be introduced.
- Asynchronous, message-mediated workflows. State-changing financial operations (redemption, extension, principal change) are mediated by durable envelopes (a MongoDB notification collection and a Supabase contract-action table) and advanced by webhooks and scheduled jobs rather than synchronous calls.
- Defense in depth at the data tier. All database access is server-side using privileged credentials; the public anonymous key is not used. Row-Level Security is enabled on every Supabase table as a backstop.
- Configuration over code. Feature flags, model identifiers, providers, exchange rates, cache TTLs, and per-actor LIFF identifiers are environment-driven.

---

## 3. Actor and Channel Topology

The platform is multi-tenant by actor role. There are three LINE login (LIFF) channels and at least four LINE Official Account messaging credential sets.

| Actor | LINE login channel (LIFF prefix) | Page tree (functional) | Messaging credentials |
|---|---|---|---|
| Borrower / customer | `2008216710` | loan estimate, item submission, drafts, contracts, contract actions, delivery tracking, penalty payment, registration, eKYC, QR | `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` |
| Store / Shop operator | `2008216710` (shared) | store contract, store registration, item verification | `LINE_STORE_CHANNEL_ACCESS_TOKEN` / `LINE_STORE_CHANNEL_SECRET` |
| Investor | `2008641671` | investment, investor dashboard, offers, offer detail, investor payment, investor loan-ticket, registration, eKYC | `LINE_CHANNEL_ACCESS_TOKEN_INVEST` / `LINE_CHANNEL_SECRET_INVEST` |
| Drop point | `2008651088` | drop-point console, dashboard, returns, verification, registration | `LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT` / `LINE_CHANNEL_SECRET_DROPPOINT` |
| Admin / operations | none (push only) | manual-estimate operator console | `LINE_ADMIN_CHANNEL_ACCESS_TOKEN` / `LINE_ADMIN_CHANNEL_SECRET` + `LINE_ADMIN_TARGET_IDS` |

The admin account has no LIFF login of its own; it is a push/multicast/broadcast channel driven by `LINE_ADMIN_TARGET_IDS`.

Each feature route mounts its own `LiffProvider` (in a route-level `layout.tsx`) using a per-feature `NEXT_PUBLIC_LIFF_ID_*` identifier with a hard-coded fallback. There is no single global LIFF identifier; roughly twenty-five distinct LIFF identifiers exist. The LINE user identity (`profile.userId`) obtained from `liff.getProfile()` is the cross-cutting principal, passed to backend APIs as `lineId`.

---

## 4. Deployment and Infrastructure Architecture (Vercel)

The entire web tier, networking, DNS, TLS, edge caching, and edge security are provided by Vercel. There is no Cloudflare or other CDN/WAF in front of the application; Vercel's Edge Network is the single ingress. The brand/production domain is `Astly.co`.

### 4.1 Edge Network and request routing

- Vercel's Edge Network is a globally distributed anycast network of points of presence. All inbound HTTPS terminates at the nearest edge PoP. The edge serves static assets and cached responses directly and proxies dynamic requests to Vercel Functions.
- Static assets produced by the Next.js build (immutable, content-hashed `/_next/static/*`) are cached at the edge with long-lived, immutable cache headers.
- Dynamic Route Handlers (the `/api/*` surface) are not edge-cached; most are explicitly marked dynamic (`export const dynamic = 'force-dynamic'` and/or `revalidate = 0`) to guarantee fresh execution.

### 4.2 Compute model (Vercel Functions)

- Every backend handler is a Next.js Route Handler compiled into a Vercel Function. Functions are stateless, autoscaling, and billed per invocation and duration.
- Runtime: Node.js (the default for this application). One route pins `export const runtime = 'nodejs'` explicitly (the investor inbound webhook); the rest inherit the Node.js default. The application is not on the Edge runtime because it depends on Node-only libraries (MongoDB driver, AWS SDK, Puppeteer/Chromium, bcrypt).
- Execution time: latency-sensitive defaults apply, with `export const maxDuration = 60` set on the heavyweight handlers that perform headless-Chromium document rendering or multi-image vision and live web search:
  - the condition-analysis route (vision precheck + Gemini scoring)
  - the loan-ticket rendering route
  - the contract-image rendering route
- Document and image rendering uses `puppeteer` with `@sparticuz/chromium`, a Chromium build packaged for the AWS Lambda/Vercel Function filesystem and memory constraints.
- Region: Vercel Functions execute in a configured region. For this workload the data-adjacency target is Southeast Asia (Singapore, `sin1`) to minimize latency to Supabase, MongoDB Atlas, and SEA users; the S3 bucket is in Sydney (`ap-southeast-2`). Region selection should be validated against the actual Supabase and MongoDB Atlas regions to avoid cross-region round-trips on hot paths.
- Cold starts: as with any serverless platform, infrequently invoked functions incur cold-start latency. Module-level singletons (the cached MongoDB client, the lazily constructed S3 client, the Redis client) are reused across warm invocations to amortize connection setup.

### 4.3 Scheduled jobs (Vercel Cron)

Two cron jobs are declared in `vercel.json`, each every five minutes:

| Schedule | Path | Function |
|---|---|---|
| `*/5 * * * *` | `/api/contracts/process-ticket-queue` | Drains the Supabase ticket-generation queue; issues loan-ticket links to borrower and investor via LINE. |
| `*/5 * * * *` | `/api/redemptions/auto-confirm-received` | Auto-advances redemptions from `COMPLETED` to a borrower-confirmed state after a 48-hour window. |

Operational note: Vercel Cron invokes the configured path using an HTTP GET request. `auto-confirm-received` is implemented as a GET handler and optionally enforces an `Authorization: Bearer <CRON_SECRET>` check (open if the secret is unset). `process-ticket-queue` implements its queue-draining logic in a POST handler while its GET handler returns queue statistics only; the GET/POST method alignment for that cron should be verified against Vercel's invocation method.

### 4.4 Managed data services on the Vercel side

- Vercel KV (Upstash Redis): the estimate cache and per-image content-hash cache use Upstash Redis through the Vercel KV integration. The application reads the Vercel-KV-style credentials `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `KV_REST_API_READ_ONLY_TOKEN`. If these are absent, caching is silently skipped and the pipeline runs uncached.

The primary databases (MongoDB Atlas, Supabase) and object storage (AWS S3) are external managed services reached over the network from Vercel Functions; they are not Vercel-hosted (see Section 6 and Section 7).

### 4.5 Domains, DNS, and TLS

- DNS for `Astly.co` is managed by Vercel (either via Vercel nameservers or delegated records pointing at Vercel). Apex and subdomains resolve to the Vercel Edge Network.
- TLS certificates are provisioned and auto-renewed by Vercel (Let's Encrypt), with automatic HTTPS and HSTS. No certificate management is performed by the team.
- The application computes absolute callback and deep-link URLs from `VERCEL_URL` (the deployment's system-assigned hostname) or `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_DOMAIN`, falling back to the production domain. This is used to construct the Shop System callback URL and LINE deep links.

### 4.6 Edge security (the Cloudflare-equivalent layer)

With no Cloudflare in the path, the following responsibilities are owned by Vercel's platform:

- Always-on DDoS mitigation at the edge (network and application layer).
- Vercel Firewall / Web Application Firewall: managed rulesets, custom firewall rules, rate limiting, and Attack Challenge Mode for L7 protection.
- Automatic TLS, HTTP/2 and HTTP/3 termination at the edge.
- Bot and abuse controls configurable per project.

Application-layer authenticity for inbound machine-to-machine traffic (LINE webhooks, Shop System callbacks, UPPASS eKYC callbacks) is enforced in code via signature verification (Section 10), independent of the edge firewall.

### 4.7 Delivery pipeline (CI/CD)

- Git-integrated deployments: every push builds an immutable deployment. Pull requests and non-production branches produce isolated Preview Deployments with their own URLs and environment scope.
- Production promotion is atomic; rollbacks are instant (re-pointing the alias to a previous immutable deployment).
- Build: `next build` (production) / `next dev --turbopack` (local). Environment variables are scoped per environment (Production, Preview, Development), encrypted at rest, and injected at build and runtime. `NEXT_PUBLIC_*` variables are inlined into the client bundle; all others remain server-only.

### 4.8 The separate Shop System (independent Vercel app)

The Store/Shop SaaS is a distinct, independently deployed Vercel application (configured via `SHOP_SYSTEM_URL`). This platform pushes signed requests to the Shop System and receives asynchronous callbacks at `/api/webhooks/shop-notification`. The two systems are integrated by signed HTTP, not by a shared database.

---

## 5. Application Architecture (Next.js App Router)

The application is a single Next.js 16 project (App Router, React 19, TypeScript, Tailwind CSS v4). The path alias `@/*` resolves to the project root.

Approximate inventory: 115 API Route Handlers, 76 pages, 39 route-level layouts (each typically a `LiffProvider` boundary).

### 5.1 Presentation tier (LIFF mini-apps)

- A single `LiffProvider` (`lib/liff/liff-provider.tsx`) is the only place `liff.init` is called. It initializes the SDK, fetches the LINE profile (or triggers login), and exposes a `useLiff()` hook.
- Per-feature route layouts bind a `NEXT_PUBLIC_LIFF_ID_*` to the provider. Actor theming is applied through per-actor wrapper CSS classes (borrower, investor, and drop-point themes, plus a public web shell) with CSS custom properties (`--primary`, `--s2`, `--s3`).
- Cross-channel navigation uses `lib/liff/navigation.ts`, redirecting through `https://liff.line.me/<id>?liff.state=<path>` with ordered fallback identifiers.
- Global UX primitives (`ToastProvider`, `CookieBanner`, `ScrollReveal`) mount once in the root layout. A development bypass (`NEXT_PUBLIC_LIFF_MOCK`, `NEXT_PUBLIC_DROPPOINT_MOCK`) injects a mock LINE profile to run outside LINE.

### 5.2 API tier (Route Handlers)

The `/api/*` surface is grouped by domain: estimate, condition analysis, manual estimate, contracts, contract actions, negotiation requests, items, customer actions, borrowers, investors, redemptions, penalties, payments, drop points, delivery, loan requests, eKYC, stores, upload, QR, and the webhook family (customer, alternate customer, store, drop-point, Shop System callbacks, investor, and the eKYC callbacks).

### 5.3 Shared libraries (`lib/`)

- `lib/db/` — MongoDB connection (hot-reload-cached client) and data models.
- `lib/supabase/client.ts` — the Supabase service-role client factory (`supabaseAdmin()`).
- `lib/line/` — per-actor LINE clients, Flex message templates, admin push.
- `lib/security/` — PIN authentication and session tokens, LINE and webhook signature verification.
- `lib/services/` — pricing (`price-representative`), investor tiers, penalty engine, slip verification, geo distance, and the shared Anthropic client (`anthropic-llm`).
- `lib/aws/s3.ts` — S3 upload and presigned URL generation.
- `lib/utils/` — financial calculations, QR codes, item private notes.

---

## 6. External Integrations and Trust Boundaries

All third-party systems are reached over the network from Vercel Functions. Inbound integrations are authenticated by signature; outbound integrations authenticate with secrets held in environment variables.

| Integration | Direction | Purpose | Protocol / Endpoint | Authentication |
|---|---|---|---|---|
| LINE Messaging API (x4 OAs) | Inbound webhooks + outbound push | Customer/store/investor/drop-point messaging, Flex UI, rich menus | HTTPS `api.line.me` | HMAC-SHA256 (base64) signature on inbound; channel access token on outbound |
| LINE LIFF | Client | Mini-app auth and profile | LINE SDK in browser | LINE login (OAuth) |
| Anthropic Claude | Outbound | Primary LLM: input normalization, SerpAPI filtering, web-search pricing (Sonnet 4.6); image precheck and slip OCR (Haiku 4.5) | HTTPS `api.anthropic.com/v1/messages` | `x-api-key` (4-key rotation) |
| Google Gemini | Outbound | Item condition scoring (`gemini-3-flash-preview`) | Google Generative AI SDK | API key (4-key rotation) |
| OpenAI | Outbound (optional) | Alternate web-search price provider when `PRICE_SEARCH_PROVIDER=openai` | HTTPS Responses API | API key (4-key rotation) |
| SerpAPI | Outbound | Google Shopping Light price candidates | HTTPS `serpapi.com` | API key |
| UPPASS | Outbound + inbound webhook | eKYC for borrowers and investors | HTTPS `app.uppass.io` | Bearer API key; inbound HMAC (`x-uppass-signature`) |
| SlipOK | Outbound | Bank-slip verification (primary path when configured) | HTTPS `api.slipok.com` | `x-authorization` header |
| AWS S3 | Outbound | Object storage for images, contracts, tickets, QR codes | AWS SDK, `piwp360` bucket, `ap-southeast-2` | IAM access key/secret; presigned URLs for read |
| MongoDB Atlas | Outbound | Primary OLTP store | MongoDB wire protocol (TLS) | SRV connection string |
| Supabase (PostgreSQL) | Outbound | Investor/finance/logistics store | HTTPS PostgREST / supabase-js | Service-role JWT |
| Upstash Redis (Vercel KV) | Outbound | Estimate and image-hash cache | HTTPS REST | KV REST token |
| Shop System (separate Vercel app) | Outbound + inbound callback | Negotiation and payment verification | HTTPS | HMAC-SHA256 (hex) over `notificationId-timestamp` + 5-minute replay window |

Trust boundary summary: the browser (LIFF) is untrusted and authenticates via LINE; Vercel Functions are the trusted compute boundary holding all secrets; databases and object storage sit behind privileged credentials; inbound machine callers must present a valid signature.

---

## 7. Data Architecture

The platform operates a polyglot persistence model with four stores. Ownership is split deliberately.

### 7.1 MongoDB Atlas — customer-facing operational store

Connection is established by `connectToDatabase()` (cached `MongoClient`/`Db` across warm invocations); database name from `MONGODB_DB`, connection string from `MONGODB_URI`.

Collections (TypeScript interfaces in `lib/db/models.ts`):

- A customer collection — keyed by `lineId`.
- An item collection — the pledged collateral. Carries pre-negotiation fields (desired amount, estimated value, loan days, interest rate), the post-negotiation `confirmationNewContract` sub-document (the authoritative principal/rate/days), and principal-history / extension-history event logs. Note: the item uses `loanDays` (not `contractDays`) and `createdAt` (not `startDate`).
- A contract collection — embedded transaction history, loan details, signatures, documents. Status vocabulary is lowercase: `active | overdue | redeemed | lost | sold`.
- Store and user collections.
- A negotiation-request collection — store-to-customer negotiation records.
- A notification collection — the asynchronous workflow envelope. `type`: `redemption | extension | increase_principal | reduce_principal`. `status` (seven states): `pending | confirmed | rejected | payment_pending | payment_uploaded | completed | failed`. The `contractId` field actually stores the Mongo item identifier.

### 7.2 Supabase (PostgreSQL) — investor, finance, and logistics store

Accessed exclusively server-side through `supabaseAdmin()` (service role). Representative tables: `contracts` (with `loan_principal_amount`, `investor_tier`, `investor_rate`, `contract_status`, `item_delivery_status`, `contract_end_date`, `drop_point_id`), the contract-action request and log tables, `redemption_requests`, a borrower table, an item table, `investors`, `drop_points`, `drop_point_storage_boxes`, `drop_point_bag_assignments`, `drop_point_verifications`, the door-to-door delivery-request table, `penalty_payments`, `loan_requests`, `user_security`, the ticket-generation queue, `manual_estimate_requests`, `payments`, `company_bank_accounts`, slip verifications, and item lenses.

Supabase `contract_status` is uppercase and a different vocabulary from MongoDB's: `ACTIVE | CONFIRMED | EXTENDED | COMPLETED | TERMINATED | DEFAULTED`. The two status enumerations are not interchangeable.

Row-Level Security: RLS is enabled on every table. Because all application access uses the service-role credential (which bypasses RLS), enabling RLS does not affect application behavior; it is a defense-in-depth control that denies the public anonymous key (which the application does not use).

### 7.3 Store-ownership model and synchronization

The split is not a clean "customer = MongoDB / investor = Supabase" line. Borrower and item records exist in both stores; drop-point, contract-action, redemption, and ticket-queue data exist only in Supabase. When a concept exists in both stores (notably contracts, and customers versus borrowers), the MongoDB record is customer-visible and the Supabase record is the investor/finance view. There is no replication layer; both records must be written in application code at the same logical step.

### 7.4 Caching tier (Upstash Redis / Vercel KV)

The estimate pipeline caches whole responses under `estimate:global:v1:<hash>` and image content hashes under `estimate:image-hash:v1:<hash>`. Keys are versioned; the cache key payload is derived from normalized request fields and sorted image content hashes (not URLs). Default TTL is thirty days, configurable by environment.

### 7.5 Object storage (AWS S3)

Bucket `piwp360`, prefix `cont360/`, region `ap-southeast-2`. Stores item images, verification photos, contract HTML/PDF, loan-ticket assets, and QR codes. Objects are private; read access is granted through presigned URLs. Uploads occur via `POST /api/upload` (multipart, image/PDF allowlist, 10 MB limit) and direct server-side puts. Stored URLs are persisted on the relevant database records.

### 7.6 Data classification

- Identity and KYC: national ID, phone number, address, eKYC artifacts (UPPASS). Sensitive personal data subject to Thai PDPA.
- Financial: loan principal, interest, penalty payments, bank slips, company bank account.
- Authentication: bcrypt PIN hashes and session tokens (Supabase `user_security`).
- Collateral media: item and slip photographs (candidate training data for the future model; see Section 14).

---

## 8. AI and LLM Layer

Intelligence is concentrated in the pricing and assessment pipeline and is provider-abstracted.

### 8.1 Provider abstraction

- `lib/services/anthropic-llm.ts` is the shared Claude client: a direct REST integration to the Anthropic Messages API with four-key rotation on rate-limit/overload, structured output via forced tool use (`anthropicStructured`), image-block construction for vision, and model resolution.
- Model assignment:
  - Text steps (input normalization, SerpAPI result filtering, web-search pricing): `claude-sonnet-4-6` (`ANTHROPIC_MODEL`).
  - Vision steps (image precheck, slip OCR): `claude-haiku-4-5-20251001` (`ANTHROPIC_VISION_MODEL`).
- The web-search pricing step is additionally provider-switchable via `PRICE_SEARCH_PROVIDER` (`anthropic` default, `openai` alternate) and `PRICE_SEARCH_MODEL`.
- Condition scoring uses Google Gemini (`gemini-3-flash-preview`) with its own four-key rotation.

### 8.2 Price derivation pipeline (`/api/estimate`)

1. Cache check (Redis) on a normalized payload including image content hashes.
2. Agent 1, input normalization (Claude Sonnet 4.6): produces a single canonical product name; color and serial number are deliberately stripped.
3. Agent 2, representative market price: in parallel, a Claude web-search call returns four to eight Thai-market used listings, and a SerpAPI Google Shopping query is filtered by a Claude call returning the item IDs to keep. Results are combined and passed to `computeRepresentativeUsedPriceTHB`.
4. Representative price estimator (`lib/services/price-representative.ts`): a winsorized percentile-window estimator with two regimes selected by a dispersion score (IQR/median), not a plain median.
5. Loan principal: `principal = round(marketPrice x 0.6)` (a fixed 60 percent loan-to-value).
6. Condition blend: `0.6 x borrowerCondition + 0.4 x aiCondition`, normalized and clamped.
7. Final price: `round(principal x condition)`, clamped to at least 100 THB, then snapped to a multiple of 500.

### 8.3 Condition scoring pipeline (`/api/analyze-condition`)

- Agent 1, image precheck (Claude Haiku 4.5 vision): confirms the photos match the declared item type and are the same item; rejects mismatches with a 400.
- Agent 2, condition scoring (Gemini): scores on a fixed 100-point rubric (screen 35, body 30, buttons 20, camera 10, overall 5), returning a normalized score. Results at or below a floor are treated as unusable photos rather than genuine low scores.

This pipeline is the direct predecessor of, and integration point for, the future self-hosted model (Section 14).

### 8.4 Bank-slip OCR (`lib/services/slip-verification.ts`)

Primary path is the SlipOK API when configured; otherwise a Claude Haiku 4.5 vision fallback extracts the transfer amount and validity and returns a structured verdict (`MATCHED | UNDERPAID | OVERPAID | UNREADABLE | INVALID`).

---

## 9. Core Domain Workflows

### 9.1 Loan origination

1. The borrower completes the estimate flow (`/api/estimate`) and optionally an explicit condition analysis (`/api/analyze-condition`); a manual fallback (`/api/manual-estimate`) routes to an operator when the AI pipeline is insufficient.
2. The estimate feeds a negotiation request. The Store/Shop subsystem negotiates against it; the negotiated outcome is written to `item.confirmationNewContract` (the authoritative principal).
3. A loan request selects a delivery method (walk-in to a drop point, or door-to-door pickup) and a branch resolved by nearest-active-branch Haversine distance; pickups beyond 10 km are forced to walk-in.
4. A contract is created in both stores and routed to a drop point via `contracts.drop_point_id`.

### 9.2 Collateral custody (drop point)

- Intake verification (`/api/drop-points/verify`, PIN-gated): six boolean checks, at least one photo, a condition tolerance check, and a storage-box assignment. Approval marks `item_delivery_status = VERIFIED`, occupies a storage box, and pushes a payment-instruction card to the investor; rejection terminates the contract.
- Item-delivery state machine on `contracts.item_delivery_status`: `PENDING -> BORROWER_CONFIRMED -> IN_TRANSIT -> RECEIVED_AT_DROP_POINT -> VERIFIED | RETURNED` (the second state retains a legacy enum label in code; see Section 13).
- Door-to-door delivery has its own status machine and a delivery-fee slip verification step.

### 9.3 Lifecycle operations (redemption, extension, principal change)

These exist in two parallel mechanisms that must be kept consistent:

- The MongoDB notification collection — the customer-facing asynchronous flow. Created `pending` by `/api/customer/request-*`; advanced by the Shop System callback (`/api/webhooks/shop-notification`), the payment-proof upload, and verification, through the seven-state machine to `completed` or `failed`.
- The Supabase contract-action request/log tables — the investor-side flow (for example principal-increase approval), driven by the `/api/contract-actions/*` family.

### 9.4 Returns and settlement

- On redemption, the drop point confirms return (`/api/drop-points/returns/confirm`, PIN-gated): exactly two photos and a validated bag number; the redemption and contract are completed, investor interest is computed, and the storage box is released.
- If the borrower does not acknowledge receipt within 48 hours, the `auto-confirm-received` cron advances the state.

### 9.5 Identity verification (eKYC)

UPPASS is invoked per actor (`/api/ekyc/initiate` for borrowers, `/api/ekyc/initiate-invest` for investors). Results arrive via two webhooks (`/api/ekyc/webhook` and `/api/webhooks/uppass-invest`) and update `kyc_status`.

### 9.6 Scheduled processing

The ticket-generation queue and the redemption auto-confirmation run every five minutes as Vercel Cron functions (Section 4.3).

---

## 10. Security Architecture

### 10.1 Authentication and authorization

- End-user identity is the LINE `userId` obtained through LIFF login.
- Sensitive mutations across all three actor flows are gated by a six-digit PIN. PINs are bcrypt-hashed (cost 10) in the Supabase `user_security` table, keyed by `(role, line_id)`. A successful PIN check mints an opaque server-stored session token (`crypto.randomBytes(32)`, two-minute TTL) persisted on the security row; the client stores it in browser `sessionStorage` and returns it to protected APIs as a `pinToken` field in the request body (or multipart form field), never as a header or cookie. `requirePinToken()` is the server-side gate, guarding roughly fourteen mutation routes. Lockout escalates (three failures: one minute; five failures: thirty minutes) and recovery is by identity verification rather than the old PIN.

### 10.2 Inbound message authenticity

Signature verification is enforced per integration and is intentionally documented here because it is not uniform:

- LINE customer/store webhooks verify the HMAC but log-and-continue on mismatch (a debug posture that should be hardened for production).
- The alternate customer webhook and investor webhook reject with 401 on bad/missing signatures.
- The drop-point webhook performs no signature verification.
- eKYC webhooks treat verification as optional (accept when no signature header or secret is present).
- Shop System callbacks use a distinct scheme: HMAC-SHA256 (hex) over `notificationId-timestamp` with `WEBHOOK_SECRET` and a five-minute replay window.

### 10.3 Data-tier protection

- All Supabase access uses the service-role key server-side. The anonymous key is not used by any code path; Row-Level Security is enabled on all tables as a backstop. Because service role bypasses RLS, the real authorization boundary is the API layer (PIN tokens and signature checks), with RLS as a secondary control against credential leakage.
- S3 objects are private and exposed only through time-limited presigned URLs.

### 10.4 Secrets management

All credentials are Vercel environment variables, scoped per environment and encrypted at rest. Only `NEXT_PUBLIC_*` values reach the browser. Multiple provider keys (LLM and others) support rotation under rate limits.

### 10.5 Compliance considerations

The platform processes Thai PDPA-relevant personal and financial data (national ID, contact details, eKYC artifacts, bank slips). Data minimization, retention, and consent (a cookie/consent banner is present) must be governed, particularly for media that will seed the future training corpus.

---

## 11. Reliability, Scalability, and Performance

- Horizontal scale is provided automatically by Vercel Functions; there is no capacity to provision.
- Resilience to provider rate limits is built into the LLM clients via multi-key rotation and graceful degradation (the pricing pipeline falls back to a minimum price; slip verification falls back to UNREADABLE rather than failing hard).
- The estimate cache reduces both latency and LLM spend; cache keys are content-addressed by normalized inputs and image hashes.
- Idempotency: the customer webhook maintains an in-memory event-deduplication cache; the ticket queue bounds retries (failed after three attempts).
- Connection management: the MongoDB client, S3 client, and Redis client are module-level singletons reused across warm invocations to limit connection churn against managed databases.
- Cost and latency on the AI path are managed by model tiering (Sonnet for text reasoning, Haiku for high-volume vision) and by the cache.

---

## 12. Observability and Operations

- Runtime logs are emitted by Route Handlers and collected by Vercel's logging/observability (function logs, analytics). The pricing and assessment paths emit structured progress logs.
- Deployments are immutable with instant rollback; preview deployments provide per-change verification environments.
- Recommended additions: centralized structured logging and error tracking, an LLM-call audit trail (model, tokens, latency, fallback path), and synthetic checks on the cron endpoints and the estimate path.

---

## 13. Known Constraints and Technical Debt

- Dual mechanisms for the same business concept (the MongoDB notification collection versus the Supabase contract-action tables) require disciplined dual writes; divergence is a latent risk.
- Status vocabularies differ between stores (lowercase MongoDB versus uppercase Supabase) and are not interchangeable.
- The notification `contractId` field actually holds an item identifier; this naming is a footgun.
- Webhook signature handling is inconsistent across actors (Section 10.2).
- The ticket-queue cron's drain logic is in a POST handler while Vercel Cron issues GET; the effective behavior must be confirmed.
- The 60 percent loan-to-value and the 500 THB price snapping are fixed in code and mirrored in client UIs; changes must be coordinated.
- Some internal code identifiers, the persisted MongoDB database name, and a number of state-machine enum values retain legacy naming from an earlier product label; these are implementation details only and are scheduled for gradual normalization.
- No automated test suite exists; ESLint is relaxed (no failure on `any` or unused variables).

---

## 14. Future Phase: Self-Hosted Open-Source Condition-Assessment Model

### 14.1 Objective

Replace, or progressively displace, the third-party condition-scoring pipeline (currently Claude Haiku vision precheck plus Gemini scoring) with an in-house, open-source computer-vision model that ingests item photographs and outputs a structured condition assessment (an overall condition score plus rubric sub-scores and detected defects). Owning the model reduces per-inference cost and vendor dependence, removes per-request egress of sensitive media to third parties, and lets the assessment be tuned to the platform's actual collateral mix and to the downstream loan-pricing decision.

### 14.2 The data flywheel

The platform already generates the exact supervision signal required:

- Inputs: item photographs uploaded during the estimate and condition flows (stored in S3).
- Weak labels: the current AI condition scores and rubric sub-scores produced by the existing pipeline.
- Strong labels (ground truth): drop-point physical verification records. When a drop point inspects an item it records the six boolean attribute checks, an operator-assessed condition, and verification photographs. These human-verified, in-hand assessments are the gold standard against which the model is trained and evaluated.
- Outcome labels: downstream contract outcomes (redeemed versus defaulted/sold, realized resale value) provide an economic signal for calibrating condition to value.

This closes a continuous loop: every physical verification yields a new labeled example, enabling periodic retraining and active learning on the cases where the model and operators disagree.

### 14.3 Model architecture options

Two complementary tracks, both open-source and self-trainable:

1. Vision encoder plus multi-task heads (recommended primary).
   - Backbone: an open-source image encoder (for example a DINOv2 / SigLIP / EVA / ConvNeXt-class model) fine-tuned on the platform's imagery.
   - Heads: a regression head for the overall condition (0 to 1) and the rubric sub-scores (screen, body, buttons, camera, overall) to preserve compatibility with the existing contract; a multi-label defect-detection head; and an item-type classification head that subsumes the current precheck (does the photo match the declared type, is it the same item).
   - This track is compact, fast, cheap to serve, and directly produces the numeric outputs the pricing pipeline consumes.

2. Fine-tuned open vision-language model (secondary / explanatory).
   - An open VLM (for example a Qwen-VL / InternVL / LLaVA / PaliGemma-class model) fine-tuned to emit the same structured JSON the current pipeline returns, including a natural-language rationale and defect description.
   - Useful for explainability, operator-facing review, and handling free-form edge cases, at higher inference cost than track 1.

A staged approach uses track 1 in production for scoring and track 2 for auditing, explanation, and hard cases.

### 14.4 Training and MLOps infrastructure

GPU training and inference do not run on Vercel (Vercel Functions provide no GPUs). The recommended topology keeps Vercel as the product and orchestration front end and places ML compute on a dedicated GPU platform:

- Data pipeline: extract images and labels from S3 and Supabase into a versioned dataset (for example DVC or LakeFS), with PDPA-aware redaction (mask serial numbers and any bystander/PII content) and a documented dataset sheet.
- Labeling and curation: an operator review tool for confirming and correcting labels; active-learning queues prioritized by model-operator disagreement.
- Training: a managed GPU environment (for example Modal, RunPod, Lambda, or AWS SageMaker), with experiment tracking (Weights and Biases or MLflow), reproducible training configs, and scheduled retraining.
- Model registry: versioned artifacts with model cards (intended use, metrics, limitations, fairness across item categories).
- Inference serving: a GPU-backed inference service (for example Triton, vLLM/TGI for the VLM track, TorchServe, or BentoML) exposed as a private HTTPS endpoint. For elastic, scale-to-zero economics, a serverless GPU provider (for example Modal or Replicate) is appropriate given bursty traffic.

### 14.5 Integration with the existing system

The model is introduced behind the existing provider abstraction, exactly as Claude and Gemini are today. A new self-hosted condition provider is added alongside the current vision providers and selected by configuration (mirroring `PRICE_SEARCH_PROVIDER` and `ANTHROPIC_VISION_MODEL`). `/api/analyze-condition` calls the in-house inference endpoint and maps its output to the established condition contract consumed by `/api/estimate`. No change to the pricing mathematics or the downstream contract is required; only the source of `aiCondition` changes.

### 14.6 Rollout and governance

- Shadow mode: run the in-house model alongside the incumbent pipeline on live traffic, logging both outputs and their disagreement, with no effect on pricing.
- Canary and A/B: route a fraction of traffic to the in-house model; compare against drop-point ground truth on the money-gating metric (agreement on the condition that drives the loan amount), not aggregate accuracy.
- Promotion with fallback: make the in-house model primary while retaining an automatic fallback to the third-party pipeline on low confidence, timeout, or error.
- Governance: model cards and dataset documentation, periodic fairness/calibration review across item categories and image-quality bands, reproducible retraining, human-in-the-loop review for low-confidence or high-value items, and PDPA-compliant data handling throughout the training lifecycle.

### 14.7 Target-state placement

In the target state, Vercel continues to host the entire product surface (LIFF apps, APIs, webhooks, crons, edge security, domains, TLS) and orchestrates inference, while the self-hosted condition model runs on a dedicated GPU inference plane reached over a private HTTPS contract. The two planes are connected only by that contract, preserving the serverless, provider-abstracted design of the existing system.

---

## 15. Appendices

### 15.1 Environment variable inventory (by domain)

- Platform/runtime: `VERCEL_URL`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DOMAIN`, `CRON_SECRET`.
- Datastores: `MONGODB_URI`, `MONGODB_DB`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`.
- Object storage: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_S3_FOLDER`.
- LINE (customer): `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `CHANNEL_ACCESS_TOKEN`, `CHANNEL_SECRET`, `NEXT_PUBLIC_LIFF_ID*`, `RICH_MENU_ID_MEMBER`.
- LINE (admin): `LINE_ADMIN_CHANNEL_ACCESS_TOKEN`, `LINE_ADMIN_CHANNEL_SECRET`, `LINE_ADMIN_TARGET_IDS`.
- LINE (store): `LINE_STORE_CHANNEL_ACCESS_TOKEN`, `LINE_STORE_CHANNEL_SECRET`.
- LINE (investor): `LINE_CHANNEL_ACCESS_TOKEN_INVEST`, `LINE_CHANNEL_SECRET_INVEST`.
- LINE (drop point): `LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT`, `LINE_CHANNEL_SECRET_DROPPOINT`.
- AI / LLM: `ANTHROPIC_API_KEY(_2/_3/_4)`, `ANTHROPIC_MODEL`, `ANTHROPIC_VISION_MODEL`, `OPENAI_API_KEY(_2/_3/_4)`, `GEMINI_API_KEY(_2/_3/_4)`, `PRICE_SEARCH_PROVIDER`, `PRICE_SEARCH_MODEL`, `PRICE_SEARCH_ENABLE_WEB_FETCH`.
- Pricing/search: `SERPAPI_ENABLED`, `SERPAPI_API_KEY`, `SERPAPI_EXCHANGE_RATE_THB_PER_USD`, `ESTIMATE_CACHE_TTL_SECONDS`, `ESTIMATE_IMAGE_HASH_CACHE_TTL_SECONDS`.
- eKYC: `UPPASS_API_URL`, `UPPASS_API_KEY`, `UPPASS_FORM_SLUG`, `UPPASS_WEBHOOK_SECRET`, and the `*_INVEST` equivalents.
- Slip verification: `SLIPOK_API_URL`, `SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`, `SLIPOK_PASSWORD`.
- Shop System: `SHOP_SYSTEM_URL`, `WEBHOOK_SECRET`.
- Feature flags: `MANUAL_ESTIMATE_ENABLED`, `NEXT_PUBLIC_LIFF_MOCK`, `NEXT_PUBLIC_DROPPOINT_MOCK`.

### 15.2 Inbound webhook surface

`/api/webhook` (customer), `/api/line/webhook` (alternate customer), `/api/webhook-store` (store), `/api/webhook-droppoint` (drop point), `/api/webhooks/shop-notification` (Shop System callbacks; drives the notification state machine), `/api/webhooks/line-invest` (investor), `/api/ekyc/webhook` (borrower eKYC), `/api/webhooks/uppass-invest` (investor eKYC).

### 15.3 Glossary

- ราคากลาง (raka klang): representative market reference price.
- ราคาจำนำ (raka chamnam): loan principal.
- LIFF: LINE Front-end Framework (in-LINE mini-app runtime).
- OA: LINE Official Account.
- LTV: loan-to-value ratio (fixed at 60 percent).
- Drop point: a physical receiving and return branch holding collateral custody.
- Service role: the privileged Supabase credential that bypasses Row-Level Security.
- Collateral: the borrower's pledged item securing the loan.
