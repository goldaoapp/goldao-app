import { Box, type LucideIcon, Sparkles, Trophy } from "lucide-react";

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

export function fmtCountdown(endsAtNs: bigint): string {
  const ms = Number(endsAtNs / 1_000_000n) - Date.now();
  if (ms <= 0) return "Closing";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export function fmtDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const STAKE_LABELS = ["Min", "Mid", "Max"];

export const PAYOUT_BPS = 9_250;

/** Net multiplier text for a points value, e.g. 114 -> "1.05x". */
export function fmtMult(points: number): string {
  return `${((points * PAYOUT_BPS) / 1_000_000).toFixed(2)}x`;
}

/** Gross payout (e8s) for a stake and points, same integer math as the backend. */
export function grossOf(stake: bigint, points: number): bigint {
  return (stake * BigInt(points) * BigInt(PAYOUT_BPS)) / 1_000_000n;
}

export interface PrizeMeta {
  name: string;
  icon: LucideIcon;
  pill: string;
}

const GOLD_DUST: PrizeMeta = {
  name: "Gold dust",
  icon: Sparkles,
  pill: "bg-[oklch(0.85_0.1_85)] text-[oklch(0.36_0.07_70)] border-[oklch(0.78_0.1_82)]",
};
const INGOT: PrizeMeta = {
  name: "Ingot",
  icon: Box,
  pill: "bg-[oklch(0.74_0.14_80)] text-[oklch(0.25_0.05_70)] border-[oklch(0.68_0.14_78)]",
};
const TREASURE: PrizeMeta = {
  name: "Treasure",
  icon: Trophy,
  pill: "bg-[oklch(0.6_0.13_70)] text-[oklch(0.98_0.02_85)] border-[oklch(0.55_0.13_70)]",
};

/** Prize name for a saved depth: 3 Gold dust, 4-5 Ingot, 6-10 Treasure. */
export function prizeName(picks: number): PrizeMeta {
  if (picks >= 6) return TREASURE;
  if (picks >= 4) return INGOT;
  return GOLD_DUST;
}

/** Depth (picks) that corresponds to a points value of the table. */
export function picksForPoints(table: number[], points: number): number {
  let best = 0;
  for (let i = 0; i < table.length; i++) if (table[i] <= points) best = i;
  return best;
}

/** Net result of a ranking row: returned + jackpots - staked, in e8s. */
export function netOf(row: {
  returned: bigint;
  jackpotWon: bigint;
  staked: bigint;
}): bigint {
  return row.returned + row.jackpotWon - row.staked;
}

export function fmtSigned(e8s: bigint, digits = 0): string {
  const sign = e8s > 0n ? "+" : e8s < 0n ? "-" : "";
  const abs = e8s < 0n ? -e8s : e8s;
  return `${sign}${fmtGoldao(abs, digits)}`;
}

/** Amount authorized to the game in one step (whole GOLDAO). */
export const AUTHORIZE_GOLDAO = 10_000;

export function shortPrincipal(p: string): string {
  return p.length > 14 ? `${p.slice(0, 5)}…${p.slice(-5)}` : p;
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
