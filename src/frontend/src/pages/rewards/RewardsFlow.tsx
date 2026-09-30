import { useEffect, useMemo, useState } from "react";

import { type FlowBalances, fetchFlowBalances } from "@/lib/flow-data";
import { type IcpNeuronTotals, fetchIcpNeuronTotals } from "@/lib/icp-neuron";
import {
  BUYBACK_LABEL,
  type BuybackMode,
  type ParsedPipeline,
  SPAWN_DISSOLVE_DAYS,
  SPAWN_LIMIT_ICP,
  buildPipeline,
  fetchLogs,
  nextDistribution,
  nextGldtDistribution,
} from "@/lib/reward-events";
import { cn } from "@/lib/utils";

/*
 * Reward Flow — terminal-style view of the ICP reward pipeline.
 * Colors come from the --term-* tokens in index.css (same values as
 * CreamTerminals), so the panel follows light / dark automatically.
 */

const DAO_NEURON_ID = "7446549063176501841";
const MIN_CYCLE_ICP = 1000;
const MIN_GOLDAO_PER_ICP = 500;
const MIN_OGY_PER_ICP = 1000;
const BUYBACK_RATE = 0.0238; // Rate(2_380_950) per run
const FALLBACK_APY = 0.0815;
const SPLIT_STAKERS = 0.33;
const DAY_MS = 86_400_000;

const FLOW_KEYFRAMES = `
@keyframes termDot{0%{top:-8px;opacity:0}15%{opacity:1}85%{opacity:1}100%{top:100%;opacity:0}}
@keyframes termPulse{0%,100%{opacity:1}50%{opacity:0.35}}
`;

/* ── Formatting ─────────────────────────────────────────────────────────── */

function num(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  const d = Math.abs(v) >= 1000 ? 0 : digits;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function compact(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(2);
}

function utcSlot(ts: number): string {
  const d = new Date(ts);
  const day = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${day} · ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/* ── Building blocks ────────────────────────────────────────────────────── */

const ink = "text-[color:var(--term-ink)]";
const inkMid = "text-[color:var(--term-ink-mid)]";
const inkFaint = "text-[color:var(--term-ink-faint)]";
const gold = "text-[color:var(--term-gold)]";

function Label({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
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

function Stage({
  index,
  title,
  note,
}: { index: string; title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2">
      <span
        className={cn(
          "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
          inkFaint,
        )}
      >
        <span className={gold}>{index}</span> · {title}
      </span>
      {note && (
        <span
          className={cn("hidden font-mono text-[10px] sm:inline", inkFaint)}
        >
          {note}
        </span>
      )}
    </div>
  );
}

function Cell({
  children,
  className,
  dashed,
}: {
  children: React.ReactNode;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-[var(--term-card)] p-4 sm:p-5",
        dashed ? "border-dashed" : "border-solid",
        "border-[color:var(--term-border)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function BigValue({
  value,
  unit,
  className,
}: { value: string; unit?: string; className?: string }) {
  return (
    <div
      className={cn(
        "mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-[28px]",
        ink,
        className,
      )}
    >
      {value}
      {unit && (
        <span className={cn("ml-1.5 font-mono text-sm font-medium", inkMid)}>
          {unit}
        </span>
      )}
    </div>
  );
}

function Connector({
  animate,
  delay = 0,
}: { animate: boolean; delay?: number }) {
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <div className="relative h-8 w-px overflow-hidden bg-[var(--term-border)]">
        {animate && (
          <span
            className="absolute left-[-1.5px] h-2 w-1 rounded-full bg-[var(--term-gold)]"
            style={{ animation: `termDot 1.8s linear ${delay}s infinite` }}
          />
        )}
      </div>
    </div>
  );
}

function StatusChip({
  tone,
  children,
  pulse,
}: {
  tone: "ok" | "warn" | "idle" | "gold";
  children: React.ReactNode;
  pulse?: boolean;
}) {
  const tones = {
    ok: "border-[color:var(--term-green-border)] bg-[var(--term-green-bg)] text-[color:var(--term-green)]",
    warn: "border-[color:var(--term-warn)] bg-[var(--term-warn-bg)] text-[color:var(--term-warn)]",
    idle: "border-[color:var(--term-border)] text-[color:var(--term-ink-faint)]",
    gold: "border-[color:var(--term-border)] bg-[var(--term-gold-soft)] text-[color:var(--term-gold)]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        tones[tone],
      )}
    >
      {tone !== "idle" && (
        <span
          className="inline-block size-1.5 rounded-full bg-current"
          style={
            pulse
              ? { animation: "termPulse 2s ease-in-out infinite" }
              : undefined
          }
        />
      )}
      {children}
    </span>
  );
}

function Row({
  k,
  v,
  strong,
}: { k: React.ReactNode; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[color:var(--term-border-faint)] py-2 first:border-t-0">
      <span className={cn("font-mono text-[11px]", inkMid)}>{k}</span>
      <span
        className={cn(
          "text-right font-mono text-[12px] tabular-nums",
          strong ? gold : ink,
          strong && "font-semibold",
        )}
      >
        {v}
      </span>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--term-border-faint)]"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full bg-[var(--term-gold)] transition-[width] duration-700"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

/* ── Branch card ────────────────────────────────────────────────────────── */

function Branch({
  logo,
  name,
  share,
  children,
  highlight,
}: {
  logo?: string;
  name: string;
  share: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border bg-[var(--term-card)]",
        highlight
          ? "border-[color:var(--term-gold)]"
          : "border-[color:var(--term-border)]",
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-[color:var(--term-border)] bg-[var(--term-header)] px-4 py-3">
        {logo ? (
          <img src={logo} alt="" className="size-5 rounded-sm" />
        ) : (
          <span className="flex size-5 items-center justify-center rounded-sm bg-[var(--term-gold-soft)] font-mono text-[10px] font-bold text-[color:var(--term-gold)]">
            G
          </span>
        )}
        <span
          className={cn(
            "flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]",
            ink,
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            "font-display text-lg font-semibold tabular-nums",
            gold,
          )}
        >
          {share}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
    </div>
  );
}

function CascadeRow({
  step,
  title,
  rule,
  live,
  active,
  extra,
}: {
  step: number;
  title: string;
  rule: string;
  live?: string;
  active: boolean;
  extra?: string;
}) {
  return (
    <div
      className={cn(
        "rounded border px-3 py-2.5 transition-colors",
        active
          ? "border-[color:var(--term-green-border)] bg-[var(--term-green-bg)]"
          : "border-[color:var(--term-border-faint)] bg-transparent",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-[10px] tabular-nums", inkFaint)}>
          {step}
        </span>
        <span
          className={cn(
            "flex-1 truncate text-[13px] font-semibold",
            active ? ink : inkMid,
          )}
        >
          {title}
        </span>
        <StatusChip tone={active ? "ok" : "idle"} pulse={active}>
          {active ? "Active" : "Standby"}
        </StatusChip>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 pl-4 font-mono text-[11px]">
        <span className={inkFaint}>{rule}</span>
        {live && (
          <span
            className={cn(
              "tabular-nums",
              active ? "text-[color:var(--term-green)]" : inkMid,
            )}
          >
            {live}
          </span>
        )}
      </div>
      {extra && (
        <div className={cn("mt-0.5 pl-4 font-mono text-[11px]", inkFaint)}>
          {extra}
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

export default function RewardsFlow() {
  // Animations always on (product choice, see previous version).
  const animate = true;
  const [bal, setBal] = useState<FlowBalances | null>(null);
  const [neuron, setNeuron] = useState<IcpNeuronTotals | null>(null);
  const [pipeline, setPipeline] = useState<ParsedPipeline | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = "rewards-flow-keyframes-v2";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = FLOW_KEYFRAMES;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const logs = Promise.all([
      fetchLogs("icp_neuron").catch(() => undefined),
      fetchLogs("buyback_burn").catch(() => undefined),
    ]).then(([icp_neuron, buyback_burn]) =>
      buildPipeline({ icp_neuron, buyback_burn }),
    );

    Promise.all([fetchFlowBalances(), fetchIcpNeuronTotals(), logs]).then(
      ([b, n, p]) => {
        if (cancelled) return;
        setBal(b);
        setNeuron(n);
        setPipeline(p);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    const now = Date.now();
    const lastSpawn = pipeline?.lastSpawn;
    const lastDisburse = pipeline?.lastDisburse;
    const inFlight =
      lastSpawn && (!lastDisburse || lastSpawn.ts > lastDisburse.ts)
        ? lastSpawn
        : undefined;

    // Maturity accrual: measured since the last spawn (maturity resets to ~0),
    // otherwise estimated from stake × APY.
    let ratePerDay: number | null = null;
    let rateMeasured = false;
    if (neuron && lastSpawn && now - lastSpawn.ts > DAY_MS / 2) {
      ratePerDay = neuron.maturity / ((now - lastSpawn.ts) / DAY_MS);
      rateMeasured = true;
    } else if (neuron) {
      ratePerDay = (neuron.staked * FALLBACK_APY) / 365;
    }
    const remaining = neuron
      ? Math.max(0, SPAWN_LIMIT_ICP - neuron.maturity)
      : null;
    const daysToSpawn =
      remaining != null && ratePerDay ? remaining / ratePerDay : null;

    // Buyback cascade: live ICPSwap quote for 1 ICP (same check as the
    // canister); falls back to the last run seen in the logs.
    const lastRun = pipeline?.buybackRuns
      .filter((r) => r.mode !== "gldt")
      .at(-1);
    const lastGldtRun = pipeline?.buybackRuns
      .filter((r) => r.mode === "gldt")
      .at(-1);
    let mode: BuybackMode | null = null;
    if (bal?.goldaoRatio != null && bal.ogyRatio != null) {
      mode =
        bal.goldaoRatio >= MIN_GOLDAO_PER_ICP
          ? "goldao"
          : bal.ogyRatio >= MIN_OGY_PER_ICP
            ? "ogy"
            : "compound";
    } else if (lastRun) {
      mode = lastRun.mode;
    }

    const incoming = inFlight ? SPAWN_LIMIT_ICP * SPLIT_STAKERS : null;
    return {
      inFlight,
      eta: inFlight ? inFlight.ts + SPAWN_DISSOLVE_DAYS * DAY_MS : null,
      ratePerDay,
      rateMeasured,
      daysToSpawn,
      mode,
      lastRun,
      lastGldtRun,
      incoming,
      nextRound: nextDistribution(now),
      nextGldt: nextGldtDistribution(now),
    };
  }, [bal, neuron, pipeline]);

  const cycleOk = bal?.cycle != null ? bal.cycle >= MIN_CYCLE_ICP : null;
  const maturityPct = neuron ? (neuron.maturity / SPAWN_LIMIT_ICP) * 100 : 0;
  const today = new Date()
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase();

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        How ICP maturity from the DAO&apos;s NNS neuron moves through the split,
        the buyback cascade and the GLDT job on its way to stakers. Percentages
        and price rules are fixed by governance; balances are read on-chain when
        the tab opens.
      </p>

      <section
        className="relative overflow-hidden rounded-xl border border-[color:var(--term-border)] backdrop-blur-[2px]"
        aria-label="Reward flow"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--term-border)] px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/logos/goldao.png"
              alt=""
              className="size-7 rounded-full"
            />
            <span
              className={cn(
                "font-mono text-sm font-semibold uppercase tracking-[0.18em] sm:text-base",
                ink,
              )}
            >
              Reward <span className={gold}>Flow</span>
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
                loaded ? "bg-[var(--term-gold)]" : "bg-[var(--term-ink-faint)]",
              )}
              style={
                loaded
                  ? undefined
                  : { animation: "termPulse 1.2s ease-in-out infinite" }
              }
            />
            {loaded ? `LIVE · ${today}` : "LOADING"}
          </span>
        </header>

        <div className="flex flex-col px-4 py-6 sm:px-8 sm:py-8">
          {/* 01 — Source */}
          <Stage index="01" title="Source" note="icp_neuron · daily job" />
          <div className="grid gap-3 md:grid-cols-2">
            <Cell>
              <div className="flex items-start justify-between gap-3">
                <Label>NNS neuron · staked</Label>
                <img src="/logos/icp.png" alt="" className="size-5" />
              </div>
              <BigValue value={num(neuron?.staked, 0)} unit="ICP" />
              <div className={cn("mt-2 font-mono text-[11px]", inkFaint)}>
                {neuron && neuron.count > 1
                  ? `${neuron.count} neurons`
                  : `Neuron ${DAO_NEURON_ID.slice(0, 4)}…${DAO_NEURON_ID.slice(-4)}`}{" "}
                · generates maturity every day
              </div>
            </Cell>

            <Cell>
              <div className="flex items-start justify-between gap-3">
                <Label>Maturity → next spawn</Label>
                {view.daysToSpawn != null && (
                  <StatusChip tone="gold">
                    {view.daysToSpawn < 1
                      ? "< 1 day"
                      : `≈ ${view.daysToSpawn.toFixed(1)} days`}
                  </StatusChip>
                )}
              </div>
              <BigValue
                value={num(neuron?.maturity)}
                unit={`/ ${num(SPAWN_LIMIT_ICP, 0)} ICP`}
              />
              <ProgressBar pct={maturityPct} />
              <div
                className={cn(
                  "mt-2 flex justify-between gap-2 font-mono text-[11px]",
                  inkFaint,
                )}
              >
                <span>
                  {neuron
                    ? `${num(Math.max(0, SPAWN_LIMIT_ICP - neuron.maturity))} ICP to go`
                    : "—"}
                </span>
                {view.ratePerDay != null && (
                  <span>
                    {view.rateMeasured ? "" : "est. "}
                    {num(view.ratePerDay, 1)} ICP/day
                  </span>
                )}
              </div>
            </Cell>
          </div>

          {view.inFlight && view.eta && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[color:var(--term-border)] bg-[var(--term-alt)] px-4 py-2.5">
              <span className={cn("font-mono text-[11px]", inkMid)}>
                Spawned {shortDate(view.inFlight.ts)} · dissolving{" "}
                {SPAWN_DISSOLVE_DAYS} days
              </span>
              <StatusChip tone="gold" pulse>
                {view.eta > Date.now()
                  ? `Disburses ~${shortDate(view.eta)}`
                  : "Disbursal due"}
              </StatusChip>
            </div>
          )}

          <Connector animate={animate} />

          {/* 02 — Pre-split check */}
          <Stage index="02" title="Pre-split check" note="before every split" />
          <Cell dashed>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Label>Cycle management account</Label>
                <BigValue value={num(bal?.cycle)} unit="ICP" />
              </div>
              {cycleOk === null ? (
                <StatusChip tone="idle">Unavailable</StatusChip>
              ) : cycleOk ? (
                <StatusChip tone="ok">≥ 1,000 · no diversion</StatusChip>
              ) : (
                <StatusChip tone="warn" pulse>
                  &lt; 1,000 · next disbursal diverted
                </StatusChip>
              )}
            </div>
            {bal?.cycle != null && (
              <ProgressBar
                pct={Math.min(100, (bal.cycle / (MIN_CYCLE_ICP * 1.5)) * 100)}
              />
            )}
            <p
              className={cn(
                "mt-2 font-mono text-[11px] leading-relaxed",
                inkFaint,
              )}
            >
              If this balance drops below {num(MIN_CYCLE_ICP, 0)} ICP, one whole
              disbursed neuron is sent here to fund canister cycles before the
              33/33/33/1 split.
              {cycleOk &&
                bal?.cycle != null &&
                ` Margin: ${num(bal.cycle - MIN_CYCLE_ICP)} ICP.`}
            </p>
          </Cell>

          <Connector animate={animate} delay={0.4} />

          {/* 03 — Split */}
          <Stage
            index="03"
            title="Split"
            note="proposal #341 · 33 / 33 / 33 / 1"
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.3fr_1fr_0.8fr]">
            <Branch logo="/logos/icp.png" name="Stakers" share="33%">
              <div>
                <Label>ICP reward pool</Label>
                <BigValue value={num(bal?.rewards)} unit="ICP" />
                {view.incoming != null && (bal?.rewards ?? 0) < 1 && (
                  <div className="mt-1.5 font-mono text-[11px] text-[color:var(--term-gold)]">
                    ≈ {num(view.incoming, 0)} ICP incoming from the spawn in
                    flight
                  </div>
                )}
              </div>
              <div>
                <Row k="OGY pool" v={`${compact(bal?.poolOgy)} OGY`} />
                <Row k="GLDT pool" v={`${compact(bal?.poolGldt)} GLDT`} />
                <Row k="Next round" v={utcSlot(view.nextRound)} strong />
                <Row k="Next GLDT" v={utcSlot(view.nextGldt)} />
              </div>
              <p className={cn("mt-auto font-mono text-[11px]", inkFaint)}>
                Paid by maturity gained · 2-yr lock, not dissolving
              </p>
            </Branch>

            <Branch
              logo="/logos/goldao.png"
              name="Buyback"
              share="33%"
              highlight
            >
              <div>
                <Label>ICP available</Label>
                <BigValue value={num(bal?.buyback)} unit="ICP" />
                {bal?.buyback != null && (
                  <div className={cn("mt-1.5 font-mono text-[11px]", inkFaint)}>
                    ≈ {num(bal.buyback * BUYBACK_RATE)} ICP per run (2.38%)
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <CascadeRow
                  step={1}
                  title="Burn GOLDAO"
                  rule={`≥ ${MIN_GOLDAO_PER_ICP} per ICP`}
                  live={
                    bal?.goldaoRatio != null
                      ? num(bal.goldaoRatio, 0)
                      : undefined
                  }
                  active={view.mode === "goldao"}
                />
                <CascadeRow
                  step={2}
                  title="Stake OGY"
                  rule={`≥ ${num(MIN_OGY_PER_ICP, 0)} per ICP`}
                  live={
                    bal?.ogyRatio != null ? num(bal.ogyRatio, 0) : undefined
                  }
                  active={view.mode === "ogy"}
                  extra={
                    bal?.ogyStaked != null
                      ? `Staked: ${compact(bal.ogyStaked)} OGY`
                      : undefined
                  }
                />
                <CascadeRow
                  step={3}
                  title="Compound ICP"
                  rule="Fallback"
                  active={view.mode === "compound"}
                  extra={`Stakes into neuron ${DAO_NEURON_ID.slice(0, 4)}…${DAO_NEURON_ID.slice(-4)}`}
                />
              </div>
              <div className={cn("mt-auto font-mono text-[11px]", inkFaint)}>
                {view.lastRun ? (
                  <>
                    Last run: {BUYBACK_LABEL[view.lastRun.mode]}
                    {view.lastRun.icp > 0 && ` · ${num(view.lastRun.icp)} ICP`}{" "}
                    · {ago(view.lastRun.ts)}
                  </>
                ) : (
                  "Runs every ~4 h · first rule that passes wins"
                )}
              </div>
            </Branch>

            <Branch logo="/logos/gldt.png" name="GLDT" share="33%">
              <div>
                <Label>ICP available</Label>
                <BigValue value={num(bal?.gldt)} unit="ICP" />
              </div>
              <div>
                <Row k="Price check" v="None" />
                <Row
                  k="Last buy"
                  v={
                    view.lastGldtRun
                      ? `${num(view.lastGldtRun.icp)} ICP · ${ago(view.lastGldtRun.ts)}`
                      : "—"
                  }
                />
                <Row k="Paid out" v={utcSlot(view.nextGldt)} strong />
              </div>
              <p className={cn("mt-auto font-mono text-[11px]", inkFaint)}>
                Buys GLDT every run (rate × balance), distributed the first
                Wednesday of each month
              </p>
            </Branch>

            <Branch name="Good DAO" share="1%">
              <div>
                <Label>Per disbursal</Label>
                <BigValue
                  value={`≈ ${num(SPAWN_LIMIT_ICP * 0.01, 0)}`}
                  unit="ICP"
                />
                <div className={cn("mt-1.5 font-mono text-[11px]", inkFaint)}>
                  per {num(SPAWN_LIMIT_ICP, 0)} ICP spawn
                </div>
              </div>
              <p className={cn("mt-auto font-mono text-[11px]", inkFaint)}>
                External charity wallet · sent directly
              </p>
            </Branch>
          </div>
        </div>

        {/* Footer */}
        <footer
          className={cn(
            "border-t border-[color:var(--term-border)] px-5 py-3 text-center font-mono text-[10px] tracking-[0.08em] sm:px-8",
            inkMid,
          )}
        >
          icp_neuron → sns_rewards · buyback_burn · GLDT job · Balances from the
          ICP ledger · Quotes from ICPSwap
        </footer>
      </section>
    </div>
  );
}
