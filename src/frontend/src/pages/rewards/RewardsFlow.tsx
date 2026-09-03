import { useEffect, useState } from "react";

import { fetchFlowBalances } from "@/lib/flow-data";
import {
  ACCENTS,
  type FlowNode,
  NODES,
  nodeById,
} from "./flow-model";

type FlowAmounts = Record<string, string>;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ── Animated vertical connector ── */
function Connector({ height = 32, accent = "gold", animate = true, delay = 0 }: {
  height?: number; accent?: string; animate?: boolean; delay?: number;
}) {
  const color = ACCENTS[accent as keyof typeof ACCENTS] ?? ACCENTS.gold;
  return (
    <div className="flex justify-center">
      <div className="relative overflow-hidden" style={{ width: 2, height, background: `${color}20` }}>
        {animate && (
          <div
            className="absolute rounded-full"
            style={{
              width: 4, height: 10, left: -1,
              background: color,
              animation: `dotTravel 1.6s linear ${delay}s infinite`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Reward Pool Banner (top, standalone) ── */
function RewardPoolBanner({ amounts }: { amounts: FlowAmounts }) {
  return (
    <div className="rounded-xl border border-[oklch(0.82_0.15_85_/_0.15)] p-3.5 px-5 flex items-center justify-between flex-wrap gap-3"
      style={{ background: "linear-gradient(135deg, oklch(0.82 0.15 85 / 0.06), oklch(0.82 0.15 85 / 0.02))" }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
          style={{ background: "oklch(0.82 0.15 85 / 0.12)", animation: "glowPulse 3s ease-in-out infinite" }}>
          <img src="/logos/goldao.png" alt="GoldDAO" className="w-6 h-6 rounded" />
        </div>
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: ACCENTS.gold }}>
            Reward Pool
          </div>
          <div className="font-mono text-[9px] text-muted-foreground/50">
            Next distribution: Wednesday 14h UTC
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <PoolChip logo="/logos/icp.png" value={amounts.rewards ?? "—"} label="ICP" color="oklch(0.75 0.10 290)" />
        <PoolChip logo="/logos/ogy.png" value={amounts.pool_ogy ?? "—"} label="OGY" color="oklch(0.70 0.17 162)" rounded />
        <PoolChip logo="/logos/gldt.svg" value={amounts.pool_gldt ?? "—"} label="GLDT" color="oklch(0.82 0.14 85)" />
      </div>
    </div>
  );
}

function PoolChip({ logo, value, label, color, rounded }: {
  logo: string; value: string; label: string; color: string; rounded?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40"
      style={{ background: "oklch(1 0 0 / 0.03)" }}>
      <img src={logo} alt={label} className={`w-4 h-4 ${rounded ? "rounded" : ""}`} />
      <span className="font-mono text-xs font-semibold" style={{ color }}>
        {value} {label}
      </span>
    </div>
  );
}

/* ── Flow Node Card ── */
function FlowCard({ node, amount, className = "", children }: {
  node: FlowNode; amount?: string; className?: string; children?: React.ReactNode;
}) {
  const color = ACCENTS[node.accent];
  return (
    <div
      className={`rounded-xl border px-5 py-4 flex items-center gap-3.5 ${className}`}
      style={{
        background: `${color}0A`,
        borderColor: `${color}28`,
        borderStyle: node.dashed ? "dashed" : "solid",
      }}
    >
      {children}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold" style={{ color: node.accent === "muted" ? "oklch(0.7 0 0)" : color }}>
          {node.title}
        </div>
        {node.sub && (
          <div className="font-mono text-[10px] text-muted-foreground/60 mt-0.5">{node.sub}</div>
        )}
        {node.flowKey && amount && (
          <div className="font-mono text-xs font-semibold mt-1" style={{ color }}>{amount}</div>
        )}
      </div>
      {node.tag && (
        <div className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0"
          style={{ color, background: `${color}1A` }}>
          {node.tag}
        </div>
      )}
    </div>
  );
}

/* ── Buyback Sub-module ── */
function BuybackModule({ id, logo, title, ratioLabel, ratioValue, isActive, dataLabel, dataValue, animate }: {
  id: string; logo: string; title: string; ratioLabel: string;
  ratioValue?: string; isActive: boolean; dataLabel?: string;
  dataValue?: string; animate: boolean;
}) {
  const activeStyles = id === "burn"
    ? { border: "1px solid oklch(0.78 0.16 60 / 0.35)", background: "oklch(0.78 0.16 60 / 0.06)", animation: animate ? "burnGlow 3s ease-in-out infinite" : undefined }
    : id === "stakeogy"
      ? { border: "1px solid oklch(0.70 0.17 162 / 0.35)", background: "oklch(0.70 0.17 162 / 0.06)" }
      : { border: "1px solid oklch(0.75 0.10 290 / 0.35)", background: "oklch(0.75 0.10 290 / 0.06)" };

  const inactiveStyles = { border: "1px solid oklch(1 0 0 / 0.06)", background: "oklch(1 0 0 / 0.02)" };
  const styles = isActive ? activeStyles : inactiveStyles;

  const colors: Record<string, string> = {
    burn: "oklch(0.78 0.16 60)",
    stakeogy: "oklch(0.70 0.17 162)",
    compound: "oklch(0.75 0.10 290)",
  };
  const color = colors[id] ?? "oklch(0.6 0 0)";

  return (
    <div
      className="rounded-[10px] px-3 py-2.5 flex items-center gap-2 transition-opacity"
      style={{ ...styles, opacity: isActive ? 1 : 0.45 }}
    >
      <div className="relative shrink-0">
        <img src={logo} alt={title} className="w-5 h-5 rounded" />
        {isActive && id === "stakeogy" && (
          <div className="absolute -inset-1 border border-dashed rounded-full"
            style={{ borderColor: "oklch(0.72 0.17 162 / 0.2)", animation: "stakeOrbit 8s linear infinite" }} />
        )}
        {isActive && id === "compound" && (
          <div className="absolute -inset-0.5 border-[1.5px] rounded-full"
            style={{ borderColor: "oklch(0.75 0.10 290 / 0.15)", animation: "compoundPulse 3s ease-in-out infinite" }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold" style={{ color }}>{title}</div>
        <div className="font-mono text-[9px] text-muted-foreground/50 mt-px">{ratioLabel}</div>
      </div>
      {/* Fire animation for burn */}
      {isActive && id === "burn" && animate && (
        <svg width="14" height="18" viewBox="0 0 14 18" className="shrink-0" style={{ animation: "fireFlicker 0.7s ease-in-out infinite" }}>
          <path d="M7 0C7 0 1.5 5 1.5 9.5c0 3 2.5 5.5 5.5 5.5s5.5-2.5 5.5-5.5C12.5 5 7 0 7 0z" fill="oklch(0.78 0.16 60 / 0.7)" />
          <path d="M7 5C7 5 4.5 7.5 4.5 10c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5C9.5 7.5 7 5 7 5z" fill="oklch(0.85 0.14 85 / 0.8)" />
        </svg>
      )}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="font-mono text-[9px] font-bold px-1.5 py-px rounded"
          style={{
            color: isActive ? color : "oklch(1 0 0 / 0.25)",
            background: isActive ? `${color}1A` : "oklch(1 0 0 / 0.04)",
          }}>
          {isActive ? "ACTIVE" : "STANDBY"}
        </span>
        {ratioValue && (
          <span className="font-mono text-[8px] text-muted-foreground/40">{ratioValue}</span>
        )}
        {dataValue && (
          <span className="font-mono text-[8px] text-muted-foreground/30">{dataLabel}: {dataValue}</span>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function RewardsFlow() {
  const reduced = usePrefersReducedMotion();
  const animate = !reduced;
  const [amounts, setAmounts] = useState<FlowAmounts>({});
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFlowBalances().then((data) => {
      if (!cancelled) {
        setAmounts(data);
        setLive(Object.keys(data).length > 0);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Buyback cascade logic — placeholder ratios, connect real data later
  const goldaoRatio = amounts.goldao_ratio ? Number(amounts.goldao_ratio) : 420;
  const ogyRatio = amounts.ogy_ratio ? Number(amounts.ogy_ratio) : 1200;
  const burnActive = goldaoRatio >= 500;
  const stakeActive = !burnActive && ogyRatio >= 1000;
  const compoundActive = !burnActive && !stakeActive;

  const nns = nodeById("nns");
  const spawn = nodeById("spawn");
  const split = nodeById("split");
  const rewards = nodeById("rewards");
  const buyback = nodeById("buyback");
  const gldt = nodeById("gldt");
  const gooddao = nodeById("gooddao");
  const distribute = nodeById("distribute");
  const gldtjob = nodeById("gldtjob");

  return (
    <div className="flex flex-col gap-5">
      {/* Description + status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          How ICP maturity from the DAO's NNS neurons moves through the split,
          buyback cascade, and GLDT job on its way to stakers. Structural values
          are fixed by governance; ICP balances are fetched from the ICP ledger
          on load.
        </p>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground">
          <span className={`inline-block size-1.5 rounded-full ${live ? "bg-[oklch(0.72_0.17_162)]" : "bg-primary animate-pulse"}`} />
          {live ? "Balances loaded" : "Loading balances…"}
        </span>
      </div>

      {/* Reward Pool Banner — standalone at top */}
      <RewardPoolBanner amounts={amounts} />

      {/* Flow diagram — vertical timeline */}
      <div className="rounded-xl border border-border p-4 sm:p-6 flex flex-col items-center"
        style={{ background: "oklch(0.12 0 0)" }}>

        {/* NNS Neurons */}
        <div className="w-full max-w-sm">
          <FlowCard node={nns} amount={amounts[nns.flowKey ?? ""]}>
            <img src="/logos/icp.png" alt="ICP" className="w-8 h-8 shrink-0" />
          </FlowCard>
        </div>
        <Connector height={32} animate={animate} delay={0} />

        {/* Spawn + Disburse */}
        <div className="w-full max-w-sm">
          <FlowCard node={spawn} amount={amounts[spawn.flowKey ?? ""]}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.82 0.15 85 / 0.1)" }}>
              <svg width="18" height="18" fill="none" stroke={ACCENTS.gold} strokeWidth="1.5">
                <path d="M9 3v12M5 11l4 4 4-4" />
              </svg>
            </div>
          </FlowCard>
        </div>

        {/* Cycle Pre-check — minimized inline badge */}
        <div className="flex flex-col items-center">
          <Connector height={12} animate={animate} delay={0.3} />
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-dashed"
            style={{ borderColor: "oklch(0.83 0.13 70 / 0.2)", background: "oklch(1 0 0 / 0.02)" }}>
            <svg width="12" height="12" fill="none" stroke={ACCENTS.amber} strokeWidth="1.5">
              <circle cx="6" cy="6" r="4" /><path d="M6 4v2l1.5 0.5" />
            </svg>
            <span className="font-mono text-[9px]" style={{ color: "oklch(0.83 0.13 70 / 0.6)" }}>
              Cycle pre-check · rare diversion if &lt; 1k ICP
            </span>
          </div>
          <Connector height={12} animate={animate} delay={0.4} />
        </div>

        {/* Split */}
        <div className="w-full max-w-xs text-center rounded-xl border px-5 py-4"
          style={{
            background: "linear-gradient(135deg, oklch(0.82 0.15 85 / 0.08), oklch(0.82 0.15 85 / 0.03))",
            borderColor: "oklch(0.82 0.15 85 / 0.2)",
          }}>
          <div className="text-sm font-extrabold" style={{ color: ACCENTS.gold }}>SPLIT</div>
          <div className="font-mono text-xl font-bold text-foreground mt-1">33 / 33 / 33 / 1</div>
          <div className="font-mono text-[9px] text-muted-foreground/50 mt-1">Proposal #341</div>
        </div>

        {/* Branch fan-out (SVG lines) */}
        <div className="w-full max-w-[860px] hidden sm:block" style={{ height: 50 }}>
          <svg width="100%" height="50" viewBox="0 0 860 50" preserveAspectRatio="none" style={{ overflow: "visible" }}>
            <path d="M430 0 L120 50" stroke={ACCENTS.teal} strokeWidth="1.5" strokeOpacity="0.25" fill="none" />
            <path d="M430 0 L370 50" stroke={ACCENTS.purple} strokeWidth="1.5" strokeOpacity="0.25" fill="none" />
            <path d="M430 0 L580 50" stroke={ACCENTS.red} strokeWidth="1.5" strokeOpacity="0.25" fill="none" />
            <path d="M430 0 L760 50" stroke="oklch(0.6 0 0)" strokeWidth="1.5" strokeOpacity="0.15" fill="none" />
            {animate && <>
              <circle r="3" fill={ACCENTS.teal} opacity="0.9">
                <animateMotion dur="2s" repeatCount="indefinite" path="M430,0 L120,50" />
              </circle>
              <circle r="3" fill={ACCENTS.purple} opacity="0.9">
                <animateMotion dur="2s" begin="0.3s" repeatCount="indefinite" path="M430,0 L370,50" />
              </circle>
              <circle r="3" fill={ACCENTS.red} opacity="0.9">
                <animateMotion dur="2s" begin="0.6s" repeatCount="indefinite" path="M430,0 L580,50" />
              </circle>
              <circle r="3" fill="oklch(0.6 0 0 / 0.5)">
                <animateMotion dur="2s" begin="0.9s" repeatCount="indefinite" path="M430,0 L760,50" />
              </circle>
            </>}
          </svg>
        </div>

        {/* Mobile: simple connectors before grid */}
        <div className="sm:hidden"><Connector height={24} animate={animate} delay={0.5} /></div>

        {/* 4 Branch cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-[860px]">

          {/* Rewards 33% */}
          <div className="rounded-xl border px-4 py-4 flex flex-col gap-2"
            style={{ background: `${ACCENTS.teal}0A`, borderColor: `${ACCENTS.teal}30` }}>
            <div className="flex items-center gap-2 mb-1">
              <img src="/logos/icp.png" alt="ICP" className="w-5 h-5" />
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
                style={{ color: ACCENTS.teal, background: `${ACCENTS.teal}1A` }}>33%</span>
            </div>
            <div className="text-[13px] font-bold" style={{ color: ACCENTS.teal }}>{rewards.title}</div>
            <div className="font-mono text-[9px] text-muted-foreground/50">{rewards.sub}</div>
            <div className="border-t border-[oklch(0.7_0.12_185_/_0.1)] pt-2 mt-1">
              <div className="text-[11px] font-semibold text-muted-foreground/70">↓ Distribute by maturity</div>
              <div className="font-mono text-[9px] text-muted-foreground/40">2yr lock · not dissolving</div>
            </div>
          </div>

          {/* Buyback 33% — Expanded with 3 sub-modules */}
          <div className="sm:col-span-1 lg:col-span-1 rounded-xl border px-4 py-4 flex flex-col gap-2"
            style={{ background: `${ACCENTS.purple}06`, borderColor: `${ACCENTS.purple}28` }}>
            <div className="flex items-center gap-2 mb-1">
              <img src="/logos/goldao.png" alt="GoldDAO" className="w-5 h-5 rounded" />
              <span className="text-[13px] font-bold flex-1" style={{ color: ACCENTS.purple }}>Buyback</span>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
                style={{ color: ACCENTS.purple, background: `${ACCENTS.purple}1A` }}>33%</span>
            </div>
            <div className="font-mono text-[8px] text-muted-foreground/40 uppercase tracking-wide mb-1">
              Conditional cascade · by ratio
            </div>
            <div className="flex flex-col gap-1.5">
              <BuybackModule
                id="burn" logo="/logos/goldao.png" title="Burn GOLDAO"
                ratioLabel="Ratio ≥ 1:500" ratioValue={`1:${goldaoRatio}`}
                isActive={burnActive} animate={animate}
              />
              <BuybackModule
                id="stakeogy" logo="/logos/ogy.png" title="Stake OGY"
                ratioLabel="Ratio ≥ 1:1000" ratioValue={`1:${ogyRatio}`}
                isActive={stakeActive} animate={animate}
                dataLabel="Staked" dataValue={amounts.ogy_staked ?? "—"}
              />
              <BuybackModule
                id="compound" logo="/logos/icp.png" title="Compound ICP"
                ratioLabel="Fallback"
                isActive={compoundActive} animate={animate}
                dataLabel="Neuron" dataValue={amounts.icp_neuron ?? "—"}
              />
            </div>
          </div>

          {/* GLDT 33% */}
          <div className="rounded-xl border px-4 py-4 flex flex-col gap-2"
            style={{ background: `${ACCENTS.red}0A`, borderColor: `${ACCENTS.red}30` }}>
            <div className="flex items-center gap-2 mb-1">
              <img src="/logos/gldt.svg" alt="GLDT" className="w-5 h-5" />
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
                style={{ color: ACCENTS.red, background: `${ACCENTS.red}1A` }}>33%</span>
            </div>
            <div className="text-[13px] font-bold" style={{ color: ACCENTS.red }}>{gldt.title}</div>
            <div className="font-mono text-[9px] text-muted-foreground/50">{gldt.sub}</div>
            <div className="border-t border-[oklch(0.65_0.19_22_/_0.1)] pt-2 mt-1">
              <div className="text-[11px] font-semibold text-muted-foreground/70">↓ GLDT Job</div>
              <div className="font-mono text-[9px] text-muted-foreground/40">No price check · rate × balance</div>
            </div>
          </div>

          {/* Good DAO 1% */}
          <div className="rounded-xl border px-4 py-4 flex flex-col gap-2"
            style={{ background: "oklch(1 0 0 / 0.02)", borderColor: "oklch(1 0 0 / 0.06)" }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                style={{ background: "oklch(1 0 0 / 0.08)", color: "oklch(1 0 0 / 0.4)" }}>G</div>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
                style={{ color: "oklch(1 0 0 / 0.35)", background: "oklch(1 0 0 / 0.04)" }}>1%</span>
            </div>
            <div className="text-[12px] font-bold" style={{ color: "oklch(1 0 0 / 0.45)" }}>{gooddao.title}</div>
            <div className="font-mono text-[9px] text-muted-foreground/30">{gooddao.sub}</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <FlowLegend />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function FlowLegend() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendDot color="oklch(0.78 0.16 60)" label="Active condition" />
        <LegendDot color="oklch(0.6 0 0 / 0.3)" label="Standby" />
        <LegendDot color={ACCENTS.teal} label="To stakers" />
        <LegendDot color={ACCENTS.red} label="Unconditional (GLDT)" />
        <span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: "oklch(1 0 0 / 0.3)" }} />
          Pre-split diversion
        </span>
      </div>
      <p className="text-[11px] font-mono text-muted-foreground">
        Your simulated rewards land at &ldquo;{nodeById("distribute").title}&rdquo;.
      </p>
    </div>
  );
}
