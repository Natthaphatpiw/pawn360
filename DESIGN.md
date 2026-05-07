# Pawn360 UI Master Template

This document is the design **Source of Truth** for this project.  
All UI work (human or AI) should follow these rules without re-scanning CSS files.

## 1) Platform Themes

- **Web theme:** `.theme-web` (default, applied in `app/layout.tsx`)
- **LIFF theme:** `.theme-liff` (applied in `app/register-invest/layout.tsx`)
- **Color mode policy:** Light mode only. Do not implement dark-mode variants.
- **Background safety policy:** `html` and `body` must remain white-backed to avoid black-screen flashes.

## 2) Design Tokens (Extracted from `app/globals.css`)

### 2.1 Primitive Colors (`:root`)

#### Neutral
- `--white: #ffffff`
- `--black: #202020`
- `--neutral-900: #1a1a1a`
- `--neutral-850: #1b1b1b`
- `--neutral-800: #2d2d2d`
- `--neutral-700: #3b3b3b`
- `--neutral-600: #575757`
- `--neutral-500: #757575`
- `--neutral-400: #939393`
- `--neutral-300: #c9c9c9`
- `--neutral-200: #ebebeb`
- `--neutral-100: #f5f5f5`
- `--neutral-50: #f9f9f9`

#### Brand / Accent
- `--orange-700: #db4710`
- `--orange-600: #ff5d1f`
- `--orange-500: #ff7845`
- `--orange-400: #ff9a6f`
- `--orange-200: #ffc5b0`
- `--orange-100: #fff0e9`

- `--blue-700: #1d4db8`
- `--blue-600: #265ed7`
- `--blue-500: #3d71e6`
- `--blue-400: #5e8dff`
- `--blue-200: #8aaad4`
- `--blue-100: #eef3ff`

- `--green-700: #4bb000`
- `--green-600: #5fdb0c`
- `--green-500: #77ea2e`
- `--green-400: #98ef61`
- `--green-200: #9ce86b`
- `--green-100: #effbdf`

#### Feedback
- `--success-700: #00a341`
- `--success-600: #00c950`
- `--success-500: #00e059`
- `--success-200: #a3e9be`
- `--success-100: #e6f9ed`

- `--warning-700: #cc9600`
- `--warning-600: #f0b100`
- `--warning-500: #ffc21a`
- `--warning-200: #ffd094`
- `--warning-100: #fff9e6`

- `--error-700: #d42028`
- `--error-600: #fb2c36`
- `--error-500: #ff4d56`
- `--error-200: #f8a4a9`
- `--error-100: #fff0f1`

#### Utility
- `--dot-fallback: #06367b`

### 2.2 Semantic Colors (`.theme-web`, `.theme-liff`)

#### Surface / Text
- `--background`, `--background-dark`, `--background-darker`
- `--background-white`, `--background-subtle`
- `--foreground`, `--foreground-muted`, `--foreground-subtle`
- `--surface`, `--surface-raised`
- `--line`, `--line-soft`, `--line-strong`

#### Primary / Role Colors
- `--primary`, `--primary-hover`, `--primary-active`, `--primary-soft`, `--primary-border`, `--primary-fg`
- `--s1`, `--s1-hover`, `--s1-active`, `--s1-soft`, `--s1-fg`
- `--s2`, `--s2-hover`, `--s2-active`, `--s2-soft`, `--s2-border`, `--s2-fg`
- `--s3`, `--s3-hover`, `--s3-active`, `--s3-soft`, `--s3-border`, `--s3-fg`

#### Feedback Semantic
- `--success`, `--success-hover`, `--success-active`, `--success-soft`, `--success-border`, `--success-fg`
- `--warning`, `--warning-hover`, `--warning-active`, `--warning-soft`, `--warning-border`, `--warning-fg`
- `--error`, `--error-hover`, `--error-active`, `--error-soft`, `--error-border`, `--error-fg`

#### Greys and Gradients
- `--grey-1` to `--grey-6`
- `--grad-primary-start`, `--grad-primary-end`
- `--grad-investor-start`, `--grad-investor-end`
- `--grad-drop-start`, `--grad-drop-end`

### 2.3 Typography Tokens

- `--font-sans: 'Noto Sans Thai', sans-serif`
- `--font-mono: 'Noto Sans Thai', monospace`
- `--font-bellota-text: 'Bellota Text'`
- `--font-noto-sans-thai: 'Noto Sans Thai'`
- `--font-english: var(--font-bellota-text), var(--font-noto-sans-thai), sans-serif`

Typography usage:
- Thai-first UI body copy uses `Noto Sans Thai`.
- English headline/accent copy may use `.font-english`.

### 2.4 Radius + Safe Area Tokens

Shared:
- `--radius-xs: 6px`
- `--radius-sm: 8px`
- `--radius-md: 12px`
- `--radius-lg: 16px`
- `--radius-xl: 24px`
- `--radius-round: 9999px`
- `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left`

LIFF overrides (`.theme-liff`):
- `--radius-xs: 8px`
- `--radius-sm: 10px`
- `--radius-md: 14px`
- `--radius-lg: 18px`
- `--radius-xl: 28px`
- `--radius-round: 9999px`
- `--safe-bottom: env(safe-area-inset-bottom, 0px)`

### 2.5 Spacing Tokens

Current state in CSS:
- There are **no dedicated spacing custom properties** yet (no `--space-*` tokens in `globals.css`).

Interim spacing rule:
- Use Tailwind spacing scale consistently (4px baseline).
- Prefer `8 / 12 / 16 / 24 / 32` rhythm for paddings, gaps, and vertical sections.

Future extension (recommended):
- Introduce `--space-1` ... `--space-8` tokens when spacing needs centralization similar to colors/radius.

## 3) Platform UI Rules

## Web (`.theme-web`)

Reference: `app/page.tsx`

- Use card-based composition: raised sections, contained content blocks, and clear whitespace separation.
- Preserve desktop interaction patterns: hover, focus-visible rings, transitions, and pointer affordances.
- Keep content width constrained for readability (centered containers).
- Use semantic tokens (`--primary`, `--surface`, `--line-soft`) instead of raw color values.

## LIFF (`.theme-liff`)

Reference: `app/register-invest/`

- Prioritize thumb-friendly mobile ergonomics.
- Touch targets: interactive controls should be at least **48px** high.
- Corner rounding: use **16px+** defaults (`--radius-lg` or above).
- Respect safe areas for sticky/footer actions: pad with `var(--safe-bottom)`.
- Reduce hover-only dependence; prioritize active/focus/pressed states.

## 4) Core Components

## Buttons

### Primary (Action)
- Purpose: main submit/continue CTA.
- Background: `var(--primary)`.
- Text: `var(--primary-fg)`.
- Hover: `var(--primary-hover)`.
- Active/pressed: `var(--primary-active)`.
- Radius: Web `--radius-md`/`--radius-lg`; LIFF `--radius-lg`+.
- Height: LIFF minimum 48px.

### Secondary (Cancel / Alternate)
- Purpose: secondary action, cancel, back, less-emphasis CTA.
- Recommended style: subtle surface (`var(--surface)` or `var(--s1-soft)`), border `var(--line-soft)` or `var(--primary-border)`.
- Text: `var(--foreground)` or `var(--s1)`.
- Interaction: gentle hover/active shift, never visually stronger than Primary.

### Disabled
- Purpose: unavailable action while preserving layout.
- Background: `var(--grey-5)` or muted surface token.
- Text: `var(--grey-3)` / reduced contrast.
- Behavior: no hover affordance, no pointer emphasis, clear disabled cursor when applicable.

## Forms

### Input Field Base
- Background: `var(--surface)`.
- Text: `var(--foreground)`.
- Border: `var(--line-soft)`.
- Radius: `--radius-md` (Web) / `--radius-lg` (LIFF preferred).
- Height: LIFF minimum 48px for key input controls.

### Focus State
- Border upgrades to `var(--primary)` (or role-specific accent if needed).
- Provide visible ring/glow with high contrast against white backgrounds.
- Focus indicator must be keyboard-visible and not rely on color only.

### Error State
- Border and helper text use `var(--error)`.
- Optional background hint: `var(--error-soft)`.
- Keep message concise and near the field.
- Do not replace label with error; show both label and error text.

## 5) Implementation Rules for AI Agents

- Always consume semantic tokens first; do not hardcode hex in components.
- Do not introduce dark mode media queries or dark variant APIs.
- New screens must declare the correct theme scope (`.theme-web` or `.theme-liff` inheritance).
- For LIFF screens, verify:
  - 48px minimum touch height
  - 16px+ corner radius
  - safe-area bottom handling for sticky actions
- If a new token is required, add it to `app/globals.css` and update this file in the same change.

## 6) Quick Mapping Cheat Sheet

- Main CTA: `--primary` + `--primary-fg`
- Body background: `--background`
- Elevated card: `--surface` + `--shadow-soft`
- Divider: `--line-soft`
- Success feedback: `--success` / `--success-soft`
- Warning feedback: `--warning` / `--warning-soft`
- Error feedback: `--error` / `--error-soft`

# Pawnly Platform Design Document

## 1. Brand Concept: "Energized Professionalism"
- **Energize:** High-contrast color palette using vibrant oranges and deep blues.
- **Trust:** Solid layouts, consistent iconography, and clean typography.
- **Speed & Convenient:** Fast transitions, mobile-first design, and AI-driven workflows.
- **Friendly:** Rounded components (Capsule style) for a modern, approachable feel.

## 2. Color System & Domain Roles
We use domain-specific coloring to instantly signal the user's current context:

| Domain | Category | Hex Code | Usage |
| :--- | :--- | :--- | :--- |
| **Pawner** | Primary | `#FF5D1F` | Main website, Borrowing flows, AI Appraisal |
| **Investor** | Secondary 2 (S2) | `#265ed7` | Investor dashboard, Funding pages |
| **Drop-point** | Secondary 3 (S3) | `#5FDB0C` | Partner portal, Location tracking |
| **Neutral** | Secondary 1 (S1) | `#3b3b3b` | Text, Primary navigation, UI Grayscale |

### Interaction States
- **Hover:** Subtle brightness shift (+10%) without scaling for a "snappy" feel.
- **Active (Click):** Darker shade shift to provide tactile feedback.
- **Light Versions:** Used for backgrounds, alerts, and subtle section separators.

## 3. Typography
- **Thai Font:** `Noto Sans Thai` (Friendly & High readability)
- **English Font:** `Google Sans Flex` (Professional, Dynamic, and Modern)
- **Concept:** Mix of Extralight for hero statements and Bold for actionable data.

## 4. UI Components Rules
- **Buttons:** - `rounded-full` (Capsule) for all Action CTAs and Links.
  - `rounded-[8px]` for Navbar active state only (to distinguish navigation from actions).
- **Shadows:** Smooth and soft light shadows (`shadow-soft`) to maintain depth without clutter.
- **Gradients:** Applied to important cards and primary CTA buttons for high visual impact.

## 5. Animation Strategy
- **Transitions:** Standard 200ms-300ms linear or ease-out transitions for color changes.
- **Entry:** Staggered `fade-up` and `reveal-left/right` for landing page storytelling.
- **Interactive:** No scaling on hover; focus purely on color and shadow depth.
