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
| UPPASS | Identity / eKYC | Live | Outbound + inbound webhook | REST (hosted form + API) | Bearer API key; inbound HMAC `x-uppass-signature` |
| Anthropic Claude | AI (text + vision) | Live | Outbound | REST (Messages API, direct) | `x-api-key` (4-key rotation) |
| Google Gemini | AI (vision) | Live | Outbound | SDK | API key (4-key rotation) |
| OpenAI | AI (optional search) | Live (optional) | Outbound | SDK | API key (4-key rotation) |
| SerpAPI | Price data | Live | Outbound | REST | API key |
| LINE Messaging API | Messaging | Live | Outbound push + inbound webhook | SDK / REST | Channel access token; inbound HMAC |
| LINE LIFF | Identity (channel login) | Live | Client SDK | SDK | LINE Login (OAuth) |
| SlipOK | Payment-slip verification | Live | Outbound | REST | `x-authorization` |
| AWS S3 | Object storage | Live | Outbound | AWS SDK | IAM key; presigned URLs |
| Shop System | Adjacent platform | Live | Outbound + inbound callback | REST | HMAC-signed |
| Escrow / funds custody | Payments / custody | Planned | Outbound + webhook | REST (PSP) or bank arrangement | TBD (provider) |
| In-house condition model | AI (vision) | Planned | Outbound (private endpoint) | REST | Private network / token |

---

## 2. Integration Architecture and Conventions

All external integrations follow a small set of consistent patterns, which is itself a due-diligence positive (uniform, auditable handling):

- Server-side only. Every third-party credential lives in a Vercel environment variable and is used only from server-side functions; nothing sensitive is exposed to the browser.
- Two integration styles: synchronous REST/SDK calls for request/response work, and signed inbound webhooks for asynchronous results (eKYC outcomes, payment callbacks, LINE events).
- Inbound authenticity by signature. Webhooks are verified by HMAC signatures per provider (LINE base64 HMAC; Shop System HMAC-hex over a notification id and timestamp with a 5-minute replay window; UPPASS `x-uppass-signature`). Note: signature enforcement is currently inconsistent across endpoints (some log-and-continue or skip when unsigned) - a hardening item tracked in the risk registers.
- Resilience by key rotation. AI providers each rotate across up to four API keys and degrade gracefully on rate-limit/quota errors.
- Provider abstraction. AI/OCR integrations sit behind thin internal abstractions so a model, vendor, or the future in-house model can be substituted by configuration.
- Graceful degradation. Each external dependency has a defined fallback (SlipOK -> Claude vision; AI provider down -> minimum price / unreadable verdict; cache miss -> recompute).
- Idempotency. Webhook handlers and queue drains are designed to tolerate at-least-once and duplicate delivery.

---

## 3. Identity and KYC - UPPASS (current) and the Thai eKYC landscape

### 3.1 Current UPPASS integration (implemented)

UPPASS (uppass.io) is the platform's electronic Know-Your-Customer provider, integrated per actor (borrowers and investors verify independently).

Integration mechanics (as implemented):

- Initiation: `POST {UPPASS_API_URL}/th/api/forms/{formSlug}/create/` with `Authorization: Bearer {UPPASS_API_KEY}` and a body that pre-fills known answers (`th_first_name`, `th_last_name`, `id_card_number`). The response returns a hosted verification `form_url` and a session `slug`. The platform stores `uppass_slug` and `ekyc_url` on the actor record and sets `kyc_status = PENDING`. An existing pending session URL is reused if verification has not completed.
- Verification UX: the user is directed to the hosted UPPASS form (in-LINE), where document capture and biometric checks occur; the platform does not handle raw identity media itself for this flow.
- Result callback (webhook): UPPASS posts to `/api/ekyc/webhook` (borrowers) or `/api/webhooks/uppass-invest` (investors), with an optional `x-uppass-signature` HMAC (verified against `UPPASS_WEBHOOK_SECRET`). Events handled: `submit_form`, `update_status`, `drop_off`, and the front-card / liveness "max attempts reached" events. Status mapping: `application.status = complete` with `other_status.ekyc = pass -> VERIFIED`, `fail -> REJECTED`, `need_review -> PENDING`; `drop_off -> NOT_VERIFIED`; max-attempts -> REJECTED. The record is matched by `uppass_slug`, the `kyc_status` (and `kyc_verified_at`) updated, and the user notified over LINE.
- Per-actor configuration: the investor path falls back to the borrower form/key when its own (`UPPASS_FORM_SLUG_INVEST`, `UPPASS_API_KEY_INVEST`) are unset. The two `initiate` routes and the two webhooks are near-duplicates (a refactor candidate).

Integration model summary: a hosted-form + webhook + API-key pattern on a Thailand (`/th/`) endpoint - low integration surface, with the sensitive capture handled by the vendor.

### 3.2 UPPASS product capabilities (per vendor, to confirm in contract)

UPPASS positions itself as an AI-powered verification platform for Southeast Asia (public client logos include Thai fintech/telecom names). Capabilities relevant here (source: uppass.io):

- Personalized eKYC: configurable biometric eKYC, ID verification, bank-statement verification, and email/mobile verification, with non-Roman-character OCR tuned for lower false positives and validation against local identity datasets, plus fraud-service integration and pass/fail behavioral tracking.
- eKYB / screening: AML, PEP, and adverse-media screening across directors/shareholders/UBOs, sanctions screening, UBO discovery, document authenticity checks, and scheduled re-KYB / continuous monitoring (relevant if institutional investors are onboarded).
- Integration tooling: a no-code Verifications Builder with a risk-based Decision Workflow, secure data-passing APIs, and file-upload APIs; developer hub at docs.uppass.io.
- Compliance claims: ISO/IEC 27001 certified, GDPR- and PDPA-compliant, with customer-controlled retention/deletion.

Items to confirm directly with UPPASS for the data room: explicit liveness/face-match method, AML/PEP screening inclusion for the borrower flow, data-retention windows, NDID connectivity (if any), and the executed DPA.

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
| Anthropic Claude | Direct REST to the Messages API (no SDK), structured output via tool-use, server-side `web_search` (+ optional `web_fetch`) tools | Sonnet 4.6 (text), Haiku 4.5 (vision) | Input normalization, search-result filtering, live web-search pricing; item-photo precheck; bank-slip OCR fallback | 4-key rotation; graceful degradation to minimum price / unreadable |
| Google Gemini | `@google/generative-ai` SDK | Gemini Flash | Item-condition scoring on a fixed rubric | 4-key rotation |
| OpenAI | `openai` SDK | gpt-4.1 family | Optional alternate web-search price provider (text only), selected by `PRICE_SEARCH_PROVIDER` | 4-key rotation |
| SerpAPI | REST | Google Shopping Light | Structured price candidates for the representative-price estimator | App-level handling |

Key integration properties:
- Provider abstraction: a shared internal client (`lib/services/anthropic-llm.ts`) and a configuration layer mean models and providers are swappable without business-logic changes (`ANTHROPIC_MODEL`, `ANTHROPIC_VISION_MODEL`, `PRICE_SEARCH_PROVIDER`, `PRICE_SEARCH_MODEL`).
- Cost and latency control: model tiering (large model for reasoning, small for high-volume vision), a content-hash response cache, and structured tool-use for reliable JSON.
- Data-handling posture (critical for DD): item photos and bank slips are sent to Anthropic and Google; product text to OpenAI/SerpAPI. The no-training / retention posture of each provider must be contractually confirmed (Anthropic ZDR/BAA; OpenAI ZDR; Gemini paid tier / Vertex, never the free tier). Detail and provider-by-provider defaults are in `INFRASTRUCTURE.md` Section 9.

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

- Slip verification: `lib/services/slip-verification.ts` calls the SlipOK API (`https://api.slipok.com/api/line/apikey/{branchId}`, header `x-authorization`) when configured, otherwise falls back to Claude Haiku vision OCR. It returns a verdict (`MATCHED | UNDERPAID | OVERPAID | UNREADABLE | INVALID`) and persists a `slip_verifications` record.
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

- AWS S3: integrated via the AWS SDK v3; all media (item photos, slips, contracts, tickets, QR) is stored privately and accessed through time-limited presigned URLs. Detail in `INFRASTRUCTURE.md` Section 7.
- Shop System: a separate, independently deployed application integrated over signed HTTP (HMAC over a notification id and timestamp, 5-minute replay window). It performs negotiation and payment verification and calls back into the platform to advance the asynchronous lifecycle state machine.

---

## 10. Integration Security and Reliability

| Concern | Control |
|---|---|
| Credential protection | All keys in server-side Vercel env vars; none in the browser; AI keys rotated (4 per provider) |
| Inbound authenticity | HMAC signature verification per provider (LINE, Shop System, UPPASS); enforcement consistency is a hardening item |
| Replay protection | Shop System callbacks enforce a 5-minute timestamp window |
| Rate-limit resilience | Multi-key rotation and graceful degradation on AI providers |
| Idempotency | Event-dedup on the customer webhook; bounded retries on the ticket queue; planned idempotent payout references |
| Failure isolation | Defined fallbacks (SlipOK->Claude vision; AI->min price/unreadable; cache miss->recompute) |
| Data minimization | Hosted eKYC keeps raw identity media with the vendor; media access via presigned URLs |

---

## 11. Integration Risk Register and DD Checklist

| # | Risk / open item | Severity | Action |
|---|---|---|---|
| I1 | Funds custody must be a licensed third party (P2P no-hold rule) | High | Adopt licensed-PSP / bank-escrow model; never hold funds on platform balance; confirm with counsel |
| I2 | Legal structure (P2P vs a secured-lending legal basis under separate Thai law) undetermined | High | Counsel to determine; it drives custody, licensing, and capital requirements |
| I3 | Manual slip verification has OCR-misread residual risk on money decisions | Medium | Migrate to PSP settlement-confirmed reconciliation |
| I4 | Webhook signature enforcement inconsistent | Medium | Enforce strict verification (reject on mismatch) on all inbound webhooks |
| I5 | AI provider no-training / ZDR / BAA posture unconfirmed (photos + slips) | High | Execute ZDR/BAA (Anthropic), ZDR (OpenAI), paid-tier/Vertex (Gemini); never Gemini free tier |
| I6 | UPPASS contract terms (liveness, AML screening, retention, DPA) | Medium | Confirm capabilities and execute DPA; consider NDID high-assurance tier as a roadmap |
| I7 | Duplicated eKYC initiate/webhook code paths | Low | Refactor to a single shared module |
| I8 | AML program (screening, monitoring, STR, retention) | High | Build into the funds-flow with the licensed partner; confirm with counsel |

DD checklist (data-room items): executed DPAs (UPPASS, AI providers, PSP); AI provider ZDR/BAA confirmations; counsel memo on legal structure and custody requirement; selected PSP/bank and the funds-flow design sign-off; AML policy and STR procedure; signature-verification hardening status.

---

## 12. Appendix - Endpoints, Credentials, and Sources

Integration endpoints and credentials (env vars):
- UPPASS: `UPPASS_API_URL` (default `https://app.uppass.io`), `UPPASS_API_KEY`, `UPPASS_FORM_SLUG`, `UPPASS_WEBHOOK_SECRET`, and `*_INVEST` equivalents; endpoints `/{lang}/api/forms/{slug}/create/` and webhooks `/api/ekyc/webhook`, `/api/webhooks/uppass-invest`.
- Anthropic: `https://api.anthropic.com/v1/messages`, `ANTHROPIC_API_KEY(_2/_3/_4)`, `ANTHROPIC_MODEL`, `ANTHROPIC_VISION_MODEL`.
- Gemini: `GEMINI_API_KEY(_2/_3/_4)`. OpenAI: `OPENAI_API_KEY(_2/_3/_4)`, `PRICE_SEARCH_PROVIDER`, `PRICE_SEARCH_MODEL`. SerpAPI: `SERPAPI_API_KEY`, `SERPAPI_ENABLED`.
- LINE: per-actor channel tokens/secrets (`LINE_CHANNEL_ACCESS_TOKEN`/`_SECRET`, `_INVEST`, `_DROPPOINT`, `LINE_ADMIN_*`, `LINE_STORE_*`).
- SlipOK: `SLIPOK_API_URL`, `SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`, `SLIPOK_PASSWORD`.
- Shop System: `SHOP_SYSTEM_URL`, `WEBHOOK_SECRET`. S3: `AWS_*`.
- Escrow (planned): PSP/bank credentials to be added behind a "funds provider" abstraction.

Regulatory and provider sources (public, as of mid-2026; confirm currency at diligence time):
- P2P lending / no-hold rule: BoT Notification 4/2562 (2019); tilleke.com, silklegal.com, bot.or.th P2P sandbox page.
- Escrow Act B.E. 2551 (2008): FPO/BoT documents; thailand.acclime.com; thai-laws.com.
- Payment Systems Act B.E. 2560 (2017) and license/capital tiers: bot.or.th; belaws.com; lexology.com; fosrlaw.com.
- AML/CFT (AMLA B.E. 2542; CDD Reg B.E. 2563): juslaws.com; lexology.com.
- Providers: xendit.co / gbprimepay.com; docs.omise.co / docs.opn.ooo; developer.2c2p.com; KBank/SCB/Bangkok Bank developer portals; tazapay.com; beamcheckout.com.
- eKYC: uppass.io; ndid.co.th; biometricupdate.com; scbtechx.io.

All regulatory statements are summaries of public sources for engineering planning and must be validated by qualified Thai counsel before implementation.
