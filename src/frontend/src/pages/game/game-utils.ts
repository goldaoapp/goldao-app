import {
  Box,
  CircleDot,
  type LucideIcon,
  Mountain,
  Sparkles,
  Trophy,
} from "lucide-react";

/* Terminal tokens (index.css --term-*), same as the rest of the app */
export const ink = "text-[color:var(--term-ink)]";
export const inkMid = "text-[color:var(--term-ink-mid)]";
export const inkFaint = "text-[color:var(--term-ink-faint)]";
export const gold = "text-[color:var(--term-gold)]";
export const panel =
  "rounded-xl border border-[color:var(--term-border)] bg-[var(--term-card)] backdrop-blur-[2px]";
export const panelHeader =
  "flex items-center justify-between gap-3 border-b border-[color:var(--term-border)] bg-[var(--term-header)] px-4 py-3 sm:px-5";
export const eyebrow =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.18em]";

/** Expected points of an unplayed excavation (auto-played saving at 3 at close). Mirrors AUTO_EV in the backend. */
export const AUTO_SAVE_EV = 100;

/** Typical chip-average cutoffs (x100) for Treasure, Ingot and Gold dust, from simulations. Used while the week has too few chips to have its own. */
export const TYPICAL_CUTS_X100 = [14_200, 11_700, 7_850];

/** Set to an image path (e.g. "/assets/images/diamond.png") once the diamond artwork is added. */
export const DIAMOND_IMG: string | null = "/assets/images/diamond.png";

const E8S = 100_000_000;

export function toGoldao(e8s: bigint): number {
  return Number(e8s) / E8S;
}

export function fmtGoldao(e8s: bigint, digits = 0): string {
  return toGoldao(e8s).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Average points are sent as x100 integers. */
export function fmtAvg(x100: bigint | number): string {
  return (Number(x100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function fmtPct(x100: bigint): string {
  return `${Math.round(Number(x100) / 100)}%`;
}

export function shortPrincipal(p: string): string {
  return p.length > 14 ? `${p.slice(0, 5)}…${p.slice(-5)}` : p;
}

/* Prize tiers (index 0..3, as returned by the backend) */

export interface TierMeta {
  name: string;
  icon: LucideIcon;
  pct: number;
  payout: string;
  pill: string;
}

const TREASURE_META: TierMeta = {
  name: "Treasure",
  icon: Trophy,
  pct: 5,
  payout: "≈3x",
  pill: "bg-[oklch(0.6_0.13_70)] text-[oklch(0.98_0.02_85)] border-[oklch(0.55_0.13_70)]",
};
const INGOT_META: TierMeta = {
  name: "Ingot",
  icon: Box,
  pct: 15,
  payout: "1.2x",
  pill: "bg-[oklch(0.74_0.14_80)] text-[oklch(0.25_0.05_70)] border-[oklch(0.68_0.14_78)]",
};
const GOLD_DUST_META: TierMeta = {
  name: "Gold dust",
  icon: Sparkles,
  pct: 60,
  payout: "1x",
  pill: "bg-[oklch(0.85_0.1_85)] text-[oklch(0.36_0.07_70)] border-[oklch(0.78_0.1_82)]",
};
const ROCK_META: TierMeta = {
  name: "Rock",
  icon: Mountain,
  pct: 20,
  payout: "0",
  pill: "bg-[oklch(0.6_0.01_80/0.14)] text-[color:var(--term-ink-mid)] border-[oklch(0.6_0.01_80/0.35)]",
};

export const TIERS: TierMeta[] = [
  TREASURE_META,
  INGOT_META,
  GOLD_DUST_META,
  ROCK_META,
];

/** Index of the Rock tier (the last one); the tiers above it have a cutoff. */
export const ROCK_TIER = TIERS.length - 1;

/**
 * Tiers of weeks closed before Nugget was removed (five entries). Only used to
 * label old history rows.
 */
const LEGACY_TIERS: TierMeta[] = [
  TREASURE_META,
  INGOT_META,
  {
    name: "Nugget",
    icon: CircleDot,
    pct: 25,
    payout: "1.15x",
    pill: "bg-[oklch(0.85_0.1_85)] text-[oklch(0.36_0.07_70)] border-[oklch(0.78_0.1_82)]",
  },
  GOLD_DUST_META,
  ROCK_META,
];

/** Tier list matching a stored per-tier count (old weeks have five tiers). */
export function tiersFor(count: number): TierMeta[] {
  return count === LEGACY_TIERS.length ? LEGACY_TIERS : TIERS;
}

export function tierOf(index: bigint | number): TierMeta {
  return TIERS[Math.min(ROCK_TIER, Math.max(0, Number(index)))];
}

/* Mine tokens (cosmetic: which token a safe pick reveals) */

export type TokenKey = "GLDT" | "ICP" | "OGY" | "GOLDAO";

export const TOKENS: Record<
  TokenKey,
  { logo: string; cell: string; glow: string }
> = {
  GLDT: {
    logo: "/logos/gldt.png",
    cell: "bg-[oklch(0.62_0.12_250/0.16)] border-[oklch(0.62_0.14_250/0.55)]",
    glow: "oklch(0.62 0.14 250 / 0.45)",
  },
  ICP: {
    logo: "/logos/icp.png",
    cell: "bg-[oklch(0.6_0.14_300/0.16)] border-[oklch(0.6_0.16_300/0.55)]",
    glow: "oklch(0.6 0.16 300 / 0.45)",
  },
  OGY: {
    logo: "/logos/ogy.png",
    cell: "bg-[oklch(0.68_0.14_162/0.16)] border-[oklch(0.66_0.15_162/0.55)]",
    glow: "oklch(0.66 0.15 162 / 0.45)",
  },
  GOLDAO: {
    logo: "/logos/goldao.png",
    cell: "bg-[oklch(0.78_0.13_85/0.2)] border-[oklch(0.72_0.14_82/0.65)]",
    glow: "oklch(0.75 0.14 82 / 0.55)",
  },
};

export const ROCK_CELL =
  "bg-[oklch(0.55_0.01_80/0.22)] border-[oklch(0.55_0.01_80/0.6)]";
export const DIAMOND_CELL =
  "bg-[oklch(0.7_0.14_350/0.18)] border-[oklch(0.68_0.16_350/0.7)]";
export const DIAMOND_TEXT =
  "text-[oklch(0.62_0.17_350)] dark:text-[oklch(0.8_0.12_350)]";

/** Picks 1-2 GLDT, 3-4 ICP, 5-6 OGY, 7+ GOLDAO. */
export function tokenForPick(pick: number): TokenKey {
  const order: TokenKey[] = ["GLDT", "ICP", "OGY", "GOLDAO"];
  return order[Math.min(3, Math.floor((pick - 1) / 2))];
}

/** Strategy guide: simulated odds per chip with a mixed public. */
/** Simulated share of chips (%) ending in each tier: Treasure, Ingot, Gold dust, Rock. Each row sums to 100. */
export const STRATEGY_GUIDE: { saveAt: number; odds: number[] }[] = [
  { saveAt: 3, odds: [0, 0, 93, 7] },
  { saveAt: 4, odds: [0, 20, 70, 10] },
  { saveAt: 5, odds: [3, 14, 63, 20] },
  { saveAt: 6, odds: [6, 17, 60, 17] },
  { saveAt: 7, odds: [8, 23, 47, 22] },
  { saveAt: 8, odds: [10, 15, 43, 32] },
];
