/**
 * Reward-flow graph: the shape of the ICP reward pipeline as drawn from the
 * icp_neuron job down to stakers, buyback, and GLDT.
 *
 * v1 is design-only. `flowKey` marks where a live on-chain amount will later be
 * injected per node; `tag` holds values that are already fixed by governance
 * (the 33/33/33/1 split, the 1:500 / 1:1000 ratio triggers).
 */

export type Accent =
  | "gold"
  | "amber"
  | "teal"
  | "purple"
  | "green"
  | "red"
  | "muted";

export const ACCENTS: Record<Accent, string> = {
  gold: "oklch(0.82 0.15 85)",
  amber: "oklch(0.83 0.13 70)",
  teal: "oklch(0.7 0.12 185)",
  purple: "oklch(0.65 0.18 304)",
  green: "oklch(0.72 0.17 162)",
  red: "oklch(0.65 0.19 22)",
  muted: "oklch(0.6 0 0)",
};

export interface FlowNode {
  id: string;
  /** center x/y and size in viewBox units */
  cx: number;
  cy: number;
  w: number;
  h: number;
  accent: Accent;
  title: string;
  sub?: string;
  /** fixed, governance-set value (percent or ratio) */
  tag?: string;
  /** slot for a future live on-chain amount; renders as "—" until wired */
  flowKey?: string;
  /** dashed border — marks the pre-split diversion */
  dashed?: boolean;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  accent?: Accent;
}

export const VIEW_W = 1100;
export const VIEW_H = 1180;

export const NODES: FlowNode[] = [
  {
    id: "nns",
    cx: 550,
    cy: 58,
    w: 300,
    h: 74,
    accent: "gold",
    title: "7 NNS neurons",
    sub: "generate ICP maturity",
    flowKey: "nns",
  },
  {
    id: "spawn",
    cx: 550,
    cy: 182,
    w: 300,
    h: 74,
    accent: "gold",
    title: "Spawn + disburse",
    sub: "when maturity > 1,000 ICP",
    flowKey: "spawn",
  },
  {
    id: "cycle",
    cx: 550,
    cy: 308,
    w: 388,
    h: 90,
    accent: "amber",
    title: "Cycle account — pre-check",
    sub: "if balance < 1,000 ICP, takes a whole neuron first",
    flowKey: "cycle",
    dashed: true,
  },
  {
    id: "split",
    cx: 550,
    cy: 440,
    w: 320,
    h: 74,
    accent: "gold",
    title: "Split 33 / 33 / 33 / 1",
    sub: "of remaining ICP (prop. #341)",
    flowKey: "split",
  },
  {
    id: "rewards",
    cx: 165,
    cy: 606,
    w: 274,
    h: 98,
    accent: "teal",
    title: "sns_rewards",
    sub: "to eligible stakers",
    tag: "33%",
    flowKey: "rewards",
  },
  {
    id: "buyback",
    cx: 452,
    cy: 606,
    w: 236,
    h: 98,
    accent: "purple",
    title: "Buyback",
    sub: "conditional",
    tag: "33%",
    flowKey: "buyback",
  },
  {
    id: "gldt",
    cx: 716,
    cy: 606,
    w: 236,
    h: 98,
    accent: "purple",
    title: "GLDT",
    sub: "buy + distribute",
    tag: "33%",
    flowKey: "gldt",
  },
  {
    id: "gooddao",
    cx: 962,
    cy: 606,
    w: 196,
    h: 98,
    accent: "muted",
    title: "Good DAO",
    sub: "external",
    tag: "1%",
    flowKey: "gooddao",
  },
  {
    id: "distribute",
    cx: 165,
    cy: 802,
    w: 274,
    h: 104,
    accent: "teal",
    title: "Distribute by maturity",
    sub: "eligible: 2 yr lock, not dissolving",
    flowKey: "distribute",
  },
  {
    id: "cascade",
    cx: 452,
    cy: 772,
    w: 236,
    h: 52,
    accent: "muted",
    title: "Cascade by ratio",
  },
  {
    id: "gldtjob",
    cx: 716,
    cy: 812,
    w: 250,
    h: 108,
    accent: "red",
    title: "GLDT job",
    sub: "no price check · rate x balance",
    flowKey: "gldtjob",
  },
  {
    id: "burn",
    cx: 300,
    cy: 968,
    w: 218,
    h: 96,
    accent: "green",
    title: "Burn GOLDAO",
    sub: "1st · high priority",
    tag: "\u2265 1:500",
    flowKey: "burn",
  },
  {
    id: "stakeogy",
    cx: 545,
    cy: 968,
    w: 218,
    h: 96,
    accent: "green",
    title: "Stake OGY",
    sub: "2nd · medium",
    tag: "\u2265 1:1000",
    flowKey: "stakeogy",
  },
  {
    id: "compound",
    cx: 800,
    cy: 968,
    w: 218,
    h: 96,
    accent: "green",
    title: "Compound ICP",
    sub: "3rd · fallback",
    flowKey: "compound",
  },
];

export const EDGES: FlowEdge[] = [
  { id: "e-nns-spawn", from: "nns", to: "spawn", accent: "gold" },
  { id: "e-spawn-cycle", from: "spawn", to: "cycle", accent: "gold" },
  { id: "e-cycle-split", from: "cycle", to: "split", accent: "gold" },
  { id: "e-split-rewards", from: "split", to: "rewards", accent: "teal" },
  { id: "e-split-buyback", from: "split", to: "buyback", accent: "purple" },
  { id: "e-split-gldt", from: "split", to: "gldt", accent: "purple" },
  { id: "e-split-gooddao", from: "split", to: "gooddao", accent: "muted" },
  {
    id: "e-rewards-distribute",
    from: "rewards",
    to: "distribute",
    accent: "teal",
  },
  { id: "e-buyback-cascade", from: "buyback", to: "cascade", accent: "purple" },
  { id: "e-cascade-burn", from: "cascade", to: "burn", accent: "green" },
  {
    id: "e-cascade-stakeogy",
    from: "cascade",
    to: "stakeogy",
    accent: "green",
  },
  {
    id: "e-cascade-compound",
    from: "cascade",
    to: "compound",
    accent: "green",
  },
  { id: "e-gldt-gldtjob", from: "gldt", to: "gldtjob", accent: "red" },
];

const NODE_BY_ID: Record<string, FlowNode> = Object.fromEntries(
  NODES.map((n) => [n.id, n]),
);

export function nodeById(id: string): FlowNode {
  const n = NODE_BY_ID[id];
  if (!n) throw new Error(`Unknown flow node: ${id}`);
  return n;
}

/** Smooth cubic path from a parent's bottom edge to a child's top edge. */
export function edgePath(edge: FlowEdge): string {
  const from = nodeById(edge.from);
  const to = nodeById(edge.to);
  const x1 = from.cx;
  const y1 = from.cy + from.h / 2;
  const x2 = to.cx;
  const y2 = to.cy - to.h / 2;
  const dy = Math.max((y2 - y1) * 0.45, 24);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
}
