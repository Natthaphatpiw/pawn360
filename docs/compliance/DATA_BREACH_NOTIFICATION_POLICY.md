# Astly - Data-Breach Notification and Incident-Response Policy
Status: Living document - prepared for investor technical due diligence and operational adoption.
Owner: Data Protection Officer (DPO) [to be appointed], Astly Co., Ltd. [registration to confirm].
Version: 0.1 (draft) | Effective date: [to set] | Review: at least annually; test at least annually.
Scope: How Astly detects, assesses, contains, notifies and records personal-data breaches under the PDPA, including the 72-hour PDPC notification and high-risk data-subject notification.
Related: `../../DATA_PRIVACY_COMPLIANCE.md` (parent analysis), `../../DATA_SECURITY.md`, `../../DISASTER_RECOVERY_AND_RISK_PLAN.md`, and siblings: `PRIVACY_POLICY.md`, `RECORDS_OF_PROCESSING_ACTIVITIES.md`, `DATA_PROCESSING_AGREEMENTS.md`.

> **Legal note.** This document is an operational runbook, not legal advice. It reflects Astly's good-faith reading of the Personal Data Protection Act B.E. 2562 (2019) ("PDPA") and the PDPC Notification on Criteria and Methods of Personal Data Breach Notification B.E. 2565 (2022). Timelines, thresholds and exemption criteria must be validated with Thai data-protection counsel and kept current with PDPC guidance (to confirm with Thai data-protection counsel).

---

## 1. Purpose & scope

This policy establishes how Astly Co., Ltd. ("Astly", the **Data Controller**) detects, assesses, contains, notifies and records personal-data breaches, and how it discharges its notification duties under **PDPA Sec 37(4)** (controller's duty to notify the Office of the Personal Data Protection Committee, "PDPC") and **Sec 40** (processor's duty to notify the controller).

**In scope:** all personal data processed by Astly across the P2P collateral-backed lending platform (secured lending under the applicable Thai secured-lending legal basis, a separate Thai law) - borrower, investor and drop-point-operator personal data, item and collateral records, eKYC/biometric data, financial/bank-slip data, and all supporting systems and processors.

**Applies to:** all Astly staff, contractors, and processors acting on Astly's behalf. Every person who becomes aware of a suspected breach must report it through the channel in Section 4 without delay.

## 2. Definitions

- **Personal data breach** - a breach of security leading to the unauthorized or unlawful, or accidental, **loss, access, use, alteration, correction, or disclosure** of personal data. It covers any compromise of:
  - **Confidentiality** - unauthorized access to or disclosure of personal data;
  - **Integrity** - unauthorized or accidental alteration of personal data;
  - **Availability** - accidental or unlawful loss of access to, or destruction of, personal data.
- **Sensitive personal data** - data under PDPA Sec 26 (here principally **eKYC biometric data** from identity verification). A breach of sensitive personal data carries the **highest exposure** - top administrative-fine tier and potential criminal liability - and is triaged as high-risk by default (see Section 5).
- **Becoming aware** - the point at which Astly has a reasonable degree of certainty that a security incident has occurred that compromised personal data. **The 72-hour clock starts here**, not at first suspicion (to confirm with Thai data-protection counsel).
- **Incident** - any suspected or confirmed event that may be a personal data breach until triaged.

## 3. Roles & responsibilities

The **Incident Response Team (IRT)** is convened on any incident escalated as potential breach. The **DPO leads** and is the single point of contact with the PDPC.

| Role | Owner | Primary responsibilities |
|---|---|---|
| **DPO (IRT lead / PDPC contact)** | [DPO name] / [dpo@astly.co] | Owns the runbook; convenes IRT; makes the notify/no-notify decision on the risk assessment; drafts and files the PDPC notification; is the named DPO contact in all notifications; owns the breach register. |
| **Engineering on-call** | [owner] | First technical responder; triage, containment, evidence preservation, log retrieval; implements the technical fix. |
| **Security** | [owner] | Forensics, root-cause analysis, scope of affected data/subjects, remediation validation. |
| **Legal / compliance** | [owner] | Confirms notification thresholds and content against PDPA/PDPC rules; liaises with external counsel; assesses fine/criminal exposure. |
| **Communications** | [owner] | Drafts data-subject and public messaging with DPO/Legal; manages support channels and inbound queries. |
| **Executive sponsor** | [owner] | Authorizes resourcing and external notifications; note director/manager personal liability under Sec 81. |

**RACI (key activities):**

| Activity | DPO | Eng on-call | Security | Legal | Comms |
|---|---|---|---|---|---|
| Detect & log incident | A | R | C | I | I |
| Contain & preserve evidence | I | R | A | I | I |
| Risk assessment / severity call | A/R | C | R | C | I |
| PDPC notification (Sec 37(4)) | A/R | I | C | R | I |
| Data-subject notification | A/R | I | I | C | R |
| Root-cause & remediation | I | R | A | I | I |
| Breach-register entry | A/R | C | C | C | I |

R = Responsible, A = Accountable, C = Consulted, I = Informed.

## 4. Detection & reporting

**Detection sources:**
- **Monitoring & logs** - platform, infrastructure and access logs across Vercel/Blob, Supabase, MongoDB Atlas and Upstash; anomalous access to private databases (server-side privileged access only) or Blob signed-URL abuse.
- **Processor notification** - a processor reports a breach to Astly (see Section 9).
- **Staff or user report** - a borrower, investor, drop-point operator, or staff member reports suspected exposure via [incident hotline] or [dpo@astly.co].

**Internal reporting channel.** Any suspected incident must be reported **immediately** to the DPO via [dpo@astly.co] and [incident hotline]. Do not investigate informally or attempt fixes before logging. The reporter records: what was observed, when, systems/data involved, and any actions already taken.

**The clock.** Astly's assessment of "becoming aware" (Section 2) is logged at the moment the DPO/IRT reasonably concludes a personal-data breach has occurred. **The 72-hour PDPC window runs from that timestamp.** Record T0 explicitly in the breach register.

## 5. Severity & risk assessment

The IRT assesses the **likelihood and severity of risk to individuals' rights and freedoms** against the PDPC criteria, then classifies the breach. Sensitive personal data (biometric eKYC) is triaged **high-risk by default** unless robust mitigations (e.g. data minimized at vendor, strong encryption of the compromised store) demonstrably reduce risk (to confirm with Thai data-protection counsel).

**Triage factors:**

| Factor | Lower risk | Higher risk |
|---|---|---|
| Data type | Non-identifying operational data | **Biometric (eKYC)**, national ID, financial / bank-slip, contact details, PIN-related data |
| Protection state of compromised data | Strongly encrypted (AES-256 at rest) / hashed (bcrypt PINs) and keys uncompromised | Plaintext or keys also exposed |
| Volume | Single/few records | Many data subjects |
| Likelihood of harm | Contained, no exfiltration evidenced | Exfiltration, misuse, identity theft, or financial fraud plausible |
| Reversibility | Fully recoverable / no onward disclosure | Irreversible loss or public disclosure |

**Classification & action:**

| Class | Definition | Action |
|---|---|---|
| **No-risk** | Unlikely to result in risk to individuals' rights and freedoms | **Do not notify PDPC**, but **document the risk-assessment justification** in the breach register (the no-risk exemption requires a documented assessment). |
| **Risk** | Likely to risk rights/freedoms | **Notify PDPC** per Section 6 (without delay, where feasible within 72 hours). |
| **High-risk** | Likely to result in **high risk** to individuals | **Notify PDPC (Section 6) and affected data subjects (Section 7)** without delay. |

## 6. PDPC notification (Sec 37(4))

Where the breach is classified **Risk** or **High-risk**, notify the PDPC **without delay and, where feasible, within 72 hours** of becoming aware, **unless** the breach is unlikely to result in a risk to individuals' rights and freedoms.

- If the **72-hour window cannot be met**, notify **as soon as possible** and, per PDPC B.E. 2565 (2022), **no later than 15 days**, accompanied by a **justification for the delay**.
- Notification may be **phased** where full facts are not yet known: file an initial notification within the window and supplement as the investigation develops.
- File via [PDPC notification channel].

**PDPC notification content checklist:**

- [ ] Nature of the breach (confidentiality / integrity / availability; how it occurred).
- [ ] Categories and approximate number of **data subjects** affected.
- [ ] Categories and approximate volume of **personal data records** affected (flag any **sensitive/biometric** data).
- [ ] Likely **consequences** of the breach for affected individuals.
- [ ] Measures **taken or proposed** to address the breach and mitigate adverse effects.
- [ ] **DPO contact** - [DPO name], [dpo@astly.co], [incident hotline].
- [ ] Whether affected data subjects have been / will be notified (Section 7), and timing.
- [ ] If beyond 72 hours: the **justification for delay** (max 15 days).

## 7. Data-subject notification

Where the breach is **likely to result in high risk** to individuals (e.g. exposure of biometric eKYC, national ID, or financial data enabling fraud/identity theft), Astly notifies the **affected data subjects and the remedial measures without delay**.

- **Channels.** Primary: in-app notice and the actor's LINE LIFF channel (borrower / investor / drop-point operator); secondary: email/SMS on record. Use [incident hotline] for inbound queries.
- **Content (plain Thai and English):** what happened, when, the data involved, likely consequences, what Astly has done and is doing, concrete **steps the individual should take** (e.g. reset PIN, watch for fraud), and DPO contact.
- Where direct notification to each subject would involve disproportionate effort, a **public communication** of equivalent effectiveness may be used (to confirm with Thai data-protection counsel).
- Template pointers: maintain pre-approved data-subject notice templates alongside this runbook; align wording with `PRIVACY_POLICY.md`.

## 8. Containment, remediation & recovery

1. **Immediate containment** - isolate affected systems, revoke/rotate compromised credentials and Blob tokens, invalidate access paths where possible, disable affected accounts, and block the attack path. TLS-everywhere, private databases and private-Blob controls limit blast radius; use them to contain.
2. **Evidence preservation** - snapshot logs and affected systems before remediation; preserve chain of custody for forensics and any regulator/law-enforcement request. Do not destroy evidence while fixing.
3. **Root-cause analysis** - Security determines how the breach occurred and the full scope of affected data and subjects.
4. **Remediation & recovery** - apply the fix, restore integrity/availability from known-good backups, and validate that the vulnerability is closed. Follow the restoration, backup and RTO/RPO procedures in `../../DISASTER_RECOVERY_AND_RISK_PLAN.md`.
5. **Post-incident review** - within a defined period after closure, run a lessons-learned review; feed corrective actions into controls, this runbook, and `../../DATA_SECURITY.md`.

## 9. Processor breaches (Sec 40)

Under **PDPA Sec 40**, each processor must maintain appropriate security measures and **notify Astly (the controller) of any personal-data breach without delay**. Every Data Processing Agreement must impose this flow-through obligation, a defined notification timeline to Astly, and cooperation duties. On receiving a processor notification, Astly runs this runbook from Section 4 (Astly's own 72-hour clock starts when **Astly** becomes aware).

**Key processors handling personal data:**

| Processor | Data / role | Breach-relevant note |
|---|---|---|
| **UPPASS** | eKYC - **biometric / sensitive** identity verification | Highest exposure; biometric data minimized at vendor. |
| **Anthropic, Google, OpenAI** | AI on item photos and bank slips | May transiently process images containing personal/financial data. |
| **Vercel** | Application hosting | Compute/log exposure surface. |
| **Supabase** | Database (investor/finance, drop-point, PIN/`user_security`) | Private DB; server-side privileged access only. |
| **MongoDB Atlas** | Database (customer lending flow) | Private DB; server-side privileged access only. |
| **Vercel Blob** | Object storage (contracts, item/verification photos, slips) | Private store, pathname/operation-scoped signed-URL access. |
| **Upstash** | Redis estimate cache | Cache of derived data. |
| **Payment PSP (planned)** | Payment processing | Financial data; add on onboarding. |

Cross-reference `DATA_PROCESSING_AGREEMENTS.md` for the contractual clauses and per-processor notification timelines.

## 10. Record-keeping

Astly maintains a **breach register**, kept by the DPO, recording **every** personal-data breach - **including those not notified** - to evidence accountability and support any PDPC inspection.

Each entry records:

- [ ] Incident ID and status; timestamps: detection, **T0 (became aware)**, containment, notifications, closure.
- [ ] Facts: nature, cause, systems and data categories (flag sensitive/biometric), volume, data subjects affected.
- [ ] Risk classification and, for any **no-risk** decision, the **documented risk-assessment justification** for the exemption.
- [ ] Notifications made (PDPC and/or data subjects), dates, channels, and content/reference; if delayed, the justification.
- [ ] Containment, remediation and recovery actions; root cause; corrective/preventive actions and owners.
- [ ] Whether a processor was involved and the processor-notification timeline.

Retention of register entries per Astly's records-retention schedule (to confirm with Thai data-protection counsel).

## 11. Testing & training

- **Tabletop exercises** - run a breach simulation **at least annually** (including a biometric/eKYC-exposure scenario and a processor-notified scenario), validating the 72-hour path end-to-end.
- **Runbook review** - review and update this policy **at least annually** and after any actual incident or material change to systems/processors.
- **Training & awareness** - all staff trained on how to recognize and report a suspected breach; IRT members trained on their runbook role; DPO tracks completion.
- **Contact hygiene** - verify [PDPC notification channel], [incident hotline], [dpo@astly.co] and all role-owner assignments are current at each review.

## 12. Incident timeline / checklist (one page)

| Phase | Trigger | Actions | Owner | Target |
|---|---|---|---|---|
| **T0 - Aware** | Detection (monitoring / processor / report) | Log incident; record T0 timestamp; notify DPO; convene IRT. | DPO / Eng on-call | Immediate |
| **Contain** | IRT convened | Isolate systems; rotate credentials/keys; **preserve evidence**; stop the bleed. | Security / Eng on-call | Hours |
| **Assess** | Contained | Scope affected data/subjects; run risk assessment; **classify** no-risk / risk / high-risk. | DPO / Security / Legal | Within window |
| **Notify PDPC** | Class = risk or high-risk | File via [PDPC notification channel] with the Section 6 checklist. | DPO / Legal | **Without delay; where feasible <= 72h** (else ASAP, **<= 15 days** + justification) |
| **Notify subjects** | Class = high-risk | Notify affected individuals + remedial measures via in-app/LINE/email. | DPO / Comms | **Without delay** |
| **Remediate** | Root cause known | Apply fix; restore from known-good backups; validate closure. | Eng on-call / Security | ASAP |
| **Record & review** | Incident closed | Complete breach-register entry (incl. no-risk justification); post-incident review; update controls. | DPO | Post-closure |

**Quick decision rule:** *No risk to rights/freedoms -> document exemption, do not notify. Risk -> notify PDPC within 72h. High risk -> notify PDPC and data subjects without delay.* Biometric/eKYC exposure defaults to high-risk.

---

*Current status: a documented incident-response and breach-notification runbook was previously a gap to formalize; **this document is that runbook**. Pending items: appoint and register the DPO, populate all [owner] role assignments and contact placeholders, confirm PDPC filing channel, and validate all timelines/thresholds with Thai data-protection counsel.*
