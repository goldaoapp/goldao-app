# Design Brief

## Direction
Dark editorial base customized with a warm gold accent (hue ~85, chroma ~0.15) to embody the GOLDAO brand — gold meets decentralized governance. Deep charcoal surfaces, restrained ornamentation, and a single confident accent color signal premium DAO infrastructure.

## Tone
Refined, authoritative, minimal. Reads like a financial broadsheet crossed with a modern protocol console — calm, trustworthy, never flashy.

## Differentiation
Most DAO UIs default to blue/purple tech gradients. GOLDAO commits to a single warm gold accent on deep charcoal — an unmistakable brand signature that reads as value, governance, and gravitas in one glance.

## Color Palette

| Token | OKLCH (dark) | Usage |
|---|---|---|
| background | 0.145 0 0 | App canvas, deep charcoal |
| foreground | 0.95 0 0 | Primary text on dark |
| card | 0.18 0 0 | Elevated surfaces, nav, cards |
| muted | 0.22 0 0 | Subtle backgrounds, footer |
| muted-foreground | 0.6 0 0 | Secondary text, captions |
| primary | 0.82 0.15 85 | Warm gold — CTAs, active states, brand |
| primary-foreground | 0.145 0 0 | Text on gold |
| accent | 0.82 0.15 85 | Highlights, hover accents |
| border | 0.28 0 0 | Hairline dividers |
| destructive | 0.65 0.19 22 | Errors, destructive actions |
| ring | 0.82 0.15 85 | Focus rings |

## Typography
- Display: Space Grotesk (400–700) — headings, brand wordmark, nav.
- Body: DM Sans (400–700) — paragraphs, UI labels, content.
- Mono: JetBrains Mono (400–600) — numeric data, addresses, code.
- Type tiers: display 3xl/2xl/xl, body lg/base/sm, mono sm/xs.

## Elevation
Minimal shadows. `shadow-subtle` for cards and sticky nav; `shadow-elevated` for popovers and modals. Depth comes from layered surface lightness (background → card → popover), not heavy drop shadows.

## Structural Zones

| Zone | Surface | Treatment |
|---|---|---|
| Top navigation | card | `bg-card` with `border-b`, sticky, subtle shadow |
| Hero | background | Full-bleed charcoal, gold gradient text on wordmark |
| Content sections | background / muted | Alternate `bg-background` and `bg-muted/30` for rhythm |
| Summary cards | card | `bg-card` with `border`, `shadow-subtle`, 0.625rem radius |
| Footer | muted | `bg-muted/40` with `border-t`, muted-foreground text |

## Spacing
Generous density. Section padding `py-16` to `py-24`; card padding `p-6` to `p-8`; nav height `h-16`. Gap rhythm uses 4/8/12/24 scale.

## Component Patterns
- Nav: brand left, 6 links center/right, active link in primary with underline.
- Cards: bordered surfaces with subtle shadow, gold accent on hover border.
- Buttons: primary gold fill, secondary ghost with border, mono used for numeric labels.
- Mobile: nav collapses into a sheet menu triggered by a gold-accented hamburger.

## Motion
One orchestrated entrance: hero and cards use `animate-fade-in-up` staggered. Hover transitions use `transition-smooth` (0.3s cubic-bezier). No bounce, no glow, no ambient pulse.

## Constraints
- No purple/blue gradients. No neon shadows. No rainbow palettes.
- Gold accent used sparingly — primary CTAs, active nav, focus rings, brand wordmark only.
- Body and content surfaces stay neutral charcoal; gold never dominates大面积.
- AA+ contrast maintained on all text/background pairs.

## Signature Detail
The GOLDAO wordmark in the hero renders with `.text-gradient-gold` — a 135° gradient from light gold (L 0.88) to deep gold (L 0.72), instantly anchoring the brand identity against the charcoal canvas.
