import { DEFAULTS, type FairValueParams, calcular } from "@/lib/fairvalue-calc";
import { useLiveData } from "@/lib/use-live-data";
import { Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const { params: liveParams, extra } = useLiveData();

  const stats = useMemo(() => {
    const full: FairValueParams = { ...DEFAULTS, ...liveParams };
    if (!full.market_ratio || !full.price_icp_usd || !full.goldao_eligible) {
      return {
        marketRatio: null,
        equilibrium: null,
        ogyStaked: null,
        apyEfectivo: null,
      };
    }
    const r = calcular(full);
    return {
      marketRatio: Math.round(full.market_ratio),
      equilibrium: r.ratio_eq > 0 ? Math.round(r.ratio_eq) : null,
      ogyStaked: full.ogy_staked > 0 ? Math.round(full.ogy_staked) : null,
      apyEfectivo: r.apy_efectivo > 0 ? r.apy_efectivo.toFixed(1) : null,
    };
  }, [liveParams]);

  const fmtOgy =
    stats.ogyStaked !== null ? `${(stats.ogyStaked / 1e6).toFixed(1)} M` : "—";

  const fmtWtn =
    extra.wtnTotal !== null ? `${(extra.wtnTotal / 1e6).toFixed(1)} M` : "—";

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Alpha Banner */}
      <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-center text-sm text-primary font-medium">
        BETA VERSION — Data is under active development and may be out of date
        or inaccurate.
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center text-center gap-4 py-8 sm:py-12 animate-fade-in-up">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-mono font-medium text-primary tracking-wider uppercase">
          100% On-Chain
        </span>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          <span className="text-gradient-gold">GOLDAO APP</span>
        </h1>
        <p className="font-display text-lg sm:text-xl font-medium text-foreground">
          Your DAO. Your treasury. Real-time.
        </p>
        <p className="max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
          Real-time treasury tracking, governance proposals, rewards simulation,
          and community tools — all 100% on-chain on the Internet Computer.
        </p>
      </section>

      {/* GOLDAO Token Stats */}
      <section>
        <h2 className="font-mono text-[10px] tracking-widest uppercase text-primary mb-3">
          GOLDAO Token
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            value={stats.marketRatio !== null ? String(stats.marketRatio) : "—"}
            label="ICP / GOLDAO Ratio"
            info="Current market rate: how many GOLDAO one ICP buys right now on ICPSwap. A higher number means GOLDAO is cheaper relative to ICP."
            accent
          />
          <StatCard
            value={stats.equilibrium !== null ? String(stats.equilibrium) : "—"}
            label="ICP / GOLDAO Equilibrium"
            info="Break-even ratio: the GOLDAO-per-ICP price at which holding GOLDAO yields the same annual return as staking ICP in the NNS. When the market ratio is above it, GOLDAO is comparatively cheap; below it, staking ICP wins."
            accent
          />
          <StatCard
            value={
              extra.totalBurned !== null
                ? `${(extra.totalBurned / 1e6).toFixed(1)} M`
                : "—"
            }
            label="Total Burn"
            info="Cumulative GOLDAO permanently removed from circulation by the buyback-and-burn canister since launch."
          />
          <StatCard
            value={
              extra.supply !== null
                ? `${(extra.supply / 1e6).toFixed(1)} M`
                : "—"
            }
            label="Supply"
            info="Total GOLDAO tokens currently in existence, net of everything already burned."
          />
        </div>
      </section>

      {/* Treasury Overview */}
      <section>
        <h2 className="font-mono text-[10px] tracking-widest uppercase text-primary mb-3">
          Treasury Overview
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value="580 K"
            label="ICP"
            info="ICP held by the DAO across its NNS neurons — the treasury's core reserve and the source of all reward flows."
            accent
          />
          <StatCard
            value={fmtOgy}
            label="OGY"
            info="An OGY neuron owned by Gold DAO, staked in ORIGYN's SNS."
          />
          <StatCard
            value={fmtWtn}
            label="WTN"
            info="The combined balance of all WTN (Water Neuron) neurons owned by Gold DAO."
          />
        </div>
      </section>

      {/* Quick Stats */}
      <section>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value={
              extra.proposalsActive !== null && extra.proposalsTotal !== null
                ? `${extra.proposalsActive} / ${extra.proposalsTotal}`
                : "—"
            }
            label="Active / Total Proposals"
            info="Currently open SNS governance proposals versus the total ever submitted to the GOLDAO DAO."
          />
          <StatCard
            value={
              extra.members !== null
                ? extra.members.toLocaleString("en-US")
                : "—"
            }
            label="Members"
            info="Number of GOLDAO governance participants — distinct neuron holders in the SNS."
          />
          <StatCard
            value={stats.apyEfectivo !== null ? `${stats.apyEfectivo}%` : "—"}
            label="Effective APY (ICP)"
            info="Estimated annual return for an eligible GOLDAO staker, expressed as ICP-equivalent yield at the current market ratio."
            accent
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  value,
  label,
  info,
  accent = false,
}: {
  value: string;
  label: string;
  info?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`relative rounded-lg p-4 sm:p-5 text-center ${
        accent
          ? "border border-primary/15 bg-gradient-to-br from-primary/8 to-primary/2"
          : "border border-border bg-card/50"
      }`}
    >
      {info && <InfoTip text={info} />}
      <div
        className={`font-mono text-lg sm:text-xl lg:text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-snug">
        {label}
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
      className="absolute right-1.5 top-1.5 z-10"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What does this mean?"
        onClick={() => setOpen((o) => !o)}
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/40 hover:text-primary transition-smooth"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-6 z-20 w-40 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug text-popover-foreground shadow-elevated"
        >
          {text}
        </div>
      )}
    </div>
  );
}
