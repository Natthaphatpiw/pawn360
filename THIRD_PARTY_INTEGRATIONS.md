# Astly - Third-Party API Integrations

Status: Living document, prepared for investor technical due diligence
Scope: Every external API and integration the platform consumes - identity / KYC, AI, messaging, payments and slip verification - their integration mechanics and security, plus the forward-looking integration plans for escrow / funds custody and the in-house AI model.
Companion documents: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md), [`TECH_STACK.md`](TECH_STACK.md), [`SCALABILITY_AND_DEPLOYMENT.md`](SCALABILITY_AND_DEPLOYMENT.md).

> Legal note: Sections 8 and 4.4 summarize Thai regulatory context from cited public sources to frame the integration design. This is engineering and product planning input, not legal advice; every regulatory point is marked "confirm with counsel" and the chosen funds-flow and licensing path must be validated by qualified Thai counsel before implementation.

---

## Table of Contents

1. Integration Inventory
2. Integration Architecture and Conventions
3. Identity and KYC - UPPASS (current) and the Thai eKYC landscape
4. Regulatory Context for KYC/AML
5. AI Integrations and Roadmap
6. Messaging and Channel - LINE
7. Payments and Slip Verification (current state)
8. Escrow and Funds-Flow Plan
9. Object Storage and Adjacent Systems
10. Integration Security and Reliability
11. Integration Risk Register and DD Checklist
12. Appendix - Endpoints, Credentials, and Sources

---

## 1. Integration Inventory

| Integration | Category | Status | Direction | Protocol | Auth |
|---|---|---|---|---|---|
| UPPASS | Identity / eKYC | Live | Outbound + inbound webhook | REST (hosted form + API) | Bearer API key; inbound role-specific Basic Auth, fail closed |
| OpenAI | AI (text + vision + structured extraction) | Live, primary | Outbound | Responses API via SDK | API key (up to 4-key rotation) |
| Anthropic Claude | AI fallback (text + vision) | Live, fallback | Outbound | REST (Messages API, direct) | `x-api-key` (up to 4-key rotation) |
| Parallel | Web search | Live, primary | Outbound | Search API via `parallel-web` | API key |
| Exa | Web-search fallback | Live, fallback | Outbound | Search API via `exa-js` | API key |
| SerpAPI | Price data | Live | Outbound | REST | API key |
| LINE Messaging API | Messaging | Live | Outbound push + inbound webhook | SDK / REST | Channel access token; inbound HMAC |
| LINE LIFF | Identity (channel login) | Live | Client SDK | SDK | LINE Login (OAuth) |
| SlipOK | Payment-slip verification | Live | Outbound | REST | `x-authorization` |
| Vercel Blob | Object storage | Live | Outbound | `@vercel/blob` | Project read/write token; signed URLs |
| Shop System | Adjacent platform | Live | Outbound + inbound callback | REST | HMAC-signed |
| Escrow / funds custody | Payments / custody | Planned | Outbound + webhook | REST (PSP) or bank arrangement | TBD (provider) |
| In-house condition model | AI (vision) | Planned | Outbound (private endpoint) | REST | Private network / token |

---

## 2. Integration Architecture and Conventions

All external integrations follow a small set of consistent patterns, which is itself a due-diligence positive (uniform, auditable handling):

- Server-side only. Every third-party credential lives in a Vercel environment variable and is used only from server-side functions; nothing sensitive is exposed to the browser.
- Two integration styles: synchronous REST/SDK calls for request/response work, and signed inbound webhooks for asynchronous results (eKYC outcomes, payment callbacks, LINE events).
- Inbound authentication is provider-specific: LINE and Shop System use their HMAC schemes, while UpPass uses role-specific Basic Auth and fails closed on absent/misconfigured credentials. Some legacy LINE endpoints still need strict-enforcement standardization.
- Resilience by durable backpressure. Vercel Queue topics and Redis provider semaphores absorb bursts; OpenAI/Anthropic can rotate configured keys on a true per-key rate limit, but billing quota is surfaced rather than bypassed.
- Provider abstraction. AI/OCR integrations sit behind thin internal abstractions so a model, vendor, or the future in-house model can be substituted by configuration.
- Graceful degradation. Model work uses OpenAI then Anthropic; market discovery uses fresh cache -> Parallel -> Exa -> stale cache; slip verification uses SlipOK -> OpenAI Luna -> Claude vision. Ambiguous/no-evidence results do not silently authorize a financial action.
- Idempotency. AI and eKYC consumers assume at-least-once delivery and use durable idempotency keys, leases/conditional updates, retries, and application DLQs.
- Provider admission control. A Redis-backed limiter enforces requests-per-minute, tokens-per-minute and concurrency per provider and per model **before** a billable call is made, so a provider quota is absorbed as queue backpressure rather than surfaced as a user-facing failure (`INFRASTRUCTURE.md` Section 2.6.1).

> **Deep dive.** `PRODUCTION_READINESS_LLM_SEARCH_QUEUE_EKYC.md` (Thai) records the per-integration failure semantics, measured provider costs, and the eKYC webhook/inbox/outbox design in implementation detail.

---

## 3. Identity and KYC - UPPASS (current) and the Thai eKYC landscape

### 3.1 Current UPPASS integration (implemented)

UPPASS (uppass.io) is the platform's electronic Know-Your-Customer provider, integrated per actor (borrowers and investors verify independently).

Integration mechanics (as implemented):

- Initiation: after server-side LINE ID-token/role/owner verification, `POST {UPPASS_API_URL}/th/api/forms/{formSlug}/create/` uses the actor-specific Bearer key. API and returned form URLs must be HTTPS/443 and on explicit host allowlists. A database attempt ledger plus Redis admission control prevents concurrent/abusive session creation; an existing pending URL is reused only after revalidation.
- Verification UX: the user is directed to the hosted UPPASS form (in-LINE), where document capture and biometric checks occur; the platform does not handle raw identity media itself for this flow.
- Result callback: UpPass posts to `/api/ekyc/webhook` (seller) or `/api/webhooks/uppass-invest` (Asset Funding) using role-specific Basic Auth. Missing configuration returns 503 and bad credentials return 401. A legacy HMAC mode exists only as an explicit, provider-contract-dependent option.
- Durable processing: ingress accepts JSON up to 512 KiB, stores only normalized status fields in `ekyc_webhook_events`, deduplicates by a hashed event key, and publishes an opaque id to `ekyc-webhook-events`. The consumer applies monotonic status transitions and schedules LINE notification separately. A minute `CRON_SECRET`-protected reconciler republishes durable inbox/outbox records after transient queue failures.
- Per-actor configuration: seller and Asset Funding API keys, form slugs, API URLs, form-host allowlists, and webhook credentials are distinct. Missing `_INVEST` configuration fails closed rather than silently using the seller policy.

Schema prerequisite: apply `database/migrations/2026_08_01_harden_ekyc.sql` before enabling production callbacks. It creates the server-only `ekyc_attempts` ledger and normalized `ekyc_webhook_events` inbox/outbox with RLS and revoked browser roles.

Integration model summary: a hosted-form + webhook + API-key pattern on a Thailand (`/th/`) endpoint - low integration surface, with the sensitive capture handled by the vendor.

### 3.2 UPPASS product capabilities (per vendor, to confirm in contract)

UPPASS positions itself as an AI-powered verification platform for Southeast Asia (public client logos include Thai fintech/telecom names). Capabilities relevant here (source: uppass.io):

- Personalized eKYC: configurable biometric eKYC, ID verification, bank-statement verification, and email/mobile verification, with non-Roman-character OCR tuned for lower false positives and validation against local identity datasets, plus fraud-service integration and pass/fail behavioral tracking.
- eKYB / screening: AML, PEP, and adverse-media screening across directors/shareholders/UBOs, sanctions screening, UBO discovery, document authenticity checks, and scheduled re-KYB / continuous monitoring (relevant if institutional investors are onboarded).
- Integration tooling: a no-code Verifications Builder with a risk-based Decision Workflow, secure data-passing APIs, and file-upload APIs; developer hub at docs.uppass.io.

#### UPPASS certification and assurance posture (vendor-published, August 2026)

| Item | Vendor-published position | DD status |
|---|---|---|
| Legal entity | UpPass is operated by **Collective Wisdom Co., Ltd.** | Confirm registration number, jurisdiction, and signing authority in the data room |
| Information security | **ISO/IEC 27001 certified by BSI, certificate No. IS773635** | **Verifiable** - request the PDF certificate and the Statement of Applicability; confirm scope covers the eKYC production environment and the certificate is in date |
| Hosting | Customer data encrypted and held "in the World Trusted Cloud Infrastructure with ISO/IEC 27001 certification"; OWASP Top 10 development practices claimed | Region/residency **not published** - must be pinned contractually (Thai residency preferred for PDPA Sec 28-29) |
| Privacy regimes | States strict adherence to both **PDPA and GDPR** | Not a certification. Obtain the executed DPA and the sub-processor list |
| Other frameworks | CSA and PCI referenced as compliance frameworks on the marketing site | Ambiguous - clarify whether these are UpPass certifications or customer-supported frameworks |
| Ecosystem signals | Investors Wavemaker and True Incube; NIA and Thai SEC programme affiliations cited | Reputational context only, not an assurance control |
| Liveness / PAD | **No published ISO/IEC 30107-3 or iBeta PAD Level 1/2 certification** | **Material gap.** Ask directly which PAD standard the liveness engine is tested against, by which NVLAP-accredited lab, at which level, and with what APCER/BPCER results |
| NDID / DOPA | **Not published** for this integration | Ask whether DOPA national-ID validation or an NDID Relying-Party path is available, and at what Identity Assurance Level (UpPass publishes Thai IAL explainer content, which implies awareness but is not a claim of capability) |
| Webhook security | Documentation offers only **No Auth** or **Basic Auth**, with Webhook Version 2 current and Version 1 deprecated. **No request signature, no replay nonce, no published IP allowlist, no documented retry/backoff policy** | Known vendor limitation - compensated in-platform (see below). Ask whether HMAC signing or source-IP ranges can be contracted |

Because the provider does not sign its callbacks, the platform treats the UpPass webhook as an *unauthenticated-by-design* channel and compensates on our side:

- mandatory role-scoped Basic Auth with constant-time comparison, failing **closed** (503) when credentials are absent rather than accepting the request
- HTTPS-only ingress with a 512 KiB streaming body cap and a strict event-schema allowlist
- a hashed event key that gives replay/duplicate suppression the vendor does not provide
- the webhook is treated as a *hint*, never as authority: it can only move an actor forward through a monotonic status machine, and can never re-open a `VERIFIED` or `REJECTED` record
- no raw identity answers, document images, or biometric payloads are persisted from the callback - only normalized status fields

Items still to confirm directly with UPPASS for the data room: the PAD/liveness certification above, AML/PEP screening inclusion for the borrower flow, retention windows and deletion SLA for document/biometric media held on their side, data-centre region, NDID connectivity, sub-processors, breach-notification SLA, uptime SLA, and the executed DPA.

### 3.3 The broader Thai eKYC landscape (for roadmap and stronger CDD)

For higher-assurance verification (e.g., to satisfy stricter customer due diligence as the platform scales or licenses), the Thai market offers:

- NDID (National Digital ID): a trust network (operated by National Digital ID Co., Ltd., a 60+ member JV including the major banks) that lets a Relying Party route identity proofing to an Identity Provider the user is already enrolled with (typically their bank), which verifies via face biometrics + PIN + registered mobile and returns verified data under user consent. Assurance is risk-tiered. Identity Providers are licensed by ETDA and supervised by the BoT. NDID is the standard rail for fully online, bank-grade KYC in Thailand and is a candidate for a future higher-assurance tier alongside or instead of the hosted UPPASS flow. (Source: ndid.co.th.)
- DOPA (Department of Provincial Administration): the authoritative source for national-ID data; eKYC vendors offer DOPA name/ID verification as a supplementary check. (Source: ndid.co.th, scbtechx.io.)
- BoT-recognized e-KYC techniques: facial biometric recognition for remote onboarding (BoT authorized six banks in Feb 2020 via NDID), "dip-chip" national-ID chip reading, and liveness detection; Thailand has been tightening identity-verification/anti-fraud measures generally. (Source: biometricupdate.com.)

Roadmap implication: UPPASS covers the current eKYC need with low integration cost; if the platform pursues a licensed/regulated structure or onboards institutional investors, adding an NDID-based high-assurance tier (and DOPA cross-checks) is the natural next integration, abstracted behind the same "KYC provider" seam.

---

## 4. Regulatory Context for KYC/AML

Customer due diligence is not only a product choice but a legal obligation that shapes the KYC and (especially) the escrow design. Summarized from public sources; confirm with counsel.

- AML/CFT regime: the Anti-Money Laundering Act B.E. 2542 (1999) defines "financial institution" broadly to include payment-service and e-money operators; whichever entity legally holds or moves customer funds is a reporting entity supervised by AMLO. (Source: juslaws.com, lexology.com.)
- Customer Due Diligence (Ministerial Regulation on CDD B.E. 2563 / 2020): five mandated steps - (1) identify the customer via government ID; (2) verify identity through credible sources or electronic means (e-KYC permitted); (3) identify ultimate beneficial owners (>=25%) for legal entities; (4) understand the purpose of the relationship; (5) ongoing monitoring with periodic refresh and transaction screening; with Enhanced Due Diligence for PEPs and higher-risk cases. The platform's UPPASS integration addresses steps (1)-(2). (Source: juslaws.com.)
- Reporting thresholds: Cash Transaction Report at THB 2,000,000+; Suspicious Transaction Report at any amount on reasonable suspicion - both filed without undue delay; wire/transfer travel-rule data from THB 100,000. Red flags include unexplained third-party funding and structuring - directly relevant to a multi-party investor-to-borrower flow. (Source: juslaws.com.)
- Record retention: at least 5 years; penalties for failures are significant and can attach to directors personally. (Source: juslaws.com.)

Design consequence: the platform should maintain auditable identity and transaction records, screening, and an STR process - and (Section 8) ensure the entity that legally holds funds carries these obligations, which is a strong reason to route custody through a licensed partner rather than the platform itself.

---

## 5. AI Integrations and Roadmap

The AI layer is the platform's most differentiated integration surface. Full pipeline detail is in `SYSTEM_ARCHITECTURE.md`; here is the integration and roadmap view.

### 5.1 Current AI integrations

| Provider | Integration | Models | Role | Resilience |
|---|---|---|---|---|
| OpenAI | `openai` SDK, Responses API, structured outputs, image input | `gpt-5.6-luna`, `gpt-5.6-terra` | Primary model for normalization, evidence extraction/filtering, condition analysis, missing notebook specs, and slip OCR fallback | Task-specific none/low-first policy, one-level quality escalation, usage/cost telemetry, budget guards |
| Anthropic Claude | Direct REST to Messages API, structured tool output | Sonnet 4.6 (text), Haiku 4.5 (vision) | Automatic model fallback for migrated OpenAI tasks | Typed failure propagation; up to four configured keys |
| Parallel | `parallel-web` Search API | Search mode `turbo` by default | Primary market-web discovery | Bounded results/excerpts, timeout, cost metadata, fresh/stale Redis cache |
| Exa | `exa-js` instant search | n/a | Search fallback when Parallel fails/has no usable evidence | Bounded highlights/results and timeout |
| SerpAPI | REST | Google Shopping Light | Structured price candidates for the representative-price estimator | App-level handling |

Key integration properties:
- Provider abstraction: `lib/services/openai-llm.ts` centralizes the primary Responses API behavior, while `lib/services/anthropic-llm.ts` retains the previous implementation as fallback.
- Cost and latency control: deterministic calls start at `none`, reasoning/vision calls at `low`, and only quality-gated calls retry one level higher. Redis result/search caches, prompt caching, per-job/month budgets, and queue concurrency prevent uncontrolled burst spend.
- Data handling: item photos, fallback bank slips, and product text go to OpenAI; Anthropic may receive the same payload only on model fallback. Parallel/Exa and optional SerpAPI receive canonical product/spec search text without user ids, serials, or image URLs. Provider retention/no-training terms and the production OpenAI storage setting must be contractually confirmed.

#### AI and search provider assurance matrix (vendor-published, August 2026)

| Provider | Certification | Training on our data | Retention / ZDR | What we send | DD action |
|---|---|---|---|---|---|
| OpenAI | SOC 2 Type 2; CSA STAR; ISO 27001 family claimed on the trust page | API business data **not** used for training by default | Default abuse-monitoring retention (~30 days); **Zero Data Retention available on approval** for eligible endpoints | Item photos, product text, bank slips (fallback only) | Execute the DPA, apply for **ZDR**, and keep `OPENAI_STORE_RESPONSES=false` so responses are not persisted on their side |
| Anthropic | SOC 2 Type 2; ISO 27001 / ISO 42001 claimed on the trust page | Commercial API inputs/outputs **not** used for training by default | Vendor-stated retention window; ZDR by agreement | Same payloads as OpenAI, **fallback path only** | Execute the DPA; confirm the fallback is in scope of the same terms |
| Parallel Web Systems | **SOC 2 Type II**; HIPAA-compliant posture; trust centre at `trust.parallel.ai` | Vendor states zero data retention available | **ZDR offered on enterprise plans** | Canonicalized product/spec search strings only - no LINE ID, no serial, no image URL, no eKYC data | Request the SOC 2 Type II report and enable **ZDR** on the account |
| Exa | **SOC 2 Type II**; trust centre at `trust.exa.ai`; published vulnerability-disclosure policy | Vendor states ZDR is available on enterprise | **ZDR offered on enterprise plans** | Same canonicalized search strings; fallback path only | Request the SOC 2 Type II report and DPA; enable ZDR |
| SerpAPI | No certification published | n/a | n/a | Canonical product query only; **disabled by default** (`SERPAPI_ENABLED`) | Keep disabled unless a specific price-coverage need is proven |
| SlipOK | No certification published | n/a | Slip images are transmitted for verification | Bank-slip images (financial PII) | Highest-priority DPA gap of the payment stack - execute a DPA or replace with PSP settlement reconciliation |

The single most important point for a DD reader: **no personal data reaches the search providers**. The search path receives only a canonicalized product string such as `Apple MacBook Air M2 13 256GB` built by the normalization step. LINE user IDs, serial numbers, national IDs, eKYC media, and Blob image URLs are all excluded by construction, so the Parallel/Exa leg of the pipeline is out of scope for PDPA cross-border transfer analysis. The OpenAI/Anthropic leg **is** in scope because item photos and bank slips are personal data.

### 5.2 AI roadmap - the in-house condition model

The strategic AI plan is to replace third-party vision inference for item-condition assessment with an in-house, open-source model (full design in `SYSTEM_ARCHITECTURE.md` Section 14):

- Why: cap per-transaction AI cost, remove per-request egress of sensitive media to third parties (a privacy and PDPA win), and tune the model to the platform's actual collateral mix and pricing decision.
- How it integrates: the in-house model is introduced behind the same provider abstraction as a new "self-hosted condition" provider, exposed as a private REST inference endpoint on a GPU plane, selected by configuration - identical integration shape to the current providers.
- Rollout: shadow -> canary -> primary, with automatic fallback to the third-party providers on low confidence, timeout, or error.
- Data flywheel: drop-point physical verifications provide ground-truth labels; the model is trained and continuously improved on the platform's own data.

Net: the AI integration strategy is designed so that adding or substituting an AI provider - including the eventual in-house model - is a configuration change, not a re-integration.

---

## 6. Messaging and Channel - LINE

LINE is both the user channel and an identity source. Integration via `@line/bot-sdk` (server) and `@line/liff` (client):

- Official Accounts: four credential sets (customer, admin, investor, drop-point) for push/multicast/broadcast, Flex message UIs, and rich menus.
- LIFF: in-LINE mini-app login provides the user identity (`profile.userId`), used as the cross-cutting principal.
- Inbound: eight webhook entrypoints handle follow events, postbacks, image-message slip uploads, and cross-system callbacks, with LINE HMAC signature verification (enforcement consistency is a hardening item).
- Role in flows: every actor notification (approvals, payment instructions, ticket links, settlement summaries, eKYC outcomes) is delivered as a LINE Flex message.

---

## 7. Payments and Slip Verification (current state)

The current money movement is bilateral bank transfer with software-verified proof - not yet escrow.

- Slip verification: `lib/services/slip-verification.ts` calls SlipOK when configured. Without SlipOK it uses OpenAI Luna vision OCR, then Claude Haiku if OpenAI fails. It returns a verdict (`MATCHED | UNDERPAID | OVERPAID | UNREADABLE | INVALID`) and persists a `slip_verifications` record.
- Collection account: `getCompanyBankAccount` resolves an active company bank account (PromptPay), with a hard-coded fallback.
- Where it is used: redemption payments, penalty payments, door-to-door collateral-pickup delivery fees, and contract-action payments - each is a user uploading a transfer slip that the system verifies against an expected amount.
- Underlying rail: PromptPay / bank transfer (Thailand's national real-time rail).

Limitations driving the escrow plan: (a) verification is a proof-of-transfer check, not a guaranteed settlement; the OCR fallback carries a residual misread risk on a money-gating decision; (b) funds move directly between parties' bank accounts, which does not provide the conditional hold-and-release that a collateral-lending flow ideally wants (release investor funds to the borrower only after the collateral is verified at the drop point; route repayments back to the investor with the platform fee split); and (c) reconciliation is manual rather than settlement-confirmed.

---

## 8. Escrow and Funds-Flow Plan

This is the platform's most important forthcoming integration and is presented as a plan grounded in the Thai regulatory reality. Source citations are in the appendix; all regulatory points are "confirm with counsel".

### 8.1 The governing constraint (why design matters)

The single most load-bearing fact: under the Bank of Thailand's P2P lending regulation (Notification 4/2562, effective April 2019), a P2P lending platform is prohibited from holding the money of lenders and borrowers itself; custody must sit with either (a) an SEC-authorized custodian or (b) a BoT-authorized commercial bank escrow account. Separately, the Payment Systems Act B.E. 2560 (2017) requires a Designated Payment Service license for an entity that accepts/holds/routes third-party funds ("receipt of payment on behalf", "payment facilitating", or e-money) - with minimum paid-up capital from THB 10 million (facilitating / payment-on-behalf) up to THB 100 million (e-money). And the Escrow Act B.E. 2551 (2008) restricts statutory escrow-agent status to banks and specifically licensed juristic persons.

Conclusion for the architecture: Astly must not build a "hold customer funds on our own balance" model. The funds custody leg must be a licensed third party. There are three compliant structural options, in order of practicality:

1. Licensed-PSP managed-payout / split model (recommended first): a BoT-regulated Payment Service Provider collects funds and holds them in the PSP's regulated balance / sub-accounts, then releases and splits to recipients on conditions defined by Astly's application logic. Astly orchestrates the flow by API but is never the legal custodian of client money - the exact regulatory benefit needed. (Whether a PSP managed-payout model is accepted by BoT as satisfying the P2P "qualified custodian / bank escrow" requirement specifically is to confirm with counsel/BoT.)
2. Bank escrow account (directly compliant custody leg): a BoT-authorized commercial bank holds the escrowed loan funds under the Escrow Act, with Astly using the bank's Open APIs (PromptPay/QR collection, statements) for orchestration and reconciliation. This is the most directly compliant option but has the longest onboarding and is partly a commercial/legal arrangement rather than a self-serve API.
3. SEC-authorized custodian: the alternative custodian named in the BoT P2P rule, suited if the structure is treated as investment-like; integration is bespoke per custodian.

### 8.2 Provider options (evaluated)

| Provider | Model | Fit for Astly's split-and-release flow | Notes |
|---|---|---|---|
| Xendit (XenPlatform) / GB Prime Pay | Marketplace sub-accounts + Split Payments + payouts; GB Prime Pay (BoT-regulated) supplies Thai rails (PromptPay, cards, e-wallets) | Strongest fit - purpose-built multi-party money flow; lets the platform avoid "holding" funds | Confirm Thai-specific availability of split/sub-account settlement and local-entity constraints |
| Opn Payments (formerly Omise) | Collection + Recipients API + Transfers API (one-time/scheduled); funds sit in merchant Opn balance until transfer = de-facto hold-and-release | Good fit; marketplace assembled from Recipients + Transfers; Bangkok-based, Thailand-native | Not a turnkey contractual escrow; release-on-condition is app logic |
| 2C2P (Antom/Ant Group) | SE-Asia PSP with split payments, marketplace sub-merchants, and a dedicated Payout suite (Beneficiary/Payout/Inquiry APIs) | Good fit for split + payout | No explicit contractual escrow product; hold-and-release is app logic |
| Thai bank escrow (KBank / SCB / Bangkok Bank) | Bank holds escrowed funds (Escrow Act + BoT permission); bank Open APIs for collection/reconciliation | The directly compliant custody leg for a licensed P2P | Longer onboarding; conditional release typically bank-operated; commercial+legal setup |
| SEC-authorized custodian | Custodian holds lender/borrower funds | Compliant alternative custody leg | Bespoke integration; identify a specific custodian |
| Tazapay | Turnkey cross-border digital escrow API (hold, conditional release, payout) | Closest to "escrow-as-a-service" | Escrow license likely held outside Thailand - may not satisfy the domestic P2P custodian rule; cross-border/secondary; confirm acceptability |
| Beam (UOB-backed) | BoT-regulated checkout/collection (cards, e-wallets, PromptPay) | Collection only - no surfaced split/payout | Lower priority for funds routing |

Recommendation: pursue a licensed-PSP managed-payout/split integration (Xendit/GB Prime Pay or Opn or 2C2P) as the primary path for speed, with a bank escrow arrangement as the compliant custody backbone if/when the platform operates under a P2P license. Decide jointly with counsel based on the platform's final legal structure (see 8.5).

### 8.3 Target escrow funds-flow (design)

The intended conditional flow, mapped onto the existing collateral lifecycle:

1. Investor funds in: investor pays the loan principal via PSP collection (PromptPay/QR/card). Funds settle into the PSP-held escrow / sub-account, not Astly's account.
2. Conditional release to borrower: funds are released to the borrower only after the collateral is physically verified and accepted at the drop point (`item_delivery_status = VERIFIED`) - the existing drop-point verification becomes the release trigger via a payout API call (or a bank conditional-release instruction).
3. Repayment routing with split: on redemption/repayment, the borrower pays into the PSP; the PSP split rule routes principal + interest to the investor and the platform fee to Astly automatically on settlement.
4. Default handling: on default, the collateral (already in custody at the drop point) is liquidated per the contract, and proceeds are routed to the investor through the same split mechanism.
5. Reconciliation: every leg is confirmed by a PSP/bank settlement webhook (replacing the manual slip-OCR verification with settlement-confirmed reconciliation), with idempotent handling and an auditable ledger.

This preserves the platform's role as an orchestrator and record-keeper while the regulated partner is the legal holder and mover of funds.

### 8.4 Integration design

- Onboarding: each investor and borrower is registered as a payee/recipient (Opn Recipients) or sub-account (XenPlatform) with verified bank details, tied to their eKYC-verified identity.
- Collection: PSP collection (PromptPay QR/card) with a settlement webhook; the webhook (not a user-uploaded slip) confirms receipt.
- Hold and release: funds remain in the PSP escrow/sub-account; release is triggered by an internal event (drop-point VERIFIED) via a payout/transfer API call, made idempotent with a unique reference per loan leg.
- Split: configure split/commission rules so principal/interest and platform fee are routed automatically on settlement.
- Reconciliation and ledger: maintain an internal double-entry ledger reconciled against PSP settlement reports; expose an audit trail for AML/finance.
- Failure handling: typed verdicts, retries with backoff, and a manual-review queue for exceptions; never auto-release on ambiguous state.
- Abstraction: implement behind a "funds provider" abstraction (mirroring the AI provider abstraction) so the PSP/bank can be swapped without touching lifecycle logic.

### 8.5 Compliance and licensing path (to run with counsel)

- Threshold legal question: whether Astly's collateral-backed structure is legally "P2P lending" under BoT Notification 4/2562 (triggering the no-hold-funds rule, the BoT sandbox, and the Ministry-of-Finance license, with THB 5M capital and 75% Thai ownership) or sits on a secured-lending legal basis under separate Thai law. This determination drives the entire funds-flow and is the first item for counsel.
- AML controls: build CDD (already via eKYC), sanctions/PEP screening, transaction monitoring, CTR/STR reporting, and 5-year record retention into the funds-flow; ensure the licensed fund-holder (PSP/bank) and Astly each carry their respective AML duties.
- Sequencing: (1) counsel determines legal structure and custody requirement; (2) select PSP and/or bank escrow partner; (3) integrate collection + hold/release + split + reconciliation behind the funds-provider abstraction; (4) migrate off the manual SlipOK model; (5) if P2P-licensed, enter the BoT sandbox before scaling.

### 8.6 Migration from the current model

The SlipOK + bank-transfer model continues to operate during the build; the PSP integration is introduced behind the funds-provider abstraction and rolled out per money flow (e.g., redemption first), with slip verification retained as a transitional fallback until settlement-confirmed reconciliation is proven. This mirrors the AI shadow->canary->primary discipline.

---

## 9. Object Storage and Adjacent Systems

- Vercel Blob: integrated through `@vercel/blob`; media (item photos, slips, contracts, tickets, QR) is stored in a private project-connected store and accessed through time-limited, pathname-scoped signed URLs or dedicated server reads. Detail in `INFRASTRUCTURE.md` Section 7.
- Shop System: a separate, independently deployed application integrated over signed HTTP (HMAC over a notification id and timestamp, 5-minute replay window). It performs negotiation and payment verification and calls back into the platform to advance the asynchronous lifecycle state machine.

---

## 10. Integration Security and Reliability

| Concern | Control |
|---|---|
| Credential protection | All keys in server-side Vercel env vars; none in the browser; AI keys rotated (4 per provider) |
| Inbound authenticity | LINE/Shop System signatures; UpPass role-specific Basic Auth fail closed. Legacy LINE enforcement consistency remains a hardening item |
| Replay protection | Shop System callbacks enforce a 5-minute timestamp window |
| Rate-limit resilience | Vercel Queue backpressure, Redis concurrency leases, typed `Retry-After`, bounded retry, then provider fallback where safe |
| Idempotency | Queue idempotency keys + processing leases; eKYC durable unique inbox and conditional transitions; planned payout references |
| Failure isolation | OpenAI->Anthropic for model work; Parallel->Exa->stale cache for search; application DLQs for exhausted deliveries |
| Data minimization | Hosted eKYC keeps raw identity media with the vendor; Blob media access uses time-limited signed URLs |

---

## 11. Integration Risk Register and DD Checklist

| # | Risk / open item | Severity | Action |
|---|---|---|---|
| I1 | Funds custody must be a licensed third party (P2P no-hold rule) | High | Adopt licensed-PSP / bank-escrow model; never hold funds on platform balance; confirm with counsel |
| I2 | Legal structure (P2P vs a secured-lending legal basis under separate Thai law) undetermined | High | Counsel to determine; it drives custody, licensing, and capital requirements |
| I3 | Manual slip verification has OCR-misread residual risk on money decisions | Medium | Migrate to PSP settlement-confirmed reconciliation |
| I4 | Webhook signature enforcement inconsistent | Medium | Enforce strict verification (reject on mismatch) on all inbound webhooks |
| I5 | AI provider no-training / retention posture unconfirmed (photos + slips) | High | Confirm OpenAI storage/retention terms for `store: true` and execute applicable DPA/ZDR terms; retain Anthropic fallback terms |
| I6 | UPPASS contract terms (liveness, AML screening, retention, DPA) | Medium | Confirm capabilities and execute DPA; consider NDID high-assurance tier as a roadmap |
| I7 | Duplicated eKYC initiate/webhook code paths | Low | Refactor to a single shared module |
| I8 | AML program (screening, monitoring, STR, retention) | High | Build into the funds-flow with the licensed partner; confirm with counsel |
| I9 | **UPPASS publishes no liveness/PAD certification** (no ISO/IEC 30107-3, no iBeta level) | High | Obtain the PAD test report and level; if unavailable, treat the current tier as *document + selfie* assurance only and gate high-value lending on a higher-assurance tier (NDID/DOPA) |
| I10 | **UPPASS webhooks are unsigned by design** (Basic Auth is the only vendor control) | Medium | Compensated in-platform (fail-closed Basic Auth, replay hash, monotonic state machine, no raw payload persistence). Ask the vendor for HMAC signing or source-IP ranges; keep the compensating controls until then |
| I11 | Search providers (Parallel/Exa) not yet on **ZDR** contracts | Low | Both publish SOC 2 Type II and offer ZDR on enterprise. No personal data is sent today, so this is hygiene rather than exposure - request reports and enable ZDR |
| I12 | **SlipOK has no published certification and no DPA**, yet receives bank-slip images | High | Highest-priority processor gap in the payment stack. Execute a DPA or move to PSP settlement reconciliation |
| I13 | Provider quota is a shared, finite resource across all traffic | Medium | Mitigated by the Redis provider-capacity limiter (RPM/TPM/concurrency, fail-closed) and the budget guard; confirm actual account tier limits and set `PROVIDER_CAPACITY_*` to match |

DD checklist (data-room items): executed DPAs (UPPASS, AI providers, search providers, SlipOK, PSP); AI/search provider ZDR confirmations; **UPPASS ISO 27001 certificate IS773635 (BSI) PDF + Statement of Applicability + scope**; UPPASS liveness/PAD test report; UPPASS data-centre region and retention/deletion SLA; SOC 2 Type II reports for Parallel and Exa; counsel memo on legal structure and custody requirement; selected PSP/bank and the funds-flow design sign-off; AML policy and STR procedure; signature-verification hardening status.

---

## 12. Appendix - Endpoints, Credentials, and Sources

Integration endpoints and credentials (env vars):
- UPPASS: role-specific API URL/key/form slug/allowed hosts and `UPPASS_WEBHOOK_AUTH_MODE=basic`, `UPPASS_WEBHOOK_BASIC_USERNAME`, `UPPASS_WEBHOOK_BASIC_PASSWORD` plus `_INVEST`; endpoints `/{lang}/api/forms/{slug}/create/` and webhooks `/api/ekyc/webhook`, `/api/webhooks/uppass-invest`.
- OpenAI: `OPENAI_API_KEY(_2/_3/_4)`, Luna/Terra model names, task effort overrides, timeout, safety-id secret, and job/month budget controls.
- Anthropic fallback: `ANTHROPIC_API_KEY(_2/_3/_4)`, text/vision model names. Search: `PARALLEL_API_KEY`, `PARALLEL_SEARCH_MODE`, `EXA_API_KEY`, search cache TTLs. SerpAPI remains optional.
- LINE: per-actor channel tokens/secrets (`LINE_CHANNEL_ACCESS_TOKEN`/`_SECRET`, `_INVEST`, `_DROPPOINT`, `LINE_ADMIN_*`, `LINE_STORE_*`).
- SlipOK: `SLIPOK_API_URL`, `SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`, `SLIPOK_PASSWORD`.
- Shop System: `SHOP_SYSTEM_URL`, `WEBHOOK_SECRET`. Blob: `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`.
- Escrow (planned): PSP/bank credentials to be added behind a "funds provider" abstraction.

Regulatory and provider sources (public, as of mid-2026; confirm currency at diligence time):
- P2P lending / no-hold rule: BoT Notification 4/2562 (2019); tilleke.com, silklegal.com, bot.or.th P2P sandbox page.
- Escrow Act B.E. 2551 (2008): FPO/BoT documents; thailand.acclime.com; thai-laws.com.
- Payment Systems Act B.E. 2560 (2017) and license/capital tiers: bot.or.th; belaws.com; lexology.com; fosrlaw.com.
- AML/CFT (AMLA B.E. 2542; CDD Reg B.E. 2563): juslaws.com; lexology.com.
- Providers: xendit.co / gbprimepay.com; docs.omise.co / docs.opn.ooo; developer.2c2p.com; KBank/SCB/Bangkok Bank developer portals; tazapay.com; beamcheckout.com.
- eKYC: uppass.io (company/about page - ISO 27001 by BSI No. IS773635, entity "Collective Wisdom Co., Ltd."); uppass.io/help/docs/user-guide/flows/connect/ (webhook auth modes, Webhook Version 2); uppass.io/blog/thai-identity-assurance-level/ (Thai IAL); ndid.co.th; biometricupdate.com; scbtechx.io; ibeta.com (ISO/IEC 30107-3 PAD testing, NVLAP lab code 200962-0).
- AI/search provider assurance: openai.com enterprise-privacy / api-data-usage-policies; anthropic.com trust centre; trust.parallel.ai (SOC 2 Type II, ZDR); trust.exa.ai and exa.ai/docs/reference/security (SOC 2 Type II, ZDR on enterprise).

All regulatory statements are summaries of public sources for engineering planning and must be validated by qualified Thai counsel before implementation.
