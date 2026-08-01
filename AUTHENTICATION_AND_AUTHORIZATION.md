# Astly - Authentication and Authorization

Status: Living document, prepared for investor technical due diligence
Scope: Every authentication and authorization mechanism in the platform - end-user identity, step-up PIN authentication, machine-to-machine (webhook and cron) authentication, and data-tier authorization - with the libraries used, exact verification logic, and an honest hardening backlog. Facts are verified against the current code with file references.
Companion documents: [`DATA_SECURITY.md`](DATA_SECURITY.md), [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md), [`THIRD_PARTY_INTEGRATIONS.md`](THIRD_PARTY_INTEGRATIONS.md).

> Naming note: some internal role and table identifiers retain legacy names from an earlier product label; this document uses the functional names (borrower / investor / drop-point) and avoids quoting the legacy literals. They are implementation details scheduled for normalization and do not affect the security behavior described here.

---

## Table of Contents

1. Summary at a Glance
2. Frameworks and Libraries
3. End-User Identity (LINE Login via LIFF)
4. Step-Up Authentication (PIN)
5. Authorization Model
6. Machine-to-Machine Authentication (Webhooks and Cron)
7. Session Management and Lifecycle
8. Security Posture and Hardening Backlog
9. Risk Register and DD Checklist
10. Appendix - Endpoint and Credential Map

---

## 1. Summary at a Glance

Astly uses a custom, lightweight authentication and authorization design rather than an off-the-shelf auth framework. There are four distinct layers:

| Layer | Mechanism | Purpose |
|---|---|---|
| End-user identity | LINE Login via LIFF, with the ID token **verified server-side against LINE** per actor role | Establishes who the user is; the verified token subject - not a client-supplied `lineId` - is the actor identity |
| Step-up authentication | Six-digit PIN (bcrypt) + opaque server session token | Re-authenticates the user for sensitive, money-moving mutations |
| Authorization | `requirePinToken` server gate + per-route application checks + actor segmentation | Decides what an authenticated actor may do |
| Machine-to-machine | HMAC webhook signatures + cron bearer secret | Authenticates inbound callbacks from LINE, the Shop System, UPPASS, and scheduled jobs |
| Data tier | Supabase service-role, MongoDB connection credential, Vercel Blob read/write token + signed URLs | Authorizes backend access to data stores |

Key design facts: there is no password database (identity is delegated to LINE); the LINE ID token is verified server-side against LINE on every protected route, so identity is not client-asserted; sensitive actions additionally require a PIN re-auth with a deliberately short 2-minute token; and all database access is server-side with privileged credentials, which makes the API layer - not database row-level security - the true authorization boundary. The honest implications of that design are detailed in Sections 8 and 9.

There is also a fifth, less obvious layer worth naming for a financial reviewer: **value integrity**. Authenticating the caller is not sufficient when the caller can edit the numbers a legitimate session produced, so AI-derived valuations, confidence scores and condition scores are cryptographically bound to the server that computed them (`DATA_SECURITY.md` Section 6.1).

---

## 2. Frameworks and Libraries

There is intentionally no heavyweight auth framework. Verified: `package.json` contains no `next-auth`, `@auth/*`, `passport`, `jsonwebtoken`, `jose`, `express-session`, or `iron-session`; the only auth-related dependency is `bcrypt`. Authentication is bespoke.

| Library | Role |
|---|---|
| `@line/liff` | Client-side LINE login: `liff.init`, `liff.isLoggedIn`, `liff.getProfile` (yields the user id), `liff.login` redirect. Initialized in exactly one place (`lib/liff/liff-provider.tsx`). |
| `bcrypt` (cost 10) | One-way hashing and verification of the six-digit PIN (`lib/security/pin.ts`). |
| `node:crypto` | Opaque PIN session token generation (`randomBytes(32).toString('hex')`) and all HMAC signature computation for webhooks. |
| `@supabase/supabase-js` (service role) | Persists PIN/auth state in the `user_security` table and resolves role identity; all access is server-side with the service-role key. |
| Browser `sessionStorage` | Client-side store for the issued PIN session token, evicted on expiry (`lib/security/pin-session.ts`). |
| Next.js App Router (`next/server`) | Hosts all auth route handlers and webhook endpoints. |
| `@line/bot-sdk` | LINE webhook event typing and messaging (signature verification is hand-rolled, not via the SDK middleware). |

---

## 3. End-User Identity (LINE Login via LIFF)

- Single initialization point: `LiffProvider` (`lib/liff/liff-provider.tsx`) is the only place `liff.init({ liffId })` runs, keyed to a per-feature LIFF id. It exposes `useLiff() -> { liffObject, isLoggedIn, profile, error, isLoading }` to all pages.
- Login flow: after init, if `liff.isLoggedIn()` is true the provider calls `liff.getProfile()` and stores the profile; otherwise it calls `liff.login()` to redirect the user to LINE login.
- Identity propagation: the LINE user id is read as `profile.userId` and sent to backend routes under the field name `lineId`. This `lineId` is the actor identity used throughout the API.
- Development bypass: when `NEXT_PUBLIC_LIFF_MOCK === 'true'` (or, for drop-point pages, `NEXT_PUBLIC_DROPPOINT_MOCK === 'true'` or a `?mock=1` query parameter), the provider short-circuits real LINE auth and injects a hard-coded mock profile (`userId: 'Umock_dev_user_001'`). This is a development convenience and must never be enabled in a production build (Section 8).

### 3.1 Server-side LINE ID-token verification (implemented)

The platform previously trusted the `lineId` supplied in the request body as the actor identity. **That is no longer the case.** `lib/security/liff-auth.ts` now verifies a LINE ID token server-side on every protected route:

- the client sends the LIFF ID token in the `Authorization` header (attached centrally by `lib/liff/auth-header.ts`, so callers cannot forget it);
- the server posts the token to LINE's own endpoint `https://api.line.me/oauth2/v2.1/verify` with the **role-specific** Login channel id, so a token minted for the borrower channel cannot authorize an investor or drop-point action;
- issuer, audience (single or array), subject and expiry are all validated; the resolved subject becomes the actor identity;
- a `lineId` present in the body or query string is treated as a *claim*, not as identity - it is compared to the verified subject and a mismatch is a `403`, not a silent accept;
- verification results are cached in Redis for at most the token's remaining lifetime (capped at 300 s) keyed by a digest of the token, so the LINE round-trip does not become a per-request latency or availability tax;
- the roles are `PAWNER`, `INVESTOR`, `STORE`, `DROP_POINT` and `ADMIN`, each bound to its own `LINE_LOGIN_CHANNEL_ID*` environment variable; `ADMIN` additionally requires membership of the explicit `ADMIN_LINE_IDS` allowlist.

This gate is applied across roughly 56 route files, including every AI-job enqueue/poll/cancel route, the eKYC initiation and status routes, contract and item reads, registration/profile updates, and the financial mutation routes (which additionally require the PIN step-up in Section 4).

Honest characterization for diligence: identity is now server-verified, so an attacker cannot assume another user by editing a request body. The remaining caveat is the development bypass above - `NEXT_PUBLIC_LIFF_MOCK` must be `false` in production, which the production preflight script enforces as a hard gate.

---

## 4. Step-Up Authentication (PIN)

Sensitive, money-moving mutations require a six-digit PIN in addition to LINE identity. The subsystem lives in `lib/security/pin.ts` (+ `pin-session.ts`) and is Supabase-only.

### 4.1 Storage and roles

- Table: a single Supabase `user_security` table, keyed on the `(role, line_id)` pair (primary key `security_id`). No PIN data is stored in MongoDB.
- PIN format and hashing: validated as exactly six digits (`/^[0-9]{6}$/`) and stored only as a bcrypt hash at cost factor 10 (`pin_hash`); verification is `bcrypt.compare`. The PIN is never stored or logged in plaintext.
- Columns: `security_id`, `role`, `line_id`, `pin_hash`, `failed_attempts`, `locked_until`, `pin_session_token`, `pin_session_expires_at`, `pin_updated_at`, `created_at`, `updated_at`.
- Roles: three - borrower, investor, drop-point. Identity per role is resolved from the corresponding Supabase tables (borrower table, `investors`, `drop_points`), matched by `line_id`.

### 4.2 Session token

- On a successful setup, verify, or reset, the server issues an opaque token via `crypto.randomBytes(32).toString('hex')` (256-bit, 64 hex chars) and persists it on the `user_security` row with an expiry.
- TTL: `TOKEN_TTL_MS = 2 minutes`.
- Client handling: the token (with its `expiresAt`) is stored in browser `sessionStorage` under `pin_session:{role}:{lineId}` and returned to protected APIs as a `pinToken` field in the request body (or a multipart form field) - never as a header or cookie. The client evicts the entry on read once expired.

### 4.3 Endpoints (all POST under `app/api/pin/`)

| Endpoint | Body | Success | Notable behavior |
|---|---|---|---|
| `/setup` | `{role, lineId, pin}` | `{success, pinToken, expiresAt}` | 409 `{pinAlreadySet:true}` if a PIN already exists (cannot overwrite); 400 on invalid PIN; 400 `{registered:false}` if identity not found |
| `/verify` | `{role, lineId, pin}` | `{success, pinToken, expiresAt}` | 401 `{pinInvalid, failedAttempts, lockedUntil}` on wrong PIN (increments attempts); 403 `{pinLocked}` when locked; 403 `{pinRequired}` when no PIN set |
| `/status` | `{role, lineId}` | `{pinSet, failedAttempts, locked, lockedUntil, lockRemainingSeconds, pinUpdatedAt}` | Used by the modal to pick verify-vs-setup; returns 200 with `{registered:false}` if identity not found; requires no token to call |
| `/reset` | `{role, lineId, pin, phoneNumber?, nationalId?, dropPointCode?}` | `{success, pinToken, expiresAt}` | Identity-based recovery without the old PIN: borrower/investor need phone + national ID; drop-point needs phone + drop-point code; clears lockout |

### 4.4 Lockout

- Rule (`LOCK_RULES`, evaluated highest-first): `failed_attempts >= 5 -> 30-minute lock`; `>= 3 -> 1-minute lock`; `< 3 -> no lock`.
- Reset: any successful verify/setup/reset clears `failed_attempts` and `locked_until`; an expired lock auto-clears lazily on the next access.
- No hard cap: locks re-arm on each further failure (no permanent ban). A locked user can also recover immediately via `/reset` (identity-based) - a usability choice with a security trade-off noted in Section 8.

### 4.5 Server gate - `requirePinToken`

The authorization gate `requirePinToken(role, lineId, pinToken)` performs, in order: (1) token present; (2) identity exists; (3) a PIN is set; (4) not currently locked; (5) the token matches the stored `pin_session_token`; (6) the token is not expired. Each failure returns a `403` with a discriminating flag (`pinRequired`, `pinSetupRequired`, or `pinLocked`); success returns `{ok:true}`.

### 4.6 Client gate-then-modal pattern

Pages call `getPinSession(role, lineId)` first; if a live token exists they run the action immediately, otherwise they stash the pending action and open the shared `PinModal`, which auto-selects verify-vs-setup via `/api/pin/status`, captures the PIN (and recovery details for reset), and on success persists the session and invokes the pending action with the new token. Net effect: the user is re-prompted only after the ~2-minute token TTL lapses.

---

## 5. Authorization Model

Authorization is enforced in the application layer, in three complementary ways.

### 5.1 PIN-token gate on sensitive mutations

`requirePinToken` guards the money-moving and custody mutations - 10 route handlers (verified):

- Borrower flow: `contracts/create`, `contracts/request-action`, `contract-actions/complete`, and `customer/request-{redemption, extension, increase-principal, reduce-principal}`.
- Investor flow: `contracts/investor-action`.
- Drop-point flow: `drop-points/verify`, `drop-points/returns/confirm`.

### 5.2 Per-route application checks

Beyond the PIN gate, route handlers enforce identity- and ownership-based authorization in code - for example matching the requesting `lineId` to the resource owner, and (for drop-point operations) matching `contract.drop_point_id` to the operator's `drop_points.line_id`. Actor segmentation (borrower / investor / drop-point, reflected in the PIN role and the per-actor LINE channels) further constrains who can perform which operation.

### 5.3 Data-tier authorization (and why the API layer is the real boundary)

- Supabase: all access uses the service-role key from server-side functions (`lib/supabase/client.ts` exports only `supabaseAdmin()`); there is no anonymous client (it was removed and is referenced nowhere; 73 files import only `supabaseAdmin`). Because the service role bypasses Row-Level Security, RLS is not the enforcing boundary for application traffic - the per-route application code is. RLS, if enabled in the Supabase project, is a defense-in-depth backstop against use of the public anonymous key (which the app does not use). Note: the in-repo SQL migrations do not contain `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` statements, so the RLS posture lives in the Supabase dashboard and should be confirmed and version-controlled.
- MongoDB: authorized solely by the credentials in `MONGODB_URI`; a single cached connection is shared across requests; there is no per-row/per-tenant authorization - application code is the only guard.
- Vercel Blob: authorized by the project read/write token; objects are private and served via operation- and pathname-scoped signed URLs. (The default signed-URL lifetime in code is 7 days - a long window flagged in Section 8.)

The consistent theme: a small number of high-privilege backend credentials sit behind the trusted compute tier, and the correctness of per-route application checks is what enforces tenant isolation. This is a common and workable serverless pattern, but it concentrates responsibility in the application layer - which is why the hardening backlog emphasizes consistent server-side checks and tests.

---

## 6. Machine-to-Machine Authentication (Webhooks and Cron)

Inbound callbacks and scheduled jobs authenticate by HMAC signature, provider Basic Auth, or a shared secret. Enforcement was previously inconsistent; it has been standardized so that **every** inbound machine endpoint now rejects rather than fails open.

### 6.1 LINE webhook signatures

- Scheme: HMAC-SHA256 over the raw request body, keyed by the channel secret, base64-encoded, compared to the `x-line-signature` header.
- All LINE webhook routes now share the single canonical implementation `verifyLineSignatureWithSecret` in `lib/security/line.ts`, which uses a constant-time comparison and takes the channel secret explicitly so each Official Account verifies with its **own** secret rather than the customer channel's.
- A missing header, a missing configured secret, or a mismatch is a `401`. There is no log-and-continue path and no shared-channel fallback (`LINE_STORE_ALLOW_SHARED_CHANNEL` must be `false` in production).

### 6.2 Per-endpoint enforcement matrix (verified in code, August 2026)

| Endpoint | Mechanism | On failure | Status |
|---|---|---|---|
| `/api/webhook` (customer OA) | LINE HMAC, own channel secret | `401` | Enforced |
| `/api/webhook-store` (store OA) | LINE HMAC, store channel secret | `401` | Enforced |
| `/api/webhook-droppoint` (drop-point OA) | LINE HMAC, drop-point channel secret | `401` | Enforced |
| `/api/webhooks/line-invest` (investor OA) | LINE HMAC, investor channel secret | `401` | Enforced |
| `/api/webhooks/shop-notification` (Shop System) | HMAC + replay window | `401` | Enforced |
| `/api/ekyc/webhook` (UPPASS borrower) | Role-scoped **Basic Auth**, constant-time | `401`; `503` when unconfigured | Enforced, fail-closed |
| `/api/webhooks/uppass-invest` (UPPASS investor) | Role-scoped **Basic Auth**, constant-time | `401`; `503` when unconfigured | Enforced, fail-closed |
| `/api/line/webhook` (legacy alternate customer) | Retired - the legacy path is no longer a second, weaker entry point | n/a | Consolidated |
| `/api/queues/*` (queue consumers) | Air-gapped: invocable only by Vercel's internal queue infrastructure via `handleCallback` | n/a | Platform-enforced |

The key change for a DD reader: previously two eKYC endpoints **accepted unsigned requests** and three LINE endpoints processed on signature mismatch. Both classes are now closed. Absent configuration produces `503` (service unavailable), never an accept - a missing environment variable can no longer be mistaken for permission.

### 6.3 Shop System scheme

HMAC-SHA256 over the request body, keyed by `WEBHOOK_SECRET`, compared with `crypto.timingSafeEqual`, plus a replay window on the timestamp. `SHOP_WEBHOOK_SIGNATURE_MODE=body-hmac-v2` binds the **full payload** rather than only the id and timestamp; the previous id-and-timestamp scheme survives only behind an explicit `SHOP_WEBHOOK_ALLOW_LEGACY_HMAC` flag, which the production preflight requires to be `false`. The committed hard-coded fallback secret has been removed - an unset `WEBHOOK_SECRET` now fails closed.

### 6.4 Cron and internal-job authentication

- All cron handlers go through `requireInternalRequest(request, ['CRON_SECRET'])`, which requires a bearer secret and fails closed when unset. This covers `/api/redemptions/auto-confirm-received`, `/api/contracts/process-ticket-queue`, and the one-minute `/api/ekyc/reconcile` inbox/outbox reconciler.
- `/api/contracts/process-ticket-queue` previously exposed an unauthenticated POST that could be invoked publicly, and its GET/POST split meant the cron never actually drained the queue. Both are fixed: the handler is authenticated and the cron path performs the drain, with the same secret usable for an authenticated manual replay.
- The AI job workers additionally require `JOB_WORKER_SECRET`, and internal service-to-service calls require `INTERNAL_API_SECRET`. Preflight enforces a minimum length of 32 characters on each and rejects placeholder values.

---

## 7. Session Management and Lifecycle

- No JWT / no standard session library: the PIN session is a random opaque value with no embedded claims, validated server-side against the stored token and expiry on every protected call.
- Short TTL: 2 minutes server-side; the client copy in `sessionStorage` mirrors the same `expiresAt` and self-evicts on read.
- Server-authoritative: even a tampered or stale client token cannot pass `requirePinToken`, which checks the stored value and expiry.
- Logout/eviction: `clearPinSession` removes the client token; server tokens simply expire (2 minutes) and are overwritten on the next issuance.
- LINE session: identity itself is governed by LINE's LIFF session (24-hour LINE login behavior), independent of the PIN token.

---

## 8. Security Posture and Hardening Backlog

Presented transparently, with the resolved items retained so a reviewer can see both the original finding and its remediation. Each status is verified against the code as of August 2026.

### 8.1 Closed findings

| # | Original finding | Severity | Resolution |
|---|---|---|---|
| A1 | Several webhooks did not enforce signatures (`/api/webhook`, `/api/webhook-store` log-and-continue) | High | **Closed.** All LINE webhooks reject `401` on missing or invalid signature, using one canonical constant-time implementation and each channel's own secret |
| A2 | `/api/webhook-droppoint` performed no verification yet could drive redemption state | High | **Closed.** Verifies the drop-point channel signature before any state mutation |
| A3 | eKYC webhooks failed open - omitting the signature header could flip `kyc_status` to `VERIFIED` by `uppass_slug` | High | **Closed.** Role-scoped Basic Auth with constant-time comparison; missing configuration returns `503`, never an accept. The status machine is additionally monotonic, so even a valid event cannot re-open a terminal state |
| A4 | `lineId` was client-supplied and trusted as the actor identity | High | **Closed.** LINE ID tokens are verified server-side against LINE with the role-specific channel id across ~56 routes (Section 3.1); a claimed `lineId` that differs from the verified subject is a `403` |
| A5 | `process-ticket-queue` had no auth and its drain ran on POST while the cron fired GET | Medium-High | **Closed.** `requireInternalRequest(['CRON_SECRET'])` on the handler and the cron path performs the drain |
| A6 | Committed hard-coded fallback webhook secret; LINE secret fell back to an empty string | Medium-High | **Closed.** Fallbacks removed; unset secrets fail closed and preflight rejects short/placeholder values |
| A7 | Shop System signature covered only id+timestamp, not the payload | Medium | **Closed.** `SHOP_WEBHOOK_SIGNATURE_MODE=body-hmac-v2` signs the full body; the legacy scheme requires an explicit flag that preflight forces to `false` |
| A8 | PIN `/reset` bypassed lockout with no rate limit | Medium | **Closed.** `/reset` now requires a verified LIFF identity for the same subject and is rate-limited to 5 attempts/hour. Adding an OTP factor remains a roadmap improvement |
| A9 | Open `/api/pin/status` allowed enumeration of registered users | Medium | **Closed.** All PIN routes require a verified LIFF identity bound to the requested `(role, lineId)` |
| A12 | Dev mock bypass gated only by a build-time flag | Medium | **Mitigated.** `NEXT_PUBLIC_LIFF_MOCK` and `NEXT_PUBLIC_DROPPOINT_MOCK` must be `false` for the production preflight to pass, and the server-side job/identity gate ignores mock mode outside development |

Two controls were added that had no prior finding but materially change the authorization story:

- **Job and resource ownership.** AI jobs, contracts, items, drop-point records and profile reads resolve ownership from the database against the verified LINE subject. A user polling or cancelling another user's job receives `403`. This closes a class of IDOR that existed on several read routes (`/api/pawners/check`, `/api/investors/check` and the contract/drop-point readers).
- **Value integrity.** An authenticated user can no longer alter an AI valuation, confidence score or condition score between computation and loan submission - see `DATA_SECURITY.md` Section 6.1.

### 8.2 Open findings

| # | Finding | Severity | Remediation |
|---|---|---|---|
| A10 | PIN session token is stored in plaintext in `user_security.pin_session_token` and compared with a non-constant-time `!==` | Low-Medium | Store a hash of the token and compare with `crypto.timingSafeEqual`. Impact is bounded by the 2-minute TTL, but it is cheap to fix |
| A11 | Default Blob signed-URL lifetime is 7 days (`DEFAULT_SIGNED_URL_EXPIRATION_SECONDS`) and URLs are not bound to a user identity | Medium | Shorten to minutes-hours for slips, contracts and eKYC-adjacent media; consider per-request short-lived issuance |
| A13 | RLS policies are version-controlled only for the new eKYC tables; the remaining Supabase tables rely on the API layer as the sole authorization boundary | Medium | Bring all RLS policies under migration control as a backstop and add authorization tests across the Supabase routes |
| A14 | A single high-privilege credential set per store is shared across all actors | Medium | Scope credentials, rotate on a schedule, and consider least-privilege roles per actor |
| A15 | No automated authorization test suite | Medium | The identity/ownership gates are now uniform enough to be table-tested; a regression here would be silent |

---

## 9. Risk Register and DD Checklist

| # | Risk | Severity | Status |
|---|---|---|---|
| AA1 | Inconsistent / fail-open webhook authentication | ~~High~~ | **Closed** (A1-A3, A6-A7) |
| AA2 | Client-trusted identity | ~~High~~ | **Closed** (A4) |
| AA3 | Authorization concentrated in the app layer (RLS not enforcing) | Medium-High | Open (A13, A15) |
| AA4 | Recovery/lockout bypass via low-entropy identifiers | ~~Medium~~ | **Closed** (A8) - residual: identity questions are still the recovery factor, OTP recommended |
| AA5 | Unauthenticated cron/queue endpoint | ~~Medium-High~~ | **Closed** (A5) |
| AA6 | Long-lived, identity-agnostic signed Blob URLs | Medium | Open (A11) |
| AA7 | Mock-auth backdoor if misconfigured in production | Medium | Mitigated by the preflight gate (A12) |
| AA8 | Provider-side webhook authenticity cannot be strengthened beyond Basic Auth | Medium | Vendor limitation; compensated by fail-closed auth, replay hashing and a monotonic state machine |

DD checklist (data-room items): confirm production env has `NEXT_PUBLIC_LIFF_MOCK=false` and `NEXT_PUBLIC_DROPPOINT_MOCK=false`; confirm `CRON_SECRET`, `JOB_WORKER_SECRET`, `INTERNAL_API_SECRET`, `WEBHOOK_SECRET`, `ESTIMATE_ATTESTATION_SECRET` and all LINE/UPPASS credentials are set with no fallbacks in effect and are role-separated; confirm the five `LINE_LOGIN_CHANNEL_ID*` values match the real Login channels; confirm `ADMIN_LINE_IDS` contains only intended operators; confirm Supabase RLS posture and bring the remaining policies under version control; confirm Blob signed-URL TTLs; and review per-route authorization test coverage. `npm run preflight:production` mechanically checks most of this and fails closed.

Framing for reviewers: the highest-impact findings from the previous review - fail-open webhooks, client-trusted identity, and unauthenticated cron - are closed and verifiable in code. What remains is defense-in-depth (token hashing, signed-URL TTLs, version-controlled RLS, least-privilege credentials) plus test coverage. None requires re-architecture.

---

## 10. Appendix - Endpoint and Credential Map

Auth endpoints (all POST): `app/api/pin/{setup, verify, status, reset}` - all now behind a verified LIFF identity for the requested `(role, lineId)`, with `/reset` additionally rate-limited to 5/hour.
PIN-gated mutation routes (10): `contracts/create`, `contracts/request-action`, `contract-actions/complete`, `customer/request-redemption`, `customer/request-extension`, `customer/request-increase-principal`, `customer/request-reduce-principal`, `contracts/investor-action`, `drop-points/verify`, `drop-points/returns/confirm`.
Webhooks (7 active): `webhook`, `webhook-store`, `webhook-droppoint`, `webhooks/line-invest`, `webhooks/shop-notification`, `ekyc/webhook`, `webhooks/uppass-invest`. The legacy `line/webhook` second entry point has been consolidated so it cannot bypass body limits, signature checks or replay protection.
Crons (3, all `CRON_SECRET`-gated): `contracts/process-ticket-queue`, `redemptions/auto-confirm-received`, `ekyc/reconcile`.
Queue consumers (4, air-gapped to Vercel's queue infrastructure): `queues/estimate-generic`, `queues/estimate-notebook`, `queues/analyze-condition`, `queues/process-ekyc-webhook`.

Identity and secret environment variables: `LINE_LOGIN_CHANNEL_ID`, `_INVEST`, `_STORE`, `_DROPPOINT`, `_ADMIN`; `ADMIN_LINE_IDS`; `CRON_SECRET`; `JOB_WORKER_SECRET`; `INTERNAL_API_SECRET`; `WEBHOOK_SECRET`; `ESTIMATE_ATTESTATION_SECRET`; `AI_SAFETY_IDENTIFIER_SECRET`; `RATE_LIMIT_IDENTIFIER_SECRET`; `UPPASS_WEBHOOK_BASIC_USERNAME`/`_PASSWORD` and their `_INVEST` counterparts.

Auth-relevant environment variables: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `MONGODB_URI`, `BLOB_READ_WRITE_TOKEN`, the per-actor LINE channel secrets/tokens, `UPPASS_WEBHOOK_SECRET`(`_INVEST`), `WEBHOOK_SECRET`, `CRON_SECRET`, and the mock flags `NEXT_PUBLIC_LIFF_MOCK` / `NEXT_PUBLIC_DROPPOINT_MOCK`.

Key source files: `lib/security/pin.ts`, `lib/security/pin-session.ts`, `lib/security/line.ts`, `lib/security/webhook.ts`, `lib/liff/liff-provider.tsx`, `lib/supabase/client.ts`, `lib/storage/blob.ts`, `lib/db/mongodb.ts`, `components/PinModal.tsx`, and the route handlers under `app/api/`.

All findings are verified against the code as of writing and should be re-checked after any auth-related change.
