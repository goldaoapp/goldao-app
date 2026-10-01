import { DEFAULTS, type FairValueParams, calcular } from "@/lib/fairvalue-calc";
import { nextDistribution } from "@/lib/reward-events";
import { useLiveData } from "@/lib/use-live-data";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import BurnBar from "./BurnBar";

/* ── Terminal tokens (index.css --term-*) ──────────────────────────────── */

const ink = "text-[color:var(--term-ink)]";
const inkMid = "text-[color:var(--term-ink-mid)]";
const inkFaint = "text-[color:var(--term-ink-faint)]";
const gold = "text-[color:var(--term-gold)]";
const panel =
  "rounded-xl border border-[color:var(--term-border)] bg-[var(--term-card)]";

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const { params: liveParams, extra } = useLiveData();

  const stats = useMemo(() => {
    const full: FairValueParams = { ...DEFAULTS, ...liveParams };
    // Inject active eligible from canister data
    if (
      extra.rewardRounds &&
      extra.rewardRounds.totalNeurons > 0 &&
      extra.rewardRounds.activeNeurons > 0 &&
      full.goldao_eligible > 0
    ) {
      full.goldao_active_eligible = Math.round(
        full.goldao_eligible *
          (extra.rewardRounds.activeNeurons / extra.rewardRounds.totalNeurons),
      );
    }
    if (!full.market_ratio || !full.price_icp_usd || !full.goldao_eligible) {
      return {
        marketRatio: null,
        equilibrium: null,
        ogyStaked: null,
        apyEfectivo: null,
      };
    }
    const r = calcular(full);
    const eqRatio = r.ratio_eq_active > 0 ? r.ratio_eq_active : r.ratio_eq;
    const apy = r.apy_active > 0 ? r.apy_active : r.apy_efectivo;
    return {
      marketRatio: Math.round(full.market_ratio),
      equilibrium: eqRatio > 0 ? Math.round(eqRatio) : null,
      ogyStaked: full.ogy_staked > 0 ? Math.round(full.ogy_staked) : null,
      apyEfectivo: apy > 0 ? apy.toFixed(1) : null,
    };
  }, [liveParams, extra.rewardRounds]);

  const fmtOgy =
    stats.ogyStaked !== null ? `${(stats.ogyStaked / 1e6).toFixed(1)}M` : "—";
  const fmtWtn =
    extra.wtnTotal !== null ? `${(extra.wtnTotal / 1e6).toFixed(1)}M` : "—";
  const fmtIcpStaked =
    extra.icpStaked !== null ? `${(extra.icpStaked / 1000).toFixed(1)}K` : "—";

  const next = new Date(nextDistribution());
  const nextLabel = `${next.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · 14:00 UTC`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6 lg:p-10">
      {/* Brand */}
      <div
        className={cn(
          "hidden h-8 items-center gap-2.5 pr-20 font-mono text-xs font-semibold uppercase tracking-[0.2em] md:flex",
          ink,
        )}
      >
        <img src="/logos/goldao.png" alt="" className="size-6 rounded-full" />
        GOLDAO <span className={gold}>App</span>
      </div>

      {/* Hero */}
      <section className="max-w-3xl animate-fade-in-up">
        <p
          className={cn(
            "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] sm:text-[11px]",
            gold,
          )}
        >
          100% On-Chain · Internet Computer
        </p>
        <h1
          className={cn(
            "mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl",
            ink,
          )}
        >
          The on-chain app for GOLDAO holders
        </h1>
        <p className={cn("mt-4 max-w-2xl text-base leading-relaxed", inkMid)}>
          Treasury, burns, rewards and fair value for Gold DAO — read straight
          from the chain, in real time.
        </p>
      </section>

      {/* Burn — the main element */}
      <BurnBar />

      {/* Three panels */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className={cn(panel, "p-5")}>
          <PanelLabel info="Market: how many GOLDAO one ICP buys right now on ICPSwap. Equilibrium: the ratio at which holding GOLDAO yields the same as staking ICP in the NNS. Market above equilibrium = GOLDAO comparatively cheap.">
            Market vs fair value
          </PanelLabel>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className={cn("font-mono text-[11px]", inkMid)}>Market</div>
              <div
                className={cn(
                  "font-display text-3xl font-semibold tabular-nums",
                  gold,
                )}
              >
                {stats.marketRatio ?? "—"}
              </div>
            </div>
            <div>
              <div className={cn("font-mono text-[11px]", inkMid)}>
                Equilibrium
              </div>
              <div
                className={cn(
                  "font-display text-3xl font-semibold tabular-nums",
                  ink,
                )}
              >
                {stats.equilibrium ?? "—"}
              </div>
            </div>
          </div>
          <ZoneBadge
            market={stats.marketRatio}
            equilibrium={stats.equilibrium}
          />
          <div className="mt-4">
            <MiniFairBar
              market={stats.marketRatio}
              equilibrium={stats.equilibrium}
            />
          </div>
          <div className="mt-3">
            <KV
              k="ICP / GOLDAO Ratio"
              v={stats.marketRatio !== null ? String(stats.marketRatio) : "—"}
            />
            <KV
              k="ICP / GOLDAO Equilibrium"
              v={stats.equilibrium !== null ? String(stats.equilibrium) : "—"}
            />
            <KV
              k="Effective APY (ICP)"
              v={stats.apyEfectivo !== null ? `${stats.apyEfectivo}%` : "—"}
              strong
            />
          </div>
        </div>

        <div className={cn(panel, "p-5")}>
          <PanelLabel info="Assets held by Gold DAO: the NNS neuron (source of all ICP rewards), the OGY neuron staked in ORIGYN's SNS and the WTN neurons in WaterNeuron.">
            Treasury Overview
          </PanelLabel>
          <div className="mt-2">
            <KV icon="/logos/icp.png" k="ICP · NNS neuron" v={fmtIcpStaked} />
            <KV icon="/logos/ogy.png" k="OGY · ORIGYN" v={fmtOgy} />
            <KV
              icon="/logos/wtn.png"
              iconFallback="W"
              k="WTN · WaterNeuron"
              v={fmtWtn}
            />
          </div>
        </div>

        <div className={cn(panel, "p-5")}>
          <PanelLabel info="SNS governance: open proposals vs all ever submitted, distinct neuron holders, and the next weekly ICP/OGY reward distribution.">
            Governance
          </PanelLabel>
          <div className="mt-2">
            <KV
              k="Active / Total Proposals"
              v={
                extra.proposalsActive !== null && extra.proposalsTotal !== null
                  ? `${extra.proposalsActive} / ${extra.proposalsTotal}`
                  : "—"
              }
            />
            <KV
              k="Members"
              v={
                extra.members !== null
                  ? extra.members.toLocaleString("en-US")
                  : "—"
              }
            />
            <KV k="Next rewards" v={nextLabel} strong />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function PanelLabel({
  children,
  info,
}: {
  children: React.ReactNode;
  info?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
          inkMid,
        )}
      >
        {children}
      </span>
      {info && <InfoTip text={info} />}
    </div>
  );
}

function KV({
  k,
  v,
  strong,
  icon,
  iconFallback,
}: {
  k: string;
  v: string;
  strong?: boolean;
  icon?: string;
  iconFallback?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[color:var(--term-border-faint)] py-2.5 first:border-t-0">
      <span
        className={cn(
          "flex min-w-0 items-center gap-2 font-mono text-[13px]",
          inkMid,
        )}
      >
        {icon &&
          (broken ? (
            iconFallback && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--term-gold-soft)] font-mono text-[10px] font-bold text-[color:var(--term-gold)]">
                {iconFallback}
              </span>
            )
          ) : (
            <img
              src={icon}
              alt=""
              className="size-5 shrink-0 rounded-full"
              onError={() => setBroken(true)}
            />
          ))}
        <span className="truncate">{k}</span>
      </span>
      <span
        className={cn(
          "whitespace-nowrap font-mono text-[14px] tabular-nums",
          strong ? cn(gold, "font-semibold") : ink,
        )}
      >
        {v}
      </span>
    </div>
  );
}

/** Dynamic verdict: same thresholds as the Fair Value page (±10% / ±20%). */
function ZoneBadge({
  market,
  equilibrium,
}: {
  market: number | null;
  equilibrium: number | null;
}) {
  if (!market || !equilibrium) return null;
  const dif = ((market - equilibrium) / equilibrium) * 100;
  const zone =
    dif > 20
      ? {
          label: "Cheap",
          cls: "border-[oklch(0.5_0.14_162)]/40 bg-[oklch(0.5_0.14_162)]/12 text-[oklch(0.42_0.12_162)] dark:text-[oklch(0.76_0.16_162)]",
        }
      : dif > 10
        ? {
            label: "Slightly cheap",
            cls: "border-[oklch(0.55_0.14_140)]/40 bg-[oklch(0.55_0.14_140)]/12 text-[oklch(0.42_0.12_140)] dark:text-[oklch(0.76_0.13_140)]",
          }
        : dif >= -10
          ? {
              label: "Fair value",
              cls: "border-[oklch(0.62_0.13_75)]/40 bg-[oklch(0.62_0.13_75)]/12 text-[oklch(0.48_0.1_75)] dark:text-[oklch(0.83_0.13_70)]",
            }
          : dif >= -20
            ? {
                label: "Slightly expensive",
                cls: "border-[oklch(0.6_0.16_50)]/40 bg-[oklch(0.6_0.16_50)]/12 text-[oklch(0.5_0.14_50)] dark:text-[oklch(0.78_0.13_55)]",
              }
            : {
                label: "Expensive",
                cls: "border-[oklch(0.55_0.2_25)]/40 bg-[oklch(0.55_0.2_25)]/12 text-[oklch(0.5_0.19_25)] dark:text-[oklch(0.72_0.17_22)]",
              };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wider",
          zone.cls,
        )}
      >
        <span className="inline-block size-1.5 rounded-full bg-current" />
        {zone.label}
      </span>
      <span className={cn("font-mono text-xs", inkMid)}>
        {dif >= 0 ? "+" : ""}
        {dif.toFixed(1)}% vs equilibrium · GOLDAO/ICP
      </span>
    </div>
  );
}

/** Same zones as the Fair Value page: ±10% fair, ±20% slightly, beyond. */
function MiniFairBar({
  market,
  equilibrium,
}: {
  market: number | null;
  equilibrium: number | null;
}) {
  if (!market || !equilibrium) {
    return <div className="h-2 rounded-full bg-[var(--term-border-faint)]" />;
  }
  const min = equilibrium * 0.65;
  const max = equilibrium * 1.35;
  const toPct = (v: number) =>
    Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const bands = [
    {
      from: min,
      to: equilibrium * 0.8,
      cls: "bg-[oklch(0.58_0.2_25)] dark:bg-[oklch(0.65_0.19_22)]",
    },
    {
      from: equilibrium * 0.8,
      to: equilibrium * 0.9,
      cls: "bg-[oklch(0.66_0.16_50)] dark:bg-[oklch(0.75_0.14_55)]",
    },
    {
      from: equilibrium * 0.9,
      to: equilibrium * 1.1,
      cls: "bg-[oklch(0.7_0.13_80)] dark:bg-[oklch(0.83_0.13_70)]",
    },
    {
      from: equilibrium * 1.1,
      to: equilibrium * 1.2,
      cls: "bg-[oklch(0.62_0.14_140)] dark:bg-[oklch(0.72_0.13_140)]",
    },
    {
      from: equilibrium * 1.2,
      to: max,
      cls: "bg-[oklch(0.55_0.14_162)] dark:bg-[oklch(0.72_0.17_162)]",
    },
  ];
  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-full bg-[var(--term-border-faint)]">
        {bands.map((b) => (
          <div
            key={b.from}
            className={cn(
              "absolute inset-y-0 opacity-60 dark:opacity-40",
              b.cls,
            )}
            style={{
              left: `${toPct(b.from)}%`,
              width: `${toPct(b.to) - toPct(b.from)}%`,
            }}
          />
        ))}
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--term-ink)]"
          style={{ left: `${toPct(equilibrium)}%` }}
        />
      </div>
      <div className="relative -mt-3 h-4">
        <span
          className="absolute top-0 size-4 -translate-x-1/2 rounded-full border-2 border-white bg-[var(--term-gold)] shadow dark:border-[#1c1e22]"
          style={{ left: `${toPct(market)}%` }}
          title={`Market ${market}`}
        />
      </div>
      <div
        className={cn(
          "flex justify-between font-mono text-[9px] uppercase tracking-wider",
          inkFaint,
        )}
      >
        <span>Expensive</span>
        <span>Cheap</span>
      </div>
    </div>
  );
}

/* Small info affordance: opens on hover (desktop) and on tap (mobile). */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative z-10"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What does this mean?"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full transition-smooth hover:text-[color:var(--term-gold)]",
          inkFaint,
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-6 z-20 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug text-popover-foreground shadow-elevated"
        >
          {text}
        </div>
      )}
    </div>
  );
}
