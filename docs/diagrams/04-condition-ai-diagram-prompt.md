# Astly — Condition Intelligence : Investor-Grade Architecture Diagram Prompt

Paste the prompt below into a **diagram-generation AI** (Miro AI, Eraser AI, Napkin AI, Whimsical AI,
or Mermaid/Excalidraw assistants). These render labelled boxes and text accurately.
Avoid generic image models (Midjourney / DALL·E) — they garble diagram text.

> **Why this framing:** the engineering SVG (`04-condition-model-architecture.svg`) is for *technical*
> due diligence. This prompt produces an *investor*-facing picture: the AI as a **defensible business
> asset and data moat**, not a from-scratch research project. Keep both; show each to the right audience.

---

## PRIMARY PROMPT (copy from here)

```
Create a clean, professional, INVESTOR-GRADE system architecture diagram.
Audience: investors and board members — NOT machine-learning engineers. Communicate business value,
defensibility and traction, not training internals.

STYLE
- White background. Formal corporate fintech look. No emoji. No hand-drawn / sketchy style.
- Restrained palette: deep navy #1f4e79 (core engine), teal #0f766e (data), indigo #5b21b6 (product),
  muted amber #d97706 (trust / risk controls), light-gray #cbd5e1 frames, #0f172a text.
- Rounded rectangles, clear hierarchy, generous spacing, thin straight connector arrows.
- Left-to-right value flow across five grouped zones, with one curved feedback arrow forming a loop.

TITLE BLOCK (top)
- Title: "Astly — Proprietary Condition Intelligence"
- Subtitle: "AI that values second-hand electronics in seconds — the engine behind instant, accurate,
  and defensible lending decisions."

ZONE 1 — "Proprietary Data Moat"  (teal)
- "Every loan and every physical drop-point inspection creates verified, labelled ground-truth data"
- "Multi-angle photos · expert condition grades · real resale outcomes"
- Zone caption: "A compounding data asset competitors cannot simply buy."

ZONE 2 — "Condition Intelligence Engine"  (deep navy; CENTREPIECE — largest box)
- "Self-hosted foundation vision model on a commercial-licensed stack"
- "Condition score — overall + per-component (screen · body · buttons · camera)"
- "Defect detection & localisation — scratches · dents · cracks · wear"
- "Explainable results, not a black box"

ZONE 3 — "Trust & Risk Controls"  (amber)
- "Calibrated confidence score on every assessment"
- "Human-expert review for high-value or uncertain items"
- "Protects lending capital and keeps pricing accurate"

ZONE 4 — "Product Integration"  (indigo)
- "Plugs into Astly's instant-valuation pipeline through one stable interface"
- "Live today on commercial AI (Claude, Gemini); the proprietary engine swaps in behind the same interface"
- "De-risked rollout: shadow -> canary -> primary, with automatic fallback"
- "Borrower sees an instant, trustworthy in-app valuation"

ZONE 5 — "Compounding Advantage"  (teal)
- "More volume -> more data -> higher accuracy -> better margins & lower losses"
- "The moat widens with every transaction"

CONNECTORS
- Straight arrows: Data Moat -> Intelligence Engine -> Trust & Risk Controls -> Product Integration -> Compounding Advantage.
- One prominent CURVED DASHED arrow from "Compounding Advantage" back to "Proprietary Data Moat" — label it "Data Flywheel".

FOOTNOTE (small, bottom)
- "Technology foundation: GPU-served self-hosted vision models on a commercial-safe open-source stack,
  continuously improved on Astly's proprietary data. Built to be owned, not rented."

TONE: concise and outcome-oriented. Emphasise defensibility, accuracy, speed, and capital protection
over technical internals. Every label should read as a business benefit.
```

## (end of prompt)

---

### Optional subtitle / tagline swaps
- "The valuation brain of Astly — instant, accurate, and ours."
- "Turning every transaction into a smarter, more defensible lending engine."

### Notes for the deck
- **Two audiences, two assets:** use this generated image in the pitch deck; keep
  `04-condition-model-architecture.svg` in the technical data room for engineering DD.
- **Honest traction line:** the "Live today on commercial AI … proprietary engine swaps in" wording
  shows the product already ships and is *upgrading*, not waiting to be built — the same message as the
  "current design phase" note in the condition-scoring sequence diagram.
- Branding stays **Astly** throughout; describe the lending product functionally (secured lending under
  separate Thai law) and never use the word it replaces.
