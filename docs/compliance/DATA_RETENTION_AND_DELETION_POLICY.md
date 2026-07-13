# Astly - Data Retention and Deletion Policy
Status: Living document - prepared for investor technical due diligence and operational adoption.
Owner: Data Protection Officer (DPO) [to be appointed], Astly Co., Ltd. [registration to confirm].
Version: 0.1 (draft) | Effective date: [to set] | Review: at least annually or on material change.
Scope: How long Astly retains each category of personal data, the lawful drivers for those periods, and how data is securely deleted or anonymized at end of life - reconciled with the AML 5-year obligation.
Related: `../../DATA_PRIVACY_COMPLIANCE.md` (parent analysis), and siblings: `PRIVACY_POLICY.md`, `CONSENT_POLICY.md`, `RECORDS_OF_PROCESSING_ACTIVITIES.md`, `DATA_BREACH_NOTIFICATION_POLICY.md`, `DATA_PROCESSING_AGREEMENTS.md`.

> Legal note: this document maps Astly's implementation and retention choices to Thailand's PDPA (B.E. 2562 / 2019) and to the anti-money-laundering (AMLA) record-retention obligation, based on the official PDPA translation and reputable practitioner sources. It is compliance-planning input, not legal advice. Retention periods that reconcile PDPA storage-limitation with a legal-retention obligation, and the precise scope of the AML exception to erasure, must be validated by qualified Thai data-protection counsel before reliance. Points requiring such confirmation are marked "(to confirm with Thai data-protection counsel)".

---

## 1. Purpose and principles

Under **PDPA Sec 21** (purpose limitation) and **Sec 37(3)** (the controller must have a system to erase or destroy personal data when the retention period lapses, when it is no longer necessary, or when the data subject withdraws consent), Astly retains personal data only for as long as it is necessary for the purpose it was collected for, or for as long as a specific legal obligation requires. This policy operationalizes those duties.

Governing principles:

- **Storage limitation.** Each data category has a defined retention period; nothing is kept indefinitely by default.
- **Data minimization.** The shortest viable window is used, especially for sensitive (Sec 26 biometric) data, which Astly deliberately does not hold on its own systems (it is held by the eKYC vendor).
- **Lawful-obligation override.** Where a specific law (notably the AMLA 5-year obligation, Section 3) requires longer retention, that period governs those specific records even against an erasure request (Sec 33 exception).
- **Secure disposal.** At end of life, data is either irreversibly deleted or anonymized such that it can no longer identify a data subject; anonymized/aggregate data falls outside the PDPA.
- **Lifecycle coverage.** Astly's data flow is collection -> use -> storage -> disclosure -> retention/deletion; this policy governs the final stage and requires an end-of-retention deletion system per Sec 37(3).
- **Evidence.** Deletion and anonymization actions are logged so the controller can demonstrate compliance (Section 7).

---

## 2. Retention schedule

The core of this policy. Each data category below maps to its store, the lawful/operational driver for the retention period, the period itself, and the disposal method. Periods marked "[set: ...]" are a business choice to be fixed on adoption; "(to confirm ...)" flags a legal-confirmation point.

| Data category | Store | Retention driver | Retention period | Disposal method |
|---|---|---|---|---|
| KYC identity records (name, phone, address, national ID number) | Supabase / MongoDB | **AMLA**: at least 5 years from end of relationship/transaction (Sec 24(6) legal-obligation basis) | 5 years after end of relationship, then review | Delete, or **anonymize** for analytics |
| National ID-card image | Held by UPPASS (eKYC vendor); not on Astly storage | AMLA + PDPA minimization (elevated-risk identifier) | Per vendor DPA; shortest viable window aligned to the 5-year record obligation (to confirm with Thai data-protection counsel) | Vendor **deletion** per DPA; propagate deletion instruction |
| eKYC biometric (face-match / liveness) | Held by UPPASS (vendor) only; not on Astly storage | **PDPA Sec 26** minimization (sensitive data) | Only as long as needed to complete verification; **shortest viable window** | Vendor **deletion** per DPA (Section 4) |
| Loan / transaction / financial records (loan terms, servicing, settlements) | Supabase / MongoDB | **AMLA**: at least 5 years from the end of the transaction (Sec 24(6)) | 5 years after the transaction/loan closes | Delete, or **anonymize** to aggregate financial data |
| Bank-transfer slips (payment / redemption / delivery-fee proofs) | AWS S3 (ap-southeast-2, Sydney) | AML evidence + operational dispute window; financial-record aspect ties to AMLA | Financial-evidence slips: align to **5 years** (AML); other operational slips: **[set: e.g. N days]** after the dispute window | S3 **lifecycle deletion**; **anonymize** DB references |
| Item photographs (valuation / inspection / custody / return evidence) | AWS S3 (ap-southeast-2, Sydney) | Operational + dispute/custody window (may incidentally contain identifiers) | **[set: e.g. N days]** after loan closure / return confirmation | S3 **lifecycle deletion** |
| Contracts and custody records | MongoDB / Supabase | Loan-record lifecycle; **AMLA 5-year** where the record is financial | 5 years after the loan closes (financial); custody-only records **[set: e.g. N days]** after return | Delete, or **anonymize** |
| Notifications / contract-action records (redemption, extension, principal-change workflow) | MongoDB `notifications`; Supabase `contract_action_requests` / `contract_action_logs` | Tie to the loan-record lifecycle; AML 5-year where financial | 5 years where financial; otherwise **[set: e.g. N days]** after the workflow completes | Delete, or **anonymize** |
| Estimate cache (normalized inputs, image content hashes) | Upstash (Redis) | Operational (derived, low sensitivity) | **TTL-bounded - already ~30 days** (`ESTIMATE_CACHE_TTL_SECONDS`, default 30 days; image-hash cache same default) | **Automatic TTL expiry** (delete) |
| PIN hash | Supabase `user_security` | Authentication (needed while the account is active) | Retained while the account is active; deleted on **account closure** [confirm] | Delete on closure (to confirm with Thai data-protection counsel) |
| Session tokens | Supabase `user_security` | Authentication (short-lived, opaque) | **Short-lived** - 2-minute TTL (`TOKEN_TTL_MS`); superseded on each verify | Expire / overwrite (effective deletion) |
| Marketing data (marketing/communications preferences and history) | Supabase / MongoDB | **Consent** (Sec 19) | Until **consent is withdrawn** (or the marketing purpose ends) | **Delete** on withdrawal |
| Derived analytics / aggregate metrics | Supabase / MongoDB / Upstash | Business analytics (non-identifying once anonymized) | Retained while useful, **only in anonymized/aggregate form** | Kept anonymized (outside PDPA) |

Notes:
- Where a category has both a financial (AML) and a purely operational element, the AML 5-year period governs the financial record; operational-only artifacts (e.g. non-evidentiary item photos) use the shorter "[set]" window.
- "Anonymize" means irreversibly stripping identifiers so the data can no longer be linked to a data subject; where feasible Astly prefers anonymization over deletion for records with analytic value, since anonymized data is out of PDPA scope.

---

## 3. AML reconciliation (the 5-year override)

Thailand's anti-money-laundering regime (AMLA) requires reporting entities to retain **customer due-diligence (KYC) identity records and transaction/financial records for at least 5 years** from the end of the customer relationship or the completion of the transaction. Astly conducts eKYC and holds loan/financial records, so this obligation applies to those specific categories (exact scope and the precise trigger date to confirm with Thai data-protection counsel).

Interplay with the PDPA:

- **Lawful basis to retain.** For KYC identity and financial/transaction records, the retention basis is **legal obligation (PDPA Sec 24(6))**, not consent - so withdrawing consent does not, by itself, require deletion of those records.
- **Erasure exception (Sec 33).** PDPA Sec 33 gives the data subject a right to erasure/destruction, **but it does not apply where retention is necessary for compliance with a law**. The AMLA 5-year obligation is exactly such a law. Consequently, an erasure request **cannot** compel deletion of the AML-scoped KYC and financial records **until the 5-year period has elapsed**. Astly will honor the request for all data that is not subject to the obligation, and will delete/anonymize the AML-scoped records at the end of the 5-year window.
- **Minimization still applies.** The AML override is narrow: it justifies retaining only the specific records the law requires, in the form required. Data outside that scope (for example, marketing data, or item photos beyond any dispute/evidence need) is not covered and follows its own (shorter) schedule.
- **End state.** After 5 years from the end of the relationship/transaction, the AML retention driver falls away; the records are then deleted or anonymized under Section 2 unless another driver (e.g. a legal hold, Section 6) applies.

This reconciliation is what lets Astly satisfy **both** PDPA storage-limitation (Sec 21 / 37(3)) **and** the AMLA record-retention duty without conflict.

---

## 4. Deletion and anonymization mechanisms

> Current status (honest gap): a documented retention schedule (this policy) exists, but the **automated deletion/anonymization mechanisms below are largely to be implemented**. They are a priority operational task, consistent with the gap assessment in `../../DATA_PRIVACY_COMPLIANCE.md`. The cache TTL and the short-lived session-token expiry are the mechanisms already operative.

- **S3 lifecycle rules (media - photos and slips).** Define S3 lifecycle configuration on the object-storage bucket (ap-southeast-2, Sydney) to expire item photos and non-AML slips after their "[set]" window, and to transition/retain AML-evidence slips for the 5-year period. Object deletion must be paired with removal or anonymization of the URL references stored on the MongoDB/Supabase records. **To be implemented.**
- **Scheduled purges (expired DB records).** A scheduled job (e.g. a periodic cron in the existing Vercel-cron model) identifies records past their retention period - loan/contract/notification records beyond 5 years, operational records beyond their window - and deletes or anonymizes them. Must respect legal holds (Section 6). **To be implemented.**
- **Cache TTL (already in place).** The Upstash estimate cache is TTL-bounded and expires automatically at ~30 days (`ESTIMATE_CACHE_TTL_SECONDS` / image-hash cache, default 30 days); session tokens auto-expire at a 2-minute TTL. No further action is needed for these beyond keeping the TTLs documented here.
- **DSR-driven deletion (on request).** An erasure/withdrawal request (Section 5) triggers targeted deletion/anonymization across all stores holding the subject's data, subject to the AML exception. **Workflow to be implemented.**
- **Propagation to processors.** Deletion must propagate to processors that hold data on Astly's behalf - notably the **eKYC vendor (UPPASS)** for biometric and ID-image data - via the deletion terms in each Data Processing Agreement (`DATA_PROCESSING_AGREEMENTS.md`). Astly issues the deletion instruction and records the processor's confirmation. **To be implemented / confirm per DPA.**
- **Propagation to S3 objects.** Any deletion or correction that affects stored media must reach the underlying S3 objects, not only the database references, so that no orphaned personal data remains in object storage. **To be implemented.**

---

## 5. Data-subject-driven deletion

When a data subject exercises erasure/destruction (**Sec 33**), objects to processing (Sec 32), or **withdraws consent (Sec 19)**, the request flows as follows (full rights handling: `PRIVACY_POLICY.md`; consent mechanics: `CONSENT_POLICY.md`):

1. **Intake & verification.** The request is received (via the DPO contact in `PRIVACY_POLICY.md`) and the requester's identity is verified.
2. **Scope classification.** Astly determines which of the subject's data is (a) consent-based or no-longer-necessary - eligible for deletion now - versus (b) **AML-scoped KYC/financial records** subject to the 5-year legal-retention exception (Section 3).
3. **Execution.** Eligible data is deleted or anonymized across every store holding it (Supabase, MongoDB, S3 media, Upstash) and the deletion is propagated to processors (notably UPPASS) per their DPAs.
4. **Withheld data.** AML-scoped records are retained under the Sec 33 legal-obligation exception; the subject is informed of what is retained, on what basis, and for how long (until the 5-year period lapses), after which they are deleted/anonymized.
5. **Response clock.** Requests are actioned within the PDPA response window (generally 30 days; see `PRIVACY_POLICY.md`), and the outcome (including any withheld categories) is recorded.
6. **Consent withdrawal specifics.** For data whose only basis was consent (e.g. marketing), withdrawal leads to deletion; for data also supported by contract or legal obligation, withdrawal does not by itself require deletion.

---

## 6. Legal holds and exceptions

Deletion is **paused** for any data that is subject to an active hold, notwithstanding the schedule in Section 2:

- **Litigation / dispute holds.** Where a dispute, claim, or foreseeable litigation involves the data, it is preserved until the matter is resolved and any appeal/limitation period lapses.
- **Regulatory / law-enforcement holds.** Where a regulator, the PDPC, or law enforcement requires preservation or production, the data is held for the required period.
- **AML obligation.** The 5-year AMLA period (Section 3) is a standing hold on the specific KYC/financial records for its duration.
- **Release.** When a hold is released, the affected data returns to its normal schedule and is deleted/anonymized at the next scheduled purge (or immediately if already past its period).
- Holds are documented (what data, why, who authorized, start/expected end) so that suspended deletions are auditable and later resumed.

---

## 7. Roles, responsibilities, review and evidence

- **Owner / accountability.** The **DPO (to be appointed)** owns this policy, approves the "[set]" retention windows on adoption, oversees the deletion mechanisms, and authorizes legal holds. Astly Co., Ltd. remains the accountable Data Controller.
- **Engineering.** Implements and maintains the deletion/anonymization mechanisms (S3 lifecycle rules, scheduled purges, DSR-driven deletion, processor-deletion propagation) and keeps the constants in this schedule (cache TTLs, token TTL) accurate.
- **Operations / support.** Routes data-subject and hold requests to the DPO; does not delete records outside the defined process.
- **Processors.** Delete data on instruction and confirm deletion per their DPAs (`DATA_PROCESSING_AGREEMENTS.md`).
- **Review cadence.** Reviewed **at least annually or on material change** (new data category, new processor, changed legal obligation, or a change to the AML/PDPA position). Version-controlled in this repository.
- **Evidence / logging of deletion.** Deletion and anonymization actions - scheduled purges, DSR-driven deletions, and processor-deletion confirmations - are **logged** (what category, when, by which mechanism, and for DSRs any withheld AML-scoped categories) so Astly can demonstrate an operating Sec 37(3) deletion system to the PDPC and to investors. This logging capability is part of the mechanism build-out (Section 4) and is a current gap to implement.

---

_This policy is informational compliance-planning input and must be validated by qualified Thai data-protection counsel (and confirmed against the current AMLA record-retention rules) before reliance._
