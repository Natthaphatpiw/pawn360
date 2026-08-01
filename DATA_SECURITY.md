# Astly - Data Security

Status: Living document, prepared for investor technical due diligence
Scope: How Astly classifies, encrypts, stores, transmits, accesses, retains, and protects data across every tier - encryption in transit and at rest, key management, application- and field-level protection, access control, authentication and session security, network boundaries, third-party data egress, privacy (PDPA), logging and audit, and the honest hardening backlog.
Companion documents: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md), [`THIRD_PARTY_INTEGRATIONS.md`](THIRD_PARTY_INTEGRATIONS.md), [`TECH_STACK.md`](TECH_STACK.md), [`SCALABILITY_AND_DEPLOYMENT.md`](SCALABILITY_AND_DEPLOYMENT.md).

> Reviewer note: platform encryption and compliance facts are quoted from the providers' primary sources (cited in `INFRASTRUCTURE.md`) and are accurate as of mid-2026; application-level controls are stated from the implementation. Items dependent on live account configuration are marked "confirm"; recommended improvements are collected in the hardening backlog (Section 14) and risk register (Section 16).

---

## Table of Contents

1. Security Model Overview
2. Data Classification and Inventory
3. Encryption in Transit
4. Encryption at Rest
5. Key Management
6. Application- and Field-Level Data Protection
7. Secrets Management
8. Identity, Authentication, and Session Security
9. Authorization and Access Control
10. Network Security and Trust Boundaries
11. Object Storage Security (Media, Contracts, Slips)
12. Data Storage Locations and Retention
13. Third-Party Data Sharing and Egress
14. Privacy and PDPA Controls
15. Logging, Monitoring, and Audit
16. Hardening Backlog
17. Security Risk Register and DD Checklist
18. Appendix - Encryption Matrix and Sources

---

## 1. Security Model Overview

Astly's data-security posture rests on five layers that compose defense in depth:

1. Transport security: every network hop - browser to edge, edge to function, function to every datastore and API - is encrypted with TLS.
2. Storage security: every datastore encrypts data at rest with AES-256 under managed (or optionally customer-managed) keys.
3. Application security: privileged, server-only data access; one-way hashing of authentication secrets; private object storage with time-limited access; signed inbound webhooks.
4. Access control: server-verified LINE identity, database-derived ownership checks, server-side-only database credentials, Row-Level Security as a backstop on PostgreSQL, least-privilege cloud IAM, and a PIN gate on sensitive mutations.
5. Value integrity: financially material values (AI valuation, confidence, condition score, payment evidence) are cryptographically bound to the server that produced them, so an authenticated user cannot forge them (Section 6.1).
6. Governance: secrets isolation, data minimization (sensitive identity capture delegated to the eKYC vendor; asynchronous work carries only opaque ids), and a PDPA-aligned privacy posture.

The trust boundary is explicit: the browser/LIFF client is untrusted and its LINE ID token is verified server-side against LINE on every protected route; the Vercel Functions tier is the trusted compute boundary where all secrets reside; databases and object storage sit behind privileged credentials and are never publicly reachable; inbound machine callers must present a valid signature or role-scoped credential, and every such endpoint fails closed rather than open.

> **Deep dive.** `PRODUCTION_READINESS_LLM_SEARCH_QUEUE_EKYC.md` (Thai) is the implementation-level companion to this document: it records the exact controls, measured provider costs, queue and eKYC recovery semantics, the error taxonomy shown to users, and the verification evidence behind each claim here.

---

## 2. Data Classification and Inventory

| Class | Examples | Primary location | Sensitivity |
|---|---|---|---|
| Identity / KYC | National ID number, full name, phone, address; eKYC artifacts (ID images, face/liveness) | National ID and contact in the Supabase borrower and investor tables; raw eKYC media held by UPPASS (vendor) | Highest (PDPA sensitive) |
| Authentication secrets | Six-digit PIN, PIN session token | Supabase `user_security` (PIN as bcrypt hash; token opaque) | Highest |
| Financial | Bank-transfer slips, company bank account, loan principal, interest, penalty payments, settlement records | Slip images in Vercel Blob; financial records in Supabase / MongoDB | High |
| Collateral media | Item photographs, verification photos | Vercel Blob (private, signed access) | Medium-High (may show serials/PII) |
| Operational / contractual | Contracts, transaction history, negotiation, drop-point custody, notifications | MongoDB (customer view) + Supabase (investor/finance view) | Medium |
| Derived / queue control | Normalized estimate inputs, image content hashes, opaque job ids/status, idempotency/lease keys, usage counters, DLQ index | Upstash Redis; oversized private request payloads in Vercel Blob | Low-Medium; payload objects can include collateral metadata and require private access/TTL |
| Secrets / config | API keys, tokens, connection strings | Vercel environment variables | Highest |

Design principle reflected above: the most sensitive raw identity media (ID documents, liveness) is captured and held by the eKYC vendor (UPPASS), not on Astly's own storage, reducing Astly's custody of the highest-risk data. The platform retains the verified outcome (`kyc_status`) and the identifying fields it needs (e.g., national ID for identity-based PIN recovery).

---

## 3. Encryption in Transit

All data in motion is encrypted with TLS; there are no plaintext network paths.

| Hop | Protection |
|---|---|
| Browser / LIFF -> Vercel edge | HTTPS, TLS 1.3, automatic HTTPS + HSTS, HTTP/2 and HTTP/3, certificates auto-provisioned and auto-renewed by Vercel (Let's Encrypt) |
| Edge -> Vercel Function | Internal TLS within the platform |
| Function -> Supabase (PostgreSQL) | TLS (SSL-enforced Postgres connection) |
| Function -> MongoDB Atlas | TLS over the MongoDB wire protocol (SRV) |
| Function -> Vercel Blob | HTTPS/TLS (`@vercel/blob`) |
| Function -> Upstash Redis | TLS (HTTPS REST) |
| Function -> third-party APIs (OpenAI, Anthropic, Parallel, Exa, optional SerpAPI, LINE, UPPASS, SlipOK) | HTTPS/TLS to each provider |
| Inbound webhooks | HTTPS at the edge; provider-specific authentication (LINE/Shop HMAC, UpPass Basic Auth) |

No internal service is exposed over an unencrypted channel, and the databases are not reachable on the public internet without credentials.

---

## 4. Encryption at Rest

Every storage tier encrypts data at rest with AES-256 (or stronger), under provider-managed keys by default, with customer-managed-key options on the tiers that support them.

| Store | At-rest encryption | Key option | Source |
|---|---|---|---|
| Supabase (PostgreSQL) | AES-256 | Provider-managed | Supabase platform |
| MongoDB Atlas | AES-256 | Provider-managed, with optional BYOK / customer-managed keys via cloud KMS (AWS KMS, Azure Key Vault, GCP KMS); Queryable Encryption available | mongodb.com/cloud/atlas/security |
| Vercel Blob | AES-256 encryption at rest | Private stores, scoped signed URLs, and project-scoped credentials | vercel.com/docs/vercel-blob/security |
| Upstash Redis (cache) | Encryption at rest available; TLS in transit on all plans | Provider-managed | upstash.com |
| Vercel (build artifacts, env vars, platform data) | AES-256 at rest | Provider-managed | vercel.com/docs/security/compliance |

Application secrets stored as Vercel environment variables are encrypted at rest by the platform. Whether MongoDB BYOK is enabled on the live account is configuration-dependent (confirm); Blob encryption at rest is platform managed (Section 14).

---

## 5. Key Management

- Platform-managed keys: by default, each managed service holds and rotates its own data-encryption keys (Supabase, Vercel Blob, Upstash, Vercel). The team does not handle these keys, eliminating a class of key-handling errors.
- Customer-managed key (BYOK) options: MongoDB Atlas supports BYOK via cloud KMS. Vercel Blob uses platform-managed AES-256 encryption, so any requirement for customer-managed object-storage keys would need a separate provider/control decision.
- TLS certificates: managed and auto-renewed by Vercel; no manual certificate lifecycle.
- Application secrets: API keys and connection strings are stored as encrypted Vercel environment variables (Section 7), not in code or the repository; AI provider keys are provisioned in rotating sets of four.
- Recommended additions: a formal key-and-secret rotation schedule and, for the identity store, BYOK so that key revocation is an available control.

---

## 6. Application- and Field-Level Data Protection

Beyond storage encryption, specific high-value fields receive application-level protection:

- PIN (authentication secret): the six-digit user PIN is never stored in plaintext or reversibly. It is one-way hashed with bcrypt at cost factor 10 and stored as `pin_hash` in Supabase `user_security`. Verification is a bcrypt compare; the PIN itself is never logged or returned.
- PIN session token: a random, opaque token (`crypto.randomBytes(32)` hex) - not a JWT and carrying no claims - with a two-minute TTL, stored on the security row and matched server-side; it cannot be forged or decoded to reveal anything.
- Webhook authenticity: inbound callbacks are never trusted by origin alone. LINE and Shop System use their HMAC schemes; UpPass uses role-specific Basic Auth and fails closed when credentials are absent or invalid (Section 9).
- Honest note on identity fields: the national ID and bank-account numbers are stored as queryable fields (the national ID is used for identity-based PIN recovery, which requires a comparison, so it is not hashed). These rely on at-rest encryption plus Row-Level Security plus service-role-only access for protection. Adding field-level encryption or tokenization for the national ID and bank-account number is a recommended defense-in-depth improvement (Section 14), so that even a privileged-credential compromise does not expose them in plaintext.

### 6.1 Integrity controls on financially material values

A lending platform's most valuable attack surface is not usually data exfiltration - it is *value forgery*: changing a number that the business later honours. The following controls exist specifically so that an authenticated, legitimate user cannot alter a financially material value between the moment the server computes it and the moment the business acts on it.

| Control | Threat it closes | Mechanism |
|---|---|---|
| **Estimate attestation** | An authenticated borrower edits the AI-derived valuation, confidence, or item identity in the browser before submitting a loan request | The server issues an HMAC token binding owner, item fingerprint, photo set, price, condition score, confidence, source and expiry. Loan-request creation re-derives and re-verifies it; the approved principal is capped by the **signed** estimate, never by the value posted from the client. Changing any bound field invalidates the token |
| **Condition-job binding** | Submitting a high condition score that no analysis produced | The loan request must reference a completed condition job owned by the same LINE subject; scores are read from the job record, not the request body |
| **Confidence floor** | Low-confidence AI output silently becoming a real loan | Below `MIN_ESTIMATE_CONFIDENCE_FOR_SUBMISSION` the request is routed to manual review instead of being auto-created |
| **Slip evidence fingerprint** | Re-using one genuine bank slip to settle two different obligations | A SHA-256 fingerprint of the slip is checked against every payment-evidence store under a shared distributed lock, so two concurrent workflows cannot both pass the lookup |
| **AI slip non-authority** | Treating an OCR read as proof of payment | SlipOK is the authoritative verifier. When it is unavailable the AI fallback may *read* an amount but cannot prove authenticity, payee, or non-replay, so it does not auto-authorize a financial state change (`ALLOW_AI_SLIP_AUTO_APPROVAL=false`) |
| **Deterministic price evidence** | An LLM hallucinating a market price that then anchors a real loan | Every extracted price must be independently provable from the source text by a deterministic parser, within a 1.5% tolerance, with an explicit currency marker. Bare model numbers, storage sizes, years, order ids and long digit runs are rejected rather than truncated into plausible prices. Only evidence that can be re-proven from the persisted listing title is allowed to seed the historical price cache |
| **Statistical outlier quarantine** | A single mispriced or fraudulent listing dragging the representative price | Median/MAD partitioning quarantines extreme prices before they can strengthen a pool |
| **Distributed financial locks** | Double-spend / double-advance races on redemption, extension and principal change | Redis locks plus compare-and-set on the underlying rows |

### 6.2 Data minimization in the asynchronous path

The queue and eKYC inbox are designed so that a compromise of the messaging layer yields no personal data:

- Queue messages carry **only an opaque job or event id**. Request payloads live in Redis and anything above 512 KiB in private Blob; image bytes are never placed on a queue.
- Image references passed to workers must be HTTPS URLs on the project's **own** private Blob store and under an expected path prefix, validated against the store id derived from the project token - not merely a hostname that looks similar. `data:` URLs are rejected outright. This closes both an SSRF/open-proxy vector on the vision workers and an unbounded-payload vector.
- The eKYC inbox stores **only normalized status fields** (event type, application status, eKYC status, provider timestamp, hashed event key). Raw UpPass answers, document images, biometric payloads, hosted form URLs and LINE IDs are deliberately not persisted from the callback.
- Provider usage telemetry records token counts, latency, cache status and derived cost - never prompts, images, or response bodies.
- Cost and abuse admission control (`AI_MAX_JOB_COST_USD`, `AI_MAX_OWNER_DAILY_COST_USD`, `AI_MONTHLY_BUDGET_USD`, plus per-subject job rate limits) is a security control as well as a financial one: it bounds what a single compromised or abusive authenticated account can consume.

---

## 7. Secrets Management

- Storage: all credentials (database connection strings, service-role key, AI provider keys, LINE channel tokens, UPPASS/SlipOK keys, AWS IAM keys, webhook secrets) are Vercel environment variables, encrypted at rest, never committed to source control.
- Environment isolation: variables are scoped per environment (Production / Preview / Development); production secrets are not shared with preview builds.
- Browser exposure: only variables explicitly prefixed `NEXT_PUBLIC_*` are bundled to the client (LIFF identifiers, public base URL, the Supabase URL and anonymous key). No private key, service-role key, or provider secret reaches the browser. Importantly, the Supabase anonymous key - though public by design - is not used by any code path, and Row-Level Security is enabled on every table so the public key is denied at the database (Section 9).
- Rotation: AI provider keys are provisioned in sets of four to support rotation under rate limits; a documented rotation cadence for all secrets is a recommended process control.
- Least exposure: secrets are used only server-side within Vercel Functions, the trusted compute boundary.

---

## 8. Identity, Authentication, and Session Security

- End-user identity: delegated to LINE Login via LIFF; the platform does not store user passwords. The LINE `userId` is the principal.
- Step-up authentication (PIN): sensitive mutations across all three actor flows require a six-digit PIN, bcrypt-hashed in Supabase (Section 6). The PIN subsystem includes escalating lockout (three failures: one minute; five failures: thirty minutes) and identity-based recovery (phone + national ID, or phone + drop-point code) without exposing the old PIN.
- Session model: on successful PIN verification, a short-lived (two-minute) opaque server-stored token is issued and returned to the client, which keeps it in browser `sessionStorage` and presents it on protected mutations as a `pinToken` body field. The token is validated server-side against the stored value and expiry on every protected call (`requirePinToken`). Because the TTL is short and the token carries no claims, the window of misuse on token theft is minimal.
- Server-side enforcement: protected routes call `requirePinToken(role, lineId, pinToken)`, which checks presence, match, non-expiry, and not-locked, returning a 403 with a discriminating reason on failure. This guards the financially sensitive mutation routes across borrower, investor, and drop-point flows.

---

## 9. Authorization and Access Control

- Database access is server-side and privileged: all Supabase access uses the service-role key from within Vercel Functions; the public anonymous key is used nowhere.
- Row-Level Security backstop: RLS is enabled on every Supabase table. Because the service role bypasses RLS, the true authorization boundary is the API layer (PIN tokens, signature checks, and per-route logic); RLS is a secondary control that denies any access attempted with the public anonymous key (defense in depth against credential leakage).
- Inbound machine authorization: LINE uses base64 HMAC and Shop System uses HMAC-SHA256 (hex) with a five-minute replay window. UpPass uses separate Basic Auth credentials for seller and Asset Funding webhooks, constant-time comparison, and fail-closed configuration; `legacy_hmac` is explicit only for a provider-confirmed contract. Some legacy LINE endpoints remain inconsistent and are tracked in Section 16.
- High-cost job ownership: enqueue, poll, and cancel routes validate the LINE ID token server-side and bind every job to its token subject; client-supplied `lineId` cannot authorize access to another user's job.
- eKYC ownership: initiation and status routes verify LINE issuer/audience/expiry/subject and actor role before database lookup. Seller and Asset Funding provider credentials/forms do not fall back across roles.
- Cloud least privilege: Blob access uses a project-connected store token and pathname/operation-scoped signed read URLs; database credentials are per service; provider keys are per integration.
- Actor segmentation: the three actor roles (borrower, investor, drop-point) and the PIN role model segment who can perform which mutation.

---

## 10. Network Security and Trust Boundaries

- Single ingress: all inbound traffic terminates at Vercel's anycast Edge Network; there is no other public entry point.
- Edge protection (the WAF/DDoS layer): automatic L3/L4/L7 DDoS mitigation (free, all plans), Attack Challenge Mode, and the Vercel WAF (custom rules, IP blocking, rate limiting) protect the application edge; this replaces an external CDN/WAF. (Detail and Pro-tier limits in `INFRASTRUCTURE.md` Section 2.5.)
- No public databases or media store: Supabase, MongoDB Atlas, the private Blob store, and Upstash are reached only with credentials from the trusted compute tier; media is shared through time-limited signed URLs.
- Outbound egress: functions call managed services and APIs over TLS. The platform does not currently use static outbound IPs (a Vercel add-on/Enterprise capability), so egress is not from a fixed allow-listable range - relevant only if a downstream provider requires IP allow-listing (noted in `INFRASTRUCTURE.md`).
- Compute isolation: stateless functions hold no durable secrets beyond the injected environment; there are no long-lived servers to harden or patch.

---

## 11. Object Storage Security (Media, Contracts, Slips)

Vercel Blob holds the platform's most sensitive media (item photos, bank slips, contracts, tickets, QR):

- Private by default: objects are not public; account-level Block Public Access is the recommended and expected configuration (confirm on the live account).
- Time-limited access: read access is granted via Blob signed URLs scoped to one pathname and the `get` operation, with a maximum lifetime of seven days. The application controls the TTL; short TTLs are the key control and should be kept tight for slip and ID-bearing media.
- Encryption: AES-256 at rest with platform-managed keys; HTTPS/TLS in transit.
- Upload controls: the dedicated estimate image route validates a seller LINE token, content type/signature and a bounded file size before writing to private Blob. AI queue messages carry only opaque ids; up to four signed Blob image URLs remain in the private job payload, never in the queue message.
- Recommended: confirm private-store and retention configuration, tighten signed URL TTLs, and maintain independent immutable/auditable storage where regulatory records require it. Vercel Blob does not expose every S3-specific control; do not assume Object Lock or customer-managed SSE-KMS without verifying the live product.

---

## 12. Data Storage Locations and Retention

| Data | Store | Retention posture |
|---|---|---|
| Customer-facing operational records | MongoDB Atlas | Operational lifetime; backed up (continuous backup on dedicated tiers) |
| Investor/finance/logistics records, KYC status, PIN security | Supabase (PostgreSQL) | Operational lifetime; daily backups (7 days on Pro), PITR add-on |
| Media (photos, slips, contracts, tickets) | Vercel Blob | 11-nines durability; retention/deletion policy to be defined |
| Raw eKYC identity media | UPPASS (vendor) | Vendor-held with customer-controlled retention/deletion (confirm in DPA) |
| Cache (estimate, image hashes) | Upstash Redis | TTL-bounded (30-day estimate TTL); rebuildable, non-authoritative |
| Secrets | Vercel env vars | Lifetime of configuration; rotate on schedule |

Retention and deletion: a formal data-retention and deletion schedule (especially for KYC artifacts and bank slips, and the AML-driven 5-year record-retention obligation discussed in `THIRD_PARTY_INTEGRATIONS.md`) should be documented and implemented, including scheduled Blob deletion and a data-subject deletion workflow for PDPA. This is a governance item to formalize (Section 14).

---

## 13. Third-Party Data Sharing and Egress

Data that leaves Astly's boundary, and the controls that apply:

| Recipient | Data shared | Control |
|---|---|---|
| OpenAI | Product text, item photos, and bank slips when SlipOK is unavailable | TLS; safety identifier is hashed; confirm production storage setting, retention and DPA |
| Anthropic Claude | Same payload only when the OpenAI primary path fails | TLS; confirm fallback retention and DPA |
| Parallel / Exa | Canonical product/spec search text and returned web excerpts; no intentional user id, serial, or image URL | TLS; bounded results/excerpts; confirm retention and DPA |
| SerpAPI (optional) | Canonical product-name search text (no intentional PII) | TLS |
| UPPASS | Identity data for eKYC | TLS; vendor holds raw media; confirm DPA + retention |
| SlipOK | Bank-slip image/reference | TLS; confirm DPA + retention |
| LINE | Messages, user identity | Platform terms |

Critical control for diligence: item photos and fallback bank slips are transmitted to OpenAI and may be transmitted to Anthropic on model fallback. The account's effective OpenAI storage setting, contractual retention/no-training posture, and DPA must be confirmed. Search providers receive canonical non-PII queries, but prompt construction and logs must continue stripping serials and actor identifiers.

---

## 14. Privacy and PDPA Controls

Astly processes personal and sensitive data under Thailand's Personal Data Protection Act (PDPA).

- Lawful basis and consent: a cookie/consent banner is present; consent and lawful-basis records for identity, financial, and media processing should be maintained.
- Data minimization: the highest-risk identity media is held by the eKYC vendor. The application stores a normalized webhook inbox containing only opaque slug/event/status/timestamp fields, not raw UpPass answers, ID images, biometrics, hosted-form URLs, or LINE ids.
- Cross-border transfer: data is processed by providers in Singapore/Sydney/US regions; PDPA cross-border-transfer safeguards (DPAs / standard contractual terms with each processor) must be executed - several are noted as "confirm" across the integration and infrastructure documents.
- Data-subject rights: a documented process for access, correction, deletion, and objection requests (including propagation to Vercel Blob and the eKYC vendor) should be implemented.
- Records of processing and retention schedules: to be formalized, with the AML 5-year retention reconciled against PDPA minimization.

---

## 15. Logging, Monitoring, and Audit

- Current: Vercel runtime logs (1-day retention on Pro; up to 30 days with the Observability Plus add-on), build logs (indefinite), firewall traffic views and alerts; Supabase and MongoDB Atlas native audit/metrics.
- Sensitive-data hygiene: PINs and tokens are not logged; care must be taken that identity/financial fields and AI payloads (photos/slips) are not written to logs - a log-review and redaction control is recommended.
- Recommended for a financial platform: centralized structured logging and error tracking; an immutable audit trail for sensitive mutations (who/what/when on PIN-gated and money-moving actions); Log Drains to a SIEM for security monitoring and AML evidence; alerting on authentication failures, lockouts, and signature-verification failures; and, with BYOK, KMS/CloudTrail decryption audit.

---

## 16. Hardening Backlog

Presented transparently; each is a defense-in-depth improvement rather than a present exposure.

| # | Item | Priority |
|---|---|---|
| H1 | Finish strict verification on legacy LINE/drop-point inbound endpoints; UpPass is already fail-closed Basic Auth | High |
| H2 | Confirm AI providers' no-training/ZDR/BAA and execute DPAs for media-bearing calls | High |
| H3 | Field-level encryption / tokenization for national ID and bank-account numbers | High |
| H4 | Confirm the Blob store is private, restrict the read/write token, and tighten signed-URL TTLs for ID/slip/financial objects | High |
| H5 | Adopt BYOK / customer-managed keys where supported for identity and financial stores; document Blob's platform-managed encryption posture | Medium |
| H6 | Formal secret/key rotation schedule and a documented incident-response runbook | Medium |
| H7 | Immutable audit trail + SIEM log drain for sensitive mutations | Medium |
| H8 | Documented data-retention/deletion schedule and PDPA data-subject-rights workflow | Medium |
| H9 | Third-party penetration test and a periodic security review cadence | Medium |
| H10 | Automated security tests in CI (authz, input validation) | Medium |
| H11 | Load/chaos-test Vercel Queues beta delivery, Redis lease loss, duplicate events, provider 429, DLQ replay, and eKYC reconciliation before public launch | High |

---

## 17. Security Risk Register and DD Checklist

| # | Risk | Severity | Mitigation / status |
|---|---|---|---|
| D1 | Egress of photos/slips to AI providers without confirmed no-training posture | High | Execute ZDR/BAA/paid-tier; in-house model removes egress (roadmap) |
| D2 | Inconsistent legacy LINE webhook signature enforcement | High | Strict verification (H1); UpPass has separate fail-closed Basic Auth |
| D3 | National ID / bank account protected by at-rest + RLS only, not field-level | Medium-High | Field-level encryption/tokenization (H3) |
| D4 | Provider-managed keys (no BYOK confirmed) | Medium | Adopt BYOK on identity/financial stores (H5) |
| D5 | Blob signed-URL TTL / private-store config account-specific | Medium | Confirm and tighten (H4) |
| D6 | RLS bypassed by service role -> API layer is the real boundary | Medium | Strengthen API-layer authz tests; RLS remains a backstop |
| D7 | No confirmed pentest / security-test cadence | Medium | Schedule pentest + CI security tests (H9, H10) |
| D8 | PDPA records, retention, and data-subject workflow not yet formalized | Medium | Formalize (H8) |
| D9 | Queue messages are at-least-once and Vercel Queues is beta | Medium | Opaque messages, idempotency/leases, app DLQ, load testing and rollback path (H11) |

DD checklist (data-room items): confirmation of at-rest encryption and any BYOK on each store; Blob private-store configuration, token scope, and signed-URL TTL; executed DPAs and AI no-training/ZDR/BAA confirmations; PIN/auth design review; webhook-signature hardening status; PDPA records of processing, retention schedule, and consent records; most recent penetration-test report (if any); and the incident-response runbook.

---

## 18. Appendix - Encryption Matrix and Sources

| Layer | In transit | At rest | Notes |
|---|---|---|---|
| Vercel (edge, functions, env) | TLS 1.3 | AES-256 | Auto TLS/HSTS; secrets encrypted |
| Supabase (PostgreSQL) | TLS (SSL-enforced) | AES-256 | Provider keys; RLS on all tables |
| MongoDB Atlas | TLS (wire protocol) | AES-256 (+ optional BYOK) | Queryable Encryption available |
| Vercel Blob | HTTPS/TLS | AES-256, platform managed | Private; pathname/operation-scoped signed URLs |
| Upstash Redis | TLS | At rest available | Cache only; TTL-bounded |
| Application secrets | n/a | AES-256 (Vercel env) | Server-only; NEXT_PUBLIC excluded |
| PIN | n/a | bcrypt (cost 10), one-way | Never plaintext |
| PIN session token | TLS | Opaque, server-stored, 2-min TTL | No claims; not a JWT |

Sources (primary, as of mid-2026; full citations in `INFRASTRUCTURE.md`): vercel.com/docs/security/compliance and /docs/vercel-blob/security; supabase.com security docs; mongodb.com/cloud/atlas/security; upstash.com; and the AI providers' data-retention pages. Application-level controls are stated from the implementation (`lib/security/`, `lib/storage/blob.ts`, `lib/supabase/client.ts`). All platform figures should be re-verified against the live provider documentation and the live account configuration at diligence time.
