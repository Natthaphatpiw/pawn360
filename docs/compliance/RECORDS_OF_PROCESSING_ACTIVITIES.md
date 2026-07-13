# Astly - Records of Processing Activities (RoPA)
Status: Living document - prepared for investor technical due diligence and operational adoption.
Owner: Data Protection Officer (DPO) [to be appointed], Astly Co., Ltd. [registration to confirm].
Version: 0.1 (draft) | Last updated: [date] | Review: at least annually or on material change.
Scope: The Sec 39 record of Astly's personal-data processing activities - data categories, purposes, lawful bases, recipients, cross-border transfers, retention and security measures.
Related: `../../DATA_PRIVACY_COMPLIANCE.md` (parent analysis), and siblings: `PRIVACY_POLICY.md`, `CONSENT_POLICY.md`, `DATA_RETENTION_AND_DELETION_POLICY.md`, `DATA_BREACH_NOTIFICATION_POLICY.md`, `DATA_PROCESSING_AGREEMENTS.md`.

> **Legal note.** This document is an internal compliance record, not legal advice. It is drafted against the Thailand Personal Data Protection Act B.E. 2562 (2019) ("PDPA"). Section references are indicative and must be validated with Thai data-protection counsel before this register is relied upon. Items marked "(to confirm with Thai data-protection counsel)" or "(confirm)" require verification before sign-off. Astly operates a P2P secured, collateral-backed lending service under the applicable Thai secured-lending legal basis (a separate Thai law); this RoPA addresses only personal-data processing under the PDPA.

---

## 1. Controller identity and DPO contact (Sec 39)

PDPA Sec 39 requires a Data Controller to maintain a record of processing activities and to make the controller's and DPO's identities available to data subjects and to the Office of the Personal Data Protection Committee (PDPC).

| Field | Value |
| --- | --- |
| Data Controller | Astly Co., Ltd. |
| Registration no. | [Astly Co., Ltd. registration no.] |
| Registered address | [registered address] |
| Trading domain | Astly.co |
| Product | Astly - P2P secured, collateral-backed lending platform (Thailand) |
| Data Protection Officer (DPO) | [DPO name] (to be appointed) |
| DPO email | [dpo@astly.co] |
| DPO postal contact | [registered address], attn. Data Protection Officer |
| Processor engagements | See Section 5 and `DATA_PROCESSING_AGREEMENTS.md` |

Astly is the **Data Controller** for all processing in this register. Third-party vendors listed in Section 5 act as **Data Processors** (or independent controllers where noted) under written agreements.

---

## 2. Why a full RoPA applies

PDPA Sec 39 paragraph 2, read with PDPC subordinate notifications, provides a narrowed record-keeping obligation for small organisations. Astly does **not** rely on that relief because:

- Astly processes **sensitive personal data** - biometric face-match / liveness data under Sec 26 - as a core, routine part of onboarding, not occasionally.
- Astly processes **financial data** (bank accounts, bank slips, loan and repayment records) and **national identification data** at scale across borrowers, investors and drop-point operators.
- Processing is continuous and central to the service, not incidental.

On that basis Astly maintains the **full** Sec 39 register below. (The precise scope of the small-organisation exemption is to confirm with Thai data-protection counsel; Astly treats it as inapplicable regardless.)

---

## 3. Processing-activity register (core Sec 39 record)

One row per processing activity. "SENSITIVE" flags Sec 26 special-category data. Lawful-basis citations are indicative and to be confirmed with counsel. Cross-border safeguards are detailed in Section 5 and `DATA_PROCESSING_AGREEMENTS.md`.

### (a) Account onboarding & authentication

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors, drop-point operators |
| Personal-data categories | Name, phone, address; PIN hash + session token (authentication data; PIN one-way bcrypt-hashed) |
| Purpose | Create and authenticate the account; secure access to sensitive actions |
| Lawful basis | Contract necessity (Sec 24(3)); legitimate interest for account security (Sec 24(5)) |
| Recipients / processors | Supabase, MongoDB Atlas, Vercel |
| Cross-border + safeguard | US (Vercel compute/logs); DB region (confirm) - DPA + SCC-equivalent clauses; Sec 28-29 |
| Retention | For the account lifetime + AML minimum (see Section 4); session tokens are short-lived and transient |
| Storage location | Supabase (`user_security` for PIN hash/token); MongoDB/Supabase (profile); Vercel logs |

### (b) KYC identity verification

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors |
| Personal-data categories | National ID number (general, elevated-risk); ID-card image (elevated-risk); name, phone, address |
| Purpose | Customer due diligence and identity verification (AML/CDD) prior to lending |
| Lawful basis | Legal obligation - AML/CDD (Sec 24(6)); contract necessity (Sec 24(3)) |
| Recipients / processors | UPPASS (eKYC vendor); Supabase |
| Cross-border + safeguard | ID images processed by UPPASS in SE Asia; number stored in Supabase (region confirm) - DPA required; Sec 28-29 |
| Retention | KYC records **>= 5 years** (AMLA) then delete/anonymise |
| Storage location | National ID number in Supabase; ID-card images at UPPASS |

### (c) eKYC biometric / liveness verification [SENSITIVE]

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors |
| Personal-data categories | **SENSITIVE** - biometric face-match / liveness data (Sec 26) |
| Purpose | Confirm the applicant is a live, genuine person matching the submitted ID (anti-impersonation) |
| Lawful basis | **Explicit consent (Sec 26)** for biometric processing; obtained before capture (see `CONSENT_POLICY.md`) |
| Recipients / processors | UPPASS (eKYC vendor) - holds the biometric data |
| Cross-border + safeguard | UPPASS in SE Asia - DPA required; explicit consent + SCC-equivalent safeguards; Sec 28-29 |
| Retention | **Shortest viable** - vendor deletion per DPA once verification outcome is recorded; Astly retains only the pass/fail status |
| Storage location | Biometric held at UPPASS vendor; verification status in Supabase (borrower / investor records) |

### (d) Item photo capture & AI valuation / condition scoring

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers |
| Personal-data categories | Item photographs (general); derived cache (normalised inputs, image content hashes) |
| Purpose | Value the collateral and score its condition to derive a loan offer |
| Lawful basis | Contract necessity (Sec 24(3)); legitimate interest in accurate valuation (Sec 24(5)) |
| Recipients / processors | AWS S3 (image storage); Anthropic (Claude - image precheck, condition/valuation vision, slip fallback); Google (Gemini - condition scoring); Upstash (cache) |
| Cross-border + safeguard | S3 in ap-southeast-2 (Sydney); Anthropic/Google in US - DPA with **no-training** and (for Anthropic) **zero-data-retention** terms; Sec 28-29 |
| Retention | S3 media lifecycle window (see Section 4); cache TTL ~30 days |
| Storage location | AWS S3 (Sydney); transient AI-provider processing (no retention where ZDR/no-training applies); Upstash cache |

### (e) Contract formation & custody

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors |
| Personal-data categories | Contracts, transaction records, custody records, loan/financial records; signatures |
| Purpose | Form the loan agreement, record collateral custody, and administer the loan |
| Lawful basis | Contract necessity (Sec 24(3)); legal compliance for record-keeping (Sec 24(6)) |
| Recipients / processors | MongoDB Atlas, Supabase; AWS S3 (contract HTML/PDF) |
| Cross-border + safeguard | DB region (confirm); S3 Sydney - DPA required; Sec 28-29 |
| Retention | Loan/financial records **>= 5 years** (AMLA) then delete/anonymise |
| Storage location | MongoDB/Supabase (records); AWS S3 (contract documents) |

### (f) Payment & bank-slip verification

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors |
| Personal-data categories | Bank slips (image), bank-account details, loan/financial records (general - financial) |
| Purpose | Verify that a payment (disbursement, interest, redemption) was actually made |
| Lawful basis | Contract necessity (Sec 24(3)); legitimate interest in fraud prevention (Sec 24(5)) |
| Recipients / processors | AWS S3 (slip storage); SlipOK (slip-verification API, when configured); Anthropic (Claude vision fallback); Supabase/MongoDB (records) |
| Cross-border + safeguard | S3 Sydney; Anthropic US (no-training + ZDR); SlipOK region (confirm) - DPA required; Sec 28-29 |
| Retention | Financial records **>= 5 years** (AMLA); slip images per S3 lifecycle window |
| Storage location | Slips in AWS S3; financial records in Supabase/MongoDB |

### (g) Redemption / extension / principal-change processing

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors |
| Personal-data categories | Loan/financial records, transaction records, notifications, payment slips |
| Purpose | Process redemption, extension and principal-increase/reduction requests and their approvals |
| Lawful basis | Contract necessity (Sec 24(3)); legal compliance for record-keeping (Sec 24(6)) |
| Recipients / processors | MongoDB Atlas (customer-facing flow), Supabase (investor/finance flow); AWS S3 (slips) |
| Cross-border + safeguard | DB region (confirm); S3 Sydney - DPA required; Sec 28-29 |
| Retention | Financial records **>= 5 years** (AMLA) then delete/anonymise |
| Storage location | MongoDB (customer view) and Supabase (investor/finance view) in parallel; slips in S3 |

### (h) AML monitoring & fraud prevention

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors, drop-point operators |
| Personal-data categories | Identity data, national ID number, financial/transaction records, device/session signals |
| Purpose | Anti-money-laundering monitoring, customer due diligence and fraud detection |
| Lawful basis | Legal obligation - AML (Sec 24(6)); legitimate interest in fraud prevention (Sec 24(5)) |
| Recipients / processors | Supabase, MongoDB Atlas; competent authorities on lawful request |
| Cross-border + safeguard | DB region (confirm) - DPA required; Sec 28-29 |
| Retention | **>= 5 years** (AMLA); may override erasure requests (see Section 6) |
| Storage location | Supabase/MongoDB; disclosures to authorities logged per Section 7 |

### (i) Drop-point intake / return logistics

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, drop-point operators |
| Personal-data categories | Name, phone, contract/custody records, verification photographs, delivery records; drop-point operator identity + location |
| Purpose | Route the collateral to a branch, verify intake, store, and return on repayment |
| Lawful basis | Contract necessity (Sec 24(3)); legitimate interest in secure logistics (Sec 24(5)) |
| Recipients / processors | Supabase; AWS S3 (verification/return photos); drop-point operators (as recipients performing intake/return) |
| Cross-border + safeguard | Supabase region (confirm); S3 Sydney - DPA required; Sec 28-29 |
| Retention | Custody/logistics records aligned to loan-record retention (see Section 4) |
| Storage location | Supabase (`drop_points`, `contracts`, delivery tables); AWS S3 (photos) |

### (j) Notifications / communications

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors, drop-point operators |
| Personal-data categories | Name, LINE user id, phone, notification/message content |
| Purpose | Operational and transactional messaging over the LINE LIFF apps and OA channels |
| Lawful basis | Contract necessity for transactional messages (Sec 24(3)); legitimate interest (Sec 24(5)) |
| Recipients / processors | LINE (messaging channel), MongoDB/Supabase (notification records), Vercel |
| Cross-border + safeguard | LINE processing region (confirm); Vercel US - DPA required; Sec 28-29 |
| Retention | Notification records per operational-record retention (see Section 4) |
| Storage location | MongoDB/Supabase (`notifications`); LINE platform for delivery |

### (k) Optional marketing

| Attribute | Detail |
| --- | --- |
| Data subjects | Borrowers, investors (opt-in only) |
| Personal-data categories | Name, phone, LINE user id, marketing preferences |
| Purpose | Promotional and product-update communications |
| Lawful basis | **Consent (Sec 19)** - opt-in, withdrawable at any time |
| Recipients / processors | LINE (messaging), Supabase/MongoDB (preference store) |
| Cross-border + safeguard | LINE region (confirm) - DPA required; Sec 28-29 |
| Retention | **Until consent withdrawal**, then cease and suppress |
| Storage location | Supabase/MongoDB (preference flags); LINE for delivery |

---

## 4. Personal-data inventory

| Data category | PDPA classification | Where held | Processor(s) |
| --- | --- | --- | --- |
| Name, phone, address | General | Supabase / MongoDB | Supabase, MongoDB Atlas |
| National ID number | General (elevated-risk) | Supabase | Supabase |
| ID-card image | General (elevated-risk) | UPPASS | UPPASS |
| eKYC face-match / liveness | **SENSITIVE - biometric (Sec 26)** | UPPASS vendor | UPPASS |
| Bank slips | General (financial) | AWS S3 | AWS, SlipOK, Anthropic (fallback) |
| Bank account, loan / financial records | General (financial) | Supabase / MongoDB | Supabase, MongoDB Atlas |
| Item photographs | General | AWS S3 | AWS, Anthropic, Google (Gemini) |
| Contracts, transactions, custody records, notifications | General | MongoDB / Supabase | MongoDB Atlas, Supabase |
| PIN hash + session token | Authentication data (PIN one-way hashed) | Supabase `user_security` | Supabase |
| Cache (normalised inputs, image hashes) | Derived, low sensitivity | Upstash | Upstash |

---

## 5. Recipients / processors summary

Cross-reference `DATA_PROCESSING_AGREEMENTS.md` for executed-DPA status and clause detail. All engagements below **require a DPA** under PDPA Sec 40 (processor obligations). Regions marked "(confirm)" are pending verification.

| Processor | Function | Region | DPA status |
| --- | --- | --- | --- |
| UPPASS | eKYC incl. **biometric** (Sec 26) | SE Asia | DPA required - retention/deletion terms; ISO 27001 / PDPA claims to confirm |
| Anthropic (Claude) | AI on item photos + bank slips | US | DPA required - **no-training + zero-data-retention critical** |
| Google (Gemini) | AI condition scoring | US (paid / Vertex) | DPA required - **no-training** |
| OpenAI | Optional web-search (product text only) | US | DPA required |
| Vercel | Hosting / compute / logs | US-default (configurable) | DPA required |
| Supabase | Primary database | AWS region (confirm) | DPA required |
| MongoDB Atlas | Operational database | AWS region (confirm) | DPA required |
| AWS S3 | Object storage | ap-southeast-2 (Sydney) | DPA required |
| Upstash | Cache | AWS region | DPA required |
| Payment PSP (planned) | Funds routing | TH / SE Asia | DPA required |

### Cross-border transfer basis (Sec 28-29)

Several processors host or process data outside Thailand: US processors (Anthropic, Google, OpenAI, Vercel, AWS, MongoDB Atlas, Upstash) and AWS S3 in Sydney. There is **no PDPC adequacy finding** for the United States. Astly relies on:

- **Contract-necessity derogation** (Sec 28) where the transfer is necessary to perform the contract with the data subject; and/or
- **Informed consent** to the cross-border transfer where necessity does not apply; and
- **SCC-equivalent contractual safeguards** embedded in each processor DPA (Sec 28-29).

Astly's stated mitigation plan is to **co-locate core databases in a Singapore region** to reduce US-transfer exposure. (Adequacy status, derogation applicability and safeguard sufficiency are to confirm with Thai data-protection counsel.)

---

## 6. Data-subject-rights fulfilment (Sec 30-36)

Requests are received at [dpo@astly.co] and actioned within **30 days** of a valid, identity-verified request (extendable where the PDPA permits, with notice). Cross-reference `PRIVACY_POLICY.md` for the subject-facing description.

| Right | PDPA Sec | Fulfilment method | Notes |
| --- | --- | --- | --- |
| Access + copy | Sec 30 | Export identity, contract, transaction and custody records to the subject | 30-day clock |
| Data portability | Sec 31 | Provide machine-readable export of consent/contract-based data | 30-day clock |
| Object to processing | Sec 32 | Halt legitimate-interest / marketing processing on request | Marketing objection honoured immediately |
| Erasure / destruction | Sec 33 | Delete or anonymise once no lawful retention basis remains | **AML retention (>= 5 yrs) can override** |
| Restriction | Sec 34 | Suspend processing pending verification / dispute | 30-day clock |
| Rectification | Sec 35-36 | Correct inaccurate or incomplete personal data | Propagate to both Supabase and MongoDB |
| Withdraw consent | Sec 19 | Withdraw biometric / marketing consent; cease dependent processing | Does not affect prior lawful processing |

**Retention override.** Where AML/AMLA record-keeping (>= 5 years) or another legal obligation applies, erasure is refused for the affected records and the refusal is logged (Section 7) with the legal basis. Biometric data is deleted at the vendor at the shortest viable point regardless of the loan record's retention.

---

## 7. Consent-exempt disclosures and rejected-request log (Sec 39)

Sec 39 requires a record of (i) disclosures made without consent under a lawful exemption and (ii) rejected data-subject requests, with reasons. Maintain the following log rows for each event.

### 7.1 Consent-exempt disclosure log (template)

| Date | Data subject / ref | Data disclosed | Recipient | Lawful exemption (PDPA Sec) | Authorised by | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| [YYYY-MM-DD] | [subject id] | [categories] | [recipient / authority] | [e.g. Sec 24(6) legal obligation] | [DPO / officer] | [request ref] |

### 7.2 Rejected data-subject-request log (template)

| Date received | Data subject / ref | Right requested (Sec) | Decision | Reason for rejection (PDPA Sec) | Decided by | Date notified |
| --- | --- | --- | --- | --- | --- | --- |
| [YYYY-MM-DD] | [subject id] | [e.g. Sec 33 erasure] | Rejected / partially fulfilled | [e.g. AMLA 5-yr retention override] | [DPO] | [YYYY-MM-DD] |

---

## 8. Security measures summary (Sec 37)

Sec 37 requires appropriate technical and organisational safeguards. Cross-reference `../../DATA_SECURITY.md` for full detail.

| Measure | Implementation |
| --- | --- |
| Encryption in transit | TLS on all connections |
| Encryption at rest | AES-256 across all data stores |
| Credential hashing | PIN hashed with bcrypt (cost 10); no plaintext PIN stored |
| Session handling | Opaque, short-lived session tokens (not long-lived cookies/JWTs) |
| Database exposure | No public database access; server-side privileged access only |
| Object storage | AWS S3 buckets private; access via presigned URLs only |
| Sensitive-data minimisation | Biometric data minimised and held at the eKYC vendor; Astly retains only pass/fail status |
| Processor controls | Written DPAs with no-training / ZDR / deletion terms (Section 5) |

---

## 9. Maintenance note

- **Owner:** the DPO ([DPO name], to be appointed) maintains this RoPA on behalf of Astly Co., Ltd.
- **Review cadence:** reviewed at least **annually**, and on any **material change** - a new processing activity, a new processor or region, a change of lawful basis, or a change in retention.
- **Change triggers:** onboarding a payment PSP, relocating databases to Singapore, adding/removing an AI provider, or any new sensitive-data processing must be reflected here before go-live.
- **Version control:** update the Version and Last-updated fields in the header on each change; retain prior versions in git history.
- **Open confirmations:** DPO appointment, company registration/address, DB regions, and all "(confirm)" / "(to confirm with Thai data-protection counsel)" items must be closed before this register is treated as final.
