import {
  DEFAULTS,
  type FairValueParams,
  type FairValueResult,
  calcular,
} from "@/lib/fairvalue-calc";
import { useLiveData } from "@/lib/use-live-data";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

const LIVE_FIELDS: FieldDef[] = [
  { key: "market_ratio", label: "Market Ratio (GOLDAO/ICP)", unit: "ratio" },
  { key: "goldao_eligible", label: "Eligible (rewards)", unit: "GOLDAO" },
  { key: "ogy_staked", label: "OGY Staked", unit: "OGY" },
  { key: "price_ogy_usd", label: "OGY Price", unit: "USD" },
  { key: "price_icp_usd", label: "ICP Price", unit: "USD" },
  { key: "wtn_total", label: "WTN Total", unit: "WTN" },
  { key: "wtn_per_icp", label: "WTN/ICP Ratio", unit: "ratio" },
];

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
      {
        key: "pct_burn",
        label: "% Buyback / Auto-Compound ICP (treasury)",
        unit: "%",
      },
      { key: "pct_cecil", label: "% Good DAO (external)", unit: "%" },
    ],
  },
  {
    title: "OGY Neuron",
    fields: [{ key: "ogy_apy", label: "OGY APY", unit: "%" }],
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
        <span
          className={`inline-flex items-center justify-center rounded text-xs font-mono font-bold size-6 ${cls.badge}`}
        >
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
      ? (colorMap[accent] ?? "text-foreground")
      : "text-foreground";

  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-xs text-muted-foreground font-mono truncate">
        {label}
      </span>
      <span
        className={`text-sm font-mono font-semibold whitespace-nowrap ${valColor}`}
      >
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

/* ── Spectrum bar ────────────────────────────────────────────────────────── */

function SpectrumBarTop({ r }: { r: FairValueResult }) {
  const eq = r.ratio_eq;
  const mkt = r.market_ratio;
  if (eq <= 0 || mkt <= 0) return null;
  const maxVal = Math.max(eq, mkt) * 1.5;
  const pct = (v: number) => Math.min((v / maxVal) * 100, 98);
  const isCheap = mkt > eq;
  const dif = Math.abs(r.diferencia_pct);

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-baseline gap-6">
          <div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              Equilibrium
            </span>
            <p className="text-2xl font-mono font-bold text-foreground">
              {fmtNum(eq, 0)}
              <span className="text-xs text-muted-foreground ml-1">
                GOLDAO/ICP
              </span>
            </p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              Market
            </span>
            <p className="text-2xl font-mono font-bold text-foreground">
              {fmtNum(mkt, 0)}
              <span className="text-xs text-muted-foreground ml-1">
                GOLDAO/ICP
              </span>
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-mono font-semibold px-2 py-1 rounded ${
            isCheap
              ? "text-[oklch(0.72_0.17_162)] bg-[oklch(0.72_0.17_162)]/10"
              : "text-destructive bg-destructive/10"
          }`}
        >
          ● {isCheap ? "CHEAP" : "EXPENSIVE"} {isCheap ? "+" : "-"}
          {fmtNum(dif, 1)}%
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-secondary/60 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, oklch(0.65 0.19 22), oklch(0.72 0.17 162))",
            opacity: 0.35,
          }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${pct(eq)}%`, background: "oklch(0.83 0.13 70)" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full border-2"
          style={{
            left: `${pct(mkt)}%`,
            transform: "translate(-50%, -50%)",
            background: isCheap
              ? "oklch(0.72 0.17 162)"
              : "oklch(0.65 0.19 22)",
            borderColor: isCheap
              ? "oklch(0.72 0.17 162)"
              : "oklch(0.65 0.19 22)",
          }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] font-mono text-muted-foreground">
          EXPENSIVE
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          CHEAP
        </span>
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

      <StepCard step={1} title="Gross ICP Generated (NNS)" accent="primary">
        <Row
          label="▶ Gross ICP / year"
          value={`${fmtNum(r.icp_gross)} ICP`}
          accent="primary"
        />
      </StepCard>

      <StepCard step={2} title="ICP Distribution" accent="teal">
        <Row
          label="→ Stakers (direct ICP)"
          value={`${fmtNum(r.icp_stakers)} ICP`}
          accent="green"
        />
        <Row
          label="→ GLDT Rewards"
          value={`${fmtNum(r.icp_gldt)} ICP`}
          accent="green"
        />
        <Row
          label="→ Buyback (treasury)"
          value={`${fmtNum(r.icp_burn)} ICP`}
          dim
        />
        <Row
          label="→ Good DAO (external)"
          value={`${fmtNum(r.icp_cecil)} ICP`}
          dim
        />
        <Note>
          Only stakers + GLDT flow to holders as direct yield. Buyback and Good
          DAO are treasury actions — not staker income.
        </Note>
      </StepCard>

      <StepCard step={3} title="OGY Neuron → ICP Equivalent" accent="purple">
        <Row label="OGY earned" value={`${fmtNum(r.ogy_rewards, 0)} OGY`} dim />
        <Row label="= USD" value={`$${fmtNum(r.ogy_usd, 0)}`} dim />
        <Row
          label="▶ OGY → ICP / year"
          value={`${fmtNum(r.ogy_icp)} ICP`}
          accent="purple"
        />
      </StepCard>

      <StepCard step={4} title="WTN Neurons → ICP (amortized)" accent="teal">
        <Note>
          WTN will be distributed to eligible holders upon dissolve. Estimated
          distribution: 2 neurons ~Mar 2027, 1 neuron ~Sep 2027. Amortized as
          annual yield for equilibrium comparison.
        </Note>
        <Row
          label="Total WTN"
          value={`${fmtNum(params.wtn_total, 0)} WTN`}
          dim
        />
        <Row
          label="WTN/ICP ratio"
          value={`${fmtNum(params.wtn_per_icp, 1)}`}
          dim
        />
        <Row
          label="▶ WTN → ICP (annualized)"
          value={`${fmtNum(r.wtn_icp)} ICP`}
          accent="teal"
        />
        <Row
          label="= per day"
          value={`${fmtNum(r.wtn_daily_icp, 1)} ICP`}
          dim
        />
      </StepCard>

      <StepCard step={5} title="Direct Yield per GOLDAO" accent="gold">
        <Note>(ICP stakers + GLDT + OGY + WTN) ÷ eligible GOLDAO</Note>
        <Row label="Direct pool" value={`${fmtNum(r.pool_directo)} ICP`} />
        <Row
          label={`÷ ${fmtNum(params.goldao_eligible / 1e6)}M eligible`}
          value={`${r.yield_directo.toFixed(9)} ICP/GOLDAO`}
          accent="gold"
        />
      </StepCard>

      <StepCard step={6} title="Effective APY (ICP)" accent="green">
        <Note>APY = yield per GOLDAO ÷ GOLDAO price in ICP × 100</Note>
        <Row
          label="Effective APY (ICP)"
          value={`${fmtNum(r.apy_efectivo, 2)}%`}
          accent={r.apy_efectivo >= params.nns_apy ? "green" : "destructive"}
        />
        <Row
          label="NNS Benchmark APY"
          value={`${fmtNum(params.nns_apy)}%`}
          accent="primary"
        />
      </StepCard>

      <StepCard step={7} title="Equilibrium Ratio" accent="amber">
        <Note>
          price_eq = yield per GOLDAO ÷ APY NNS · ratio = 1 / price_eq
        </Note>
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

      <StepCard
        step={8}
        title="Market vs Equilibrium"
        accent={r.esta_barato ? "green" : "destructive"}
      >
        <div className="space-y-0.5">
          <Row
            label="Equilibrium"
            value={`1 ICP = ${fmtNum(r.ratio_eq, 0)} GOLDAO`}
            accent="amber"
          />
          <Row
            label="Market"
            value={`1 ICP = ${fmtNum(r.market_ratio, 0)} GOLDAO`}
          />
        </div>
        {(() => {
          const dif = Math.abs(r.diferencia_pct);
          if (r.esta_barato) {
            return (
              <div className="rounded-md border-l-4 border-[oklch(0.72_0.17_162)] bg-[oklch(0.72_0.17_162)]/10 px-3 py-2 mt-2">
                <p className="text-sm font-mono font-semibold text-[oklch(0.72_0.17_162)]">
                  GOLDAO is CHEAP ({fmtNum(dif)}% above equilibrium)
                </p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  Buying GOLDAO yields more than staking ICP directly on the
                  NNS.
                </p>
              </div>
            );
          }
          return (
            <div className="rounded-md border-l-4 border-destructive bg-destructive/10 px-3 py-2 mt-2">
              <p className="text-sm font-mono font-semibold text-destructive">
                GOLDAO is EXPENSIVE ({fmtNum(dif)}% below equilibrium)
              </p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                Staking ICP directly on the NNS yields more than buying GOLDAO
                today.
              </p>
            </div>
          );
        })()}
      </StepCard>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function FairValuePage() {
  const { params: liveParams, flash } = useLiveData();

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
    return p as unknown as FairValueParams;
  }, [raw]);

  const result = useMemo(() => calcular(params), [params]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          <span className="text-gradient-gold">Fair Value</span>
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground font-mono mt-1">
          GOLDAO vs ICP — Equilibrium based on direct staker yield
        </p>
      </div>

      <SpectrumBarTop r={result} />

      <LiveFieldsRow
        fields={LIVE_FIELDS}
        values={raw}
        onChange={handleChange}
        flash={flash}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(340px,1fr)_minmax(400px,1.4fr)] gap-6">
        <div className="space-y-3">
          {COLLAPSIBLE_SECTIONS.map((s) => (
            <CollapsibleInputSection
              key={s.title}
              section={s}
              values={raw}
              onChange={handleChange}
              flash={flash}
            />
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
        <Results r={result} params={params} />
      </div>
    </div>
  );
}
