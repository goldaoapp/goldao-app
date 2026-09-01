import { useEffect, useState } from "react";

import { fetchFlowBalances } from "@/lib/flow-data";
import {
  ACCENTS,
  EDGES,
  type FlowEdge,
  type FlowNode,
  NODES,
  VIEW_H,
  VIEW_W,
  edgePath,
  nodeById,
} from "./flow-model";

/**
 * Live on-chain amounts per node keyed by `flowKey`. Fetched once on mount
 * from the ICP Ledger API — no polling.
 */
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

function Edge({ edge, animate }: { edge: FlowEdge; animate: boolean }) {
  const color = ACCENTS[edge.accent ?? "muted"];
  const d = edgePath(edge);
  const pathId = `path-${edge.id}`;
  return (
    <g>
      <path
        id={pathId}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.28}
      />
      {animate &&
        [0, 1].map((i) => (
          <circle key={i} r={3.4} fill={color} opacity={0.9}>
            <animateMotion
              dur="3.4s"
              begin={`${i * 1.7}s`}
              repeatCount="indefinite"
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="linear"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        ))}
    </g>
  );
}

function Node({ node, amount }: { node: FlowNode; amount?: string }) {
  const color = ACCENTS[node.accent];
  const left = node.cx - node.w / 2;
  const top = node.cy - node.h / 2;
  const right = node.cx + node.w / 2;
  const bottom = node.cy + node.h / 2;
  const hasSub = Boolean(node.sub);
  const titleY = hasSub ? top + 30 : node.cy + 5;

  return (
    <g>
      <rect
        x={left}
        y={top}
        width={node.w}
        height={node.h}
        rx={14}
        fill="oklch(0.2 0 0)"
        stroke={color}
        strokeOpacity={0.55}
        strokeWidth={1.25}
        strokeDasharray={node.dashed ? "5 4" : undefined}
      />

      <text
        x={left + 18}
        y={titleY}
        fill="oklch(0.96 0 0)"
        fontFamily="var(--font-display)"
        fontSize={16}
        fontWeight={600}
      >
        {node.title}
      </text>

      {hasSub && (
        <text
          x={left + 18}
          y={top + 48}
          fill="oklch(0.62 0 0)"
          fontFamily="var(--font-mono)"
          fontSize={11}
        >
          {node.sub}
        </text>
      )}

      {node.tag && (
        <>
          <rect
            x={right - 16 - node.tag.length * 8.4}
            y={top + 12}
            width={node.tag.length * 8.4 + 4}
            height={20}
            rx={6}
            fill={color}
            fillOpacity={0.16}
          />
          <text
            x={right - 14}
            y={top + 26}
            textAnchor="end"
            fill={color}
            fontFamily="var(--font-mono)"
            fontSize={12}
            fontWeight={600}
          >
            {node.tag}
          </text>
        </>
      )}

      {node.flowKey && (
        <text
          x={left + 18}
          y={bottom - 14}
          fill={amount ? color : "oklch(0.5 0 0)"}
          fontFamily="var(--font-mono)"
          fontSize={13}
          fontWeight={amount ? 600 : 400}
        >
          {amount ?? "\u2014 ICP"}
        </text>
      )}
    </g>
  );
}

export default function RewardsFlow() {
  const reduced = usePrefersReducedMotion();
  const [amounts, setAmounts] = useState<FlowAmounts>({});
  const [live, setLive] = useState(false);
  /* Force re-mount of SVG animation when the tab becomes visible — some
     desktop browsers pause animateMotion while the element is off-screen. */
  const [animKey, setAnimKey] = useState(0);

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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setAnimKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    /* Also kick after first paint in case the SVG rendered while hidden */
    const id = requestAnimationFrame(() => setAnimKey((k) => k + 1));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      cancelAnimationFrame(id);
    };
  }, []);

  const rewardPoolIcp = amounts.rewards ?? null;
  const rewardPoolOgy = amounts.pool_ogy ?? null;
  const rewardPoolGldt = amounts.pool_gldt ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          How ICP maturity from the DAO's NNS neurons moves through the split,
          buyback cascade, and GLDT job on its way to stakers. Structural values
          are fixed by governance; ICP balances are fetched from the ICP ledger
          on load.
        </p>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground">
          <span
            className={`inline-block size-1.5 rounded-full ${
              live ? "bg-[oklch(0.72_0.17_162)]" : "bg-primary animate-pulse"
            }`}
          />
          {live ? "Balances loaded" : "Loading balances…"}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Flow diagram */}
        <div className="flex-1 overflow-x-auto rounded-xl border border-border bg-[oklch(0.16_0_0)] p-2 shadow-subtle">
          <svg
            key={animKey}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="h-auto w-full"
            style={{ minWidth: 720 }}
            role="img"
            aria-label="GOLDAO reward flow diagram"
          >
            <title>GOLDAO reward flow</title>
            {EDGES.map((e) => (
              <Edge key={e.id} edge={e} animate={!reduced} />
            ))}
            {NODES.map((n) => (
              <Node key={n.id} node={n} amount={amounts[n.flowKey ?? ""]} />
            ))}
          </svg>
        </div>

        {/* Reward pool panel */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-card/50 p-4">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Reward Pool
            </h3>
            <p className="font-mono text-[10px] text-muted-foreground/60 mb-3">
              iyehc-lqaaa-aaaap-ab25a-cai
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Tokens waiting to be distributed next Wednesday 14h UTC.
            </p>
            <div className="space-y-2">
              <PoolRow token="ICP" value={rewardPoolIcp} />
              <PoolRow token="OGY" value={rewardPoolOgy} />
              <PoolRow token="GLDT" value={rewardPoolGldt} />
            </div>
          </div>
          {(!rewardPoolOgy || !rewardPoolGldt) && (
            <p className="text-[10px] font-mono text-muted-foreground/50 px-1">
              Some token balances may be unavailable if the ICRC API is slow to respond.
            </p>
          )}
        </div>
      </div>

      <FlowLegend />
    </div>
  );
}

function PoolRow({ token, value }: { token: string; value: string | null }) {
  const colors: Record<string, string> = {
    ICP: "oklch(0.75 0.10 290)",
    OGY: "oklch(0.70 0.17 162)",
    GLDT: "oklch(0.82 0.14 85)",
  };
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 bg-secondary/30 px-3 py-2">
      <span className="flex items-center gap-2">
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: colors[token] ?? "var(--muted)" }}
        />
        <span className="font-mono text-xs text-muted-foreground">{token}</span>
      </span>
      <span className="font-mono text-sm font-medium" style={{ color: value ? colors[token] : undefined }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function LegendDot({
  accent,
  label,
}: { accent: keyof typeof ACCENTS; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ background: ACCENTS[accent] }}
      />
      {label}
    </span>
  );
}

function FlowLegend() {
  const anchor = nodeById("distribute");
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendDot accent="green" label="Ratio-conditioned" />
        <LegendDot accent="red" label="Unconditional (GLDT)" />
        <LegendDot accent="amber" label="Pre-split diversion" />
        <LegendDot accent="teal" label="To stakers" />
      </div>
      <p className="text-[11px] font-mono text-muted-foreground">
        Your simulated rewards land at &ldquo;{anchor.title}&rdquo;.
      </p>
    </div>
  );
}
