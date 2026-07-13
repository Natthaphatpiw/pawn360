# Astly - Infrastructure and Cloud Provider Reference

Status: Living document, prepared for investor technical due diligence
Scope: Every cloud service, hosting model, networking and load-balancing posture, region and data-residency footprint, scaling model, backup and disaster-recovery posture, security and compliance position, cost model, and the associated risk register for the Astly platform.
Companion documents: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) (application architecture) and [`docs/diagrams/`](docs/diagrams) (architecture and sequence diagrams).

> Verification note for reviewers: figures for plan limits, prices, and SLAs are accurate to the cited primary sources as of writing (mid-2026) and are marked with their source. Cloud-provider quotas and prices change frequently; all dollar figures and quotas should be re-verified against the live pricing pages at diligence time. Items marked "ACCOUNT-SPECIFIC - confirm" depend on the live account configuration and are listed in the verification checklist (Section 15).

---

## Table of Contents

1. Executive Summary and Service Inventory
2. Hosting and Compute - Vercel (Pro)
3. Networking, Ingress, TLS, and Load Balancing
4. Scaling Model
5. Primary Database - Supabase PostgreSQL (Pro)
6. Operational Database - MongoDB Atlas
7. Object Storage - AWS S3
8. Cache - Upstash Redis (via Vercel KV / Marketplace)
9. Third-Party API and Identity Providers (and AI data-handling posture)
10. Regions and Data Residency
11. Backup, Disaster Recovery, RPO/RTO
12. Security and Compliance
13. Observability and Operations
14. Cost Model
15. Risk Register and Due-Diligence Verification Checklist
16. Appendix - Service, SLA, and Compliance Matrix

---

## 1. Executive Summary and Service Inventory

Astly is a fully serverless, managed-cloud platform. The team operates no virtual machines, containers, Kubernetes clusters, or self-managed load balancers. All compute is stateless and event-driven; all stateful systems are managed third-party services consumed over the network. This minimizes operational surface area and headcount but concentrates availability and compliance dependencies on the providers below.

| Layer | Provider / Service | Plan | Role | Underlying cloud |
|---|---|---|---|---|
| Web hosting, edge, compute | Vercel | Pro | Edge network (CDN, TLS, WAF, DDoS), serverless Functions, cron, CI/CD | AWS (Vercel-managed, ~20 regions) |
| Primary relational DB | Supabase (PostgreSQL) | Pro | Investor / finance / logistics system of record, RLS, Auth-capable | AWS |
| Operational document DB | MongoDB Atlas | Dedicated (ACCOUNT-SPECIFIC - confirm M10+) | Customer-facing operational store | AWS |
| Object storage | AWS S3 | Standard | Item photos, bank slips, contracts, tickets, QR | AWS ap-southeast-2 (Sydney) |
| Cache | Upstash Redis (via Vercel KV / Marketplace) | Pay-as-you-go / Fixed (confirm) | Estimate and image-hash cache | AWS |
| Messaging / channel | LINE (Messaging API + LIFF) | Official Accounts | Customer/investor/drop-point/store channels and mini-app auth | LINE Corp |
| AI - text | Anthropic Claude | Commercial API | Pricing normalization, search filtering, web-search pricing | Anthropic |
| AI - vision | Anthropic Claude (Haiku) + Google Gemini | Commercial API / paid tier | Item-condition image analysis, bank-slip OCR | Anthropic / Google |
| AI - alternate search | OpenAI | Commercial API | Optional alternate web-search price provider (text only) | OpenAI |
| Price data | SerpAPI | Commercial API | Google Shopping price candidates | SerpAPI |
| eKYC | UPPASS | Commercial API | Identity verification (national ID) | UPPASS |
| Payment-slip verification | SlipOK | Commercial API | Bank-transfer slip validation | SlipOK |

Headline diligence facts:

- Both core platforms (Vercel and Supabase) are on the Pro tier. Neither Pro tier carries a contractual uptime SLA - SLAs are Enterprise-only on both. This is the single most material infrastructure risk and is detailed in Section 15.
- There is no manually operated load balancer anywhere in the stack; traffic distribution is handled automatically by Vercel's anycast Edge Network and by each managed database's own routing.
- Sensitive personal and financial media (item photos, bank slips, national-ID eKYC) is processed by third-party AI and verification providers; the no-training / retention posture of each must be contractually confirmed (Section 9, Section 15).

---

## 2. Hosting and Compute - Vercel (Pro)

The entire application (frontend, API, webhooks, cron) is a single Next.js project deployed on Vercel. Vercel runs on AWS infrastructure across roughly 20 regions and presents a single global anycast edge.

### 2.1 Vercel Pro plan - commercial model

- Platform fee: USD 20 per deploying member per month, which includes one deploying seat and USD 20 of monthly usage credit. Read-only Viewer seats are free and unlimited. (Source: vercel.com/docs/plans/pro, vercel.com/pricing.)
- Usage model: the USD 20 credit is applied against on-demand resources after included allotments. Included on Pro each month: Fast Data Transfer 1 TB; Edge Requests 10,000,000. Active CPU, Provisioned Memory, function invocations, and Fast Origin Transfer have no separate included allotment on Pro beyond the credit - they are billed from the first unit and offset by the credit. (Source: vercel.com/docs/limits.)
- Representative on-demand rates (verify against live pricing): function invocations USD 0.60 per 1M; Active CPU from USD 0.128/hr; Provisioned Memory from USD 0.0106/GB-hr; Log Drains USD 0.50/GB; Observability Plus events USD 1.20 per 1M.

### 2.2 Vercel Functions (serverless compute)

All backend handlers are Next.js Route Handlers compiled to Vercel Functions on the Node.js runtime. Relevant Pro characteristics (source: vercel.com/docs/functions/limitations, vercel.com/docs/fluid-compute):

- Fluid compute (default for new projects): an instance can serve multiple concurrent invocations (in-function concurrency), with Active CPU billed only while code executes (paused during I/O waits) and automatic cold-start mitigation (bytecode caching on Node 20+, production pre-warming, per-request error isolation).
- Execution duration: Pro default 300 s, maximum 800 s (generally available), extended maximum 1800 s (30 min, beta, per-function configuration). The application sets `maxDuration = 60` on its three heaviest handlers (condition analysis, loan-ticket rendering, contract-image rendering) which perform headless-Chromium document rendering or multi-image vision plus live web search.
- Memory / CPU: Pro can configure up to 4 GB memory / 2 vCPU (default 2 GB / 1 vCPU).
- Concurrency / auto-scaling: functions auto-scale up to 30,000 concurrent executions on Pro, with no provisioning required.
- Payload limit: request/response body max 4.5 MB (the app independently caps uploads at 10 MB and routes large media through S3, not function bodies).
- Runtime selection: the app uses Node.js (not the Edge runtime) because it depends on the MongoDB driver, AWS SDK, Puppeteer/Chromium, and bcrypt, which are Node-only.

### 2.3 Build and deployment pipeline (CI/CD)

- Git-integrated: every push produces an immutable deployment; pull requests and non-production branches produce isolated Preview Deployments with their own URL and environment scope.
- Build limits (Pro): max build time 45 min/deployment; up to 12 concurrent builds; up to 6,000 deployments/day. (Source: vercel.com/docs/limits.)
- Production promotion is atomic; Instant Rollback re-points the alias to a prior immutable deployment. Operational caveat: Instant Rollback does not revert cron-job definitions - crons continue on the latest configuration until manually changed.
- Environment variables are scoped per environment (Production / Preview / Development), encrypted at rest, and injected at build and runtime; only `NEXT_PUBLIC_*` values reach the browser bundle. Limit: 1,000 vars/environment, 64 KB total.

### 2.4 Scheduled jobs (Vercel Cron)

- Pro allows up to 100 cron jobs/project at per-minute scheduling granularity. (Hobby is limited to once/day, so the platform's 5-minute crons require Pro.) Source: vercel.com/docs/cron-jobs/usage-and-pricing.
- Crons are invoked over HTTP GET and should be secured with a `CRON_SECRET` bearer token. Delivery is best-effort (occasional missed or duplicate runs are possible) with no automatic retry - handlers must be idempotent.
- The platform runs two crons every 5 minutes: the loan-ticket queue drain and the 48-hour redemption auto-confirm (see [`vercel.json`](vercel.json)).

### 2.5 Edge security on Vercel (the WAF / DDoS layer)

There is no Cloudflare or external WAF; Vercel's platform provides this layer (source: vercel.com/docs/vercel-firewall, /security/ddos-mitigation, /attack-mode, /security/vercel-waf):

- DDoS mitigation: automatic L3/L4/L7 mitigation included free on all plans; traffic blocked by mitigation is not billed.
- Attack Challenge Mode: free on all plans; challenges browser visitors while allowing verified bots and the platform's own functions/cron.
- Vercel WAF (Pro): up to 40 custom rules, up to 100 project-level IP blocks, and rate limiting (Fixed Window algorithm, up to 40 rules, keyed by IP or JA4). WAF Managed Rulesets (e.g. OWASP CRS) are Enterprise-only and not available on Pro. WAF changes propagate globally within ~300 ms with instant rollback.
- Application-layer authenticity for inbound machine traffic (LINE webhooks, Shop System callbacks, eKYC callbacks) is enforced in code via HMAC signature verification, independent of the edge firewall.

### 2.6 Vercel compliance and SLA

- Certifications (platform-wide): SOC 2 Type 2; ISO/IEC 27001:2022; GDPR with DPA and EU SCCs/UK Addendum; EU-U.S. Data Privacy Framework; TISAX AL2; PCI DSS v4.0 (SAQ-D service provider and SAQ-A merchant AOCs, shared responsibility). HIPAA requires a signed BAA, available on Pro as a USD 350/month add-on. (Source: vercel.com/docs/security/compliance.)
- Encryption: AES-256 at rest; TLS 1.3 in transit.
- SLA: the 99.99% uptime SLA and service credits are Enterprise-only. Pro has no contractual uptime SLA. This is a key risk item (Section 15).
- SSO/SAML: a USD 300/month add-on on Pro; SCIM directory sync is Enterprise-only.

---

## 3. Networking, Ingress, TLS, and Load Balancing

- Single ingress: all inbound HTTPS terminates at Vercel's globally distributed anycast Edge Network (global IP addresses on AWS). There is no separate ingress controller, API gateway, or reverse proxy operated by the team.
- DNS and domains: DNS for `Astly.co` is managed by Vercel; the apex and subdomains resolve to the Edge Network.
- TLS: certificates are auto-provisioned and auto-renewed by Vercel (Let's Encrypt) with automatic HTTPS, HSTS, and HTTP/2 and HTTP/3 termination at the edge. No certificate operations are performed by the team.
- Load balancing: there is no manually configured or self-operated load balancer. Distribution of traffic across edge points of presence and function instances is fully automatic:
  - Edge routing is anycast: each client is served by the nearest point of presence.
  - Function fan-out is automatic horizontal autoscaling (up to 30,000 concurrent on Pro); Vercel allocates instances on demand and prefers idle instances before spinning up new ones (Fluid compute).
  - Failover: Vercel uses AWS Global Accelerator plus anycast to reroute traffic away from a failed region to the nearest healthy edge automatically; Fluid compute additionally provides cross-availability-zone failover within a region. (Source: vercel.com/docs/security/compliance.)
- Outbound egress: functions reach managed services (Supabase, MongoDB Atlas, S3, Upstash, and all third-party APIs) over the public internet using TLS. The platform does not currently use Vercel Secure Compute / Static IPs (an Enterprise capability, or a USD 100/month/project Pro add-on) - meaning outbound calls do not originate from a fixed, allow-listable IP range. If any downstream provider requires IP allow-listing, that add-on (or Enterprise) would be required (Section 15).

---

## 4. Scaling Model

- Stateless horizontal scale: the compute tier scales automatically and instantly with request volume; there is no capacity to pre-provision and no scaling configuration to manage. Cost scales with usage (invocations, Active CPU, memory-time, transfer).
- Connection-bound scaling is the real constraint: serverless functions can fan out far wider than a database accepts direct connections. This is mitigated by (a) Supabase's Supavisor connection pooler, and (b) MongoDB driver connection reuse via a cached client across warm invocations. The Supabase compute size dictates the connection ceiling (Section 5.3); this is the primary scaling bottleneck to monitor under load.
- Cache offload: the estimate pipeline caches whole responses and image content-hashes in Upstash Redis, reducing both latency and per-request AI/database cost at scale.
- AI provider rate limits: each LLM client rotates across up to four API keys and degrades gracefully on rate-limit/quota errors, decoupling burst capacity from a single key's limit.
- Known ceilings to watch: Supabase direct/pooled connection caps per compute size; AI provider per-minute token/request limits; SerpAPI and eKYC/slip provider quotas; Vercel function concurrency (30,000) and the 4.5 MB function payload limit.

---

## 5. Primary Database - Supabase PostgreSQL (Pro)

Supabase hosts the investor, finance, and logistics system of record (and the newer drop-point, redemption, contract-action, ticket-queue, and PIN-authentication data). All access is server-side through the service-role credential; the public anonymous key is unused, and Row-Level Security is enabled on every table as a backstop.

### 5.1 Pro plan inclusions and overage (source: supabase.com/pricing)

- Base: USD 25/month per organization. Included: 8 GB database disk; 100,000 monthly active users; 100 GB file storage; 250 GB egress + 250 GB cached egress; 2,000,000 Edge Function invocations; daily backups retained 7 days; USD 10/month compute credit (covers one Micro instance).
- Overage (verify live): disk USD 0.125/GB; egress USD 0.09/GB; cached egress USD 0.03/GB; storage USD 0.0213/GB; MAU USD 0.00325 each; Edge Function invocations USD 2 per 1M.
- Spend cap: a Pro control that, when enabled, blocks usage of capped items past quota (no overage billing) until the next cycle; when disabled, projects keep running and are billed per unit. Compute, PITR, read replicas, IPv4, and custom domains are never capped (always billed). The current enabled/disabled state is ACCOUNT-SPECIFIC - confirm.

### 5.2 Compute and disk

- Compute is an add-on tier separate from the base fee. Sizes range from Nano/Micro (shared, burstable, 1 GB RAM) up to 16XL (64-core, 256 GB). The default new Pro project runs on Micro (2-core ARM, 1 GB RAM), covered by the USD 10 credit. The platform's actual compute size is ACCOUNT-SPECIFIC - confirm, and is the main lever for both performance and connection capacity.
- Disk: gp3 default (125 MB/s, 3,000 IOPS), autoscaling, 8 GB included; disk can grow but cannot shrink, with at most four modifications per rolling 24 hours.

### 5.3 Connection management

- Supavisor (shared pooler) is available on all tiers and is the recommended path for serverless/edge clients (transaction mode, port 6543); direct connections use port 5432. A dedicated PgBouncer pooler is available on paid plans.
- Connection ceilings scale with compute size: Micro 60 direct / 200 pooled; Small 90 / 400; Medium 120 / 600; Large 160 / 800, and upward. Because direct, Supavisor, and PgBouncer connections are cumulative against the instance maximum, the compute size is the governing scale limit for a high-fan-out serverless front end.
- Note: transaction-mode pooling does not support prepared statements - the client must be configured accordingly.

### 5.4 Platform features in use

PostgreSQL (default version 17 on new projects; confirm per project) with Row-Level Security; the platform also has Supabase Auth, Storage, Realtime, and Deno Edge Functions available within Pro, though the application currently uses Supabase principally as a Postgres data store accessed via the service role.

### 5.5 Backups, PITR, and high availability (critical)

- Daily backups: Pro retains the last 7 days of daily backups at no extra charge.
- Point-in-Time Recovery: PITR is a paid add-on (not included in Pro), with a worst-case RPO of approximately 2 minutes, requiring at least a Small compute add-on; representative pricing is approximately USD 100/month for a 7-day window. Whether PITR is enabled is ACCOUNT-SPECIFIC - confirm. For a financial system of record, PITR (or the absence of it) is a primary durability question.
- Read replicas: a paid add-on (read-only, can be cross-region); not included in Pro.
- High availability / automatic failover: automatic failover (promotion of a standby/replica on primary failure) is an Enterprise-tier capability. The Pro plan does not include automatic multi-AZ failover. On Pro, a primary-instance or single-AZ failure is recovered via backup/PITR restore rather than automatic promotion - a material RTO consideration (Section 11, Section 15).
- Single region: each Supabase project is provisioned in one AWS region and cannot be moved after creation; cross-region presence requires read replicas. The project's region is ACCOUNT-SPECIFIC - confirm (Section 10).

### 5.6 Supabase compliance and SLA

- SOC 2 Type 2: Supabase is certified, but the SOC 2 report is accessible only to Team and Enterprise customers - a Pro customer cannot obtain the report for a data room without upgrading.
- HIPAA: requires a signed BAA and a paid add-on available on Team and Enterprise, not on Pro.
- GDPR: a DPA is available to all plans (supabase.com/legal/dpa).
- SLA: the uptime SLA (99.9% per product) and guaranteed support response times are Enterprise-only (support-response SLAs extend to Team). Pro has no uptime SLA and email-only support.

---

## 6. Operational Database - MongoDB Atlas

MongoDB Atlas hosts the customer-facing operational store (customers, items with the authoritative post-negotiation terms, contracts, the asynchronous notification envelope, negotiation requests). Connection uses an SRV string over TLS, with the client cached across warm function invocations.

- Cluster tier: dedicated clusters (M10 and above) provide isolated compute, replica-set high availability (default three data-bearing nodes), and Cloud Backup with PITR; shared/free tiers do not. The platform's actual tier is ACCOUNT-SPECIFIC - confirm M10+ to claim dedicated isolation and backups.
- Backups / PITR: Continuous Cloud Backup replays the oplog for point-in-time restore, with a configurable 1-7 day window (default and max 7 days) and restore granularity to 1 second; on AWS, backup objects are stored across at least three Availability Zones, with optional multi-region snapshot distribution.
- High availability: dedicated clusters are replica sets with automatic failover, optionally multi-region/multi-cloud. The exact topology (node count, region spread) is ACCOUNT-SPECIFIC - confirm.
- Encryption: AES-256 at rest (with optional customer-managed BYOK via cloud KMS) and TLS in transit; Queryable Encryption is available.
- Compliance: SOC 2 Type II, ISO 27001 (and 27017/27018/9001), PCI DSS, GDPR; HIPAA-capable with a BAA; Atlas for Government is FedRAMP Moderate.
- Region: AWS ap-southeast-1 (Singapore) is the expected SE-Asia region; the cluster's actual region pin is ACCOUNT-SPECIFIC - confirm (Section 10).

---

## 7. Object Storage - AWS S3

S3 stores item photos, verification photos, bank slips, contract HTML/PDF, loan-ticket assets, and QR codes. Objects are private and served via time-limited presigned URLs; uploads pass through a function (multipart, image/PDF allowlist, 10 MB cap) or direct server-side puts.

- Bucket and region: `piwp360` in ap-southeast-2 (Sydney).
- Durability and availability: S3 Standard is designed for 11 nines (99.999999999%) durability with redundancy across at least three Availability Zones; the contractual availability SLA is 99.9% monthly uptime (service credits from 10% up to 100% as uptime degrades). The design target (99.99%) differs from the SLA floor (99.9%); the 99.9% figure is the contractual guarantee.
- Encryption: all new objects are encrypted at rest by default with SSE-S3 (AES-256). SSE-KMS (customer-controlled, CloudTrail-audited keys) and SSE-C are available; in transit via HTTPS/TLS. Whether SSE-KMS is configured is ACCOUNT-SPECIFIC - confirm.
- Access control: governed by IAM and bucket policies with account-level Block Public Access; presigned URLs (SigV4, maximum 7-day validity, or shorter when signed with temporary credentials) are the access mechanism. The application controls the presigned-URL TTL in code; Versioning and Object Lock (WORM) availability for tamper/deletion protection should be confirmed.

---

## 8. Cache - Upstash Redis (via Vercel KV / Marketplace)

Upstash Redis backs the estimate-response cache and the per-image content-hash cache, consumed through Vercel-KV-style REST credentials. If the credentials are absent the cache is silently skipped and the pipeline runs uncached, so Redis is a performance and cost optimization rather than a system of record.

- Model: serverless Redis with per-request pricing; data is persisted and replicated to cloud block storage across multiple replicas (survives restarts and instance failures). A Global (multi-region, active-active CRDT) option exists; whether the database is Regional or Global is ACCOUNT-SPECIFIC - confirm.
- Security: TLS in transit on all plans; encryption at rest and IP allow-lists available. SOC 2 is an add-on ("Prod Pack"); HIPAA is Enterprise-tier. Whether these are enabled is ACCOUNT-SPECIFIC - confirm.
- Data sensitivity: the cache holds normalized request fields and image content hashes (not raw identity documents), so its compliance exposure is comparatively low, but it can contain product/condition data and should still be access-controlled.

---

## 9. Third-Party API and Identity Providers (and AI data-handling posture)

This section is emphasized for diligence because the platform transmits personal and financial media (item photos, bank-transfer slips, and national-ID eKYC) to external processors. Under Thailand's PDPA these are data-processor relationships requiring executed data-processing terms and a defensible no-training / minimal-retention posture.

| Provider | Data sent | Default training posture | Default retention | Controls to confirm |
|---|---|---|---|---|
| Anthropic Claude (text + vision: condition photos, bank slips) | Product text; item photos; bank-slip images | Not used for training without express permission; standard Messages API does not retain content by default | None by default on standard models; certain newer models require 30-day retention | Zero Data Retention (ZDR) arrangement and/or HIPAA BAA in force for the organization |
| Google Gemini (vision: condition scoring) | Item photos | Paid tier / Vertex AI: not used for training. Free tier: may be used to improve products | Paid tier: limited logging for policy/abuse only | That all usage is on the paid tier (or Vertex AI), never the free quota |
| OpenAI (optional alternate web-search provider) | Product text only (no images in current architecture) | Not used for training since March 2023 unless opted in | Up to 30 days by default; ZDR for eligible accounts | Whether ZDR is enabled if used |
| SerpAPI | Product-name search queries (no PII) | n/a | Provider-defined | Standard DPA |
| LINE (Messaging API + LIFF) | User identity (LINE userId), message content, Flex payloads | Platform processor | Provider-defined | LINE OA data terms; LIFF login scope |
| UPPASS (eKYC) | National ID, identity documents, liveness/biometric artifacts | Identity-verification processor (highly sensitive) | Provider-defined | Executed DPA, retention/deletion terms, breach notification |
| SlipOK | Bank-transfer slip images / references | Slip-verification processor | Provider-defined | Executed DPA, retention terms |

Architecture note relevant to diligence: after the platform's migration to Claude, the PII-bearing image traffic (item photos and bank slips) is sent to Anthropic and Google; OpenAI receives only product-name text in the optional web-search path; SerpAPI receives only search text. The most sensitive identity data (national ID) flows to UPPASS, and bank slips to SlipOK and/or Anthropic. Each provider's contractual posture (ZDR, BAA, paid-tier, DPA) is the controlling control and is account-specific (Section 15).

---

## 10. Regions and Data Residency

The stack currently spans more than one geography, which is relevant to both latency and data residency:

| Component | Region (expected) | Status |
|---|---|---|
| Vercel Functions | Single configured region (default iad1 unless changed; ideal for this user base is Singapore sin1) | ACCOUNT-SPECIFIC - confirm |
| Supabase (PostgreSQL) | One AWS region, fixed at creation | ACCOUNT-SPECIFIC - confirm |
| MongoDB Atlas | AWS ap-southeast-1 (Singapore) expected | ACCOUNT-SPECIFIC - confirm |
| AWS S3 | ap-southeast-2 (Sydney) | Confirmed in code |
| Upstash Redis | Provider region (Regional or Global) | ACCOUNT-SPECIFIC - confirm |

Observations:
- S3 in Sydney while the relational/document databases are expected in Singapore is a cross-region split; for hot paths that read or write media this adds round-trip latency and spreads data across jurisdictions.
- The Vercel function region should be co-located with the databases (Singapore) to minimize per-query latency; if it is still the default US region, that is a latency optimization opportunity.
- Thailand has no in-country region on these providers; SE-Asia residency typically means Singapore. PDPA does not mandate in-country storage but does require lawful cross-border transfer safeguards (DPAs/SCCs), which exist with these providers but must be executed.

Recommendation for diligence: produce a single confirmed region map (Vercel function region, Supabase region, Atlas region, S3 region, Upstash region) and align the compute region with the primary databases.

---

## 11. Backup, Disaster Recovery, RPO/RTO

| Store | Backup mechanism | Retention | PITR / RPO | Failover / RTO posture |
|---|---|---|---|---|
| Supabase (Postgres) | Daily automated backups (Pro) | 7 days | PITR ~2 min RPO only if the paid add-on is enabled (confirm) | No automatic HA failover on Pro; recovery via restore. RTO bounded by restore time. Read-replica add-on can improve resilience but is not automatic failover |
| MongoDB Atlas | Continuous Cloud Backup (oplog) on dedicated tiers | 1-7 days window | ~1-second restore granularity, sub-minute RPO (if dedicated + enabled) | Replica-set automatic failover within the cluster (if M10+); multi-region optional |
| AWS S3 | Built-in 3-AZ redundancy; optional Versioning/Object Lock | n/a (object durability 11 nines) | n/a | Region-level durability; cross-region replication optional |
| Upstash Redis | Replicated to block storage | n/a (cache) | Rebuildable from source on loss | Cache miss falls through to live computation; non-critical |
| Application code / config | Git history + Vercel immutable deployments | Indefinite | n/a | Instant Rollback (note: does not revert cron definitions) |

Diligence summary: MongoDB Atlas (if dedicated M10+) has the stronger built-in resilience (automatic replica-set failover, continuous backup). Supabase on Pro is the weaker link for the financial system of record because automatic failover is Enterprise-only and PITR is an add-on; its effective RPO/RTO depends on whether PITR and read replicas are enabled, and on the team's restore runbook. A documented, tested restore/failover runbook for both databases should be requested.

---

## 12. Security and Compliance

Application-level controls (detailed in [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) Section 10):
- All database access is server-side with privileged credentials; the Supabase anonymous key is unused; Row-Level Security is enabled on every table as a backstop (service role bypasses RLS, so the API layer is the true authorization boundary).
- Sensitive mutations are gated by a six-digit PIN: bcrypt-hashed (cost 10) in Supabase, with a short-lived (two-minute) opaque server-side session token; escalating lockout.
- Inbound machine-to-machine traffic is authenticated by HMAC signatures (LINE base64 HMAC; Shop System HMAC-hex over a notification id and timestamp with a five-minute replay window). Note: signature handling is currently inconsistent across actors (some endpoints log-and-continue or skip verification) - a hardening item flagged in the application architecture document.
- Secrets are Vercel environment variables, encrypted at rest, scoped per environment; only `NEXT_PUBLIC_*` reaches the browser; AI provider keys are rotated (four per provider).
- Object storage is private with time-limited presigned URLs.

Provider certification matrix (platform-level; report access and HIPAA can be tier-gated):

| Provider | SOC 2 Type II | ISO 27001 | PCI DSS | HIPAA (with BAA) | GDPR DPA | Uptime SLA |
|---|---|---|---|---|---|---|
| Vercel | Yes | Yes (2022) | v4.0 (SAQ-D/A) | Add-on (USD 350/mo on Pro) | Yes | Enterprise only |
| Supabase | Yes (report: Team/Enterprise only) | - | - | Team/Enterprise add-on | Yes | Enterprise only |
| MongoDB Atlas | Yes | Yes | Yes | Yes (BAA) | Yes | Per Atlas terms |
| AWS S3 | Yes (AWS) | Yes (AWS) | Yes (AWS) | Yes (AWS BAA) | Yes (AWS) | 99.9% |
| Upstash | Add-on (Prod Pack) | - | - | Enterprise | Yes | Per plan |

PDPA (Thailand) note: the platform processes personal data (identity, contact, eKYC, financial). A consent banner exists. Data minimization, retention schedules, cross-border transfer safeguards (DPAs/SCCs with each processor), and a records-of-processing inventory should be in place and producible. The most sensitive flows (national ID to UPPASS; bank slips and item photos to AI providers) warrant explicit executed processor terms.

---

## 13. Observability and Operations

- Runtime logs: emitted by functions and retained by Vercel for 1 day on Pro (up to 30 days with the Observability Plus add-on). Log Drains can stream to an external SIEM at USD 0.50/GB.
- Build logs: retained indefinitely per deployment.
- Firewall observability: per-project traffic view, firewall alerts, and drains are available.
- Database observability: Supabase and MongoDB Atlas each provide their own metrics, logs, and alerting dashboards.
- Recommended additions for production maturity: centralized structured logging and error tracking, an LLM-call audit trail (model, tokens, latency, fallback path, provider), uptime/synthetic checks on the estimate path and both cron endpoints, and alerting on Supabase connection saturation and AI provider error rates.

---

## 14. Cost Model

Astly's cost is predominantly usage-based with low fixed minimums - efficient at low scale, with clear linear drivers as volume grows.

Fixed monthly minimums (representative; verify live):
- Vercel Pro: USD 20/member/month (includes USD 20 usage credit).
- Supabase Pro: USD 25/month base (includes USD 10 compute credit = one Micro instance); add-ons (larger compute, PITR ~USD 100/mo, read replicas, IPv4) are extra and account-specific.
- Upstash Redis: pay-as-you-go (per request) or a fixed plan.
- MongoDB Atlas: dedicated cluster hourly cost by tier (e.g. an M10 is a low-tens-of-USD/month order of magnitude; confirm tier).
- AWS S3: storage + request + egress, typically low at current media volumes.

Primary variable drivers as the business scales:
- AI inference (Anthropic, Gemini, OpenAI) per estimate and per condition analysis - the largest variable cost, mitigated by the Redis cache and by model tiering (Sonnet for text, Haiku for high-volume vision).
- SerpAPI, eKYC (UPPASS), and slip-verification (SlipOK) per-call fees.
- Vercel Active CPU + Provisioned Memory + invocations + transfer (offset by the USD 20 credit, then on-demand).
- Supabase compute upgrades (driven by connection demand) and egress; MongoDB Atlas tier upgrades.

A bottoms-up monthly run-rate model keyed to estimates/day, condition analyses/day, contracts/day, and media volume should be prepared for diligence; the architecture makes per-transaction unit economics straightforward to compute.

---

## 15. Risk Register and Due-Diligence Verification Checklist

### 15.1 Material risks (honest assessment)

| # | Risk | Severity | Detail | Mitigation / path |
|---|---|---|---|---|
| R1 | No contractual uptime SLA on either core platform | High | Vercel and Supabase SLAs are Enterprise-only; the production financial platform runs on Pro on both | Upgrade path to Supabase Team/Enterprise and Vercel Enterprise for SLAs; or accept and document the risk |
| R2 | Supabase has no automatic HA failover on Pro | High | A primary/single-AZ failure is recovered by restore, not automatic promotion; RTO depends on runbook | Enable PITR + read-replica add-ons; plan Enterprise upgrade for automatic failover; document and test restore runbook |
| R3 | PITR may not be enabled on Supabase | High | Without the PITR add-on, RPO is up to 24 h (last daily backup) for the finance store | Confirm and enable PITR on the production project |
| R4 | AI provider no-training / retention posture unconfirmed | High | Item photos and bank slips are sent to Anthropic/Google; defaults vary; Gemini free tier can train | Confirm ZDR (Anthropic/OpenAI), paid-tier/Vertex (Gemini), and executed DPAs; never use Gemini free tier |
| R5 | eKYC and slip data processor terms | High | National ID (UPPASS) and bank slips (SlipOK) are highly sensitive PII | Execute DPAs with explicit retention/deletion and breach terms |
| R6 | Webhook signature verification inconsistent | Medium | Some inbound webhooks log-and-continue or skip signature checks | Enforce strict verification (reject on mismatch) on all actor webhooks |
| R7 | Cross-region data split | Medium | S3 (Sydney) vs databases (Singapore) vs function region | Confirm region map; co-locate compute with databases; consolidate region where feasible |
| R8 | Single-region databases | Medium | Supabase is single-region by design; Atlas topology unconfirmed | Read replicas (Supabase) / multi-region (Atlas) if RTO requires |
| R9 | No outbound static IP | Low/Medium | Functions egress from rotating IPs; cannot be allow-listed by downstream providers | Vercel Secure Compute / Static IP add-on or Enterprise if any provider requires it |
| R10 | SOC 2 report not obtainable on Supabase Pro | Low | The report is Team/Enterprise gated | Upgrade tier if the data room requires the Supabase SOC 2 report |
| R11 | Instant Rollback does not revert crons | Low | Operational footgun during incident rollback | Document in the incident runbook |
| R12 | No automated test suite | Medium | Regression risk on a financial codebase | Introduce CI tests around pricing, calculations, and state machines |

### 15.2 Verification checklist (data-room items to request / confirm)

- Vercel: team plan confirmation; configured function region; whether SAML SSO, Static IP, or HIPAA BAA add-ons are active; current monthly usage and spend-management threshold.
- Supabase: project region; compute size; spend-cap state; whether PITR and read replicas are enabled; Postgres major version (`SELECT version();`); SOC 2 report access (tier).
- MongoDB Atlas: cluster tier (confirm M10+); region pin; replica-set topology and any multi-region config; PITR window value; BYOK/KMS configuration; Backup Compliance Policy.
- AWS S3: Block Public Access state; Versioning/Object Lock; SSE-S3 vs SSE-KMS; the presigned-URL TTL set in code; IAM policy least-privilege review.
- Upstash: plan, region, Regional vs Global; SOC 2 (Prod Pack) / HIPAA add-on state; TLS and IP allow-list.
- AI/identity providers: executed DPAs; Anthropic ZDR and/or BAA; OpenAI ZDR; Gemini paid-tier/Vertex confirmation; UPPASS and SlipOK retention/deletion and breach-notification terms.
- DR: documented and tested restore/failover runbooks for Supabase and MongoDB Atlas, with measured RTO.
- Compliance: PDPA records of processing, consent records, cross-border transfer safeguards, and the SOC 2 reports of Vercel and MongoDB Atlas (and Supabase if upgraded) for the data room.

---

## 16. Appendix - Service, SLA, and Compliance Matrix

| Service | Plan | Hosting cloud | Automatic scaling | Automatic failover / HA | Backups | Uptime SLA (this tier) | Encryption at rest / transit |
|---|---|---|---|---|---|---|---|
| Vercel Functions / Edge | Pro | AWS (~20 regions) | Yes (to 30,000 concurrent) | Cross-AZ + cross-region routing (automatic) | Platform DR only (not customer data) | None (Enterprise only) | AES-256 / TLS 1.3 |
| Supabase Postgres | Pro | AWS (single region) | Compute-bound (manual size) | No automatic failover on Pro | Daily (7d); PITR add-on | None (Enterprise only) | AES-256 / TLS |
| MongoDB Atlas | Dedicated M10+ (confirm) | AWS | Manual tier; replica set | Yes (replica-set failover) | Continuous Cloud Backup (1-7d, PITR) | Per Atlas terms | AES-256 (+BYOK) / TLS |
| AWS S3 | Standard | AWS ap-southeast-2 | Fully managed | 3-AZ redundancy | 11-nines durability; Versioning optional | 99.9% | SSE-S3/KMS / TLS |
| Upstash Redis | PAYG/Fixed (confirm) | AWS | Serverless | Multi-replica; Global optional | Replicated block storage | Per plan | At rest available / TLS |

Sources (primary): vercel.com/docs/plans/pro, /docs/limits, /docs/functions/limitations, /docs/fluid-compute, /docs/cron-jobs, /docs/vercel-firewall, /docs/security/compliance, /legal/sla; supabase.com/pricing, /docs/guides/platform/compute-and-disk, /backups, /read-replicas, /regions, /docs/guides/security, /sla; mongodb.com/cloud/atlas/security and Atlas backup/compliance docs; aws.amazon.com/s3 (faqs, sla, storage-classes); upstash.com pricing/docs; and the published API data-retention pages of Anthropic, OpenAI, and Google. All figures are as of mid-2026 and must be re-verified against the live pages at diligence time.
