import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FairValueParams,
  type FairValueResult,
  DEFAULTS,
  calcular,
} from "@/lib/fairvalue-calc";

const DISSOLVE_API =
  "https://api.gldt.org/v1/daos/golddao/neurons/dissolve-delays";
const BINANCE_API =
  "https://api.binance.com/api/v3/ticker/price?symbol=ICPUSDT";
const COINGECKO_API =
  "https://api.coingecko.com/api/v3/simple/price?ids=internet-computer,origyn-foundation&vs_currencies=usd";
const ICPSWAP_API =
  "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/tickers";

const POLL_INTERVAL = 30_000;

interface DissolveGroup {
  dissolve_delay_group: string;
  total_stake: number;
}

interface ICPSwapTicker {
  ticker_id: string;
  ticker_name: string;
  last_price: string;
}

function avg(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

function validNum(v: number | undefined | null): number | null {
  if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) return v;
  return null;
}

function useLiveData(
  onUpdate: (key: keyof FairValueParams, val: number) => void,
): { flash: Set<string> } {
  const [flash, setFlash] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    function triggerFlash(key: string) {
      setFlash((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setFlash((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 1500);
    }

    const decimalsMap: Partial<Record<keyof FairValueParams, number>> = {
      price_icp_usd: 3,
      price_ogy_usd: 6,
      market_ratio: 1,
    };

    function apply(key: keyof FairValueParams, val: number | null) {
      if (!cancelled && val !== null && Number.isFinite(val) && val > 0) {
        const d = decimalsMap[key];
        const rounded = d !== undefined ? Number(val.toFixed(d)) : val;
        onUpdate(key, rounded);
        triggerFlash(key);
      }
    }

    async function fetchAll() {
      // ── 1. Eligible GOLDAO ──
      try {
        const res = await fetch(DISSOLVE_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const groups: DissolveGroup[] = await res.json();
        const max = groups.find((g) =>
          g.dissolve_delay_group.includes("max delay"),
        );
        if (max) apply("goldao_eligible", Math.round(max.total_stake));
      } catch (_) { /* default */ }

      // ── 2. ICPSwap tickers (GOLDAO + OGY pools by canister ID) ──
      let icpswapGoldao: number | null = null;
      let icpswapOgyPerIcp: number | null = null;

      try {
        const res = await fetch(ICPSWAP_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const tickers: ICPSwapTicker[] = await res.json();
        for (const t of tickers) {
          if (t.ticker_id === "k46ek-4qaaa-aaaag-qcyzq-cai") {
            icpswapGoldao = validNum(Number.parseFloat(t.last_price));
          }
          if (t.ticker_id === "ttnzy-lyaaa-aaaag-qj2bq-cai") {
            icpswapOgyPerIcp = validNum(Number.parseFloat(t.last_price));
          }
        }
      } catch (_) { /* fallback */ }

      // ── 3. Market ratio — ICPSwap only ──
      apply("market_ratio", icpswapGoldao);

      // ── 4. ICP price USD — Binance + CoinGecko, average ──
      let binanceIcp: number | null = null;
      let geckoIcp: number | null = null;
      let geckoOgy: number | null = null;

      try {
        const res = await fetch(BINANCE_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { price: string } = await res.json();
        binanceIcp = validNum(Number.parseFloat(data.price));
      } catch (_) { /* fallback */ }

      try {
        const res = await fetch(COINGECKO_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Record<string, { usd?: number }> = await res.json();
        geckoIcp = validNum(data["internet-computer"]?.usd);
        geckoOgy = validNum(data["origyn-foundation"]?.usd);
      } catch (_) { /* fallback */ }

      const icpUsd = avg(binanceIcp, geckoIcp);
      apply("price_icp_usd", icpUsd);

      // ── 5. OGY price USD — CoinGecko + ICPSwap pool ttnzy, average ──
      let icpswapOgyUsd: number | null = null;
      if (icpswapOgyPerIcp !== null && icpUsd !== null) {
        icpswapOgyUsd = icpUsd / icpswapOgyPerIcp;
      }
      apply("price_ogy_usd", avg(geckoOgy, icpswapOgyUsd));
    }

    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onUpdate]);

  return { flash };
}

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

/* ── Input field definitions ─────────────────────────────────────────────── */

type FieldDef = { key: keyof FairValueParams; label: string; unit: string };
type SectionDef = { title: string; fields: FieldDef[] };

/* Live-updated fields shown below the spectrum bar */
const LIVE_FIELDS: FieldDef[] = [
  { key: "market_ratio", label: "Market Ratio (GOLDAO/ICP)", unit: "ratio" },
  { key: "goldao_eligible", label: "Eligible (rewards)", unit: "GOLDAO" },
  { key: "price_ogy_usd", label: "OGY Price", unit: "USD" },
  { key: "price_icp_usd", label: "ICP Price", unit: "USD" },
];

/* Collapsible input sections (without the live fields) */
const COLLAPSIBLE_SECTIONS: SectionDef[] = [
  {
    title: "NNS Neurons (ICP)",
    fields: [
      { key: "icp_staked", label: "ICP Staked", unit: "ICP" },
      { key: "nns_apy", label: "NNS Max APY", unit: "%" },
    ],
  },
  {
    title: "ICP Distribution (33/33/33/1)",
    fields: [
      { key: "pct_stakers", label: "% Stakers (direct ICP)", unit: "%" },
      { key: "pct_gldt", label: "% GLDT Rewards", unit: "%" },
      { key: "pct_burn", label: "% Buyback (treasury)", unit: "%" },
      { key: "pct_cecil", label: "% Good DAO (external)", unit: "%" },
    ],
  },
  {
    title: "OGY Neuron",
    fields: [
      { key: "ogy_staked", label: "OGY Staked", unit: "OGY" },
      { key: "ogy_apy", label: "OGY APY", unit: "%" },
    ],
  },
];

/* ── Components ──────────────────────────────────────────────────────────── */

function InputField({
  field,
  value,
  onChange,
  live,
}: {
  field: FieldDef;
  value: string;
  onChange: (key: keyof FairValueParams, val: string) => void;
  live?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 font-mono flex items-center gap-1.5">
        {field.label}
        {live && (
          <span
            className="inline-block size-1.5 rounded-full bg-[oklch(0.72_0.17_162)] animate-pulse"
            title="Live from API"
          />
        )}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        className={`flex-1 min-w-0 border rounded px-2 py-1.5 text-right text-sm font-mono text-foreground outline-none focus:ring-1 focus:ring-primary/50 transition-colors duration-700 ${
          live
            ? "bg-[oklch(0.72_0.17_162)]/10 border-[oklch(0.72_0.17_162)]/30"
            : "bg-secondary/60 border-border"
        }`}
      />
      <span className="text-[10px] text-muted-foreground font-mono w-12 shrink-0">
        {field.unit}
      </span>
    </label>
  );
}

function CollapsibleInputSection({
  section,
  values,
  onChange,
  flash,
}: {
  section: SectionDef;
  values: Record<string, string>;
  onChange: (key: keyof FairValueParams, val: string) => void;
  flash: Set<string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-secondary/30 transition-colors"
      >
        <h3 className="text-[10px] tracking-widest uppercase text-primary font-mono">
          {section.title}
        </h3>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          role="img"
          aria-label="Toggle section"
          className={`text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M3.5 5.5L7 9l3.5-3.5" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            {section.fields.map((f) => (
              <InputField
                key={f.key}
                field={f}
                value={values[f.key]}
                onChange={onChange}
                live={flash.has(f.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveFieldsRow({
  fields,
  values,
  onChange,
  flash,
}: {
  fields: FieldDef[];
  values: Record<string, string>;
  onChange: (key: keyof FairValueParams, val: string) => void;
  flash: Set<string>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <h3 className="text-[10px] tracking-widest uppercase text-primary font-mono mb-2 flex items-center gap-1.5">
        Live Data
        <span
          className="inline-block size-1.5 rounded-full bg-[oklch(0.72_0.17_162)] animate-pulse"
          title="Auto-updated from APIs"
        />
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        {fields.map((f) => (
          <InputField
            key={f.key}
            field={f}
            value={values[f.key]}
            onChange={onChange}
            live={flash.has(f.key)}
          />
        ))}
      </div>
    </div>
  );
}

function StepCard({
  step,
  title,
  accent = "primary",
  children,
}: {
  step: number;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  const accentClasses: Record<string, { badge: string; title: string }> = {
    primary: {
      badge: "bg-primary text-primary-foreground",
      title: "text-primary",
    },
    teal: {
      badge: "bg-[oklch(0.7_0.12_185)] text-[oklch(0.15_0_0)]",
      title: "text-[oklch(0.7_0.12_185)]",
    },
    purple: {
      badge: "bg-[oklch(0.65_0.18_304)] text-[oklch(0.15_0_0)]",
      title: "text-[oklch(0.65_0.18_304)]",
    },
    green: {
      badge: "bg-[oklch(0.72_0.17_162)] text-[oklch(0.15_0_0)]",
      title: "text-[oklch(0.72_0.17_162)]",
    },
    amber: {
      badge: "bg-[oklch(0.83_0.13_70)] text-[oklch(0.15_0_0)]",
      title: "text-[oklch(0.83_0.13_70)]",
    },
    gold: {
      badge: "gradient-primary text-primary-foreground",
      title: "text-gradient-gold",
    },
    destructive: {
      badge: "bg-destructive text-destructive-foreground",
      title: "text-destructive",
    },
  };
  const cls = accentClasses[accent] ?? accentClasses.primary;

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <span className={`inline-flex items-center justify-center rounded text-xs font-mono font-bold size-6 ${cls.badge}`}>
          {step}
        </span>
        <span className={`text-sm font-display font-semibold ${cls.title}`}>
          {title}
        </span>
      </div>
      <div className="px-4 pb-3 space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  dim,
}: {
  label: string;
  value: string;
  accent?: string;
  dim?: boolean;
}) {
  const colorMap: Record<string, string> = {
    primary: "text-primary",
    teal: "text-[oklch(0.7_0.12_185)]",
    purple: "text-[oklch(0.65_0.18_304)]",
    green: "text-[oklch(0.72_0.17_162)]",
    amber: "text-[oklch(0.83_0.13_70)]",
    gold: "text-gradient-gold",
    destructive: "text-destructive",
  };
  const valColor = dim
    ? "text-muted-foreground"
    : accent
      ? colorMap[accent] ?? "text-foreground"
      : "text-foreground";

  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-xs text-muted-foreground font-mono truncate">{label}</span>
      <span className={`text-sm font-mono font-semibold whitespace-nowrap ${valColor}`}>
        {value}
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
      {children}
    </p>
  );
}

/* ── Spectrum bar — Top hero (option 1b) ──────────────────────────────────── */

function SpectrumBarTop({ r }: { r: FairValueResult }) {
  const eq = r.ratio_eq;
  const mkt = r.market_ratio;
  if (eq <= 0) return null;

  const maxVal = Math.max(eq, mkt) * 1.5;
  const eqPct = Math.min((eq / maxVal) * 100, 95);
  const mktPct = Math.min((mkt / maxVal) * 100, 95);
  const isCheap = mkt > eq;
  const diffPct = Math.abs(((mkt - eq) / eq) * 100);

  return (
    <div
      className="rounded-lg border border-border bg-card/50 overflow-hidden"
      style={{ background: "linear-gradient(180deg, oklch(0.83 0.13 70 / 0.04) 0%, transparent 100%)" }}
    >
      <div className="px-4 sm:px-6 pt-5 pb-4">
        {/* Top row: two big numbers + verdict */}
        <div className="flex items-end justify-between mb-5 flex-wrap gap-4">
          <div className="flex items-end gap-8 sm:gap-10">
            {/* Equilibrium */}
            <div>
              <div className="text-[8px] tracking-[0.1em] uppercase font-mono text-[oklch(0.83_0.13_70)] opacity-70 mb-1">
                Equilibrium
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] sm:text-[32px] font-extrabold font-mono text-[oklch(0.83_0.13_70)] leading-none">
                  {fmtNum(eq, 0)}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">GOLDAO/ICP</span>
              </div>
            </div>
            {/* Market */}
            <div>
              <div className="text-[8px] tracking-[0.1em] uppercase font-mono text-muted-foreground mb-1">
                Market
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[28px] sm:text-[32px] font-extrabold font-mono text-foreground leading-none">
                  {fmtNum(mkt, 0)}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">GOLDAO/ICP</span>
              </div>
            </div>
          </div>
          {/* Verdict badge */}
          <div
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg border text-[11px] font-mono font-semibold ${
              isCheap
                ? "bg-[oklch(0.72_0.17_162)]/6 border-[oklch(0.72_0.17_162)]/10 text-[oklch(0.72_0.17_162)]"
                : "bg-destructive/6 border-destructive/10 text-destructive"
            }`}
          >
            <span
              className={`inline-block size-1.5 rounded-full ${
                isCheap ? "bg-[oklch(0.72_0.17_162)]" : "bg-destructive"
              }`}
            />
            {isCheap ? "CHEAP" : "EXPENSIVE"} +{fmtNum(diffPct, 1)}%
          </div>
        </div>

        {/* Thin track */}
        <div className="relative h-1.5 rounded-full bg-secondary/60 overflow-visible">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(to right, oklch(0.65 0.19 22 / 0.35), oklch(0.5 0.05 160 / 0.03) 45%, oklch(0.72 0.17 162 / 0.35))",
            }}
          />
          {/* EQ tick */}
          <div
            className="absolute -top-[5px] -bottom-[5px] w-0.5 rounded-full bg-[oklch(0.83_0.13_70)]"
            style={{ left: `${eqPct}%` }}
          />
          {/* MKT dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 size-3.5 rounded-full border-2 border-background"
            style={{
              left: `${mktPct}%`,
              transform: "translate(-50%, -50%)",
              background: isCheap ? "oklch(0.72 0.17 162)" : "oklch(0.65 0.19 22)",
              boxShadow: isCheap
                ? "0 0 12px oklch(0.72 0.17 162 / 0.5)"
                : "0 0 12px oklch(0.65 0.19 22 / 0.5)",
              transition: "left 1s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.06em]">EXPENSIVE</span>
          <span className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.06em]">CHEAP</span>
        </div>
      </div>
    </div>
  );
}

/* ── Results panel ───────────────────────────────────────────────────────── */

function Results({
  r,
  params,
}: {
  r: FairValueResult;
  params: FairValueParams;
}) {
  const pctWarning = Math.abs(r.total_pct - 100) > 0.01;

  return (
    <div className="space-y-3">
      {pctWarning && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-mono text-destructive">
          ⚠ Distribution totals {fmtNum(r.total_pct, 0)}% (should be 100%)
        </div>
      )}

      {/* Paso 1 — ICP bruto */}
      <StepCard step={1} title="Gross ICP Generated (NNS)" accent="primary">
        <Row label="▶ Gross ICP / year" value={`${fmtNum(r.icp_gross)} ICP`} accent="primary" />
      </StepCard>

      {/* Paso 2 — Distribución */}
      <StepCard step={2} title="ICP Distribution" accent="teal">
        <Row label="→ Stakers (direct ICP)" value={`${fmtNum(r.icp_stakers)} ICP`} accent="green" />
        <Row label="→ GLDT Rewards" value={`${fmtNum(r.icp_gldt)} ICP`} accent="green" />
        <Row label="→ Buyback (treasury)" value={`${fmtNum(r.icp_burn)} ICP`} dim />
        <Row label="→ Good DAO (external)" value={`${fmtNum(r.icp_cecil)} ICP`} dim />
        <Note>
          Only stakers + GLDT flow to holders as direct yield.
          Buyback and Good DAO are treasury actions — not staker income.
        </Note>
      </StepCard>

      {/* Paso 3 — OGY */}
      <StepCard step={3} title="OGY Neuron → ICP Equivalent" accent="purple">
        <Row label="OGY earned" value={`${fmtNum(r.ogy_rewards, 0)} OGY`} dim />
        <Row label="= USD" value={`$${fmtNum(r.ogy_usd, 0)}`} dim />
        <Row label="▶ OGY → ICP / year" value={`${fmtNum(r.ogy_icp)} ICP`} accent="purple" />
      </StepCard>

      {/* Paso 4 — Yield directo */}
      <StepCard step={4} title="Direct Yield per GOLDAO" accent="gold">
        <Note>(ICP stakers + GLDT + OGY) ÷ eligible GOLDAO</Note>
        <Row label="Direct pool" value={`${fmtNum(r.pool_directo)} ICP`} />
        <Row
          label={`÷ ${fmtNum(params.goldao_eligible / 1e6)}M eligible`}
          value={`${r.yield_directo.toFixed(9)} ICP/GOLDAO`}
          accent="gold"
        />
      </StepCard>

      {/* Paso 5 — APY efectivo */}
      <StepCard step={5} title="Effective APY (at market price)" accent="green">
        <Note>APY = yield per GOLDAO ÷ GOLDAO price in ICP × 100</Note>
        <Row
          label="Effective GOLDAO APY"
          value={`${fmtNum(r.apy_efectivo, 2)}%`}
          accent={r.apy_efectivo >= params.nns_apy ? "green" : "destructive"}
        />
        <Row label="NNS Benchmark APY" value={`${fmtNum(params.nns_apy)}%`} accent="primary" />
      </StepCard>

      {/* Paso 6 — Equilibrio */}
      <StepCard step={6} title="Equilibrium Ratio" accent="amber">
        <Note>price_eq = yield per GOLDAO ÷ APY NNS · ratio = 1 / price_eq</Note>
        <Row
          label="Equilibrium price"
          value={`${r.precio_eq.toFixed(8)} ICP ($${r.precio_eq_usd.toFixed(6)})`}
        />
        <Row
          label="▶ EQUILIBRIUM RATIO"
          value={`1 ICP : ${fmtNum(r.ratio_eq, 0)} GOLDAO`}
          accent="amber"
        />
      </StepCard>


    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function FairValuePage() {
  const [raw, setRaw] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      init[k] = fmtDefault(v);
    }
    return init;
  });

  const applyLive = useCallback((key: keyof FairValueParams, val: number) => {
    setRaw((prev) => ({ ...prev, [key]: fmtDefault(val) }));
  }, []);

  const { flash } = useLiveData(applyLive);

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
    return p as unknown as FairValueParams;
  }, [raw]);

  const result = useMemo(() => calcular(params), [params]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          <span className="text-gradient-gold">Fair Value</span>
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground font-mono mt-1">
          GOLDAO vs ICP — Equilibrium based on direct staker yield
        </p>
      </div>

      {/* Spectrum bar — full width between header and columns */}
      <SpectrumBarTop r={result} />

      {/* Live data fields — full width below bar */}
      <LiveFieldsRow fields={LIVE_FIELDS} values={raw} onChange={handleChange} flash={flash} />

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(340px,1fr)_minmax(400px,1.4fr)] gap-6">
        {/* Inputs — collapsible */}
        <div className="space-y-3">
          {COLLAPSIBLE_SECTIONS.map((s) => (
            <CollapsibleInputSection key={s.title} section={s} values={raw} onChange={handleChange} flash={flash} />
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-border bg-secondary/60 px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-smooth"
            >
              Reset Defaults
            </button>
          </div>
        </div>

        {/* Results */}
        <Results r={result} params={params} />
      </div>
    </div>
  );
}
