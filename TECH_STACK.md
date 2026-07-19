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
| Web framework | Next.js (App Router) | ^16.0.7 | Frontend + API routes in one project |
| UI runtime | React / React DOM | 19.1.0 (pinned) | Latest major |
| Styling | Tailwind CSS v4 | ^4 | CSS-first config (no `tailwind.config.js`) |
| Server runtime | Node.js (Vercel Functions) | Node 20+ on Vercel | Serverless; not Edge runtime |
| Primary DB client | `@supabase/supabase-js` | ^2.86.0 | PostgreSQL via PostgREST, service role |
| Operational DB driver | `mongodb` | ^6.20.0 | Native MongoDB driver |
| Cache client | `@upstash/redis` | ^1.36.3 | REST-based Redis |
| Object storage | `@vercel/blob` | ^2.6.1 | Private Vercel Blob storage + signed URLs |
| AI - primary | Anthropic Claude | direct REST (no SDK) | Text + vision |
| AI - vision scoring | `@google/generative-ai` | ^0.24.1 | Gemini |
| AI - optional | `openai` | `latest` (unpinned) | Alternate web-search provider |
| Channel | `@line/bot-sdk`, `@line/liff` | ^10.3.0 / ^2.27.2 | Messaging + mini-app |
| Document rendering | `puppeteer` + `@sparticuz/chromium` | ^24.25.0 / ^141.0.0 | Serverless headless Chrome |
| Auth | `bcrypt` + Node `crypto` | ^6.0.0 | PIN hashing + tokens |
| Package manager | npm | `package-lock.json` | Single lockfile |
| Build tooling | Turbopack (dev), `next build` (prod), `tsx` | - | - |
| Linting | ESLint 9 + `eslint-config-next` | ^9 / ^16.0.7 | Flat config, relaxed rules |
| Automated tests | None | - | No test framework in manifest (see Section 17) |

Headline: a modern, current-generation TypeScript stack (Next.js 16, React 19, Tailwind v4, Node 20+) with no legacy framework debt, deployed serverless, integrating best-in-class managed services for data, storage, messaging, and AI.

---

## 2. Languages, Runtime, and Package Management

- Primary language: TypeScript (`typescript` ^5), compiled to ES2017 target with `module: esnext`, `moduleResolution: bundler`, `strict: true`, and `jsx: react-jsx`. Path alias `@/*` maps to the project root.
- Secondary languages: SQL (PostgreSQL DDL/DML, captured in `DATABASE_CHANGES.sql` / `database.sql`); JSX/TSX for React components; CSS (Tailwind v4 utility layer).
- Runtime: Node.js on Vercel Functions (Node 20+ on the platform; the local development environment observed is Node 24). No `engines` field is declared in `package.json` (see Section 17). The application uses the Node.js runtime, not the Edge runtime, because of Node-only dependencies (MongoDB driver, Puppeteer/Chromium, bcrypt).
- Package management: npm, with a committed `package-lock.json` as the reproducibility source of truth. A single lockfile per app; note the repository's nested-directory layout is documented in the project guide.

---

## 3. Application Framework and Frontend

| Package | Version | Role |
|---|---|---|
| `next` | ^16.0.7 | Full-stack framework (App Router): server-rendered pages, Route Handlers (API), middleware-free routing, image handling, build pipeline |
| `react` | 19.1.0 | UI component runtime |
| `react-dom` | 19.1.0 | DOM renderer |
| `tailwindcss` | ^4 | Utility-first CSS (v4, configured via PostCSS plugin and CSS, no JS config file) |
| `@tailwindcss/postcss` | ^4.2.2 | Tailwind v4 PostCSS integration |
| `lucide-react` | ^0.555.0 | Icon set used across the LIFF UIs |

The frontend is delivered as a set of LINE LIFF mini-apps (one route tree per actor), all within this single Next.js project. Actor theming is implemented with CSS custom properties and per-route layout wrappers.

---

## 4. Backend and Server Runtime

The backend is implemented as Next.js Route Handlers (~115 API endpoints) running as Vercel Functions on the Node.js runtime. There is no separate backend framework (no Express/Nest/Fastify); the Next.js Route Handler model is the server framework. Cross-cutting server logic lives in `lib/` modules (database access, LINE clients, security, pricing, AI client, Blob storage). Background processing runs as two Vercel Cron jobs declared in `vercel.json`.

---

## 5. Data and Storage Clients

| Package | Version | Role |
|---|---|---|
| `@supabase/supabase-js` | ^2.86.0 | PostgreSQL access (investor/finance/logistics store) via the service-role key; PostgREST + realtime-capable client |
| `mongodb` | ^6.20.0 | Native MongoDB driver for the customer-facing operational store; client cached across warm invocations |
| `@upstash/redis` | ^1.36.3 | REST client for the estimate-response and image-hash cache (Vercel KV / Upstash) |
| `@vercel/blob` | ^2.6.1 | Private object storage for images, contracts, tickets, QR codes, and time-limited signed read URLs |

The platform runs a deliberate dual datastore (PostgreSQL via Supabase + MongoDB Atlas), described in `SYSTEM_ARCHITECTURE.md`. All database access is server-side with privileged credentials.

---

## 6. AI / ML Integration

| Provider | Integration | Version | Role |
|---|---|---|---|
| Anthropic Claude | Direct REST to the Messages API (`lib/services/anthropic-llm.ts`) - no SDK dependency | n/a (native `fetch`) | Primary LLM: input normalization, search-result filtering, web-search pricing (Sonnet 4.6); image precheck and bank-slip OCR (Haiku 4.5). Four-key rotation, structured output via tool-use |
| Google Gemini | `@google/generative-ai` SDK | ^0.24.1 | Item-condition image scoring (Gemini Flash); four-key rotation |
| OpenAI | `openai` SDK | `latest` (unpinned) | Optional alternate web-search price provider (text only), selected by configuration |

Architecturally significant point for diligence: the primary AI provider (Anthropic) is integrated via a direct, dependency-free REST client rather than a vendor SDK. This was a deliberate choice for build stability and version control and means the Anthropic integration adds no third-party SDK to the supply chain. All AI access is mediated by thin provider abstractions, enabling model/vendor substitution (and a future in-house model) by configuration.

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
| Node `crypto` (built-in) | runtime | Opaque PIN-session token generation (`randomBytes`) and HMAC signature verification for inbound webhooks |
| `@types/bcrypt` | ^6.0.0 | Type definitions for bcrypt |

Authentication and webhook-signature logic is custom and lives in `lib/security/` (PIN, PIN session, LINE signature, webhook signature). End-user identity is delegated to LINE Login via LIFF; there is no separate user-credential framework (no NextAuth/Passport).

---

## 10. HTTP, Utilities, and UI

| Package | Version | Role |
|---|---|---|
| `axios` | ^1.12.2 | HTTP client for several outbound third-party calls (alongside native `fetch` used elsewhere, e.g. the Anthropic and Shop System integrations) |
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
| `next.config.ts` | Next.js config (currently minimal/default) |
| `eslint.config.mjs` | ESLint flat config; relaxes `no-explicit-any` (off), `no-require-imports` (off), and downgrades `no-unused-vars` and `no-img-element` to warnings |
| `postcss.config.mjs` | PostCSS pipeline (Tailwind v4 plugin) |
| `vercel.json` | Deployment config: two cron jobs at 5-minute cadence |
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
| Messaging / identity | LINE (Messaging API + LIFF) | Channels and mini-app auth |
| AI - text | Anthropic Claude | Pricing pipeline reasoning |
| AI - vision | Anthropic Claude (Haiku) + Google Gemini | Condition image analysis, slip OCR |
| AI - optional search | OpenAI | Alternate web-search pricing |
| Price data | SerpAPI | Google Shopping price candidates |
| eKYC | UPPASS | Identity verification |
| Slip verification | SlipOK | Bank-transfer slip validation |
| Adjacent system | Shop System (separate Vercel app) | Negotiation and payment verification (signed HTTP) |

---

## 14. Full Dependency Manifest

Production dependencies (23):

| Package | Version | Category | Role |
|---|---|---|---|
| `next` | ^16.0.7 | Framework | Full-stack web framework |
| `react` | 19.1.0 | Frontend | UI runtime |
| `react-dom` | 19.1.0 | Frontend | DOM renderer |
| `tailwindcss` | ^4 | Styling | Utility CSS |
| `@tailwindcss/postcss` | ^4.2.2 | Styling | Tailwind PostCSS plugin (listed under devDependencies) |
| `lucide-react` | ^0.555.0 | UI | Icons |
| `@supabase/supabase-js` | ^2.86.0 | Data | PostgreSQL client |
| `mongodb` | ^6.20.0 | Data | MongoDB driver |
| `@upstash/redis` | ^1.36.3 | Data | Redis cache client |
| `@vercel/blob` | ^2.6.1 | Storage | Private Blob uploads, reads, and signed URLs |
| `@google/generative-ai` | ^0.24.1 | AI | Gemini SDK |
| `openai` | `latest` | AI | OpenAI SDK (unpinned) |
| `@line/bot-sdk` | ^10.3.0 | Messaging | LINE Messaging API |
| `@line/liff` | ^2.27.2 | Messaging | LINE LIFF SDK |
| `puppeteer` | ^24.25.0 | Media | Headless Chromium |
| `@sparticuz/chromium` | ^141.0.0 | Media | Serverless Chromium binary |
| `html2canvas` | ^1.4.1 | Media | DOM-to-canvas |
| `qrcode` | ^1.5.4 | Media | QR generation |
| `react-signature-canvas` | ^1.1.0-alpha.2 | Media | Signature capture (alpha) |
| `browser-image-compression` | ^2.0.2 | Media | Client image compression |
| `bcrypt` | ^6.0.0 | Security | PIN hashing |
| `axios` | ^1.12.2 | Utility | HTTP client |
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
- Provider-abstracted AI: a thin internal abstraction over Anthropic (REST), Gemini (SDK), and OpenAI (SDK), enabling model/vendor swaps and the future in-house model via configuration.
- Anthropic via REST, intentionally: the primary AI vendor adds no SDK to the supply chain.
- Dual datastore by design: PostgreSQL (Supabase) and MongoDB (Atlas) used together, each as a system of record for its domain.
- Custom, lightweight auth: LINE Login for identity plus a custom bcrypt PIN and HMAC webhook-signature layer - no heavy auth framework.
- Modern versions: Next 16, React 19, Tailwind v4, TypeScript 5, Node 20+ - a current-generation stack with no legacy framework debt.
- Tailwind v4 CSS-first config: no `tailwind.config.js`; theme tokens are expressed in CSS.

---

## 17. Stack Observations and Risks for Due Diligence

Presented transparently; none are architecturally serious, and each has a low-effort remediation.

| # | Observation | Severity | Remediation |
|---|---|---|---|
| 1 | `openai` is pinned to `latest` (unpinned) | Medium | Pin to an exact/caret version for reproducible builds and to avoid silent breaking changes; the lockfile mitigates but the manifest should be explicit |
| 2 | `react-signature-canvas` is a pre-release (`1.1.0-alpha.2`) in a production signing flow | Medium | Evaluate stability; pin exactly; have a fallback signature component |
| 3 | No automated test framework in the manifest | Medium | Add Vitest/Jest + Playwright with CI coverage for pricing, calculations, and state machines (also flagged in the scalability plan) |
| 4 | No `engines` field (Node version not pinned in `package.json`) | Low | Declare `engines.node` to pin the Node major version for reproducibility across Vercel and local |
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
| Unpinned (`latest`) | `openai` | Non-deterministic across fresh installs; should be pinned |
| Pre-release | `react-signature-canvas` (alpha) | Stability risk; should be evaluated/pinned |

Definitive bill of materials: the committed `package-lock.json` resolves all of the above to exact versions and integrity hashes and is the authoritative artifact for a precise dependency audit. All version figures here reflect the manifest as of writing and should be reconciled against the lockfile at diligence time.
