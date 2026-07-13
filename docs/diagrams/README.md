# Astly - Architecture Diagrams

Formal, white-background SVG diagrams for the Astly platform (P2P collateral-backed lending, hosted on Vercel). All files are standalone vector SVGs with no external dependencies and no emoji, suitable for embedding in documentation, slide decks, or a technical due-diligence pack.

For the full written architecture, see [`../../SYSTEM_ARCHITECTURE.md`](../../SYSTEM_ARCHITECTURE.md). The reusable prompt that generates the system diagram is in [`../../ARCHITECTURE_DIAGRAM_PROMPT.md`](../../ARCHITECTURE_DIAGRAM_PROMPT.md).

## Files

| File | Type | Description |
|---|---|---|
| `00-system-architecture.svg` | System (C4 container) | Full platform: client LIFF apps, Vercel edge and functions, data plane, external integrations, asynchronous lifecycle engine, trust boundaries, and the planned self-hosted condition-assessment model. |
| `01-sequence-estimate-pricing.svg` | Sequence | `POST /api/estimate`: cache check, Claude input normalization, parallel Claude web-search pricing and SerpAPI (with Claude filter), representative-price estimation, 60% LTV and condition blend, and response. |
| `02-sequence-redemption.svg` | Sequence | Redemption and settlement (Supabase `redemption_requests`): create with penalty check, pay and verify slip, drop-point physical return with investor settlement, and borrower confirmation or 48-hour auto-confirm cron. |
| `03-sequence-condition-scoring.svg` | Sequence | `POST /api/analyze-condition`: Claude Haiku vision precheck, Gemini rubric scoring with guards, downstream blend into the estimate, and the future self-hosted-model integration point. |

## Conventions

- Solid arrows: synchronous calls / requests.
- Dashed grey arrows: asynchronous, webhook, event, or return messages.
- Dashed indigo arrows: planned ML data and inference flows.
- Shapes: rectangle = service / Vercel Function; rounded rectangle = managed / edge service; cylinder = datastore; hexagon = external third party; dashed box = future / planned component.
- Color ramps: blue = Vercel platform; teal = data stores; grey = external systems; indigo (dashed) = planned ML plane.
- Trust boundaries are drawn as dashed zones.

## Rendering and export

The SVGs render directly in any browser or Markdown viewer that supports SVG. To produce raster or vector exports:

```bash
# PNG (requires rsvg-convert from librsvg, or Inkscape)
rsvg-convert -w 2400 00-system-architecture.svg -o 00-system-architecture.png

# PDF
rsvg-convert -f pdf 00-system-architecture.svg -o 00-system-architecture.pdf
```

Diagrams are accurate as of the current `main` branch. When the corresponding flows change in code, update both the SVG and `SYSTEM_ARCHITECTURE.md`.
