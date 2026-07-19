# Prompt: Generate the Official Astly System Architecture Diagram

Use the prompt below verbatim with a diagramming or image-generation model (for example a vector/diagram tool, or a Mermaid/PlantUML/draw.io renderer). It is a complete specification of nodes, groupings, connections, layout, and visual style. Do not add components that are not listed. Do not omit listed components.

---

## PROMPT

Create a single, formal, production-grade System Architecture Diagram for a serverless peer-to-peer (P2P) collateral-backed lending platform named "Astly", hosted entirely on Vercel. The diagram must be suitable for an engineering architecture review and an investor technical due-diligence pack.

### Output and rendering requirements

- Output one comprehensive diagram (landscape orientation, high resolution, vector-clean lines).
- The diagram is a layered, zoned container diagram (C4 "container" level of abstraction): show systems, services, datastores, and external integrations as boxes grouped into labeled zones, connected by directed, labeled arrows.
- Render text crisply; every box and arrow must be legible.

### Strict visual style

- Background: solid white. No gradients, no photographic backgrounds, no decorative imagery.
- Absolutely no emoji and no clip-art icons-as-jokes. If icons are used, use simple, uniform, monochrome line glyphs only.
- Formal, corporate, minimalist aesthetic. Professional restrained palette: white background; dark slate/navy text; thin grey gridlines; muted blue (#1f4e79 range) for platform components; muted teal/green for data stores; muted grey for external systems; a single accent color for the future-phase zone (dashed). Use color sparingly and only to distinguish zones, not to decorate.
- Typography: a single clean sans-serif (Inter, Helvetica, or Arial). Zone titles bold; component names regular; edge labels small.
- Connectors: orthogonal (right-angle) routed lines, no crossings where avoidable, with clear arrowheads indicating direction. Label each connector with its protocol or purpose. Use solid lines for synchronous calls and dashed lines for asynchronous/webhook/event flows.
- Trust boundaries and the future phase are drawn as labeled dashed-border zones.
- Include a title block (top-left or top-center): "Astly - System Architecture", a version/date field, and an environment label "Production (Vercel)".
- Include a legend (bottom): line styles (synchronous vs asynchronous), zone color meaning, and node-shape meaning (rectangle = service/app, cylinder = datastore, rounded rectangle = managed/edge service, hexagon = external third party, dashed box = future/planned).

### Layout

Arrange top to bottom as horizontal bands (zones). Primary user-to-data flow runs downward. External integrations sit on the right; the planned AI plane sits at the bottom as a dashed zone.

### Zone 1 - Client / Channel (top band, labeled "Client Zone - Untrusted")

Nodes (rounded rectangles):

- "Borrower LIFF Mini-App (LINE channel 2008216710)"
- "Store LIFF Mini-App (LINE channel 2008216710)"
- "Investor LIFF Mini-App (LINE channel 2008641671)"
- "Drop-Point LIFF Mini-App (LINE channel 2008651088)"
- "Admin Console (push notifications only)"

Group all five inside a dashed boundary labeled "LINE LIFF Clients (browser, authenticated via LINE Login)".

### Zone 2 - Vercel Edge (band below client, labeled "Vercel Edge Network - Single Ingress")

Nodes (rounded rectangles, muted blue):

- "Global Anycast Edge / CDN (static assets, immutable cache)"
- "Automatic TLS (Let's Encrypt, HTTP/2 and HTTP/3)"
- "Vercel Firewall / WAF + DDoS Mitigation"
- "DNS and Domain: Astly.co"

Annotate this zone with a note: "Replaces external CDN/WAF/DNS; no Cloudflare in path."

Connect all Zone 1 clients into Zone 2 with solid arrows labeled "HTTPS".

### Zone 3 - Vercel Application Platform (central band, labeled "Vercel Functions - Trusted Compute (Node.js runtime, region sin1)")

Sub-group A "Next.js Application (App Router)":

- "Frontend: 76 Pages / 39 LIFF Layouts (React 19)"
- "API Layer: 115 Route Handlers"

Sub-group B "Inbound Webhook Handlers":

- "/api/webhook (customer)"
- "/api/line/webhook (alt customer)"
- "/api/webhook-store (store)"
- "/api/webhook-droppoint (drop point)"
- "/api/webhooks/shop-notification (Shop System callbacks)"
- "/api/webhooks/line-invest (investor)"
- "/api/ekyc/webhook and /api/webhooks/uppass-invest (eKYC)"

Sub-group C "Scheduled Functions (Vercel Cron, every 5 min)":

- "/api/contracts/process-ticket-queue"
- "/api/redemptions/auto-confirm-received"

Sub-group D "Domain Services (lib/)":

- "Pricing Engine (price-representative)"
- "PIN Auth and Session (lib/security)"
- "LINE Clients and Flex Templates (lib/line)"
- "Investor Tier and Penalty Engines"
- "Slip Verification Service"
- "Anthropic LLM Client (provider abstraction)"

Connect Zone 2 to Zone 3 with a solid arrow labeled "route dynamic requests".

### Zone 4 - Data Plane (band below platform, labeled "Data Plane - Privileged Server-Side Access Only")

Nodes (cylinders, muted teal):

- "MongoDB Atlas - Customer OLTP (customers, items, contracts, notifications, negotiation-requests)"
- "Supabase PostgreSQL - Investor/Finance/Logistics (RLS enabled; service-role only)"
- "Upstash Redis / Vercel KV - Estimate and Image-Hash Cache"
- "Vercel Blob (private store) - Images, Contracts, Tickets, QR (signed URLs)"

Connect Zone 3 (API + Domain Services) to each datastore with solid arrows. Labels: "MongoDB wire (TLS)" to Atlas, "supabase-js / service role" to Supabase, "REST" to Redis, and "@vercel/blob / signed URL" to Blob. Add a small note on Supabase: "Dual system of record with MongoDB; consistency at write time, no replication."

### Zone 5 - External Integrations (right side, vertical band, labeled "External Third-Party Systems")

Nodes (hexagons, muted grey):

- "LINE Messaging API (4 Official Accounts)"
- "Anthropic Claude API (Sonnet 4.6 text; Haiku 4.5 vision)"
- "Google Gemini API (condition scoring)"
- "OpenAI API (optional alternate web-search provider)"
- "SerpAPI (Google Shopping price candidates)"
- "UPPASS (eKYC)"
- "SlipOK (bank-slip verification)"
- "Shop System (separate, independently deployed Vercel application)"

Connections:

- Solid arrows from "Anthropic LLM Client" and the API layer to Claude, Gemini, OpenAI, SerpAPI, SlipOK, UPPASS, labeled with the call purpose (for example "x-api-key, structured/vision", "condition scoring", "shopping search", "slip OCR", "eKYC initiate").
- Dashed arrows from LINE Messaging API, Shop System, and UPPASS back into the Zone 3 webhook handlers, labeled "signed webhook (HMAC)" for LINE/Shop and "eKYC result callback" for UPPASS.
- Dashed arrow from "Shop System" to "/api/webhooks/shop-notification" labeled "HMAC over notificationId-timestamp, 5-min replay window".
- Solid arrow from Zone 3 to "Shop System" labeled "signed negotiation/payment request".

### Zone 6 - Asynchronous Workflow (overlay note near Zone 3/4)

Add a callout box (no fill, thin border) labeled "Asynchronous Lifecycle Engine" pointing at the MongoDB notification collection and the Supabase contract-action tables, with text: "Redemption / Extension / Principal-Change mediated by durable envelopes; advanced by webhooks and cron; 7-state machine (pending to completed/failed)."

### Zone 7 - Future Phase (bottom band, dashed accent border, labeled "PLANNED - Self-Hosted Open-Source Condition-Assessment Model")

Nodes (dashed rounded rectangles, accent color):

- "Data Flywheel: Blob item photos + drop-point ground-truth verifications + outcome labels"
- "Versioned Dataset + PDPA Redaction (DVC/LakeFS)"
- "GPU Training Plane (Modal/RunPod/SageMaker; W&B/MLflow tracking)"
- "Model: Vision Encoder + Multi-Task Heads (condition score, rubric sub-scores, defect detection, item-type) [open source]"
- "Optional: Fine-tuned Open VLM (explanatory JSON)"
- "Model Registry + Model Cards"
- "GPU Inference Endpoint (Triton/vLLM/BentoML; private HTTPS)"

Connections:

- Dashed arrow from "Vercel Blob" and "Supabase (drop_point_verifications)" down into "Data Flywheel" labeled "training data + ground truth".
- Dashed arrows through the pipeline: Data Flywheel to Dataset to GPU Training to Model to Model Registry to GPU Inference Endpoint.
- A dashed arrow from "GPU Inference Endpoint" up to "/api/analyze-condition" in Zone 3 labeled "new vision provider behind existing abstraction (shadow to canary to primary, with LLM fallback)".

Add a note in Zone 7: "Runs on a dedicated GPU plane off Vercel; Vercel remains the product/orchestration front end; connected only by a private HTTPS contract."

### Trust boundaries (dashed enclosing rectangles spanning the relevant zones)

- "Untrusted" around Zone 1.
- "Vercel Trusted Compute (secrets reside here)" around Zone 2 and Zone 3.
- "Privileged Data Access" around Zone 4.
- "Third-Party (authenticated by signature/secret)" around Zone 5.
- "Planned ML Plane" around Zone 7.

### Final instruction

Produce the diagram as one cohesive, balanced, professionally laid-out figure with the legend and title block included. Keep it clean, formal, and white-background; no emoji; no decorative elements; readable labels on every node and every connector.
