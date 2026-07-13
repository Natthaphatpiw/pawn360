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
| End-user identity | LINE Login via LIFF (OAuth in LINE) | Establishes who the user is (`profile.userId`, passed to APIs as `lineId`) |
| Step-up authentication | Six-digit PIN (bcrypt) + opaque server session token | Re-authenticates the user for sensitive, money-moving mutations |
| Authorization | `requirePinToken` server gate + per-route application checks + actor segmentation | Decides what an authenticated actor may do |
| Machine-to-machine | HMAC webhook signatures + cron bearer secret | Authenticates inbound callbacks from LINE, the Shop System, UPPASS, and scheduled jobs |
| Data tier | Supabase service-role, MongoDB connection credential, S3 IAM + presigned URLs | Authorizes backend access to data stores |

Key design facts: there is no password database (identity is delegated to LINE); sensitive actions require a PIN re-auth with a deliberately short 2-minute token; and all database access is server-side with privileged credentials, which makes the API layer - not database row-level security - the true authorization boundary. The honest implications of that design are detailed in Sections 8 and 9.

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

Honest characterization for diligence: LIFF establishes identity, not server-trusted authorization. The `lineId` is supplied by the client in the request body and is trusted by the backend as the actor identity; the current flow does not independently verify a LINE ID token / access token server-side against that `lineId`. The protections that actually gate sensitive actions are the PIN token gate and per-route application checks (Sections 4-5). Strengthening this by verifying a LINE token server-side is a hardening item.

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
- AWS S3: authorized by a static IAM access key; objects are private and served via presigned URLs. (The default presigned-URL lifetime in code is 7 days - a long window flagged in Section 8.)

The consistent theme: a small number of high-privilege backend credentials sit behind the trusted compute tier, and the correctness of per-route application checks is what enforces tenant isolation. This is a common and workable serverless pattern, but it concentrates responsibility in the application layer - which is why the hardening backlog emphasizes consistent server-side checks and tests.

---

## 6. Machine-to-Machine Authentication (Webhooks and Cron)

Inbound callbacks and scheduled jobs authenticate by HMAC signature or a shared secret. Enforcement is currently inconsistent across endpoints - documented transparently below because it is the most important hardening area.

### 6.1 LINE webhook signatures

- Scheme: HMAC-SHA256 over the raw request body, keyed by the channel secret, base64-encoded, compared to the `x-line-signature` header. There are three near-duplicate implementations (a canonical one in `lib/security/line.ts`, one in `lib/line/client.ts`, and inline copies in some routes); the comparisons use plain string equality (not constant-time).

### 6.2 Per-endpoint enforcement matrix (verified)

| Endpoint | Verifies? | On failure | Status |
|---|---|---|---|
| `/api/line/webhook` (alternate customer) | Yes, unconditionally | Rejects `401` | Enforced |
| `/api/webhooks/line-invest` (investor) | Yes | Rejects `401` (also 401 if header missing) | Enforced |
| `/api/webhooks/shop-notification` (Shop System) | Yes + replay window | Rejects `401` | Enforced |
| `/api/webhook` (customer) | Yes, but log-and-continue | Logs warning, processes anyway | Not enforced |
| `/api/webhook-store` (store) | Yes, but log-and-continue; key/guard mismatch | Logs warning, processes anyway | Not enforced |
| `/api/ekyc/webhook` (UPPASS borrower) | Optional | Accepts when no signature or no secret; else `401` | Fail-open |
| `/api/webhooks/uppass-invest` (UPPASS investor) | Optional | Accepts when no signature or no secret; else `401` | Fail-open |
| `/api/webhook-droppoint` (drop-point) | No | No check at all | None |

### 6.3 Shop System scheme

HMAC-SHA256 (hex) over the string `notificationId-timestamp` (not the full body), keyed by `WEBHOOK_SECRET` with a committed hard-coded fallback string, compared with `crypto.timingSafeEqual`, plus a 5-minute replay window on the timestamp. Because the signature covers only the id and timestamp (not the payload), it does not bind the message contents - a hardening item.

### 6.4 Cron authentication

- `/api/redemptions/auto-confirm-received`: checks `Authorization: Bearer <CRON_SECRET>` - but only if `CRON_SECRET` is set (open if unset). Vercel fires crons as GET, matching this handler.
- `/api/contracts/process-ticket-queue`: no authentication on either handler. The queue-draining logic is in the POST handler while Vercel crons issue GET (which returns counts only), so the drain is not actually triggered by the cron, and the unauthenticated POST is publicly invocable.

---

## 7. Session Management and Lifecycle

- No JWT / no standard session library: the PIN session is a random opaque value with no embedded claims, validated server-side against the stored token and expiry on every protected call.
- Short TTL: 2 minutes server-side; the client copy in `sessionStorage` mirrors the same `expiresAt` and self-evicts on read.
- Server-authoritative: even a tampered or stale client token cannot pass `requirePinToken`, which checks the stored value and expiry.
- Logout/eviction: `clearPinSession` removes the client token; server tokens simply expire (2 minutes) and are overwritten on the next issuance.
- LINE session: identity itself is governed by LINE's LIFF session (24-hour LINE login behavior), independent of the PIN token.

---

## 8. Security Posture and Hardening Backlog

Presented transparently. The architecture is sound; the items below are concrete hardenings that should be prioritized for a financial platform. Each is verified against the code.

| # | Finding | Severity | Remediation |
|---|---|---|---|
| A1 | Several webhooks do not enforce signatures: `/api/webhook` and `/api/webhook-store` log-and-continue; `/api/webhook-droppoint` performs no verification; the two UPPASS eKYC webhooks fail open (accept when the signature header or secret is absent) | High | Enforce strict verification on all inbound webhooks (reject on missing/invalid signature); never fail open |
| A2 | `/api/webhook-droppoint` (unauthenticated) can drive drop-point redemption/amount-verification state via service-role writes | High | Add signature verification before any state mutation |
| A3 | eKYC webhooks fail open - an attacker omitting the signature header could flip `kyc_status` to VERIFIED by `uppass_slug` | High | Require the signature and secret; reject when absent |
| A4 | `lineId` is client-supplied and trusted as the actor identity; no server-side LINE token verification | High | Verify a LINE ID/access token server-side and bind it to `lineId` |
| A5 | `process-ticket-queue` has no auth and its drain runs on POST while the cron fires GET | Medium-High | Add `CRON_SECRET` auth; align the cron's method with the draining handler |
| A6 | Committed hard-coded fallback webhook secret; LINE secret falls back to empty string when unset | Medium-High | Remove fallbacks; fail closed when secrets are unconfigured |
| A7 | Shop System signature covers only id+timestamp, not the payload | Medium | Sign the full body so message contents are bound |
| A8 | PIN lockout is fully bypassable via `/reset` using low-entropy identifiers (phone + national ID / drop-point code), with no rate limit or captcha on reset | Medium | Rate-limit reset, add additional factors, and consider OTP for recovery |
| A9 | Open `/api/pin/status` enables enumeration of registered `(role, lineId)` users and their lock state; probing also materializes `user_security` rows | Medium | Rate-limit / authenticate status; avoid creating rows on probe |
| A10 | PIN session token stored in plaintext in the DB column; `requirePinToken` uses non-constant-time `!==`; LINE HMAC comparisons not constant-time | Low-Medium | Hash stored tokens; use `crypto.timingSafeEqual` for all secret comparisons |
| A11 | Default S3 presigned-URL lifetime is 7 days; URLs are not bound to a user identity | Medium | Shorten TTLs (minutes-hours) for sensitive media; scope access |
| A12 | Dev mock bypass is gated only by a `NEXT_PUBLIC_*` build-time flag (and a `?mock=1` query on drop-point pages) | Medium | Ensure mock flags are never set in production builds; add a runtime guard |
| A13 | RLS not present in repo migrations; service-role-only access makes the API layer the sole authorization boundary | Medium | Version-control RLS policies as a backstop; add authz tests across all 73 Supabase routes |
| A14 | Single high-privilege credential set per store, shared across all actors; no per-actor/per-request scoping | Medium | Scope credentials; rotate on a schedule; consider least-privilege per role |

---

## 9. Risk Register and DD Checklist

| # | Risk | Severity | Status / mitigation |
|---|---|---|---|
| AA1 | Inconsistent / fail-open webhook authentication | High | Hardening A1-A3, A6-A7 |
| AA2 | Client-trusted identity (no server LINE-token check) | High | Hardening A4 |
| AA3 | Authorization concentrated in app layer (RLS not enforcing) | Medium-High | Hardening A13; authz test coverage |
| AA4 | Recovery/lockout bypass via low-entropy identifiers | Medium | Hardening A8 |
| AA5 | Unauthenticated cron/queue endpoint | Medium-High | Hardening A5 |
| AA6 | Long-lived, identity-agnostic presigned URLs | Medium | Hardening A11 |
| AA7 | Mock-auth backdoor if misconfigured in prod | Medium | Hardening A12 |

DD checklist (data-room items): confirm production env has no `NEXT_PUBLIC_LIFF_MOCK`/`NEXT_PUBLIC_DROPPOINT_MOCK`; confirm `CRON_SECRET`, `WEBHOOK_SECRET`, and all LINE/UPPASS secrets are set (no fallbacks in effect); confirm Supabase RLS posture (and bring policies under version control); review the webhook-signature hardening status; confirm S3 presigned-URL TTLs; and review the per-route authorization test coverage.

Framing for reviewers: the authentication and authorization design is coherent and uses appropriate primitives (delegated identity, bcrypt, short-lived opaque tokens, HMAC signatures, service-role isolation). The findings above are typical of a fast-moving pre-Series product and are individually low-effort to remediate; none requires re-architecture. Prioritizing A1-A5 (webhook enforcement, identity verification, and cron auth) closes the highest-impact gaps.

---

## 10. Appendix - Endpoint and Credential Map

Auth endpoints (all POST): `app/api/pin/{setup, verify, status, reset}`.
PIN-gated mutation routes (10): `contracts/create`, `contracts/request-action`, `contract-actions/complete`, `customer/request-redemption`, `customer/request-extension`, `customer/request-increase-principal`, `customer/request-reduce-principal`, `contracts/investor-action`, `drop-points/verify`, `drop-points/returns/confirm`.
Webhooks (8): `webhook`, `line/webhook`, `webhook-store`, `webhook-droppoint`, `webhooks/line-invest`, `webhooks/shop-notification`, `ekyc/webhook`, `webhooks/uppass-invest`.
Crons (2): `contracts/process-ticket-queue`, `redemptions/auto-confirm-received`.

Auth-relevant environment variables: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `MONGODB_URI`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, the per-actor LINE channel secrets/tokens, `UPPASS_WEBHOOK_SECRET`(`_INVEST`), `WEBHOOK_SECRET`, `CRON_SECRET`, and the mock flags `NEXT_PUBLIC_LIFF_MOCK` / `NEXT_PUBLIC_DROPPOINT_MOCK`.

Key source files: `lib/security/pin.ts`, `lib/security/pin-session.ts`, `lib/security/line.ts`, `lib/security/webhook.ts`, `lib/liff/liff-provider.tsx`, `lib/supabase/client.ts`, `lib/aws/s3.ts`, `lib/db/mongodb.ts`, `components/PinModal.tsx`, and the route handlers under `app/api/`.

All findings are verified against the code as of writing and should be re-checked after any auth-related change.
