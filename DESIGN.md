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
