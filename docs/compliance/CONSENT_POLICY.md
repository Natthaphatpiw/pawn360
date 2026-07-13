# Astly - Consent Policy and Consent Notice
Status: Living document - prepared for investor technical due diligence and operational adoption.
Owner: Data Protection Officer (DPO) [to be appointed], Astly Co., Ltd. [registration to confirm].
Version: 0.1 (draft) | Effective date: [to set] | Review: at least annually or on material change.
Scope: How Astly obtains, records, and manages consent under the PDPA - especially explicit consent for sensitive (biometric) eKYC data (Sec 26) - and the boundary between consent-based and non-consent (contract/legal) processing.
Related: `../../DATA_PRIVACY_COMPLIANCE.md` (parent analysis), and siblings: `PRIVACY_POLICY.md`, `RECORDS_OF_PROCESSING_ACTIVITIES.md`, `DATA_RETENTION_AND_DELETION_POLICY.md`, `DATA_BREACH_NOTIFICATION_POLICY.md`, `DATA_PROCESSING_AGREEMENTS.md`.

> **Legal note.** This document is an internal compliance policy prepared for operational adoption and investor due diligence. It is **not legal advice** and does not itself constitute a legally reviewed consent form. All consent-statement wording, lawful-basis mappings, and retention interactions must be validated with qualified Thai data-protection counsel before Astly relies on them in production. Points requiring such validation are marked "(to confirm with Thai data-protection counsel)".

---

## 1. Purpose and scope

This policy governs how **Astly Co., Ltd.** (the **Data Controller**; registration no. [Astly Co., Ltd. registration no.]), operating the Astly platform at **Astly.co**, obtains, records, honours, and withdraws **consent** from data subjects under Thailand's Personal Data Protection Act B.E. 2562 (2019) ("PDPA").

Astly operates a Thailand-based peer-to-peer secured-lending platform: short-term loans against personal movable collateral (mainly consumer electronics), extended under the applicable Thai secured-lending legal basis (a separate Thai law). Collateral is verified (eKYC and item inspection), valued via an in-app AI pricing and condition pipeline, taken into custody, and returned on repayment. The actors are the **borrower**, the **investor** who funds loans, and the **drop-point operator** who handles intake and return through LINE LIFF applications.

The policy applies to personal data of all three actor types, across all Astly channels (LINE LIFF mini-apps, web, and back-office systems), and covers both stores in which Astly holds personal data.

A central objective of this policy is to keep the boundary sharp: **Astly relies on consent only where consent is the correct lawful basis, and never bundles mandatory service processing into a consent request.** Most core processing runs on contract necessity and legal compliance; consent is reserved primarily for **biometric eKYC data** (explicit consent, Sec 26) and **optional marketing** (general consent, Sec 19).

---

## 2. PDPA consent principles (Sec 19)

Where Astly relies on consent, that consent must satisfy PDPA Sec 19. Astly adopts the following principles as binding requirements on every consent flow:

1. **Explicit and affirmative.** Consent is given by a clear affirmative action (e.g. ticking an unticked box). Silence, inactivity, or pre-ticked boxes are not consent.
2. **Clear and distinguishable statement.** The consent request is presented in writing or by electronic means in a form **clearly distinguishable** from other matters (such as the loan agreement or general terms), in plain, easily accessible language (Sec 19 para. 3).
3. **Freely given and not bundled.** Consent must **not be a condition** for entering into a service or contract where the personal data is not necessary for that service or contract (Sec 19 para. 5). Astly does not bundle unrelated processing (e.g. marketing) into a single "accept" that is required to obtain a loan.
4. **Informed as to purpose.** The data subject is told the **purpose** of processing before or at the time consent is requested (Sec 19 para. 4). A purpose not disclosed at consent time is not covered.
5. **As easy to withdraw as to give.** The data subject may withdraw consent at any time, and withdrawal must be **as easy as giving** consent (Sec 19 para. 5). Withdrawal does not affect the lawfulness of processing already carried out (Sec 19 para. 6).
6. **Consent from minors.** Where a data subject is a minor, consent handling follows Sec 20 (guardian involvement where required). Astly's product is intended for adults; age is asserted at onboarding (to confirm with Thai data-protection counsel).

Sec 21 further requires that personal data be used **only for the purpose notified**; a new purpose requires a fresh lawful basis (fresh consent or another basis). Sec 23 sets the information that must accompany collection (identity of controller, purpose, data collected, retention, rights, and DPO contact) - Astly's consent notices and the sibling `PRIVACY_POLICY.md` together deliver this Sec 23 notice.

---

## 3. When Astly relies on consent vs other bases

Consent is **one** of several lawful bases in the PDPA and, for Astly, the least-used for core operations. The table below separates **(a)** mandatory processing performed on **contract necessity / legal compliance** - which is **not** bundled into any consent request - from **(b)** processing that genuinely **requires consent**.

### (a) Mandatory processing - NOT based on consent (do not bundle into consent)

| Data / processing | Purpose | Lawful basis (PDPA) |
|---|---|---|
| Identity data (name, national ID number, ID document image) | Onboarding, loan origination, KYC | Contract necessity + legal compliance (Sec 24(3), 24(6)) |
| Contact data (phone, LINE user id, address) | Loan servicing, notifications, delivery/return coordination | Contract necessity (Sec 24(3)) |
| Loan terms (principal, rate, days, collateral valuation, repayment) | Performance of the secured-lending agreement | Contract necessity (Sec 24(3)) |
| KYC identity verification (document checks, CDD) | AML / customer due diligence obligations | Legal compliance + contract (Sec 24(6), 24(3)) |
| Item photos and payment/bank slips | Collateral custody, valuation evidence, payment reconciliation | Contract necessity + legitimate interest (Sec 24(3), 24(5)) |
| AML / fraud monitoring | Statutory AML and fraud-prevention duties | Legal compliance + legitimate interest (Sec 24(6), 24(5)) |

Because the above is done on contract necessity and legal compliance, **it is not offered as a consent choice** - a borrower cannot "decline" identity verification and still receive a loan, and Astly must not present these as consent toggles. Presenting mandatory processing as if it were a free consent choice would itself breach the "freely given" principle.

> **National ID number and ID image.** These are treated as **general personal data** but are recognised as **elevated-risk** (subject to an open PDPC public consultation). Astly collects them on **legal/contract** bases for KYC - **not** on consent - and applies tightened access, minimization, and retention controls (see `DATA_SECURITY.md` and `DATA_RETENTION_AND_DELETION_POLICY.md`). Their legal treatment is (to confirm with Thai data-protection counsel).

### (b) Processing that requires consent

| Data / processing | Purpose | Lawful basis (PDPA) | Consent type |
|---|---|---|---|
| **Biometric eKYC (face-match / liveness)** | Identity assurance during onboarding | **Sec 26 - sensitive data** | **Explicit, granular consent** (Sec 4) |
| Marketing / promotional communications | Product updates, offers, campaigns | Consent (Sec 19) | Opt-in, separate |

These are the **only** two categories for which Astly presents a consent choice to the data subject, and each is captured through its **own** control (see Sec 4 and Sec 4).

---

## 4. Explicit biometric consent (Sec 26)

### Why explicit consent is required

Astly's eKYC step captures **face-match and liveness** data. Biometric data used to identify a person is **sensitive personal data** under **PDPA Sec 26**, which prohibits its processing without the data subject's **explicit consent** (subject to narrow statutory exceptions that Astly does not rely on for this step). Mishandling sensitive personal data sits in the **highest administrative-fine tier - up to THB 5,000,000** - which is precisely why explicit consent and tight controls on the biometric category are paramount.

### What is collected and where it lives

- The face-match and liveness capture is performed and **held by Astly's eKYC vendor, UPPASS** - it is **minimized off Astly's own storage** by design. Astly stores the KYC **outcome/status**, not the raw biometric templates.
- Astly nonetheless **determines the purpose and means** of this processing and therefore **remains the Data Controller**; UPPASS acts as a processor. Astly must therefore obtain the explicit consent itself (and cover UPPASS under a data-processing agreement - see `DATA_PROCESSING_AGREEMENTS.md`).
- Consequence: the borrower cannot be onboarded without completing biometric eKYC, so if a borrower **declines** biometric consent, Astly cannot verify identity to the required assurance level and the application cannot proceed on this route. This does not make the consent "unfree": the biometric data is not used for any purpose beyond identity assurance, and declining simply means the eKYC-gated path is unavailable, not that unrelated services are withheld (to confirm with Thai data-protection counsel on framing the alternative/decline path).

### Consent statement (exact wording, granular, separate checkbox)

This statement is presented on its **own control** (a dedicated unticked checkbox), separate from the loan agreement, the general terms, and any marketing opt-in. It must be shown in the user's language (Thai/English) before the eKYC capture begins.

> **Biometric identity verification (required to complete verification).**
> I give my **explicit consent** for Astly Co., Ltd. to collect and process my **biometric data - a scan of my face and a liveness check** - for the sole purpose of verifying my identity (eKYC) so that I can use Astly's secured-lending service.
>
> I understand that:
> - this biometric data is **sensitive personal data** under Section 26 of the PDPA and is processed **only with my explicit consent**;
> - the face-match and liveness capture is performed and stored by Astly's verification provider, **UPPASS**, acting on Astly's behalf, and Astly retains only the verification result, not the raw biometric data;
> - my biometric data will **not** be used for any purpose other than identity verification and will **not** be sold or shared for marketing;
> - I may **withdraw this consent at any time** via [dpo@astly.co] or in-app account settings, and that withdrawal is as easy as giving consent and does not affect processing already carried out; and
> - if I do not give this consent, Astly cannot complete identity verification and I may be unable to proceed with the service through this route.
>
> ☐ I have read and give my explicit consent to biometric identity verification.

(Consent-text checkbox must be **unticked by default**; a version identifier is recorded with the acceptance - see Sec 6.)

---

## 5. Marketing / communications consent

Marketing is **optional** and processed on **consent (Sec 19)**. It is captured through a **separate opt-in** control that is never a condition of obtaining a loan and never pre-ticked. Declining marketing has no effect on the borrower's, investor's, or drop-point operator's access to the core service.

### Consent statement (exact wording, separate opt-in)

> **Marketing and updates (optional).**
> I would like to receive news, product updates, offers, and promotional messages from Astly Co., Ltd. via LINE, email, or SMS. I understand this is **optional**, is **not required** to use Astly's services, and that I can **unsubscribe or withdraw this consent at any time** - as easily as I gave it - via the unsubscribe link, in-app settings, or [dpo@astly.co].
>
> ☐ Yes, I consent to receive marketing communications from Astly.

Separate channel toggles (LINE / email / SMS) may be offered as sub-options; each is opt-in and independently withdrawable (to confirm with Thai data-protection counsel on channel-specific rules, e.g. SMS/email marketing).

---

## 6. Consent record-keeping

To demonstrate compliance (accountability), Astly must keep an auditable **consent log** for every consent given or withdrawn. A valid consent record stores at least the following. **This log is currently a priority gap** - see Sec 8.

| Field | Description |
|---|---|
| Subject identifier | Stable id for the data subject (e.g. role + LINE user id / internal id) |
| Consent scope | The specific processing consented to (e.g. `biometric_ekyc`, `marketing_line`) |
| Consent version / exact text | Version id **and** the verbatim statement text shown at the time |
| Consent value | Given / declined / withdrawn |
| Timestamp | Date and time consent was given (and separately, withdrawn) |
| Channel | Where consent was captured (LIFF app + which flow, web, back-office) |
| Language | Language of the statement shown (Thai / English) |
| Withdrawal timestamp | Date and time of withdrawal, if any (kept even after withdrawal, as evidence) |
| Actor / system | The interface or operator that recorded the event |

The consent log must be **append-only / immutable** for evidentiary value, retained per the retention policy, and queryable per data subject to support access and withdrawal requests. Storing the **exact text and version** (not merely "consented: yes") is essential, because a later change to the consent wording must not retroactively alter what a subject actually agreed to.

---

## 7. Withdrawal of consent

**Mechanism.** A data subject may withdraw any consent at any time through: (a) in-app account/privacy settings in the relevant LINE LIFF app; (b) the unsubscribe link in marketing messages (for marketing consent); or (c) a request to the DPO at [dpo@astly.co]. Withdrawal is designed to be **as easy as giving** consent (Sec 19), i.e. it does not require more steps, justification, or friction than the original opt-in.

**Effect on lawfulness.** Withdrawal is **prospective**: it does not affect the lawfulness of processing carried out before withdrawal (Sec 19 para. 6).

**Consequence of withdrawal.** On withdrawal, Astly **stops** the processing that relied on that consent, and the associated personal data is **erased unless another lawful basis requires or permits its continued retention**. Concretely:

- **Marketing consent withdrawn** - Astly ceases marketing to that subject and suppresses/erases the marketing-purpose data, subject to keeping a minimal suppression record to honour the opt-out.
- **Biometric eKYC consent withdrawn** - Astly ceases any further biometric processing and instructs UPPASS to delete the biometric data it holds for that subject; Astly retains only what another lawful basis mandates (see below). Withdrawal after identity has already been verified does not undo a completed loan contract, whose non-biometric records are retained on contract/legal bases.

**Retention override (important).** Erasure on withdrawal is **subject to overriding legal retention** - in particular **AML / CDD record-keeping obligations can require Astly to retain identity and transaction records for a statutorily mandated period even after consent is withdrawn**. Consent withdrawal therefore removes the consent-based processing but does **not** force deletion of records held on an independent legal basis. The precise interaction between withdrawal-driven erasure and mandatory AML retention is defined in **`DATA_RETENTION_AND_DELETION_POLICY.md`** and is (to confirm with Thai data-protection counsel).

---

## 8. Consent UI requirements and current status

Every Astly consent interface must meet the following requirements:

1. **Granular.** Each distinct purpose (biometric eKYC, each marketing channel) has its **own** control; no single "accept all" covers multiple unrelated purposes.
2. **Unbundled.** Consent controls are **separate** from the loan agreement and general terms; agreeing to the contract does not sweep in consent for biometric or marketing processing, and mandatory contract/legal processing is never presented as a consent toggle.
3. **No pre-ticked boxes.** All consent checkboxes are **unticked by default**; the subject must take an affirmative action.
4. **Language.** Consent text is available in **Thai and English**, and the language actually shown is recorded in the consent log.
5. **Versioned text.** Each consent statement carries a **version identifier**; changes to wording produce a new version, and prior versions are retained so historical consents remain interpretable.
6. **Purpose-visible and informed.** The purpose is stated in the consent control itself, satisfying Sec 19 para. 4 / Sec 23 at the point of capture.
7. **Withdrawal surfaced.** A clear, low-friction withdrawal path is exposed in-app for each consent.

### Current status (gap assessment)

- A **cookie / consent banner exists today** on Astly web surfaces.
- A **PDPA-grade granular consent flow - especially the explicit biometric-consent step (Sec 26) - and a recorded, auditable consent log are still to be implemented.** These are treated as a **priority gap** for remediation before scale, given that the biometric category carries the highest (THB 5,000,000) fine exposure.
- Remediation targets: (i) implement the granular, unbundled, unticked, versioned consent UI described above; (ii) stand up the append-only consent log in Sec 6; (iii) wire the withdrawal mechanisms in Sec 7 to the log and to UPPASS deletion.

---

## 9. Roles and review

- **Data Controller.** Astly Co., Ltd. [Astly Co., Ltd. registration no.] is the Data Controller for all consent-based processing described here and remains the controller for biometric eKYC even though UPPASS holds the biometric data.
- **Data Protection Officer (DPO).** [DPO name] ([dpo@astly.co]) owns this policy, maintains the consent statements and versions, handles withdrawal and access requests, and is the contact required by Sec 23.
- **Processors.** UPPASS (eKYC/biometrics) and any marketing-delivery providers act as processors and are governed by data-processing agreements (`DATA_PROCESSING_AGREEMENTS.md`).
- **Engineering / Product.** Responsible for implementing the consent UI and consent log to the requirements in Sec 6 and Sec 8.
- **Review cadence.** This policy and all consent-statement wording are reviewed **at least annually**, and on any **material change** to processing, vendors, the product, or PDPA/PDPC guidance. Every wording change bumps the consent version and is re-validated with Thai data-protection counsel.

*End of document.*
