# Astly - Disaster Recovery and Risk Mitigation Plan

Status: Living document, prepared for investor technical due diligence
Scope: The platform's disaster-recovery objectives (RTO/RPO), cloud topology (primary and secondary/DR), backup architecture per data store (method, frequency, retention, restore), high-availability and failover posture, DR scenarios and runbooks, restore procedures and DR testing, business-continuity in degraded mode, and a consolidated risk register with mitigations.
Companion documents: [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) (provider specs and sources), [`DATA_SECURITY.md`](DATA_SECURITY.md), [`SCALABILITY_AND_DEPLOYMENT.md`](SCALABILITY_AND_DEPLOYMENT.md), [`AUTHENTICATION_AND_AUTHORIZATION.md`](AUTHENTICATION_AND_AUTHORIZATION.md), [`DATA_PRIVACY_COMPLIANCE.md`](DATA_PRIVACY_COMPLIANCE.md).

> Reviewer note: provider backup/HA/SLA facts are quoted from `INFRASTRUCTURE.md` (which carries the primary-source citations) and are accurate to mid-2026. RTO/RPO figures and runbooks are engineering targets and plans, not contractual guarantees. Items dependent on the live account (e.g., whether PITR or read replicas are enabled, the actual cluster tier and regions) are marked "confirm" and gate several recovery objectives.

---

## Table of Contents

1. Objectives (RTO / RPO)
2. Cloud Topology - Primary and Secondary
3. Backup Architecture (per store)
4. High Availability and Failover
5. Disaster-Recovery Scenarios and Runbooks
6. Restore Procedures and DR Testing
7. Business Continuity and Degraded-Mode Operation
8. Consolidated Risk Register and Mitigations
9. DR Roadmap and Recommendations
10. Appendix - RTO/RPO Matrix, Backup Schedule, Sources

---

## 1. Objectives (RTO / RPO)

Disaster recovery is measured by two targets per asset:
- RPO (Recovery Point Objective): the maximum acceptable data loss, i.e. how far back a restore goes.
- RTO (Recovery Time Objective): the maximum acceptable time to restore service.

Proposed objectives (to ratify, and contingent on the "confirm" items in Section 3):

| Asset class | Target RPO | Target RTO | Basis |
|---|---|---|---|
| Financial / operational databases (Supabase, MongoDB) | <= 5 minutes (with PITR) | <= 4 hours | PITR + restore runbook; without PITR on Supabase, RPO degrades to <= 24 h |
| Object storage (Vercel Blob: photos, slips, contracts) | ~0 (durable managed storage) | minutes | Built-in durability + independent export |
| Application / compute | 0 (stateless) | minutes | Immutable deployments + instant rollback |
| Cache (Upstash) | n/a (rebuildable) | seconds-minutes | Recomputed on miss |
| Secrets / configuration | 0 (versioned) | minutes | Vercel env + Git |

Tiering principle: the financial system of record is the highest-value recovery asset and drives the plan; media is durable by design; compute and config recover near-instantly because they are stateless and immutable.

---

## 2. Cloud Topology - Primary and Secondary

### 2.1 Primary cloud

Astly is a serverless, multi-provider stack whose providers all run on Amazon Web Services (AWS) under the hood:

| Function | Provider | Underlying cloud |
|---|---|---|
| Edge / compute / CI-CD | Vercel | AWS (~20 regions) |
| Primary relational DB | Supabase (PostgreSQL) | AWS |
| Operational document DB | MongoDB Atlas | AWS |
| Object storage | Vercel Blob (configured region) | Vercel |
| Cache | Upstash Redis | AWS |

The primary services are accessed through independent managed-service control planes (Vercel, Supabase, Atlas, and Upstash). This is a strength for DR: a failure in one provider's control plane does not necessarily take down the others, and each has its own redundancy.

### 2.2 Secondary / DR cloud (current state and plan)

There is currently no active secondary cloud or hot standby; resilience today is in-provider (multi-AZ within a region, and Vercel's automatic cross-region edge routing). The DR strategy is therefore built in three escalating layers rather than a full second cloud (which is rarely cost-justified for a serverless stack at this stage):

1. In-region redundancy (today): every managed store is multi-AZ; Vercel auto-reroutes at the edge across AZs/regions.
2. Multi-region redundancy (plan): Supabase read replica(s), MongoDB Atlas multi-region nodes, and an independently stored copy of Blob media, so a single-region failure is survivable.
3. Provider-independent offsite backups (plan, recommended): scheduled logical exports (PostgreSQL dump, MongoDB dump, Blob copy) to an independent account and/or a different region or cloud, so that even a provider-account compromise, accidental project deletion, or provider-wide failure is recoverable. This is the closest practical equivalent to a "secondary cloud" and is the single highest-value DR addition.

The honest DR positioning for diligence: primary resilience relies on the managed providers' own multi-AZ durability and on PITR/replicas; a provider-account-level or region-level catastrophe is only fully covered once Layer 3 (offsite, provider-independent backups) and Layer 2 (multi-region) are implemented.

---

## 3. Backup Architecture (per store)

This is the core of the plan: what is backed up, how, how often, retention, and how it is restored.

| Store | Backup method | Frequency | Retention | RPO | Restore method | Notes / confirm |
|---|---|---|---|---|---|---|
| Supabase (PostgreSQL) | Automated daily snapshot (Pro) | Every 1 day | 7 days (Pro) | up to 24 h (daily only) | Dashboard restore / support | PITR is a PAID ADD-ON, not default |
| Supabase + PITR (recommended) | Continuous WAL archiving | Continuous (~2-min WAL) | 7 days (add-on) | ~2 minutes | Point-in-time restore | Requires PITR add-on + >= Small compute - CONFIRM if enabled |
| MongoDB Atlas (dedicated M10+) | Continuous Cloud Backup (oplog) + scheduled snapshots | Continuous (oplog) | Configurable 1-7 day PITR window | sub-minute (~seconds) | PITR restore to new/existing cluster | CONFIRM tier is M10+ and continuous backup enabled |
| Vercel Blob (media, contracts, slips) | Managed durability; immutable pathname strategy | Continuous | Per retention policy (define) | ~0 | Re-sync from independent copy | Confirm region and implement scheduled provider-independent export |
| Upstash Redis (cache) | Replicated to block storage | Continuous | n/a (cache) | n/a | Rebuild from source on miss | Non-authoritative; no backup needed |
| Application code + config | Git history + Vercel immutable deployments | Every commit / deploy | Indefinite | 0 | Instant Rollback / redeploy | Cron definitions are NOT reverted by Instant Rollback |
| Secrets | Vercel environment variables (encrypted) | On change | Lifetime of config | 0 | Re-inject from secure store | Keep a sealed secrets backup |
| Recommended: offsite logical exports | pg_dump (Postgres) + mongodump (Mongo) + Blob copy to an independent account/region | Daily (recommended) | 30-90 days (and 5-year archive for AML records) | <= 24 h | Import into a fresh project/cluster/store | Provider-independent DR + ransomware/account-compromise resilience |

Backup design summary in plain terms:
- The financial databases are backed up daily by default; enabling PITR upgrades that to near-continuous (about a 2-minute worst-case loss window) and is strongly recommended for a money-handling system of record.
- MongoDB Atlas (on a dedicated tier) already provides continuous, point-in-time backups with second-level granularity.
- Object storage is continuously durable across three availability zones; turning on Versioning makes accidental overwrites/deletes recoverable, and Object Lock protects financial documents from tampering.
- Code and configuration are "backed up" inherently because every deployment is an immutable, instantly-restorable artifact and all code lives in Git.
- The recommended addition is a daily, automated export of both databases and Blob media into a separate provider/account/region, which provides recovery from failures that in-provider backups cannot cover (provider outage, account compromise, accidental project deletion) and supports the AML 5-year retention requirement.

---

## 4. High Availability and Failover

| Tier | HA mechanism | Automatic failover? |
|---|---|---|
| Vercel edge / functions | Anycast edge; automatic cross-AZ failover (Fluid compute) and cross-region edge rerouting (AWS Global Accelerator + anycast) | Yes (automatic) |
| MongoDB Atlas (M10+) | Replica set (3 data-bearing nodes); optional multi-region | Yes (automatic in-cluster) |
| Vercel Blob | Provider-managed redundant object storage | Yes (built-in) |
| Supabase (Pro) | Single primary; read replicas are an add-on | NO automatic failover on Pro (Enterprise-only); recovery is via restore/PITR |
| Upstash Redis | Multi-replica; optional Global (multi-region) | Yes (provider) |

Critical HA gap (honest): Supabase on the Pro plan has no automatic database failover - that is an Enterprise capability. A primary-instance or single-AZ failure on Supabase is recovered by restore (PITR if enabled), so the Supabase RTO is bounded by restore time and the existence of a tested runbook, not by automatic promotion. This is the most important availability limitation and is reflected in the risk register (R-DR-1) with the mitigation path (read replicas now; Enterprise for automatic failover).

---

## 5. Disaster-Recovery Scenarios and Runbooks

Concise runbooks for the credible disaster scenarios. Each lists detection, response, and the target RPO/RTO.

### S1 - Single AWS Availability-Zone failure
- Detection: provider health alerts; elevated error rates.
- Response: Vercel services (including Blob), MongoDB Atlas, and Upstash use provider-managed redundancy. Supabase (Pro) may be impacted if its single AZ is affected -> initiate restore/PITR per S4.
- RPO ~0 / RTO minutes for all tiers except Supabase (which depends on PITR + restore if its AZ is hit).

### S2 - Full AWS region outage
- Detection: regional provider status; total unavailability.
- Response: Vercel reroutes edge traffic automatically. Databases are single-region unless multi-region replicas are configured (plan) -> if not, recover into another region from backups (S4). Promote a cross-region read replica if available.
- RPO/RTO: minutes if multi-region replicas exist; otherwise bounded by restore-into-new-region time (target <= 4 h) and backup RPO.

### S3 - Managed-provider (control-plane) outage (e.g., Supabase/Atlas/Vercel provider incident)
- Detection: provider status page; failed connections despite AWS being healthy.
- Response: for a stateless tier (Vercel), wait out or redeploy elsewhere; for a database provider, restore the latest backup/export into an alternate provider/account (this is why the Layer-3 offsite export matters) and repoint connection strings via environment variables.
- RPO/RTO: with offsite exports, RPO <= 24 h and RTO measured in hours; without them, recovery depends entirely on the provider's own recovery.

### S4 - Data corruption or accidental deletion (logical disaster)
- Detection: data-integrity checks; user reports; failed reconciliation.
- Response: restore to a point in time before the corruption - Supabase PITR (if enabled) or daily snapshot; MongoDB Atlas PITR; restore Blob media from the independent export. Reconcile the dual stores after restore (the MongoDB and Supabase records must be brought back into agreement).
- RPO: ~2 min (PITR) to 24 h (daily only); RTO <= 4 h.

### S5 - Ransomware / malicious deletion / provider-account compromise
- Detection: anomalous deletions, mass changes, alerting on admin actions.
- Response: this is the scenario in-provider backups may not cover if the attacker has account access; recover from immutable offsite exports (Layer 3) in a clean account and rotate all credentials, including the Blob read/write token.
- Mitigation dependency: requires offsite, access-isolated backups and Object Lock (currently a recommendation - R-DR-3).

### S6 - Secret / key compromise
- Detection: anomalous API usage; provider alerts.
- Response: rotate the affected secret in Vercel (DB credentials, service-role key, AI keys, IAM keys, webhook secrets); redeploy; review access logs; if the Supabase service-role key leaked, rotate immediately (it is the master data credential). Multi-key AI rotation limits blast radius for AI keys.
- RTO: minutes (rotation + redeploy).

### S7 - Critical dependency outage (AI provider, eKYC, PSP, LINE)
- Detection: elevated error/timeout rates per integration.
- Response: graceful degradation already built in - AI rate-limit/failure falls back (minimum price / unreadable verdict); slip verification falls back from SlipOK to Claude vision; multi-key rotation absorbs provider throttling. For a hard outage, affected flows queue or are temporarily disabled while core flows continue.
- RPO/RTO: no data loss; feature-level degradation rather than outage.

### S8 - Bad deployment / code defect in production
- Detection: error spike post-deploy; failed smoke checks.
- Response: Instant Rollback to the previous immutable deployment (seconds). Caveat: cron-job definitions are not reverted by Instant Rollback and must be corrected manually if changed.
- RPO 0 / RTO minutes.

### S9 - Loss of key personnel / access
- Detection: operational.
- Response: ensure more than one administrator on every provider; store break-glass credentials in a sealed secrets vault; document all runbooks (this set). Avoid single-person dependencies.

---

## 6. Restore Procedures and DR Testing

### 6.1 Restore procedures (summary)

- Supabase: restore from the daily snapshot or PITR via the Supabase dashboard/support into the same or a new project; update `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` if the project changes; verify RLS posture post-restore.
- MongoDB Atlas: PITR/snapshot restore to a new or existing cluster; update `MONGODB_URI`.
- Vercel Blob: re-sync objects from the independent/offsite copy and refresh stored references where necessary.
- Application: redeploy from Git / Instant Rollback; re-verify cron definitions.
- Cross-store reconciliation: after any database restore, run the reconciliation step to realign the MongoDB (customer) and Supabase (finance) records, since they are dual-written with no replication layer.

### 6.2 DR testing plan (cadence)

DR capability is only real if tested. Recommended program:
- Quarterly restore drill: restore each database from backup/PITR into a scratch environment and measure actual RTO/RPO against targets.
- Semi-annual game-day: simulate a region/provider outage and exercise the failover/restore runbooks end-to-end, including cross-store reconciliation.
- After every schema migration: verify the backup/restore still works against the new schema.
- Backup-integrity checks: automated verification that daily exports complete and are restorable (a backup that has never been restored is not a backup).
- Record results: each drill produces a measured RTO/RPO and a list of runbook corrections.

Status: a formal, scheduled DR-test program is a recommendation (R-DR-6); ad-hoc restores via the providers' tooling are possible today but unmeasured.

---

## 7. Business Continuity and Degraded-Mode Operation

The architecture degrades gracefully rather than failing wholesale:
- Read-mostly continuity: if a write path is impaired, cached and read endpoints continue to serve.
- Feature isolation: a single integration outage (AI, eKYC, slip, PSP) disables or queues only that feature; identity, browsing, and existing contracts remain available.
- Asynchronous buffering: lifecycle operations are mediated by durable envelopes and advanced by webhooks/cron, so transient downstream outages cause queueing, not loss.
- Communication: incidents should trigger user-facing status messaging over LINE and an internal incident channel; an incident-commander role and a stakeholder-comms template are recommended (R-DR-7).
- Manual fallback: critical money-gating steps (slip verification, drop-point confirmation) already have a manual-review path, allowing operations to continue under degraded automation.

---

## 8. Consolidated Risk Register and Mitigations

The platform's principal risks across reliability, security, compliance, and operations, consolidated from the companion documents and prioritized for this plan. (Cross-references: INFRA = `INFRASTRUCTURE.md`, SEC = `DATA_SECURITY.md`, AUTHZ = `AUTHENTICATION_AND_AUTHORIZATION.md`, PDPA = `DATA_PRIVACY_COMPLIANCE.md`, SCALE = `SCALABILITY_AND_DEPLOYMENT.md`.)

| # | Risk | Likelihood | Impact | Mitigation | Owner area |
|---|---|---|---|---|---|
| R-DR-1 | Supabase Pro has no automatic failover; primary/AZ failure recovered only by restore | Medium | High | Enable PITR + read replicas now; plan Enterprise for auto-failover; tested restore runbook | INFRA/DR |
| R-DR-2 | PITR may not be enabled -> up to 24 h data loss on the finance DB | Medium | High | Enable Supabase PITR; confirm Atlas continuous backup | INFRA/DR |
| R-DR-3 | No provider-independent offsite backups -> account compromise / accidental deletion / provider failure not fully recoverable | Medium | High | Implement daily database and Blob exports to an isolated account/region | DR |
| R-DR-4 | Single-region databases; region outage not survivable without replicas | Low-Medium | High | Multi-region read replicas (Supabase) / multi-region nodes (Atlas) + independent Blob copy | INFRA/DR |
| R-DR-5 | No contractual uptime SLA on Vercel/Supabase Pro tiers | Medium | Medium-High | Internal 99.9% target; Enterprise upgrade path for SLAs | INFRA |
| R-DR-6 | DR runbooks untested (unmeasured RTO/RPO) | High | Medium | Quarterly restore drills + semi-annual game-day | DR |
| R-DR-7 | No formal incident-response / breach-notification runbook | Medium | Medium-High | Build IR plan incl. PDPA 72-hour breach process (see PDPA doc) | Sec/PDPA |
| R-DR-8 | Webhook signature enforcement inconsistent (some fail-open / unauthenticated) | Medium | High | Enforce strict verification on all webhooks | AUTHZ |
| R-DR-9 | AI media egress without confirmed no-training/ZDR posture | Medium | High | Execute ZDR/BAA/paid-tier; in-house model removes egress | SEC/INTEG |
| R-DR-10 | Dual-store consistency (no replication layer); post-restore divergence | Medium | Medium | Reconciliation job; restore runbook includes realignment step | DR/SCALE |
| R-DR-11 | Secret/key compromise (single high-privilege credentials per store) | Low | High | Rotation schedule; least-privilege; multi-key AI rotation already in place | Sec |
| R-DR-12 | Instant Rollback does not revert cron definitions | Low | Medium | Document in runbook; verify crons after rollback | DR |
| R-DR-13 | Connection-pool saturation under load (Supabase) | Medium | Medium | Scale compute tier; Supavisor pooling; monitor utilization | SCALE |
| R-DR-14 | No automated test suite -> regression risk on financial logic | Medium | Medium | CI tests for pricing/calculations/state machines | SCALE |
| R-DR-15 | PDPA governance artifacts incomplete (RoPA/DPO/DPAs/consent) | High | Medium-High | Execute the PDPA gap plan | PDPA |

Highest-priority cluster for DR specifically: R-DR-1, R-DR-2, R-DR-3, R-DR-6 (failover, PITR, offsite backups, and testing) - these convert the platform from "relies on provider durability" to "demonstrably recoverable".

---

## 9. DR Roadmap and Recommendations

Immediate (days, low effort, high assurance):
1. Confirm and enable Supabase PITR; confirm MongoDB Atlas is dedicated (M10+) with continuous backup; confirm the Blob store region and independent export destination.
2. Confirm the region map and co-locate compute with the databases (reduce blast radius and latency).
3. Stand up backup-completion monitoring and basic alerting.

Near term (weeks):
4. Implement daily provider-independent offsite exports (Postgres + Mongo + Blob copy) to an isolated account/region; verify restorability.
5. Write and store the restore runbooks (this document) and a first incident-response/breach runbook.
6. Run the first quarterly restore drill and record measured RTO/RPO.

Medium term:
7. Add multi-region replicas (Supabase read replica, Atlas multi-region) and an independent Blob media copy for region/provider-failure survivability.
8. Evaluate Enterprise tiers (Vercel, Supabase) for contractual SLAs and Supabase automatic failover.
9. Institutionalize the DR test program (quarterly drills, semi-annual game-days) and infrastructure-as-code so DR environments are reproducible.

Throughline: the platform inherits strong baseline durability from its managed providers (Atlas continuous backup, Blob 11-nines durability, Vercel immutable deploys), and the DR plan's job is to (a) turn on the available safety nets that are not yet confirmed (PITR and continuous backup), (b) add a provider-independent offsite backup as the true DR backbone, and (c) prove recovery through scheduled drills - all achievable without re-architecture.

---

## 10. Appendix - RTO/RPO Matrix, Backup Schedule, Sources

RTO/RPO matrix (targets):

| Asset | Backup cadence | Retention | RPO target | RTO target |
|---|---|---|---|---|
| Supabase (with PITR) | Continuous (daily without PITR) | 7 days (+ offsite 30-90 d) | ~2 min (24 h without PITR) | <= 4 h |
| MongoDB Atlas | Continuous (oplog) | 1-7 day PITR window | sub-minute | <= 4 h |
| Vercel Blob | Continuous managed durability + independent export | Retention-defined | ~0 | minutes |
| App / config | Per deploy / commit | Indefinite | 0 | minutes |
| Cache | n/a | n/a | n/a | seconds |

Backup schedule summary: financial databases daily (continuous with PITR); object storage continuous; code/config on every deploy; recommended offsite exports daily; AML-driven records archived 5 years.

Sources: backup/HA/SLA specifications and citations are in `INFRASTRUCTURE.md` (Vercel/Blob, Supabase, MongoDB Atlas, Upstash primary-source links). All account-specific items (PITR enabled, cluster tier, and regions) must be confirmed against the live accounts; all figures are planning targets to be validated by DR drills.
