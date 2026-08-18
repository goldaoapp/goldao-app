import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, type FairValueParams, calcular } from "@/lib/fairvalue-calc";

/* ── Live data (reuses same sources as FairValuePage) ──────────────────── */

const ICPSWAP_API =
  "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/tickers";
const BINANCE_API =
  "https://api.binance.com/api/v3/ticker/price?symbol=ICPUSDT";
const COINGECKO_API =
  "https://api.coingecko.com/api/v3/simple/price?ids=internet-computer,origyn-foundation&vs_currencies=usd";
const DISSOLVE_API =
  "https://api.gldt.org/v1/daos/golddao/neurons/dissolve-delays";
const OGY_NEURON_API =
  "https://sns-api.internetcomputer.org/api/v1/snses/leu43-oiaaa-aaaaq-aadgq-cai/neurons/bf941a42ede5c1513b87375677e30fe6174a5f790be5850290182ebfa3b5f74d";

interface ICPSwapTicker {
  ticker_id: string;
  last_price: string;
}

interface DissolveGroup {
  dissolve_delay_group: string;
  total_stake: number;
}

function validNum(v: number | undefined | null): number | null {
  if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) return v;
  return null;
}

function avg(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

interface HomeStats {
  marketRatio: number | null;
  equilibrium: number | null;
  ogyStaked: number | null;
}

function useHomeStats(): HomeStats {
  const [stats, setStats] = useState<HomeStats>({ marketRatio: null, equilibrium: null, ogyStaked: null });
  const paramsRef = useRef<Partial<FairValueParams>>({});

  const recalc = useCallback(() => {
    const p = paramsRef.current;
    if (!p.market_ratio || !p.price_icp_usd || !p.goldao_eligible) return;
    const full: FairValueParams = { ...DEFAULTS, ...p };
    const r = calcular(full);
    setStats({
      marketRatio: Math.round(p.market_ratio),
      equilibrium: r.ratio_eq > 0 ? Math.round(r.ratio_eq) : null,
      ogyStaked: p.ogy_staked ? Math.round(p.ogy_staked) : null,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchICPSwap() {
      try {
        const res = await fetch(ICPSWAP_API);
        if (!res.ok) return;
        const tickers: ICPSwapTicker[] = await res.json();
        for (const t of tickers) {
          if (t.ticker_id === "k46ek-4qaaa-aaaag-qcyzq-cai") {
            const v = validNum(Number.parseFloat(t.last_price));
            if (v) paramsRef.current.market_ratio = v;
          }
          if (t.ticker_id === "ttnzy-lyaaa-aaaag-qj2bq-cai") {
            const v = validNum(Number.parseFloat(t.last_price));
            if (v && paramsRef.current.price_icp_usd) {
              paramsRef.current.price_ogy_usd = paramsRef.current.price_icp_usd / v;
            }
          }
        }
      } catch (_) { /* silent */ }
    }

    async function fetchLight() {
      try {
        const res = await fetch(DISSOLVE_API);
        if (!res.ok) throw new Error();
        const groups: DissolveGroup[] = await res.json();
        const max = groups.find((g) => g.dissolve_delay_group.includes("max delay"));
        if (max) paramsRef.current.goldao_eligible = Math.round(max.total_stake);
      } catch (_) { /* silent */ }

      let binanceIcp: number | null = null;
      let geckoIcp: number | null = null;

      try {
        const res = await fetch(BINANCE_API);
        if (!res.ok) throw new Error();
        const data: { price: string } = await res.json();
        binanceIcp = validNum(Number.parseFloat(data.price));
      } catch (_) { /* silent */ }

      try {
        const res = await fetch(COINGECKO_API);
        if (!res.ok) throw new Error();
        const data: Record<string, { usd?: number }> = await res.json();
        geckoIcp = validNum(data["internet-computer"]?.usd);
        const ogyPrice = validNum(data["origyn-foundation"]?.usd);
        if (ogyPrice) paramsRef.current.price_ogy_usd = ogyPrice;
      } catch (_) { /* silent */ }

      const icpUsd = avg(binanceIcp, geckoIcp);
      if (icpUsd) paramsRef.current.price_icp_usd = icpUsd;

      // OGY neuron (stake + maturity)
      try {
        const res = await fetch(OGY_NEURON_API);
        if (!res.ok) throw new Error();
        const data: { stake_e8s: number; total_maturity_e8s_equivalent: number } = await res.json();
        const total = (data.stake_e8s + data.total_maturity_e8s_equivalent) / 1e8;
        paramsRef.current.ogy_staked = Math.round(total);
      } catch (_) { /* silent */ }

      if (!cancelled) recalc();
    }

    async function init() {
      await Promise.all([fetchICPSwap(), fetchLight()]);
      if (!cancelled) recalc();
    }
    init();

    const fastId = setInterval(fetchLight, 30_000);
    const slowId = setInterval(async () => {
      await fetchICPSwap();
      if (!cancelled) recalc();
    }, 120_000);

    return () => {
      cancelled = true;
      clearInterval(fastId);
      clearInterval(slowId);
    };
  }, [recalc]);

  return stats;
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const { marketRatio, equilibrium, ogyStaked } = useHomeStats();

  const fmtOgy = ogyStaked !== null
    ? `${(ogyStaked / 1e6).toFixed(1)} M`
    : "—";

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Alpha Banner */}
      <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-center text-sm text-primary font-medium">
        ALPHA VERSION — Data is under development and may be inaccurate.
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
          Your DAO. Your treasury. Fully on-chain.
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
            value={marketRatio !== null ? String(marketRatio) : "—"}
            label="ICP / GOLDAO Ratio"
            accent
          />
          <StatCard
            value={equilibrium !== null ? String(equilibrium) : "—"}
            label="ICP / GOLDAO Equilibrium"
            accent
          />
          <StatCard
            value="442.5 M"
            label="Total Burn"
          />
          <StatCard
            value="557.5 M"
            label="Supply"
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
            accent
          />
          <StatCard
            value={fmtOgy}
            label="OGY"
          />
          <StatCard
            value="6.2 M"
            label="WTN"
          />
        </div>
      </section>

      {/* Quick Stats */}
      <section>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value="12"
            label="Active Proposals"
          />
          <StatCard
            value="1,847"
            label="Members"
          />
          <StatCard
            value="8.2%"
            label="APY Estimate"
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
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-lg border border-primary/15 bg-gradient-to-br from-primary/8 to-primary/2 p-4 sm:p-5 text-center"
          : "rounded-lg border border-border bg-card/50 p-4 sm:p-5 text-center"
      }
    >
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
