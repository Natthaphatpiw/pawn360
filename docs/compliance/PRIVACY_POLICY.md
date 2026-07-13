# Astly - Privacy Policy (Privacy Notice)
Status: Living document - prepared for investor technical due diligence and operational adoption.
Owner: Data Protection Officer (DPO) [to be appointed], Astly Co., Ltd. [registration to confirm].
Version: 0.1 (draft) | Effective date: [to set] | Review: at least annually or on material change.
Scope: How Astly collects, uses, discloses, transfers, retains and protects personal data of borrowers, investors and drop-point operators, and how you can exercise your PDPA rights.
Related: `../../DATA_PRIVACY_COMPLIANCE.md` (parent analysis), and siblings in this folder: `CONSENT_POLICY.md`, `RECORDS_OF_PROCESSING_ACTIVITIES.md`, `DATA_RETENTION_AND_DELETION_POLICY.md`, `DATA_BREACH_NOTIFICATION_POLICY.md`, `DATA_PROCESSING_AGREEMENTS.md`.

> This notice maps Astly's implementation to Thailand's PDPA based on the official translation and reputable practitioner sources. It is compliance-planning input, not legal advice; conclusions must be validated by qualified Thai data-protection counsel.

---

This Privacy Notice explains how **Astly Co., Ltd.** ("Astly", "we", "us", "our") handles your personal data when you use the Astly platform at **Astly.co** and our LINE mini-applications (LIFF). Astly operates a Thailand-based peer-to-peer secured-lending platform: individuals receive short-term loans against personal movable collateral (mainly consumer electronics), which we verify, value, take into custody, and return on repayment; investors fund the loans; and drop-point operators handle item intake and return. All lending is conducted under the applicable Thai secured-lending legal basis (a separate Thai law) and is governed, as to personal data, by the **Personal Data Protection Act B.E. 2562 (2019) ("PDPA")**.

Please read this notice together with our `CONSENT_POLICY.md`, which governs the specific consents we ask you to give.

## 1. Who we are and how to reach us

Astly Co., Ltd. is the **Data Controller** of your personal data under the PDPA. This means we determine why and how your personal data is processed.

| Field | Details |
|---|---|
| Controller | Astly Co., Ltd. |
| Registration no. | [Astly Co., Ltd. registration no.] |
| Registered address | [registered address] |
| Data Protection Officer (DPO) | [DPO name] |
| DPO email | [dpo@astly.co] |
| Product / domain | Astly platform, **Astly.co**, and Astly LINE mini-apps |

If you have any question about this notice, or wish to exercise your rights (Section 8), please contact our DPO using the details above.

## 2. The personal data we collect

We collect the categories of personal data below. **Data subjects** are borrowers, investors and drop-point operators; not every category applies to every role. Items marked **SENSITIVE** are sensitive personal data under **PDPA Sec 26** and receive heightened protection.

| Data category | Type / sensitivity | Where it is held |
|---|---|---|
| Name, phone number, address | General personal data | Supabase / MongoDB |
| National ID number + ID-card image | General but **elevated-risk** (subject of open PDPC consultation; treated with heightened care) | Number in Supabase; ID-card **images held by UPPASS** (our eKYC vendor), not on Astly storage |
| eKYC face-match / liveness data (biometric) | **SENSITIVE - biometric, Sec 26** (requires explicit consent) | Held by **UPPASS** vendor only; **not stored on Astly** systems (data minimization) |
| Bank-transfer slips, bank account, loan / financial records | General (financial) | Slips in AWS S3; records in Supabase / MongoDB |
| Item photographs | General (may incidentally contain identifiers) | AWS S3 |
| Contracts, transactions, custody records, notifications | General | MongoDB / Supabase |
| PIN hash + session token | Authentication data (PIN is **one-way hashed**, never stored in clear text) | Supabase (`user_security`) |
| Derived cache (normalized inputs, image content hashes) | Derived, low sensitivity | Upstash |

We collect this data directly from you (for example, when you register, request a loan, invest, or operate a drop point), and we generate some of it through your use of the platform (for example, transaction and custody records). Biometric and identity-document data are collected and processed by our eKYC vendor on our behalf, as described in Section 5.

## 3. Why we use your data, and our lawful bases

We only use your personal data where the PDPA gives us a lawful basis to do so. The table below maps each purpose to its basis.

| Purpose | Lawful basis | PDPA section(s) |
|---|---|---|
| Borrower / investor identity, contact details, loan terms and servicing | Performance of a contract + legal obligation | Sec 24(3), Sec 24(6) |
| KYC identity verification (national ID number and ID document) | Legal obligation (AML / customer due diligence) + performance of a contract | Sec 24(6), Sec 24(3) |
| eKYC biometric / liveness verification | **Explicit consent** | **Sec 26** |
| Item photographs and bank slips for valuation and payment verification | Performance of a contract + legitimate interest | Sec 24(3), Sec 24(5) |
| Anti-money-laundering monitoring and fraud prevention | Legal obligation + legitimate interest | Sec 24(6), Sec 24(5) |
| Marketing and service communications (if any) | Consent | Sec 19 |

Where we rely on **explicit consent** (biometric eKYC) or **consent** (marketing), you may withdraw that consent at any time; see Sections 4 and 8. Withdrawing consent does not affect the lawfulness of processing carried out before withdrawal, and it will not affect processing we are required or permitted to carry out on another basis (for example, records we must keep under AML law).

Where we rely on **legitimate interest** (Sec 24(5)), we have balanced that interest against your rights and freedoms; you may object to such processing as described in Section 8.

## 4. Cookies and similar technologies

Astly.co and our web surfaces use cookies and similar technologies. We display a **cookie consent banner** so that you can accept or manage non-essential cookies; essential cookies necessary to operate the service are used on the basis of necessity. For details of the categories used and how to change your choices, see `CONSENT_POLICY.md`.

## 5. Who we share your data with, and international transfers

We do not sell your personal data. We share it only with service providers (processors) who help us operate the platform, and only for the purposes described above. Each processor acts under a data processing agreement (DPA) that restricts their use of your data to our instructions.

| Recipient / processor | Function | Hosting region |
|---|---|---|
| UPPASS | eKYC identity verification, including biometric / liveness | SE Asia (vendor) |
| Anthropic (Claude) | AI analysis of item photographs and bank slips | US |
| Google (Gemini) | AI condition scoring of item photographs | US (paid tier / Vertex) |
| OpenAI | Optional web search for **product text only** (no personal data of item images) | US |
| Vercel | Application hosting, compute and logs | US-default (configurable) |
| Supabase | Primary database | AWS region (to confirm) |
| MongoDB Atlas | Operational database | AWS region (to confirm) |
| AWS S3 | Object storage (item photos, bank slips, contracts) | ap-southeast-2 (Sydney) |
| Upstash | Cache | AWS region |
| Payment PSP (planned) | Funds collection and routing | TH / SE Asia |

**AI providers operate under a no-training / zero-data-retention posture, so they do not use your data to train their models.** Biometric eKYC data is held by our vendor rather than on Astly systems, minimizing where the highest-risk data resides.

### International (cross-border) transfers - Sec 28-29

Several of these processors are located outside Thailand (largely in the United States; our object storage is in Sydney). Under **PDPA Sec 28-29**, transferring personal data abroad generally requires that the destination country provide adequate protection, or that a recognized derogation or safeguard applies.

At present there is **no PDPC adequacy finding for the United States (to confirm with Thai data-protection counsel)**. We therefore rely, as applicable, on:

- **Necessity for the performance of a contract** with you, or of a contract concluded in your interest (Sec 28 derogation);
- your **informed consent** to the transfer, having been told of the possible inadequacy of data-protection standards at the destination; and
- **appropriate safeguards** committed in each processor agreement (standard-contractual-clauses-equivalent protections).

To reduce our cross-border footprint over time, **Astly plans to co-locate its core databases in a Singapore (SE-Asia) region.**

## 6. How long we keep your data

We keep personal data only for as long as we need it for the purposes above, or for as long as the law requires. A summary appears below; the full schedule is in `DATA_RETENTION_AND_DELETION_POLICY.md`.

| Data | Retention (summary) |
|---|---|
| KYC records and loan / financial records | Retained **at least 5 years** to meet the AML (AMLA) obligation, then deleted or anonymized |
| Biometric / liveness (at vendor) | Held by the eKYC vendor for the **shortest viable window** |
| S3 media (item photos, slips, contracts) | Managed under an object-storage **lifecycle policy** |
| Derived cache | Time-to-live of approximately **30 days** |
| Marketing data | Deleted on **withdrawal of consent** |

**AML override:** the 5-year AML retention obligation can lawfully require us to keep specific KYC and financial records even where you request erasure (see Section 8).

## 7. How we protect your data

We apply technical and organizational safeguards appropriate to the risk. In summary:

- **In transit:** TLS 1.3 at the edge, and TLS to every datastore and API.
- **At rest:** AES-256 encryption across all data stores.
- **Authentication:** PINs are hashed with bcrypt (cost 10); sessions use opaque, short-lived tokens.
- **Access:** databases are not publicly reachable and are accessed only through server-side privileged access; object storage is private and served via time-limited presigned URLs.
- **Data minimization:** the highest-risk biometric data is minimized by holding it at the eKYC vendor rather than on Astly systems.

Fuller detail is in `../../DATA_SECURITY.md`.

## 8. Your rights under the PDPA, and how to exercise them

Subject to the conditions and exceptions in the PDPA, you have the following rights over your personal data.

| Right | What it means | PDPA section |
|---|---|---|
| Access + copy | Obtain access to, and a copy of, your personal data | Sec 30 |
| Data portability | Receive / transmit your data in a machine-readable form where applicable | Sec 31 |
| Object | Object to certain processing (including legitimate-interest processing and direct marketing) | Sec 32 |
| Erasure / destruction / anonymization | Have your data deleted, destroyed or anonymized where grounds apply | Sec 33 |
| Restriction | Ask us to suspend use of your data in defined situations | Sec 34 |
| Rectification | Have inaccurate data corrected and incomplete data completed | Sec 35-36 |
| Withdraw consent | Withdraw any consent you have given (for example, biometric eKYC or marketing) | Sec 19 |

To exercise any right, contact our **DPO** at [dpo@astly.co] (Section 1). We will respond **within 30 days** of your request (Sec 30). We may need to verify your identity before acting.

**Please note:** some rights are qualified. Where we are legally required to retain data - in particular the **AML (AMLA) obligation** to keep KYC and financial records for at least 5 years - we may lawfully decline an erasure request for those specific records until the obligation ends. We will explain any such refusal.

If you are unable to withdraw a consent, or exercise another right, through the platform, contact the DPO and we will action it for you.

## 9. Data breaches

If a personal-data breach occurs, we will notify the **PDPC without undue delay and, where feasible, within 72 hours** (Sec 37(4)). Where a breach is likely to result in a high risk to your rights and freedoms, we will also notify you, as an affected data subject, without delay. Our process is described in `DATA_BREACH_NOTIFICATION_POLICY.md`.

## 10. Changes to this notice

This is a living document. We may update it to reflect changes in our processing, our processors, or the law. When we make a material change, we will update the version and effective date at the top and, where appropriate, notify you. The current version always governs.

## 11. How to contact us or complain

For any privacy question or request, contact our **Data Protection Officer**:

- **DPO:** [DPO name], Astly Co., Ltd.
- **Email:** [dpo@astly.co]
- **Address:** [registered address]

If you believe we have not handled your personal data in accordance with the PDPA, you have the right to lodge a complaint with the **Personal Data Protection Committee (PDPC)** via [PDPC complaint channel]. We would, however, appreciate the chance to address your concerns first, so please consider contacting our DPO before you do so.
