/** Shared types, catalog and helpers for the GLDT image editor. */

export const EXPORT_W = 1536;
export const EXPORT_H = 1024;
export const BG_SRC = "/assets/gldt/bg.png";

/* ── Layer model ─────────────────────────────────────────────────────────── */

interface BaseLayer {
  id: string;
  /** center position as a fraction of the canvas (0..1) */
  x: number;
  y: number;
  opacity: number;
  rotation: number; // degrees
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  text: string;
  fontSize: number; // px at export resolution
  color: string;
  fontFamily: string; // CSS font-family value
  fontWeight: number;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface ImageLayer extends BaseLayer {
  kind: "image";
  src: string;
  /** width as a fraction of the canvas width (0..1) */
  width: number;
  ratio: number; // natural width / height
}

export type Layer = TextLayer | ImageLayer;

/* ── Decorative element catalog ──────────────────────────────────────────── */

export interface DecorElement {
  id: string;
  label: string;
  src: string;
  ratio: number; // width / height
  defaultWidth: number; // fraction of canvas width
  defaultOpacity: number;
}

export const DECOR_ELEMENTS: DecorElement[] = [
  {
    id: "gold-bar",
    label: "Gold bar",
    src: "/assets/gldt/gold-bar.png",
    ratio: 342 / 581,
    defaultWidth: 0.16,
    defaultOpacity: 1,
  },
  {
    id: "gold-bars",
    label: "Gold bars",
    src: "/assets/gldt/gold-bars.png",
    ratio: 542 / 444,
    defaultWidth: 0.3,
    defaultOpacity: 1,
  },
  {
    id: "scale",
    label: "Scale",
    src: "/assets/gldt/scale.png",
    ratio: 377 / 378,
    defaultWidth: 0.24,
    defaultOpacity: 1,
  },
  {
    id: "candlesticks",
    label: "Candlesticks",
    src: "/assets/gldt/candlesticks.svg",
    ratio: 1200 / 520,
    defaultWidth: 0.72,
    defaultOpacity: 0.4,
  },
  {
    id: "bars-chart",
    label: "Bar chart",
    src: "/assets/gldt/bars-chart.svg",
    ratio: 1200 / 520,
    defaultWidth: 0.72,
    defaultOpacity: 0.4,
  },
  {
    id: "gldt-emblem",
    label: "GLDT emblem",
    src: "/assets/gldt/gldt-emblem.svg",
    ratio: 528 / 527,
    defaultWidth: 0.09,
    defaultOpacity: 1,
  },
];

/* ── Fonts offered in the editor ─────────────────────────────────────────── */

export interface FontOption {
  label: string;
  value: string; // CSS font-family
  weights: number[];
  /** injected from Google Fonts on mount (the app only ships sans/mono) */
  inject?: boolean;
}

export const FONTS: FontOption[] = [
  {
    label: "Playfair Display",
    value: '"Playfair Display", serif',
    weights: [400, 700, 900],
    inject: true,
  },
  {
    label: "Lora",
    value: '"Lora", serif',
    weights: [400, 600, 700],
    inject: true,
  },
  {
    label: "Space Grotesk",
    value: '"Space Grotesk", sans-serif',
    weights: [400, 500, 700],
  },
  {
    label: "DM Sans",
    value: '"DM Sans", sans-serif',
    weights: [400, 500, 700],
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", monospace',
    weights: [400, 500, 600],
  },
];

/** Ink color close to the reference ads (warm near-black). */
export const DEFAULT_TEXT_COLOR = "#3a352f";
export const GOLD_COLOR = "#c79a3b";

/* ── Formatting helpers (shared by the data panel) ───────────────────────── */

export function fmtUsd(v: number | null, digits = 2): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function fmtUsdCompact(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v);
}

export function fmtNum(v: number | null, digits = 0): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function fmtPct(v: number | null, digits = 2): string {
  if (v === null) return "—";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(digits)}%`;
}
