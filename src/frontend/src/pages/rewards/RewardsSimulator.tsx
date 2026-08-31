import { Calculator, Hash, Loader2, RotateCcw, Search } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type NeuronLookup, lookupNeuron } from "@/lib/goldao-neuron";
import {
  ASSUMPTION_DEFAULTS,
  type RewardAssumptions,
  type RewardResult,
  type TokenReward,
  poolsFrom,
  simulate,
} from "@/lib/rewards-calc";
import { useLiveData } from "@/lib/use-live-data";

/* number helpers */

function fmtToken(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "0";
  const abs = Math.abs(v);
  const decimals = abs < 1 ? 4 : abs < 100 ? 3 : 2;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUsd(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "$0.00";
  const abs = Math.abs(v);
  const decimals = abs < 1 ? 4 : 2;
  return `$${v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtInt(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

function parseInput(s: string, fallback: number): number {
  const n = Number(s.replace(/,/g, "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function fmtDefault(v: number): string {
  if (v === 0) return "";
  if (v === Math.floor(v)) return Math.floor(v).toLocaleString("en-US");
  return String(v);
}

function fmtDelay(seconds: number | null): string {
  if (seconds === null) return "unknown";
  const years = seconds / (365 * 24 * 3600);
  return `${years.toFixed(2)} yr`;
}

/* assumption fields for the editable panel */

type AKey = keyof RewardAssumptions;
const ASSUMPTION_FIELDS: {
  key: AKey;
  label: string;
  unit: string;
  live?: boolean;
}[] = [
  {
    key: "goldao_eligible",
    label: "Eligible GOLDAO",
    unit: "GOLDAO",
    live: true,
  },
  { key: "icp_staked", label: "ICP Staked (NNS)", unit: "ICP" },
  { key: "nns_apy", label: "NNS APY", unit: "%" },
  { key: "pct_stakers", label: "% to Stakers", unit: "%" },
  { key: "ogy_staked", label: "OGY Staked", unit: "OGY", live: true },
  { key: "ogy_apy", label: "OGY APY", unit: "%" },
  { key: "wtn_total", label: "WTN Total", unit: "WTN", live: true },
  { key: "wtn_per_icp", label: "WTN / ICP", unit: "ratio", live: true },
  { key: "price_icp_usd", label: "ICP Price", unit: "USD", live: true },
  { key: "price_ogy_usd", label: "OGY Price", unit: "USD", live: true },
];

/* small presentational pieces (kept local to this section) */

const ACCENT: Record<string, { text: string; ring: string; soft: string }> = {
  icp: {
    text: "text-primary",
    ring: "border-primary/40",
    soft: "bg-primary/10",
  },
  ogy: {
    text: "text-[oklch(0.65_0.18_304)]",
    ring: "border-[oklch(0.65_0.18_304)]/40",
    soft: "bg-[oklch(0.65_0.18_304)]/10",
  },
  wtn: {
    text: "text-[oklch(0.7_0.12_185)]",
    ring: "border-[oklch(0.7_0.12_185)]/40",
    soft: "bg-[oklch(0.7_0.12_185)]/10",
  },
};

function RewardCard({
  kind,
  r,
}: {
  kind: "icp" | "ogy" | "wtn";
  r: TokenReward;
}) {
  const a = ACCENT[kind];
  return (
    <div className={`rounded-lg border ${a.ring} bg-card/50 overflow-hidden`}>
      <div
        className={`flex items-center justify-between px-4 py-2.5 ${a.soft}`}
      >
        <span className={`font-display text-sm font-semibold ${a.text}`}>
          {r.token}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {r.recurring ? "weekly stream" : "one-time · amortized"}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Per week
          </p>
          <p className={`font-mono text-2xl font-bold ${a.text}`}>
            {fmtToken(r.weekly)}
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            {fmtUsd(r.weekly_usd)}
          </p>
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-xs font-mono text-muted-foreground">
            Per month
          </span>
          <span className="text-right">
            <span className="font-mono text-sm font-semibold text-foreground">
              {fmtToken(r.monthly)}
            </span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {fmtUsd(r.monthly_usd)}
            </span>
          </span>
        </div>
        {!r.recurring && r.one_time !== undefined && (
          <div className="rounded-md border-l-2 border-[oklch(0.7_0.12_185)] bg-[oklch(0.7_0.12_185)]/10 px-3 py-2">
            <p className="text-[11px] font-mono text-[oklch(0.7_0.12_185)]">
              ~{fmtToken(r.one_time)} WTN on dissolve
            </p>
            <p className="text-[10px] font-mono text-muted-foreground">
              Future one-time payout (~2027). Weekly/monthly shown amortized
              over a year.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AssumptionField({
  field,
  value,
  onChange,
  flashing,
}: {
  field: (typeof ASSUMPTION_FIELDS)[number];
  value: string;
  onChange: (k: AKey, v: string) => void;
  flashing: boolean;
}) {
  return (
    <label className="flex items-center gap-2 py-1">
      <span className="flex w-36 shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
        {field.label}
        {field.live && (
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
        className={`min-w-0 flex-1 rounded border px-2 py-1.5 text-right font-mono text-sm text-foreground outline-none transition-colors duration-700 focus:ring-1 focus:ring-primary/50 ${
          flashing
            ? "border-[oklch(0.72_0.17_162)]/30 bg-[oklch(0.72_0.17_162)]/10"
            : "border-border bg-secondary/60"
        }`}
      />
      <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">
        {field.unit}
      </span>
    </label>
  );
}

/* page section */

const LIVE_TO_ASSUMPTION: Partial<Record<string, AKey>> = {
  goldao_eligible: "goldao_eligible",
  ogy_staked: "ogy_staked",
  price_icp_usd: "price_icp_usd",
  price_ogy_usd: "price_ogy_usd",
  wtn_total: "wtn_total",
  wtn_per_icp: "wtn_per_icp",
};

export default function RewardsSimulator() {
  const { params: live, flash } = useLiveData();

  const [raw, setRaw] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(ASSUMPTION_DEFAULTS)) {
      init[k] = fmtDefault(v);
    }
    return init;
  });

  // Sync live values into the editable assumptions.
  useEffect(() => {
    setRaw((prev) => {
      const next = { ...prev };
      for (const [liveKey, val] of Object.entries(live)) {
        const aKey = LIVE_TO_ASSUMPTION[liveKey];
        if (aKey && val !== undefined) next[aKey] = fmtDefault(val);
      }
      return next;
    });
  }, [live]);

  const flashSet = useMemo(() => {
    const s = new Set<string>();
    for (const k of flash) {
      const aKey = LIVE_TO_ASSUMPTION[k];
      if (aKey) s.add(aKey);
    }
    return s;
  }, [flash]);

  const [mode, setMode] = useState<"amount" | "neuron">("amount");
  const [amount, setAmount] = useState("100000");
  const [neuronId, setNeuronId] = useState("");
  const [neuron, setNeuron] = useState<NeuronLookup | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [lookupError, setLookupError] = useState("");

  const [showAssumptions, setShowAssumptions] = useState(false);

  const assumptions = useMemo<RewardAssumptions>(() => {
    const a: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      a[k] = parseInput(v, ASSUMPTION_DEFAULTS[k as AKey]);
    }
    return a as unknown as RewardAssumptions;
  }, [raw]);

  const handleAssumptionChange = useCallback((k: AKey, v: string) => {
    setRaw((prev) => ({ ...prev, [k]: v }));
  }, []);

  const runLookup = useCallback(async () => {
    setLookupState("loading");
    setLookupError("");
    setNeuron(null);
    try {
      const n = await lookupNeuron(neuronId);
      setNeuron(n);
      setLookupState("idle");
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed.");
      setLookupState("error");
    }
  }, [neuronId]);

  // Effective GOLDAO fed into the model. An ineligible neuron earns nothing.
  const neuronIneligible = mode === "neuron" && neuron?.eligible === false;
  const userGoldao = useMemo(() => {
    if (mode === "amount") return Math.max(parseInput(amount, 0), 0);
    if (!neuron) return 0;
    return neuron.eligible === false ? 0 : neuron.goldao;
  }, [mode, amount, neuron]);

  const result = useMemo<RewardResult>(
    () => simulate(poolsFrom(assumptions), userGoldao),
    [assumptions, userGoldao],
  );

  const liveLoading = assumptions.goldao_eligible <= 0;

  const handleReset = useCallback(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(ASSUMPTION_DEFAULTS)) {
      init[k] = fmtDefault(v);
    }
    setRaw(init);
    setAmount("100000");
    setNeuronId("");
    setNeuron(null);
    setLookupState("idle");
    setLookupError("");
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(360px,1.5fr)]">
        {/* input column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="mb-3 inline-flex rounded-lg bg-muted p-[3px]">
              <ModeButton
                active={mode === "amount"}
                onClick={() => setMode("amount")}
                icon={Calculator}
                label="By amount"
              />
              <ModeButton
                active={mode === "neuron"}
                onClick={() => setMode("neuron")}
                icon={Hash}
                label="By neuron"
              />
            </div>

            {mode === "amount" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block font-mono text-xs text-muted-foreground">
                    GOLDAO amount
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100,000"
                    className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2.5 text-right font-mono text-lg text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {[10_000, 100_000, 1_000_000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className="rounded-md border border-border bg-secondary/60 px-2.5 py-1 font-mono text-xs text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                    >
                      {fmtInt(v)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block font-mono text-xs text-muted-foreground">
                    GOLDAO neuron id (hex)
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={neuronId}
                      onChange={(e) => setNeuronId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") runLookup();
                      }}
                      placeholder="a1b2c3..."
                      className="min-w-0 flex-1 rounded-lg border border-border bg-secondary/60 px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={runLookup}
                      disabled={lookupState === "loading" || !neuronId.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 font-mono text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
                    >
                      {lookupState === "loading" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Search className="size-4" />
                      )}
                      Look up
                    </button>
                  </div>
                </label>

                {lookupState === "error" && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                    {lookupError}
                  </p>
                )}

                {neuron && (
                  <div className="space-y-1 rounded-md border border-border bg-secondary/40 px-3 py-2.5">
                    <ResolvedRow
                      label="Stake"
                      value={`${fmtInt(neuron.goldao)} GOLDAO`}
                    />
                    {neuron.votingPower !== null && (
                      <ResolvedRow
                        label="Voting power"
                        value={
                          neuron.goldao > 0
                            ? `${fmtInt(neuron.votingPower)} VP · ${(
                                neuron.votingPower / neuron.goldao
                              ).toFixed(2)}×`
                            : `${fmtInt(neuron.votingPower)} VP`
                        }
                      />
                    )}
                    <ResolvedRow
                      label="Dissolve delay"
                      value={fmtDelay(neuron.dissolveDelaySeconds)}
                    />
                    <ResolvedRow
                      label="Eligibility"
                      value={
                        neuron.eligible === false
                          ? "Not eligible"
                          : neuron.eligible === true
                            ? "Eligible"
                            : "Assumed eligible"
                      }
                      accent={
                        neuron.eligible === false
                          ? "text-destructive"
                          : "text-[oklch(0.72_0.17_162)]"
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* share summary */}
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-muted-foreground">
                Your share of eligible GOLDAO
              </span>
              <span className="font-mono text-lg font-bold text-gradient-gold">
                {(result.share * 100).toLocaleString("en-US", {
                  maximumFractionDigits: 4,
                })}
                %
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary/60">
              <div
                className="h-full gradient-primary transition-[width] duration-500"
                style={{ width: `${Math.min(result.share * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              {fmtInt(userGoldao)} of {fmtInt(result.eligible)} eligible GOLDAO
            </p>
          </div>

          {/* assumptions */}
          <div className="overflow-hidden rounded-lg border border-border bg-card/50">
            <button
              type="button"
              onClick={() => setShowAssumptions((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-secondary/30"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                Assumptions & live inputs
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                role="img"
                aria-label="Toggle assumptions"
                className={`text-muted-foreground transition-transform duration-200 ${
                  showAssumptions ? "rotate-180" : ""
                }`}
              >
                <path d="M3.5 5.5L7 9l3.5-3.5" />
              </svg>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-200"
              style={{ gridTemplateRows: showAssumptions ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-3">
                  {ASSUMPTION_FIELDS.map((f) => (
                    <AssumptionField
                      key={f.key}
                      field={f}
                      value={raw[f.key]}
                      onChange={handleAssumptionChange}
                      flashing={flashSet.has(f.key)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* results column */}
        <div className="flex flex-col gap-4">
          {liveLoading && (
            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
              Loading live data (eligible GOLDAO, prices)… estimates fill in
              once it arrives.
            </p>
          )}
          {neuronIneligible && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
              This neuron is dissolving or under the 2-year lock — it does not
              accrue rewards.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RewardCard kind="icp" r={result.icp} />
            <RewardCard kind="ogy" r={result.ogy} />
            <RewardCard kind="wtn" r={result.wtn} />
          </div>

          <div className="rounded-lg border border-primary/30 bg-card/50 p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary">
              Recurring total (ICP + OGY)
            </p>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Per week
                </p>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {fmtUsd(result.total_weekly_usd)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[11px] text-muted-foreground">
                  Per month
                </p>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {fmtUsd(result.total_monthly_usd)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[11px] text-muted-foreground">
                  Per year
                </p>
                <p className="font-mono text-xl font-semibold text-gradient-gold">
                  {fmtUsd(result.total_annual_usd)}
                </p>
              </div>
            </div>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Estimate. Rewards are distributed by maturity delta; share is
              modeled from stake within the max-delay cohort. WTN is a future
              one-time payout and is excluded from the recurring total.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-smooth ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function ResolvedRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span
        className={`font-mono text-sm font-semibold ${accent ?? "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}
