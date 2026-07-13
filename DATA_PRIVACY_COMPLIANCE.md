# Astly - Data Privacy Compliance (Thailand PDPA)

Status: Living document, prepared for investor technical due diligence
Scope: How Astly complies with Thailand's Personal Data Protection Act (PDPA, B.E. 2562 / 2019) - the controller/processor/data-subject roles, lawful bases and consent, the personal-data inventory, the data-flow lifecycle, storage standards, who may access data, data-subject rights, cross-border transfer, retention and deletion, breach notification, governance (RoPA, DPO, privacy notice), an honest compliance-gap assessment, and penalties.
Companion documents: [`DATA_SECURITY.md`](DATA_SECURITY.md), [`AUTHENTICATION_AND_AUTHORIZATION.md`](AUTHENTICATION_AND_AUTHORIZATION.md), [`THIRD_PARTY_INTEGRATIONS.md`](THIRD_PARTY_INTEGRATIONS.md), [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).

> Legal note: this document summarizes the PDPA from the official translation and reputable practitioner sources (cited) and maps it to Astly's implementation. It is engineering/compliance planning input, not legal advice. PDPA sub-regulations (PDPC notifications) continue to be issued; every regulatory conclusion - especially the national-ID classification, the cross-border-transfer basis, DPO necessity, and breach specifics - must be confirmed with qualified Thai data-protection counsel.

---

## Table of Contents

1. PDPA at a Glance
2. Roles: Controller, Processors, Data Subjects
3. Personal Data Inventory and Classification
4. Lawful Bases and Consent
5. Data-Flow Lifecycle (Collection -> Use -> Storage -> Disclosure -> Retention)
6. Storage Standards and Security Measures
7. Who Can Access the Data
8. Cross-Border Data Transfer
9. Processor Governance and Data-Processing Agreements
10. Data-Subject Rights
11. Retention and Deletion Policy
12. Data-Breach Notification
13. Privacy Governance (Privacy Notice, RoPA, DPO)
14. Compliance Status and Gap Assessment
15. Penalties
16. Risk Register and DD Checklist
17. Appendix - PDPA Section Map and Sources

---

## 1. PDPA at a Glance

- Law: Personal Data Protection Act B.E. 2562 (2019); core data-protection chapters fully effective 1 June 2022.
- Regulator: the Personal Data Protection Committee (PDPC), under the Minister of Digital Economy and Society; an expert committee adjudicates and imposes administrative fines.
- Scope (Sec 5): applies to controllers/processors in Thailand, and extraterritorially to processing of data subjects in Thailand where goods/services are offered to them or their behavior is monitored. Astly, a Thai company serving Thai users, is squarely in scope.
- Headline exposure: administrative fines up to THB 5,000,000 (highest tier reserved for mishandling sensitive personal data - directly relevant to Astly's eKYC biometrics), plus criminal liability (including for responsible directors/managers) and strict-liability civil damages with punitive damages up to 2x.

---

## 2. Roles: Controller, Processors, Data Subjects (Sec 6)

- Data Controller: Astly. It decides the purposes and means of processing borrower, investor, and drop-point-operator data, and is therefore the controller with the full set of PDPA obligations.
- Data Subjects: the natural persons whose data is processed - borrowers, investors, and drop-point operators.
- Data Processors: the third parties that process personal data on Astly's instructions:

| Processor | Processing role | Hosting region |
|---|---|---|
| UPPASS | eKYC identity verification (incl. biometric/liveness) | SE Asia (vendor) |
| Anthropic (Claude) | AI analysis of item photos and bank slips | US |
| Google (Gemini) | AI condition scoring of item photos | US (paid tier / Vertex) |
| OpenAI | Optional web-search (product text only) | US |
| Vercel | Hosting / compute / logs | US-default (configurable) |
| Supabase | Primary database | AWS region (confirm) |
| MongoDB Atlas | Operational database | AWS region (confirm) |
| AWS S3 | Object storage (photos, slips, contracts) | ap-southeast-2 (Sydney) |
| Upstash | Cache | AWS region |
| Payment PSP (planned) | Funds collection/routing | TH/SE Asia |

Important consequence (Sec 40): a processor that processes for its own purposes (rather than on instruction) is deemed a controller. Astly must therefore have a data-processing agreement with each processor (Section 9), and the AI providers' no-training posture (so they do not process Astly's data for their own model-training purposes) is both a security and a PDPA-role control.

---

## 3. Personal Data Inventory and Classification

PDPA distinguishes general personal data (Sec 24) from sensitive personal data (Sec 26, which includes biometric data and requires explicit consent).

| Data | Category under PDPA | Where held |
|---|---|---|
| Name, phone, address | General personal data | Supabase / MongoDB |
| National ID number, ID-card image | General personal data (the Sec 26 sensitive list does not enumerate the ID number) - but elevated-risk and the subject of an open PDPC consultation; treat with heightened care (confirm) | Number in Supabase; ID images held by UPPASS |
| eKYC face match / liveness (biometric) | SENSITIVE personal data (Sec 26 biometric) - requires EXPLICIT consent | Held by UPPASS (vendor) |
| Bank-transfer slips, bank account, loan/financial records | General personal data (financial) | Slips in S3; records in Supabase / MongoDB |
| Item photographs | General personal data (may incidentally contain identifiers) | AWS S3 |
| Contracts, transactions, custody, notifications | General personal data | MongoDB / Supabase |
| PIN hash, session token | Authentication data (not the PIN itself - one-way hashed) | Supabase `user_security` |
| Cache (normalized inputs, image hashes) | Derived; low sensitivity | Upstash |

Key classification point for diligence: the eKYC biometric/liveness data is sensitive personal data under Sec 26 and is the highest-risk category (5M-baht fine tier). Astly's data-minimization design - the raw biometric capture is performed and held by the eKYC vendor (UPPASS) rather than on Astly's own storage - reduces Astly's direct custody of this category, but Astly still determines the purpose and so remains the controller and must obtain explicit consent for it.

---

## 4. Lawful Bases and Consent

Astly relies on a combination of lawful bases by data category (Sec 19, 24, 26, 27):

| Processing | Lawful basis | PDPA basis |
|---|---|---|
| Borrower/investor identity, contact, loan terms | Contract necessity + legal compliance | Sec 24(3), 24(6) |
| KYC identity verification (national ID, document) | Legal compliance (AML/CDD obligations) and contract necessity | Sec 24(6), 24(3) |
| eKYC biometric / liveness | EXPLICIT consent (no general exemption applies) | Sec 26 |
| Item photos, bank slips for valuation/verification | Contract necessity + legitimate interest | Sec 24(3), 24(5) |
| AML monitoring, fraud prevention | Legal compliance + legitimate interest | Sec 24(6), 24(5) |
| Marketing/communications (if any) | Consent | Sec 19 |

Consent requirements (Sec 19): where consent is the basis (notably for biometric eKYC and any marketing), it must be explicit, in a clear and distinguishable statement (written or electronic), freely given (not bundled with unrelated processing), informed as to purpose, and as easy to withdraw as to give. Astly's onboarding should present a granular consent flow that separates (a) the mandatory KYC/contract processing it can perform on legal/contract bases from (b) the explicit biometric-eKYC consent and any optional consents, with a withdrawal mechanism.

Compliance assessment: a cookie/consent banner exists; a PDPA-grade, granular consent flow (especially explicit biometric consent under Sec 26) and a recorded consent log should be implemented and is a priority gap (Section 14).

---

## 5. Data-Flow Lifecycle (mapped to PDPA)

Astly's processing follows the PDPA lifecycle; below is the flow and the controlling obligation at each stage.

1. Collection (Sec 19, 23, 24, 26): a user authenticates via LINE; provides identity/contact and consents; uploads item photos; completes eKYC with UPPASS (biometric - explicit consent); uploads bank slips for payments. Obligation: a collection notice/privacy notice (Sec 23) must be presented at or before collection, and the correct lawful basis (consent for biometric) applied.
2. Use / processing (Sec 27): identity verified; item valued by the AI pricing/condition pipeline; contracts formed; payments verified; redemptions and settlements processed. Use must stay within the notified purposes (purpose limitation, Sec 21).
3. Storage (Sec 37): data stored encrypted across Supabase, MongoDB, S3, Upstash (Section 6), with access restricted to server-side privileged credentials.
4. Disclosure / transfer (Sec 27, 28): personal data is disclosed to processors (eKYC, AI, PSP, cloud) - several of them outside Thailand, engaging cross-border-transfer rules (Section 8) and requiring DPAs (Section 9).
5. Retention / deletion (Sec 37(3), 33): data retained per a defined schedule reconciled with the AML 5-year obligation, then deleted/anonymized; an end-of-retention deletion system is required (Section 11).

Is the data flow PDPA-aligned? The architecture supports a compliant flow - lawful-basis structure, encryption in transit and at rest, processor model, and data-minimized biometric handling are all consistent with the PDPA. Full compliance additionally requires the documented governance artifacts (privacy notice, granular/biometric consent, RoPA, executed DPAs, cross-border basis, DSR workflow, breach runbook, DPO) listed in Section 14; these are the steps from "architecturally aligned" to "demonstrably compliant".

---

## 6. Storage Standards and Security Measures (Sec 37)

Sec 37(1) requires appropriate security measures meeting the PDPC minimum standard. Astly's storage standards (full detail in `DATA_SECURITY.md`):

- Encryption in transit: TLS on every hop (TLS 1.3 at the edge; TLS to every datastore and API).
- Encryption at rest: AES-256 across all stores (Supabase, MongoDB Atlas - with optional BYOK, AWS S3 SSE-S3/optional SSE-KMS, Upstash, Vercel); secrets encrypted in Vercel.
- Authentication secrets: PINs one-way hashed (bcrypt cost 10); session tokens opaque and short-lived.
- Access restriction: databases are not publicly reachable; access is server-side with privileged credentials; object storage is private with time-limited presigned URLs.
- Data minimization: the highest-risk biometric data is held by the eKYC vendor, not on Astly storage.

Recommended to meet the PDPC minimum-security-standard notification explicitly: documented access-control policy, audit logging of access to personal data, field-level encryption/tokenization for national ID and bank-account numbers, tightened presigned-URL TTLs, and a periodic security review (these appear in the `DATA_SECURITY.md` hardening backlog).

---

## 7. Who Can Access the Data

Access is restricted at three levels - internal application, internal people, and external processors.

### 7.1 Application-level access (machine)

- All datastore access is server-side only, using privileged credentials held in the trusted compute tier (the Supabase service-role key, the MongoDB connection credential, and an AWS IAM key). The public/anonymous Supabase key is not used; no datastore is reachable anonymously from the internet.
- Because these credentials are high-privilege, the enforcing authorization boundary is the application code (identity checks by `lineId`, resource-ownership checks, and the PIN-token gate on sensitive mutations) - see `AUTHENTICATION_AND_AUTHORIZATION.md`. Row-Level Security on Supabase is a backstop.
- Data subjects themselves access only their own data through the LINE LIFF apps, authenticated by LINE login and (for sensitive actions) a PIN.

### 7.2 Internal people access

- Operational/admin access should be limited to named personnel on a least-privilege, need-to-know basis (e.g., dashboard access to the manual-estimate queue, support functions). A documented internal access policy, role-based admin access, and access logging are recommended governance items (Section 14). The forthcoming DPO oversees access governance.

### 7.3 External processor access

- Each processor accesses only the data necessary for its function (eKYC: identity/biometric; AI: item photos/slips; cloud: hosting; PSP: payment data), governed by a DPA (Section 9) and the no-training/retention controls (`THIRD_PARTY_INTEGRATIONS.md`).

Summary: access is controlled by credential isolation (server-side only), application-layer authorization, LINE + PIN authentication for data subjects, and contractual limits on processors. The principal hardening items are documenting and logging internal people-access and tightening the application-layer authorization tests.

---

## 8. Cross-Border Data Transfer (Sec 28-29)

Several processors are hosted outside Thailand (Anthropic, Google, OpenAI, Vercel, AWS, MongoDB Atlas, Upstash - largely US, with S3 in Sydney), engaging the cross-border rules.

- Sec 28 permits transfer to a foreign country only if it has adequate protection per PDPC criteria, except where one of the derogations applies: legal compliance; consent after being informed of inadequacy; contract necessity; contract in the data subject's interest; vital interest; or substantial public interest.
- Sec 29 allows intra-group transfers under PDPC-certified binding-corporate-rules-style policies or suitable safeguards.

Astly's position: in the absence of a PDPC adequacy finding for the US, the practical bases are contract necessity (Sec 28 derogation) and/or informed consent, supported by appropriate safeguards in each processor DPA (standard contractual clauses-equivalent). The exact transfer basis and safeguard wording for each foreign processor must be confirmed with counsel and documented. Co-locating the databases and compute in Singapore (a SE-Asia region) keeps the core data within the region and reduces the cross-border surface to the AI providers and Vercel.

---

## 9. Processor Governance and Data-Processing Agreements (Sec 40)

Sec 40 requires a written controller-processor agreement governing each processor's activities, and obliges the processor to (1) process only on instruction, (2) maintain security and notify the controller of breaches, and (3) keep processing records.

DPA status to establish/confirm for the data room:

| Processor | DPA required | No-training / retention control |
|---|---|---|
| UPPASS (eKYC, biometric) | Yes | Retention/deletion terms; ISO 27001/PDPA claims to confirm |
| Anthropic, Google, OpenAI (AI) | Yes | No-training + ZDR/BAA/paid-tier (critical for media) |
| Vercel, Supabase, AWS, MongoDB Atlas, Upstash (cloud) | Yes (each offers a DPA) | Standard cloud DPA + SCC-equivalent |
| Payment PSP (planned) | Yes | Per PSP terms |

This is a priority operational task: execute and file a DPA with every processor; for the AI providers, the DPA plus the no-training/ZDR posture is the key control because item photos and bank slips are transmitted to them.

---

## 10. Data-Subject Rights (Sec 30-36)

Astly must honor the full set of PDPA data-subject rights, generally within 30 days of a request (Sec 30; extendable by PDPC rule):

| Right | Section | What Astly must do |
|---|---|---|
| Access + copy | Sec 30 | Provide the data subject a copy of their data and the source of non-consented data |
| Data portability | Sec 31 | Provide consented/contract data in a machine-readable format; transmit to another controller where feasible |
| Object | Sec 32 | Stop processing on valid objection (incl. direct marketing) |
| Erasure / destruction / anonymization | Sec 33 | Delete on withdrawal/no-longer-necessary/unlawful processing, subject to legal-retention exceptions |
| Restriction | Sec 34 | Restrict use pending accuracy/objection checks |
| Rectification | Sec 35-36 | Keep data accurate; correct on request |
| Withdraw consent | Sec 19 | Allow withdrawal as easily as giving; then erase absent another basis |

Implementation requirement: a documented data-subject-rights (DSR) intake and fulfilment workflow - including propagation of erasure/correction to S3 objects and to processors (notably the eKYC vendor) and the 30-day response clock - should be built and is a gap (Section 14). Note that legal-retention obligations (AML, Section 11) can lawfully override erasure for specific records.

---

## 11. Retention and Deletion Policy (Sec 37(3), Sec 33)

PDPA requires data minimization and an end-of-retention deletion system; this must be reconciled with the AML 5-year record-retention obligation (see `THIRD_PARTY_INTEGRATIONS.md`).

| Data | Retention driver | Recommended policy |
|---|---|---|
| KYC identity + records, loan/transaction/financial records | AMLA: at least 5 years from end of relationship/transaction | Retain 5 years, then delete/anonymize |
| eKYC biometric (held by vendor) | PDPA minimization (sensitive) | Retain only as needed for verification; vendor deletion per DPA; shortest viable window |
| Bank slips, item photos (S3) | Operational + dispute window | Define an S3 lifecycle policy; delete/anonymize after the window |
| Cache (Upstash) | Operational | TTL-bounded (already ~30 days) |
| Marketing data | Consent | Delete on withdrawal |

Status: a documented retention schedule and an automated deletion/anonymization mechanism (S3 lifecycle rules, scheduled purges, DSR-driven deletion) should be implemented (gap, Section 14).

---

## 12. Data-Breach Notification (Sec 37(4))

- To the PDPC: notify without delay and, where feasible, within 72 hours of becoming aware of a breach, unless it is unlikely to risk individuals' rights and freedoms. Per the PDPC Breach Notification B.E. 2565 (2022), if 72 hours cannot be met, notify as soon as possible and no later than 15 days, with justification; the no-risk exemption requires a documented risk assessment.
- To data subjects: where the breach is likely to result in high risk to individuals, also notify the affected data subjects (and the remedial measures) without delay.

Implementation requirement: a documented incident-response and breach-notification runbook (detection -> assessment against the PDPC criteria -> 72-hour PDPC notification -> high-risk subject notification -> remediation and record-keeping), aligned with each processor's obligation to notify Astly of breaches. This is a gap to formalize (Section 14).

---

## 13. Privacy Governance (Privacy Notice, RoPA, DPO)

- Privacy / collection notice (Sec 23): Astly must present, at or before collection, a notice covering purposes, the data collected and retention period, recipients (including processors and cross-border transfers), the controller/DPO contact, and the data subject's rights. A PDPA-compliant privacy notice (and the in-app consent text) should be published and version-controlled.
- Records of Processing Activities (Sec 39): Astly must maintain a RoPA documenting the data collected, purposes, retention, recipients, rights/access methods, consent-exempt disclosures, rejected requests, and the security measures. Because Astly processes sensitive (biometric) and financial data at scale, the small-organisation exemption is unlikely to apply - a full RoPA is required.
- Data Protection Officer (Sec 41-42): a DPO is required where the core activity involves regular monitoring of large-scale data or the core activity is processing sensitive personal data (Sec 26). Astly's eKYC biometric processing makes DPO appointment likely mandatory (confirm with counsel); the DPO advises, monitors compliance, and is the PDPC/data-subject contact, and cannot be dismissed for performing the role.

Status: the privacy notice, RoPA, and DPO appointment are foundational governance artifacts that should be put in place; they are priority gaps (Section 14).

---

## 14. Compliance Status and Gap Assessment (honest)

A transparent status of PDPA readiness. "In place" reflects the implemented system; "Required/Partial" are governance/operational steps from architecturally-aligned to demonstrably-compliant.

| Area | Status | Note |
|---|---|---|
| Encryption in transit and at rest (Sec 37) | In place | AES-256 + TLS across all stores |
| Server-side access control / no public DB | In place | Service-role + app-layer authz |
| Data minimization for biometrics | In place (by design) | Raw biometric held by eKYC vendor |
| Cookie/consent banner | In place | Basic; not yet a granular PDPA consent flow |
| Lawful-basis structure | Partial | Defined here; needs documentation + biometric explicit-consent flow |
| Privacy / collection notice (Sec 23) | Required | Publish a PDPA-compliant notice |
| Granular + biometric explicit consent + consent log (Sec 19/26) | Required | Build consent UI and records |
| RoPA (Sec 39) | Required | Create and maintain |
| DPO appointment (Sec 41) | Required (likely) | Appoint; publish contact |
| DPAs with all processors (Sec 40) | Required | Execute and file each |
| Cross-border transfer basis (Sec 28-29) | Required | Document basis + safeguards; co-locate DBs in region |
| Data-subject-rights workflow (Sec 30-36) | Required | Build DSR intake + 30-day fulfilment |
| Retention schedule + deletion system (Sec 37(3)) | Required | Define + automate (S3 lifecycle, purges) |
| Breach-notification runbook (Sec 37(4)) | Required | 72-hour PDPC + high-risk subject process |
| Internal people-access policy + logging | Partial | Formalize least-privilege + audit logs |
| Field-level encryption for national ID / bank account | Recommended | Defense in depth (DATA_SECURITY H3) |

Overall posture: technically strong foundations (encryption, access control, minimized biometric handling) with the documentation-and-governance layer still to be completed. This is the normal state for a pre-scale fintech and the gaps are well-understood and individually low-effort; the priorities are the privacy notice, the granular/biometric consent flow, the RoPA, DPO appointment, executed DPAs, and the DSR/breach/retention runbooks.

---

## 15. Penalties (why this matters)

- Administrative fines (Sec 82-90): up to THB 1M (e.g., notice/records/DPO failures), up to THB 3M (e.g., security, unlawful cross-border of general data, deceptive consent), and up to THB 5M - the highest tier - for mishandling sensitive personal data (Sec 26) or unlawful cross-border transfer of sensitive data. Astly's eKYC biometrics place it squarely in the 5M-baht-exposure category, which is why explicit consent and tight controls on that category are paramount.
- Criminal liability (Sec 79-81): imprisonment up to 1 year and/or fines up to THB 1M for unlawful use/disclosure or cross-border transfer of sensitive data for unlawful benefit; and, under Sec 81, a responsible director or manager can be personally liable where the offense results from their instruction or failure to instruct.
- Civil liability (Sec 77-78): strict liability to compensate data subjects for damage regardless of intent, plus punitive damages up to two times the actual compensation.

---

## 16. Risk Register and DD Checklist

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| P1 | Biometric (sensitive) processing without a documented explicit-consent flow | High | Build granular Sec 26 consent + log |
| P2 | DPAs not executed with all processors | High | Execute/file DPAs (Sec 40) |
| P3 | Cross-border transfer basis not documented for US processors | High | Document Sec 28 basis + safeguards; co-locate DBs in region |
| P4 | No RoPA / no appointed DPO | Medium-High | Create RoPA; appoint DPO (Sec 39, 41) |
| P5 | No DSR fulfilment workflow / 30-day clock | Medium | Build DSR intake + propagation to S3/processors |
| P6 | No documented retention schedule / deletion system | Medium | Define + automate; reconcile with AMLA 5-year |
| P7 | No breach-notification runbook (72-hour) | Medium-High | Build incident + notification process |
| P8 | Privacy notice not PDPA-grade | Medium | Publish Sec 23 notice |
| P9 | National-ID classification evolving (PDPC consultation) | Low-Medium | Track PDPC guidance; treat ID data as elevated-risk |
| P10 | Internal people-access not formally least-privilege/logged | Medium | Access policy + audit logging |

DD checklist (data-room items): the published privacy notice and consent texts; the consent records design; the RoPA; the DPO appointment and contact; the executed DPAs (especially eKYC and AI providers, with no-training/ZDR confirmations); the cross-border-transfer basis memo from counsel; the DSR, retention, and breach-notification procedures; the data-residency/region map; and the internal access-control policy.

---

## 17. Appendix - PDPA Section Map and Sources

Section map used in this document: Sec 5 (scope), Sec 6 (roles/definitions), Sec 19 (consent + withdrawal), Sec 21 (purpose limitation), Sec 23 (collection notice), Sec 24 (general-data bases), Sec 26 (sensitive data incl. biometric; explicit consent), Sec 27 (use/disclosure), Sec 28-29 (cross-border transfer), Sec 30-36 (data-subject rights), Sec 37 (security; breach notification 37(4); deletion system 37(3); foreign representative 37(5)), Sec 39 (RoPA), Sec 40 (processor + DPA), Sec 41-42 (DPO), Sec 77-78 (civil/punitive), Sec 79-81 (criminal incl. director liability), Sec 82-90 (administrative fines).

Sources (public, as of mid-2026; confirm currency and sub-regulations with counsel): the official English translation of the PDPA B.E. 2562 (2019); DLA Piper Data Protection Laws of the World - Thailand; Tilleke & Gibbins PDPA insights (lawful basis/sensitive data; consent and notification guidelines; DPO notification; national-ID public consultation); DLA Piper Privacy Matters and IAPP on the PDPC breach-notification clarification; and the PDPC notifications on security standards, RoPA, DPO, and breach notification (B.E. 2565 / 2022). The AML 5-year retention interplay is sourced in `THIRD_PARTY_INTEGRATIONS.md`.

All conclusions are informational and must be validated by qualified Thai data-protection counsel before reliance.
