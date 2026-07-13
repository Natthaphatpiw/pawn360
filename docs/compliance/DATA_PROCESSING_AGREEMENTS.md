# Astly - Data-Processing Agreements and Processor Governance
Status: Living document - prepared for investor technical due diligence and operational adoption.
Owner: Data Protection Officer (DPO) [to be appointed], Astly Co., Ltd. [registration to confirm].
Version: 0.1 (draft) | Last updated: [date] | Review: at least annually or on any new/changed processor.
Scope: The controller-processor model, the register of Astly's processors, the mandatory DPA clauses under Sec 40, the AI-provider no-training/zero-retention posture, cross-border safeguards, and the DPA execution tracker.
Related: `../../DATA_PRIVACY_COMPLIANCE.md` (parent analysis), `../../THIRD_PARTY_INTEGRATIONS.md`, and siblings: `PRIVACY_POLICY.md`, `RECORDS_OF_PROCESSING_ACTIVITIES.md`, `DATA_RETENTION_AND_DELETION_POLICY.md`, `DATA_BREACH_NOTIFICATION_POLICY.md`.

> **Legal note.** This document is an internal governance and due-diligence artefact. It is **not legal advice** and does not itself constitute an executed Data-Processing Agreement. Every clause, cross-border basis, and vendor claim recorded here must be validated with qualified Thai data-protection counsel before Astly relies on it. Points requiring such validation are marked "(to confirm with Thai data-protection counsel)".

---

## 1. Purpose and the controller-processor model (Sec 6)

Astly Co., Ltd. operates **Astly** (Astly.co), a Thailand-based platform for short-term, collateral-backed lending against personal movable property (chiefly consumer electronics) under the applicable Thai secured-lending legal basis (a separate Thai law). Borrowers are onboarded (eKYC + item inspection), collateral is valued via an in-app AI pricing/condition pipeline, items are taken into custody, and collateral is returned on repayment; investors fund loans and drop-point operators handle intake and return through LINE LIFF applications.

Under PDPA **Section 6**, Astly Co., Ltd. is the **Data Controller**: it determines the purposes and means of processing personal data across the platform. The third parties listed in Section 2 are **Data Processors**: they process personal data **only on Astly's documented instructions** and for the purposes Astly defines, without pursuing purposes of their own.

**Section 40 warning — the "own-purposes" trap.** PDPA Section 40 requires a written controller-processor agreement and obliges the processor to act only within the controller's instruction. A processor that begins to process personal data for **its own purposes** ceases to be a processor and is **deemed a controller** in its own right, acquiring independent controller obligations and undermining Astly's accountability chain. This is precisely why the AI providers' **no-training / zero-data-retention** posture (Section 4) is treated as **both a security control and a role control**: if Anthropic, Google, or OpenAI were to train models on Astly's item photos or bank-slip images, that would be processing for their own purpose and would recharacterise them as controllers. The DPA and the no-training terms together keep them inside the processor role.

Every processor relationship must therefore be governed by a written DPA meeting the Section 40 clause set (Section 3), backed by onboarding due diligence (Section 7) and tracked to execution (Section 8).

---

## 2. Processor register

The following table registers every third party to which Astly discloses, or plans to disclose, personal data. Hosting regions marked "(confirm)" require verification of the actual configured region; all DPA-status cells are operational priorities tracked in Section 8.

| Processor | Personal data it receives | Processing purpose | Hosting region | Cross-border? | DPA status |
|---|---|---|---|---|---|
| **UPPASS** | National ID / document images + biometric face-match & liveness data (**SENSITIVE**, Sec 26) | eKYC identity verification for borrowers and investors | SE Asia (vendor) (confirm) | Yes (from TH) | [status: not started / in review / executed]; retention/deletion terms + ISO 27001 / PDPA claims to confirm |
| **Anthropic (Claude)** | Item photos + bank-slip images | AI analysis / vision (item precheck, slip OCR) | US | Yes | [status: not started / in review / executed]; **no-training + ZDR critical** |
| **Google (Gemini)** | Item photos | AI condition scoring | US (paid tier / Vertex) | Yes | [status: not started / in review / executed]; no-training required |
| **OpenAI** | Product text only (optional web search) | Price / product lookup | US | Yes | [status: not started / in review / executed] |
| **Vercel** | Request data + application logs | Hosting / compute / logs | US-default (configurable) | Yes | [status: not started / in review / executed] |
| **Supabase** | Primary personal-data records | Primary database | AWS region (confirm) | Yes (confirm) | [status: not started / in review / executed] |
| **MongoDB Atlas** | Operational personal-data records | Operational database | AWS region (confirm) | Yes (confirm) | [status: not started / in review / executed] |
| **AWS S3** | Item photos, bank slips, contracts | Object storage | ap-southeast-2 (Sydney) | Yes | [status: not started / in review / executed] |
| **Upstash** | Normalized inputs + image hashes (derived) | Cache (estimate pipeline) | AWS region (confirm) | Yes (confirm) | [status: not started / in review / executed] |
| **Payment PSP (planned)** | Payment / bank data | Funds collection / routing | TH / SE Asia (confirm) | To confirm | [status: not started / in review / executed] |

Notes:
- **Sensitivity.** UPPASS handles **sensitive personal data** (biometric + government-ID) under PDPA Section 26 and warrants the enhanced controls in Section 5.
- **Derived data.** Upstash holds normalized inputs and image *hashes* rather than raw images, but derived data referable to an identifiable data subject remains personal data; a DPA is still required.
- **LINE.** The LINE Messaging / LIFF platform is a delivery channel rather than a data store under Astly's control; its data-handling role is assessed separately in `../../THIRD_PARTY_INTEGRATIONS.md` (to confirm with Thai data-protection counsel whether a processor DPA is additionally required).

---

## 3. Mandatory DPA clauses (Sec 40)

PDPA **Section 40** requires a **written** controller-processor agreement that, at minimum, obliges the processor to (1) process only on the controller's instruction, (2) maintain appropriate security and notify the controller of any breach, and (3) keep records of processing. Astly expands this statutory minimum into the following mandatory clause checklist. **Every Astly DPA must contain all of (a)-(j).**

- [ ] **(a) Documented-instruction limit.** Process personal data **only on Astly's documented instruction**, for the registered purpose only, and not for any purpose of the processor's own (the Sec 40 "deemed controller" guardrail).
- [ ] **(b) Confidentiality.** Persons authorised to process the data are bound by confidentiality (contractual or statutory).
- [ ] **(c) Appropriate security measures (Sec 37).** Implement and maintain organisational and technical security measures appropriate to the risk, consistent with Astly's controller duties under **Section 37** and `DATA_SECURITY.md`.
- [ ] **(d) Breach notification to Astly.** Notify Astly **without undue delay** on becoming aware of a personal-data breach, with sufficient detail for Astly to meet its 72-hour PDPC notification duty — see `DATA_BREACH_NOTIFICATION_POLICY.md`.
- [ ] **(e) Sub-processor authorization + flow-down.** Engage sub-processors only with Astly's prior authorization (general or specific with change notice) and **flow down** equivalent obligations by contract; remain liable for sub-processor acts (see Section 9).
- [ ] **(f) Assistance with data-subject rights and DPIA/consultation.** Assist Astly, by appropriate measures, in responding to data-subject-rights requests (access, rectification, erasure, objection, portability) and in any data-protection impact assessment or prior consultation.
- [ ] **(g) Return / delete at end of service.** At Astly's election, **return or securely delete** all personal data at the end of the service and delete existing copies, save where retention is legally required — align with `DATA_RETENTION_AND_DELETION_POLICY.md`.
- [ ] **(h) Records of processing.** Maintain records of processing carried out on Astly's behalf (the Sec 40 record-keeping obligation), available to Astly on request.
- [ ] **(i) Audit / inspection rights.** Make available information necessary to demonstrate compliance and allow, and contribute to, audits and inspections by Astly or its mandated auditor.
- [ ] **(j) Cross-border-transfer safeguards.** Where processing involves transfer outside Thailand, apply **SCC-equivalent** contractual safeguards and cooperate with Astly's chosen transfer basis under Sections 28-29 (see Section 6).

Where a processor's own standard DPA (e.g. a cloud provider's addendum) is used, Astly must confirm it covers (a)-(j) or supplement it (to confirm with Thai data-protection counsel).

---

## 4. AI-provider specific controls (Anthropic, Google, OpenAI)

Item photos and bank-slip images are transmitted to Anthropic and Google, and product text (optionally with web search) to OpenAI. Because photos and slips can carry directly and indirectly identifying personal data, the following controls are **the key mitigations** for this data flow and are mandatory in every AI-provider DPA:

- [ ] **No training on Astly data.** The provider must **not** use Astly's inputs or outputs to train, fine-tune, or improve its models. (This is the Section 40 role control — training would recharacterise the provider as a controller.)
- [ ] **Zero-data-retention (ZDR) / paid-tier terms.** Prefer enterprise / paid-tier configurations offering **ZDR** or minimal, bounded retention; confirm the retention window and that abuse-monitoring copies (if any) are ZDR-exempted or contractually limited.
- [ ] **Enterprise / BAA-style commercial terms.** Confirm the provider's enterprise / commercial (not consumer) terms apply, including the no-training and confidentiality commitments, for **each** of Anthropic, Google (Vertex / paid tier), and OpenAI.
- [ ] **Data-flow minimisation.** Continue transmitting **only what each step needs** — OpenAI receives product **text only**, not images; Gemini receives item photos for scoring; Anthropic receives item photos and slip images for vision. Slip images in particular should be minimised where the verification API path (non-AI) can be used instead.
- [ ] **Sub-processor transparency.** Obtain and review each provider's sub-processor list (Section 9), including underlying cloud hosting.

**Priority:** for the AI providers, the executed DPA **plus** the no-training/ZDR posture together constitute the single most important control in this document, because sensitive item and slip imagery leaves Astly's boundary to reach them.

---

## 5. eKYC-vendor specific controls (UPPASS)

UPPASS processes **sensitive biometric data** (face-match, liveness) and government-ID document images under PDPA **Section 26** — a higher-risk category demanding enhanced controls beyond the general clause set:

- [ ] **Explicit-consent chain.** Confirm the borrower/investor explicit-consent basis for biometric processing is captured before data flows and is reflected in the DPA and `PRIVACY_POLICY.md`.
- [ ] **Retention / deletion terms.** Obtain UPPASS's documented retention period for raw biometric and ID images and its secure-deletion commitment; align with `DATA_RETENTION_AND_DELETION_POLICY.md` (to confirm with Thai data-protection counsel).
- [ ] **Certifications.** Verify UPPASS's **ISO 27001** and PDPA-compliance claims with current evidence (certificate scope, validity dates) rather than marketing assertions (to confirm).
- [ ] **Raw-biometric locality — a deliberate control.** UPPASS **holds the raw biometric template**, returning to Astly only the **verification result / status**. This is intentional: **Astly does not store raw biometrics**, which materially reduces Astly's sensitive-data attack surface and breach exposure. The DPA must preserve this split (no raw-template return to Astly unless a documented need arises).
- [ ] **Hosting region.** Confirm the vendor's actual processing region ("SE Asia (vendor) (confirm)") and treat any transfer outside Thailand under Section 6.

---

## 6. Cross-border transfer safeguards (Sec 28-29)

Multiple processors are **US-hosted** — Anthropic, Google, OpenAI, Vercel, AWS, MongoDB Atlas, and Upstash — and **AWS S3** stores item photos, bank slips, and contracts in **ap-southeast-2 (Sydney)**. There is currently **no PDPC adequacy finding** for the United States (or, pending confirmation, for the S3 Sydney region), so transfers cannot rest on adequacy under Section 28.

Astly's practical transfer bases (to confirm with Thai data-protection counsel):

1. **Contract necessity** — the Section 28 derogation permitting transfer where necessary for performance of a contract with, or in the interest of, the data subject (e.g. running the estimate, verification, and custody flow the borrower requested).
2. **Informed consent** — obtaining the data subject's consent to the specific cross-border transfer after being informed of the absence of an adequacy finding, as a complementary or alternative basis.
3. **SCC-equivalent contractual safeguards** — appropriate safeguards embedded in each DPA (clause (j), Section 3), providing enforceable data-subject rights and remedies in line with Section 29.

**Structural mitigation.** Astly plans to **co-locate its core databases (Supabase, MongoDB Atlas) in a Singapore region (confirm)** to **shrink the cross-border surface** and concentrate primary personal-data records closer to Thailand. The AI-provider and US-object-storage flows would remain cross-border and continue to rely on the bases above.

---

## 7. Processor onboarding due-diligence checklist

No personal data may flow to a new processor until the following are completed and recorded by the DPO (or delegate):

- [ ] **Security posture** reviewed (encryption in transit/at rest, access controls, incident history) against `DATA_SECURITY.md`.
- [ ] **Certifications** verified (e.g. ISO 27001, SOC 2) with current, in-scope evidence.
- [ ] **Sub-processors** enumerated and reviewed; onward-transfer chain understood (Section 9).
- [ ] **Data residency** and actual hosting region confirmed (resolve every "(confirm)" in Section 2).
- [ ] **Cross-border basis** identified and documented where transfer leaves Thailand (Section 6).
- [ ] **DPA drafted/reviewed** against the Section 40 clause set (a)-(j) and, for AI/eKYC vendors, Sections 4-5.
- [ ] **DPA executed and filed** before production data flows; recorded in Section 8.
- [ ] **RoPA updated** — new processor and data flow added to `RECORDS_OF_PROCESSING_ACTIVITIES.md`.

---

## 8. DPA execution tracker

Executing and filing a DPA with **every** processor is a **priority operational task**. All rows below are open priorities until marked executed.

| Processor | DPA required | Status | Owner | Target date |
|---|---|---|---|---|
| UPPASS | Yes (sensitive / biometric — priority) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| Anthropic (Claude) | Yes (AI — no-training/ZDR priority) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| Google (Gemini) | Yes (AI — no-training priority) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| OpenAI | Yes | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| Vercel | Yes | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| Supabase | Yes (primary data — priority) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| MongoDB Atlas | Yes (primary data — priority) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| AWS S3 | Yes (photos/slips/contracts — priority) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| Upstash | Yes | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |
| Payment PSP (planned) | Yes (payment/bank data — on engagement) | [status: not started / in review / executed] | DPO [to be appointed] | [target date] |

Execution metadata to capture per row on completion: **[DPA execution date]**, **[signatory]** for Astly Co., Ltd., counterparty signatory, and the filing location of the executed instrument.

---

## 9. Sub-processor management

Astly requires each processor to authorise sub-processors under clause (e) of Section 3 (prior authorization + flow-down) and manages the onward chain as follows:

- **Maintain a sub-processor list.** For each processor, record its current sub-processors (notably the underlying cloud hosting behind SaaS vendors — e.g. AWS beneath Supabase/MongoDB Atlas/Upstash, and the cloud beneath each AI provider).
- **Review on onboarding and on change.** Reassess the sub-processor list at onboarding (Section 7) and whenever a processor notifies a change; verify the new sub-processor's residency and safeguards.
- **Change-notification and objection.** Require processors to give **advance notice** of any intended addition or replacement of a sub-processor, with a reasonable window for Astly to **object** or, failing resolution, to exit the service.
- **Flow-down enforcement.** Confirm equivalent Section 40 obligations (security, breach notice, cross-border safeguards, deletion) are contractually imposed on every sub-processor; the primary processor remains liable to Astly.
- **Keep RoPA aligned.** Reflect material sub-processor changes affecting data flows or residency in `RECORDS_OF_PROCESSING_ACTIVITIES.md`.

---

*End of document. Living artefact — supersede on any new or changed processor, on DPA execution, or on counsel review. All "(confirm)" and "(to confirm with Thai data-protection counsel)" items are open actions for the DPO.*
