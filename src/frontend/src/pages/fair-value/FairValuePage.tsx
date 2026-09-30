import { PageHeader } from "@/components/common";
import {
  DEFAULTS,
  type FairValueParams,
  type FairValueResult,
  calcular,
} from "@/lib/fairvalue-calc";
import { useLiveData } from "@/lib/use-live-data";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

/*
 * Fair Value — terminal-style layout (same --term-* tokens as Reward Flow).
 * Calculation logic is unchanged (lib/fairvalue-calc.ts); this file only
 * arranges and styles the result.
 */

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtNum(v: number, decimals = 1): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDefault(v: number): string {
  if (v === 0) return "";
  if (v === Math.floor(v)) return Math.floor(v).toLocaleString("en-US");
  return String(v);
}

function parseInput(s: string, fallback: number): number {
  const cleaned = s.replace(/,/g, "").replace(/\s/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

const ink = "text-[color:var(--term-ink)]";
const inkMid = "text-[color:var(--term-ink-mid)]";
const inkFaint = "text-[color:var(--term-ink-faint)]";
const gold = "text-[color:var(--term-gold)]";
const card =
  "rounded-md border border-[color:var(--term-border)] bg-[var(--term-card)]";

/* ── Input field definitions ─────────────────────────────────────────────── */

type FieldDef = { key: keyof FairValueParams; label: string; unit: string };
type SectionDef = { title: string; fields: FieldDef[] };

const LIVE_FIELDS: FieldDef[] = [
  { key: "market_ratio", label: "Market ratio", unit: "GOLDAO/ICP" },
  { key: "goldao_eligible", label: "Eligible GOLDAO", unit: "GOLDAO" },
  { key: "ogy_staked", label: "OGY staked", unit: "OGY" },
  { key: "price_ogy_usd", label: "OGY price", unit: "USD" },
  { key: "price_icp_usd", label: "ICP price", unit: "USD" },
  { key: "wtn_icp_annual", label: "WTN → ICP / yr", unit: "ICP" },
  {
    key: "origyn_ogy_icp_annual",
    label: "ORIGYN → ICP / yr",
    unit: "ICP",
  },
];

const MODEL_SECTIONS: SectionDef[] = [
  {
    title: "NNS neuron",
    fields: [
      { key: "icp_staked", label: "ICP staked", unit: "ICP" },
      { key: "nns_apy", label: "NNS max APY", unit: "%" },
    ],
  },
  {
    title: "Split 33 / 33 / 33 / 1",
    fields: [
      { key: "pct_stakers", label: "Stakers (ICP)", unit: "%" },
      { key: "pct_gldt", label: "GLDT", unit: "%" },
      { key: "pct_burn", label: "Buyback", unit: "%" },
      { key: "pct_cecil", label: "Good DAO", unit: "%" },
    ],
  },
  {
    title: "OGY neuron",
    fields: [{ key: "ogy_apy", label: "OGY APY", unit: "%" }],
  },
];

/* ── Zones ───────────────────────────────────────────────────────────────── */

type ZoneId =
  | "expensive"
  | "slightly_expensive"
  | "fair"
  | "slightly_cheap"
  | "cheap";

interface ZoneInfo {
  id: ZoneId;
  label: string;
  /** bar segment: darker, more saturated in light mode so it reads on cream */
  bar: string;
  text: string;
  chip: string;
  dot: string;
}

const ZONES: ZoneInfo[] = [
  {
    id: "expensive",
    label: "Expensive",
    bar: "bg-[oklch(0.58_0.2_25)] dark:bg-[oklch(0.65_0.19_22)]",
    text: "text-[oklch(0.5_0.19_25)] dark:text-[oklch(0.7_0.17_22)]",
    chip: "border-[oklch(0.58_0.2_25)]/40 bg-[oklch(0.58_0.2_25)]/10",
    dot: "bg-[oklch(0.55_0.2_25)] dark:bg-[oklch(0.68_0.19_22)]",
  },
  {
    id: "slightly_expensive",
    label: "Slightly expensive",
    bar: "bg-[oklch(0.66_0.16_50)] dark:bg-[oklch(0.75_0.14_55)]",
    text: "text-[oklch(0.52_0.14_50)] dark:text-[oklch(0.78_0.13_55)]",
    chip: "border-[oklch(0.66_0.16_50)]/40 bg-[oklch(0.66_0.16_50)]/10",
    dot: "bg-[oklch(0.6_0.16_50)] dark:bg-[oklch(0.75_0.14_55)]",
  },
  {
    id: "fair",
    label: "Fair value",
    bar: "bg-[oklch(0.7_0.13_80)] dark:bg-[oklch(0.83_0.13_70)]",
    text: "text-[oklch(0.5_0.1_75)] dark:text-[oklch(0.83_0.13_70)]",
    chip: "border-[oklch(0.7_0.13_80)]/40 bg-[oklch(0.7_0.13_80)]/12",
    dot: "bg-[oklch(0.62_0.13_75)] dark:bg-[oklch(0.83_0.13_70)]",
  },
  {
    id: "slightly_cheap",
    label: "Slightly cheap",
    bar: "bg-[oklch(0.62_0.14_140)] dark:bg-[oklch(0.72_0.13_140)]",
    text: "text-[oklch(0.45_0.12_140)] dark:text-[oklch(0.75_0.13_140)]",
    chip: "border-[oklch(0.62_0.14_140)]/40 bg-[oklch(0.62_0.14_140)]/10",
    dot: "bg-[oklch(0.55_0.14_140)] dark:bg-[oklch(0.72_0.13_140)]",
  },
  {
    id: "cheap",
    label: "Cheap",
    bar: "bg-[oklch(0.55_0.14_162)] dark:bg-[oklch(0.72_0.17_162)]",
    text: "text-[oklch(0.45_0.12_162)] dark:text-[oklch(0.74_0.16_162)]",
    chip: "border-[oklch(0.55_0.14_162)]/40 bg-[oklch(0.55_0.14_162)]/10",
    dot: "bg-[oklch(0.5_0.14_162)] dark:bg-[oklch(0.72_0.17_162)]",
  },
];

function getZone(difPct: number): ZoneInfo {
  // difPct > 0 = cheap (market ratio above equilibrium)
  if (difPct > 20) return ZONES[4];
  if (difPct > 10) return ZONES[3];
  if (difPct >= -10) return ZONES[2];
  if (difPct >= -20) return ZONES[1];
  return ZONES[0];
}

const ZONE_TEXT: Record<ZoneId, string> = {
  expensive:
    "Staking ICP directly on the NNS yields significantly more than buying GOLDAO today.",
  slightly_expensive:
    "GOLDAO yield is slightly below NNS direct staking. Close to equilibrium.",
  fair: "GOLDAO yield is roughly in line with NNS direct staking.",
  slightly_cheap:
    "GOLDAO yield slightly exceeds NNS direct staking. Mildly favorable entry.",
  cheap:
    "Buying GOLDAO yields significantly more than staking ICP directly on the NNS.",
};

/* ── Building blocks ────────────────────────────────────────────────────── */

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
        inkMid,
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  right,
}: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--term-border)] bg-[var(--term-header)] px-4 py-3 sm:px-5">
      <span
        className={cn(
          "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
          ink,
        )}
      >
        {title}
      </span>
      {right}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  strong,
  dim,
  dot,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  strong?: boolean;
  dim?: boolean;
  dot?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-[color:var(--term-border-faint)] py-2 first:border-t-0">
      <span
        className={cn(
          "flex min-w-0 items-center gap-2 font-mono text-[11px]",
          dim ? inkFaint : inkMid,
        )}
      >
        {dot && (
          <span
            className="inline-block size-1.5 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span className="text-right">
        <span
          className={cn(
            "whitespace-nowrap font-mono text-[12px] tabular-nums",
            strong ? cn(gold, "font-semibold") : dim ? inkFaint : ink,
          )}
        >
          {value}
        </span>
        {sub && (
          <span className={cn("block font-mono text-[10px]", inkFaint)}>
            {sub}
          </span>
        )}
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn("font-mono text-[10px] leading-relaxed", inkFaint)}>
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3 sm:px-5", className)}>
      <Label>{label}</Label>
      <div
        className={cn(
          "mt-1 font-display text-xl font-semibold tabular-nums",
          ink,
        )}
      >
        {value}
        {unit && (
          <span className={cn("ml-1 font-mono text-xs font-medium", inkMid)}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div className={cn("font-mono text-[10px]", inkFaint)}>{sub}</div>
      )}
    </div>
  );
}

/* ── Hero: equilibrium vs market ─────────────────────────────────────────── */

function Hero({ r, params }: { r: FairValueResult; params: FairValueParams }) {
  const hasActive = r.goldao_active_eligible > 0 && r.ratio_eq_active > 0;
  const eq = hasActive ? r.ratio_eq_active : r.ratio_eq;
  const dif = hasActive ? r.diferencia_pct_active : r.diferencia_pct;
  const apy = hasActive ? r.apy_active : r.apy_efectivo;
  const eqUsd = hasActive ? r.precio_eq_active_usd : r.precio_eq_usd;
  const mkt = r.market_ratio;
  const ready = eq > 0 && mkt > 0;
  const zone = getZone(dif);
  const today = new Date()
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase();

  // Bar range: eq ± 35% so all five bands fit with room for the marker
  const barMin = eq * 0.65;
  const barMax = eq * 1.35;
  const toPct = (v: number) =>
    Math.max(0, Math.min(100, ((v - barMin) / (barMax - barMin)) * 100));
  const bands = [
    { zone: ZONES[0], from: barMin, to: eq * 0.8 },
    { zone: ZONES[1], from: eq * 0.8, to: eq * 0.9 },
    { zone: ZONES[2], from: eq * 0.9, to: eq * 1.1 },
    { zone: ZONES[3], from: eq * 1.1, to: eq * 1.2 },
    { zone: ZONES[4], from: eq * 1.2, to: barMax },
  ];
  const ticks = [
    { v: eq * 0.8, label: "−20%" },
    { v: eq * 0.9, label: "−10%" },
    { v: eq, label: "EQ" },
    { v: eq * 1.1, label: "+10%" },
    { v: eq * 1.2, label: "+20%" },
  ];
  const mktUsd =
    mkt > 0 && params.price_icp_usd > 0 ? params.price_icp_usd / mkt : 0;

  return (
    <section
      className="overflow-hidden rounded-xl border border-[color:var(--term-border)] backdrop-blur-[2px]"
      aria-label="Market vs equilibrium"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--term-border)] px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <img src="/logos/goldao.png" alt="" className="size-7 rounded-full" />
          <span
            className={cn(
              "font-mono text-sm font-semibold uppercase tracking-[0.18em] sm:text-base",
              ink,
            )}
          >
            Fair <span className={gold}>Value</span>
          </span>
        </div>
        <span
          className={cn(
            "flex items-center gap-2 font-mono text-[11px] tracking-[0.14em]",
            inkMid,
          )}
        >
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              ready ? "bg-[var(--term-gold)]" : "bg-[var(--term-ink-faint)]",
            )}
          />
          {ready ? `LIVE · ${today}` : "LOADING"}
        </span>
      </header>

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        {/* Numbers */}
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-2 gap-6 sm:gap-10">
            <div>
              <Label>Equilibrium{hasActive ? " · active voters" : ""}</Label>
              <div
                className={cn(
                  "mt-1 font-display text-4xl font-semibold tabular-nums sm:text-5xl",
                  ink,
                )}
              >
                {ready ? fmtNum(eq, 0) : "—"}
              </div>
              <div className={cn("font-mono text-[11px]", inkFaint)}>
                GOLDAO per ICP
              </div>
            </div>
            <div>
              <Label>Market</Label>
              <div
                className={cn(
                  "mt-1 font-display text-4xl font-semibold tabular-nums sm:text-5xl",
                  gold,
                )}
              >
                {mkt > 0 ? fmtNum(mkt, 0) : "—"}
              </div>
              <div className={cn("font-mono text-[11px]", inkFaint)}>
                GOLDAO per ICP
              </div>
            </div>
          </div>
          {ready && (
            <div className="flex flex-col items-start gap-1.5 md:items-end">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider",
                  zone.chip,
                  zone.text,
                )}
              >
                <span
                  className={cn("inline-block size-2 rounded-full", zone.dot)}
                />
                {zone.label} · {dif >= 0 ? "+" : ""}
                {fmtNum(dif, 1)}%
              </span>
              <span className={cn("font-mono text-[11px]", inkFaint)}>
                Market {dif >= 0 ? "above" : "below"} equilibrium ratio
              </span>
            </div>
          )}
        </div>

        {/* Bar */}
        {ready && (
          <div className="mt-8">
            <div className="relative h-4 overflow-hidden rounded-full bg-[var(--term-border-faint)]">
              {bands.map((b) => {
                const left = toPct(b.from);
                const width = toPct(b.to) - left;
                if (width <= 0) return null;
                return (
                  <div
                    key={b.zone.id}
                    className={cn(
                      "absolute inset-y-0 opacity-60 dark:opacity-30",
                      b.zone.bar,
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
              <div
                className="absolute inset-y-0 w-0.5 bg-[var(--term-ink)]"
                style={{ left: `${toPct(eq)}%` }}
              />
            </div>
            {/* Market marker sits above the bar so it is never clipped */}
            <div className="relative -mt-[18px] h-5">
              <div
                className={cn(
                  "absolute top-0 size-5 -translate-x-1/2 rounded-full border-[3px] border-white shadow-md ring-1 ring-[color:var(--term-border)] dark:border-[#1c1e22]",
                  zone.dot,
                )}
                style={{ left: `${toPct(mkt)}%` }}
                title={`Market ${fmtNum(mkt, 0)}`}
              />
            </div>
            <div className="relative mt-1 h-4">
              {ticks.map((t) => (
                <span
                  key={t.label}
                  className={cn(
                    "absolute -translate-x-1/2 font-mono text-[10px]",
                    t.label === "EQ" ? cn(ink, "font-semibold") : inkFaint,
                  )}
                  style={{ left: `${toPct(t.v)}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <div
              className={cn(
                "mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider",
                inkFaint,
              )}
            >
              <span>← Expensive</span>
              <span>Cheap →</span>
            </div>
            <p className={cn("mt-4 text-sm", zone.text)}>
              {ZONE_TEXT[zone.id]}
            </p>
          </div>
        )}
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 divide-[color:var(--term-border)] border-t border-[color:var(--term-border)] md:grid-cols-4 md:divide-x">
        <Stat
          label={hasActive ? "Effective APY · active" : "Effective APY"}
          value={`${fmtNum(apy, 2)}%`}
          sub={
            hasActive
              ? `All eligible: ${fmtNum(r.apy_efectivo, 2)}%`
              : undefined
          }
        />
        <Stat
          label="NNS benchmark APY"
          value={`${fmtNum(params.nns_apy, 2)}%`}
          sub="Yield target for equilibrium"
        />
        <Stat
          label="Equilibrium price"
          value={eqUsd > 0 ? `$${eqUsd.toFixed(5)}` : "—"}
          sub="per GOLDAO"
        />
        <Stat
          label="Market price"
          value={mktUsd > 0 ? `$${mktUsd.toFixed(5)}` : "—"}
          sub="per GOLDAO"
        />
      </div>
    </section>
  );
}

/* ── Yield pool ──────────────────────────────────────────────────────────── */

const SOURCE_COLORS = {
  stakers: "oklch(0.65 0.12 185)",
  gldt: "oklch(0.72 0.13 80)",
  ogy: "oklch(0.6 0.17 304)",
  wtn: "oklch(0.62 0.12 230)",
  origyn: "oklch(0.62 0.14 145)",
};

function YieldPool({ r }: { r: FairValueResult }) {
  const parts = [
    { key: "stakers", label: "ICP to stakers", v: r.icp_stakers },
    { key: "gldt", label: "GLDT (ICP value)", v: r.icp_gldt },
    { key: "ogy", label: "OGY neuron", v: r.ogy_icp },
    { key: "wtn", label: "WTN → ICP", v: r.wtn_icp_annual },
    { key: "origyn", label: "ORIGYN partnership", v: r.origyn_ogy_icp_annual },
  ] as const;
  const total = r.pool_directo > 0 ? r.pool_directo : 1;

  return (
    <div className={cn(card, "flex flex-col overflow-hidden")}>
      <PanelHeader
        title="Annual yield pool"
        right={
          <span className={cn("font-mono text-[10px]", inkFaint)}>
            ICP / year
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <Label>Direct pool to holders</Label>
          <div
            className={cn(
              "mt-1 font-display text-3xl font-semibold tabular-nums",
              ink,
            )}
          >
            {fmtNum(r.pool_directo, 0)}
            <span className={cn("ml-1.5 font-mono text-sm", inkMid)}>ICP</span>
          </div>
        </div>

        {/* Stacked composition bar */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--term-border-faint)]">
          {parts.map((p) =>
            p.v > 0 ? (
              <div
                key={p.key}
                className="h-full"
                style={{
                  width: `${(p.v / total) * 100}%`,
                  background: SOURCE_COLORS[p.key],
                }}
                title={p.label}
              />
            ) : null,
          )}
        </div>

        <div>
          {parts.map((p) => (
            <Row
              key={p.key}
              dot={SOURCE_COLORS[p.key]}
              label={p.label}
              value={`${fmtNum(p.v, 0)} ICP`}
              sub={`${fmtNum((p.v / total) * 100, 1)}%`}
            />
          ))}
        </div>

        <div className="mt-auto rounded border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] px-3 py-2">
          <Row
            label="Gross NNS maturity"
            value={`${fmtNum(r.icp_gross, 0)} ICP`}
            dim
          />
          <Row
            label="Buyback (not holder yield)"
            value={`${fmtNum(r.icp_burn, 0)} ICP`}
            dim
          />
          <Row
            label="Good DAO (external)"
            value={`${fmtNum(r.icp_cecil, 0)} ICP`}
            dim
          />
        </div>
        <Note>
          OGY = {fmtNum(r.ogy_rewards, 0)} OGY/yr (${fmtNum(r.ogy_usd, 0)})
          converted at the ICP price. ORIGYN = OGY Gold DAO recaptures from the
          partnership, in ICP value.
        </Note>
      </div>
    </div>
  );
}

/* ── From yield to equilibrium ───────────────────────────────────────────── */

function Equilibrium({
  r,
  params,
}: {
  r: FairValueResult;
  params: FairValueParams;
}) {
  const hasActive = r.goldao_active_eligible > 0;
  return (
    <div className={cn(card, "flex flex-col overflow-hidden")}>
      <PanelHeader title="From yield to equilibrium" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div>
          <Label>1 · Yield per GOLDAO</Label>
          <div className="mt-1">
            {hasActive && (
              <Row
                label={`÷ ${fmtNum(r.goldao_active_eligible / 1e6)}M active voters`}
                value={`${r.yield_active.toFixed(9)} ICP`}
                strong
              />
            )}
            <Row
              label={`÷ ${fmtNum(params.goldao_eligible / 1e6)}M eligible`}
              value={`${r.yield_directo.toFixed(9)} ICP`}
              strong={!hasActive}
              dim={hasActive}
            />
          </div>
        </div>

        <div>
          <Label>2 · Effective APY at market price</Label>
          <div className="mt-1">
            {hasActive && (
              <Row
                label="Active voters"
                value={`${fmtNum(r.apy_active, 2)}%`}
                strong
              />
            )}
            <Row
              label="All eligible"
              value={`${fmtNum(r.apy_efectivo, 2)}%`}
              strong={!hasActive}
              dim={hasActive}
            />
            <Row
              label="NNS benchmark"
              value={`${fmtNum(params.nns_apy, 2)}%`}
            />
          </div>
        </div>

        <div>
          <Label>3 · Equilibrium (yield = NNS APY)</Label>
          <div className="mt-1">
            {hasActive && (
              <Row
                label="Active voters"
                value={`1 ICP = ${fmtNum(r.ratio_eq_active, 0)} GOLDAO`}
                sub={`${r.precio_eq_active.toFixed(8)} ICP · $${r.precio_eq_active_usd.toFixed(6)}`}
                strong
              />
            )}
            <Row
              label="All eligible"
              value={`1 ICP = ${fmtNum(r.ratio_eq, 0)} GOLDAO`}
              sub={`${r.precio_eq.toFixed(8)} ICP · $${r.precio_eq_usd.toFixed(6)}`}
              strong={!hasActive}
              dim={hasActive}
            />
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-1">
          <Note>
            yield = direct pool ÷ GOLDAO · APY = yield ÷ GOLDAO price in ICP
          </Note>
          <Note>price_eq = yield ÷ NNS APY · ratio_eq = 1 ÷ price_eq</Note>
          {hasActive && (
            <Note>
              Active voters: {fmtNum(r.goldao_active_eligible / 1e6)}M of{" "}
              {fmtNum(params.goldao_eligible / 1e6)}M eligible (from on-chain
              maturity data).
            </Note>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */

function InputField({
  field,
  value,
  onChange,
  flashing,
  live,
}: {
  field: FieldDef;
  value: string;
  onChange: (key: keyof FairValueParams, val: string) => void;
  flashing?: boolean;
  live?: boolean;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-2 py-1">
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 font-mono text-[11px]",
          inkMid,
        )}
      >
        <span className="truncate">{field.label}</span>
        {live && (
          <span
            className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--term-green)]"
            title="Live from API"
          />
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={cn(
            "min-w-0 flex-1 rounded border px-2 py-1 text-right font-mono text-xs outline-none transition-colors duration-700 focus:ring-1 focus:ring-[color:var(--term-gold)]",
            ink,
            flashing
              ? "border-[color:var(--term-green-border)] bg-[var(--term-green-bg)]"
              : "border-[color:var(--term-border)] bg-[var(--term-alt)]",
          )}
        />
        <span className={cn("w-10 shrink-0 font-mono text-[9px]", inkFaint)}>
          {field.unit}
        </span>
      </span>
    </label>
  );
}

function Inputs({
  values,
  onChange,
  flash,
  onReset,
}: {
  values: Record<string, string>;
  onChange: (key: keyof FairValueParams, val: string) => void;
  flash: Set<string>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(card, "overflow-hidden")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-b border-[color:var(--term-border)] bg-[var(--term-header)] px-4 py-3 text-left sm:px-5"
      >
        <span
          className={cn(
            "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
            ink,
          )}
        >
          Assumptions & live inputs
        </span>
        <span
          className={cn(
            "flex items-center gap-2 font-mono text-[10px]",
            inkFaint,
          )}
        >
          {open ? "Hide" : "Edit"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
            className={cn(
              "transition-transform duration-200",
              open && "rotate-180",
            )}
          >
            <path d="M3.5 5.5L7 9l3.5-3.5" />
          </svg>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Label className="mb-2 flex items-center gap-1.5">
                Live data
                <span className="inline-block size-1.5 rounded-full bg-[var(--term-green)]" />
              </Label>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {LIVE_FIELDS.map((f) => (
                  <InputField
                    key={f.key}
                    field={f}
                    value={values[f.key]}
                    onChange={onChange}
                    flashing={flash.has(f.key)}
                    live
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {MODEL_SECTIONS.map((s) => (
                <div key={s.title}>
                  <Label className="mb-1">{s.title}</Label>
                  {s.fields.map((f) => (
                    <InputField
                      key={f.key}
                      field={f}
                      value={values[f.key]}
                      onChange={onChange}
                      flashing={flash.has(f.key)}
                    />
                  ))}
                </div>
              ))}
              <button
                type="button"
                onClick={onReset}
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded border border-[color:var(--term-border)] bg-[var(--term-alt)] px-3 py-1.5 font-mono text-[11px] transition-colors hover:border-[color:var(--term-gold)]",
                  inkMid,
                )}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reset defaults
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function FairValuePage() {
  const { params: liveParams, flash, extra } = useLiveData();
  const rewardRounds = extra.rewardRounds;

  const [raw, setRaw] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      init[k] = fmtDefault(v);
    }
    return init;
  });

  // Sync live values → form state
  useEffect(() => {
    setRaw((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(liveParams)) {
        if (v !== undefined) next[k] = fmtDefault(v);
      }
      return next;
    });
  }, [liveParams]);

  const handleChange = useCallback(
    (key: keyof FairValueParams, val: string) => {
      setRaw((prev) => ({ ...prev, [key]: val }));
    },
    [],
  );

  const handleReset = useCallback(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      init[k] = fmtDefault(v);
    }
    setRaw(init);
  }, []);

  const params = useMemo<FairValueParams>(() => {
    const p: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      p[k] = parseInput(v, DEFAULTS[k as keyof FairValueParams]);
    }
    // Derive active eligible from canister maturity data
    if (
      rewardRounds &&
      rewardRounds.totalNeurons > 0 &&
      rewardRounds.activeNeurons > 0 &&
      p.goldao_eligible > 0
    ) {
      p.goldao_active_eligible = Math.round(
        p.goldao_eligible *
          (rewardRounds.activeNeurons / rewardRounds.totalNeurons),
      );
    }
    return p as unknown as FairValueParams;
  }, [raw, rewardRounds]);

  const result = useMemo(() => calcular(params), [params]);
  const pctWarning = Math.abs(result.total_pct - 100) > 0.01;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <PageHeader
        tag="Fair value"
        title="GOLDAO vs ICP"
        description="Equilibrium price based on the direct yield paid to stakers."
      />

      <Hero r={result} params={params} />

      {pctWarning && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 font-mono text-xs text-destructive">
          Distribution totals {fmtNum(result.total_pct, 0)}% (should be 100%)
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <YieldPool r={result} />
        <Equilibrium r={result} params={params} />
      </div>

      <Inputs
        values={raw}
        onChange={handleChange}
        flash={flash}
        onReset={handleReset}
      />
    </div>
  );
}
