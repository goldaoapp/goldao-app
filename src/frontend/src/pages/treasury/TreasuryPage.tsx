import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULTS, type FairValueParams } from "@/lib/fairvalue-calc";
import {
  getHistory,
  hasSnapshot,
  saveSnapshot,
  type TreasurySnapshot,
} from "@/lib/treasury-history";
import { useLiveData } from "@/lib/use-live-data";
import { ArrowDown, ArrowUp, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface TreasuryAsset {
  id: string;
  label: string;
  amount: number;
  usd: number;
  colorBar: string;
}

interface Reading {
  icp_amount: number;
  icp_usd: number;
  ogy_amount: number;
  ogy_usd: number;
  wtn_amount: number;
  wtn_usd: number;
  total_usd: number;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const COLORS = {
  icp: "oklch(0.82 0.15 85)",
  ogy: "oklch(0.7 0.17 162)",
  wtn: "oklch(0.77 0.13 70)",
} as const;

/** Two readings are consistent if every value differs < 10% */
function isConsistent(a: Reading, b: Reading): boolean {
  const check = (x: number, y: number) => {
    if (x === 0 && y === 0) return true;
    const max = Math.max(Math.abs(x), Math.abs(y));
    return max > 0 && Math.abs(x - y) / max < 0.1;
  };
  return (
    check(a.icp_usd, b.icp_usd) &&
    check(a.ogy_usd, b.ogy_usd) &&
    check(a.wtn_usd, b.wtn_usd)
  );
}

/** All prices populated */
function isComplete(r: Reading): boolean {
  return r.icp_usd > 0 && r.total_usd > 0;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtTokens(v: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/* ── Animated number ────────────────────────────────────────────────────── */

function useAnimatedNumber(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    if (start === target) {
      setDisplay(target);
      return;
    }
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(start + (target - start) * (1 - (1 - p) ** 3));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

/* ── Bar ─────────────────────────────────────────────────────────────────── */

function TreasuryBar({ assets }: { assets: TreasuryAsset[] }) {
  const total = assets.reduce((s, a) => s + a.usd, 0);
  if (total === 0) return null;

  const visible = assets.filter((a) => a.usd > 0);

  return (
    <div className="space-y-3">
      <div className="flex h-10 rounded-lg overflow-hidden border border-border shadow-subtle">
        {visible.map((asset) => {
          const pct = (asset.usd / total) * 100;
          return (
            <div
              key={asset.id}
              className="relative h-full overflow-hidden first:rounded-l-lg last:rounded-r-lg group"
              style={{
                width: `${pct}%`,
                backgroundColor: asset.colorBar,
                transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="text-[10px] font-mono font-bold text-background drop-shadow-sm whitespace-nowrap">
                  {asset.label} {pct.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        {visible.map((asset) => (
          <div key={asset.id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: asset.colorBar }}
            />
            <span className="text-xs text-muted-foreground font-mono">
              {asset.label}{" "}
              <span className="text-foreground font-medium">
                {((asset.usd / total) * 100).toFixed(1)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Asset card ─────────────────────────────────────────────────────────── */

function AssetCard({ asset }: { asset: TreasuryAsset }) {
  const usd = useAnimatedNumber(asset.usd);
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: asset.colorBar }}
        />
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {asset.label}
        </span>
      </div>
      <div className="font-mono text-xl sm:text-2xl font-bold text-foreground">
        {fmtUsd(usd)}
      </div>
      <div className="text-xs text-muted-foreground mt-1 font-mono">
        {fmtTokens(asset.amount)} {asset.id.toUpperCase()}
      </div>
    </div>
  );
}

/* ── Sparkline ──────────────────────────────────────────────────────────── */

function Sparkline({ data }: { data: TreasurySnapshot[] }) {
  if (data.length < 2) return null;

  const values = data.map((d) => Number(d.total_usd));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 600;
  const h = 120;
  const pad = 8;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const line = `M${pts.join(" L")}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  const dates = data.map((d) => d.date);
  const labels = [0, Math.floor(dates.length / 2), dates.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-28 sm:h-32"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.icp} stopOpacity="0.3" />
            <stop offset="100%" stopColor={COLORS.icp} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sparkFill)" />
        <path
          d={line}
          fill="none"
          stroke={COLORS.icp}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {labels.map((i) => (
          <span key={i} className="text-[10px] font-mono text-muted-foreground">
            {dates[i]?.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function TreasuryPage() {
  const { params: liveParams, extra } = useLiveData();
  const [history, setHistory] = useState<TreasurySnapshot[]>([]);

  // ── Build current reading from live data ──
  const assets = useMemo<TreasuryAsset[]>(() => {
    const p: FairValueParams = { ...DEFAULTS, ...liveParams };
    const icpAmt = p.icp_staked || DEFAULTS.icp_staked;
    const ogyAmt = p.ogy_staked || 0;
    const wtnAmt = extra.wtnTotal || 0;
    const icpUsd = icpAmt * (p.price_icp_usd || 0);
    const ogyUsd = ogyAmt * (p.price_ogy_usd || 0);
    const wtnUsd = (extra.wtnIcp || 0) * (p.price_icp_usd || 0);

    return [
      { id: "icp", label: "ICP", amount: icpAmt, usd: icpUsd, colorBar: COLORS.icp },
      { id: "wtn", label: "WTN", amount: wtnAmt, usd: wtnUsd, colorBar: COLORS.wtn },
      { id: "ogy", label: "OGY", amount: ogyAmt, usd: ogyUsd, colorBar: COLORS.ogy },
    ];
  }, [liveParams, extra]);

  const reading = useMemo<Reading>(() => {
    const icp = assets.find((a) => a.id === "icp")!;
    const ogy = assets.find((a) => a.id === "ogy")!;
    const wtn = assets.find((a) => a.id === "wtn")!;
    return {
      icp_amount: icp.amount, icp_usd: icp.usd,
      ogy_amount: ogy.amount, ogy_usd: ogy.usd,
      wtn_amount: wtn.amount, wtn_usd: wtn.usd,
      total_usd: icp.usd + ogy.usd + wtn.usd,
    };
  }, [assets]);

  const totalUsd = reading.total_usd;
  const animatedTotal = useAnimatedNumber(totalUsd);

  // ── On-chain persistence ──
  // 1. Check if today exists → load history
  // 2. If not: wait for 2 consistent readings → save
  const prevReading = useRef<Reading | null>(null);
  const saveState = useRef<"checking" | "exists" | "waiting" | "saved">("checking");

  useEffect(() => {
    hasSnapshot(todayStr()).then((exists) => {
      saveState.current = exists ? "exists" : "waiting";
    });
    getHistory().then((h) => {
      if (h.length > 0) setHistory(h);
    });
  }, []);

  useEffect(() => {
    if (saveState.current !== "waiting") return;
    if (!isComplete(reading)) return;

    const prev = prevReading.current;
    prevReading.current = reading;

    // Need a previous complete reading to compare against
    if (!prev || !isComplete(prev)) return;

    // Second reading arrived — check consistency
    if (!isConsistent(prev, reading)) return;

    // Data verified — save once
    saveState.current = "saved";
    saveSnapshot({
      icp_amount: reading.icp_amount,
      icp_usd: reading.icp_usd,
      ogy_amount: reading.ogy_amount,
      ogy_usd: reading.ogy_usd,
      wtn_amount: reading.wtn_amount,
      wtn_usd: reading.wtn_usd,
      total_usd: reading.total_usd,
    }).then((ok) => {
      if (ok) getHistory().then((h) => setHistory(h));
    });
  }, [reading]);

  // ── Day-over-day ──
  const dayChange = useMemo(() => {
    if (history.length < 2) return null;
    const prev = Number(history[history.length - 2].total_usd);
    const curr = Number(history[history.length - 1].total_usd);
    const diff = curr - prev;
    return { diff, pct: prev > 0 ? (diff / prev) * 100 : 0 };
  }, [history]);

  const isLoading = totalUsd === 0;

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Treasury"
        title="Treasury Dashboard"
        description="Real-time composition and value of the GOLDAO treasury reserves."
      />

      {/* Total */}
      <div className="text-center mb-8 animate-fade-in-up">
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Total Treasury Value
        </span>
        <div className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-2">
          {isLoading ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : (
            <span className="text-gradient-gold">{fmtUsd(animatedTotal)}</span>
          )}
        </div>
        {dayChange && (
          <div
            className={`flex items-center justify-center gap-1 mt-2 text-sm font-mono ${
              dayChange.diff >= 0 ? "text-green-400" : "text-destructive"
            }`}
          >
            {dayChange.diff >= 0 ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )}
            {fmtUsd(Math.abs(dayChange.diff))} ({dayChange.pct >= 0 ? "+" : ""}
            {dayChange.pct.toFixed(2)}%)
          </div>
        )}
      </div>

      {/* Bar */}
      {!isLoading && (
        <div className="mb-8 animate-fade-in">
          <TreasuryBar assets={assets} />
        </div>
      )}

      {/* Cards */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 animate-fade-in">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}

      {/* Chart */}
      <Card className="overflow-hidden border-border/80 shadow-subtle">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Treasury Value Over Time
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {history.length > 0
                  ? `${history.length} day${history.length !== 1 ? "s" : ""} tracked`
                  : "Daily USD value recorded on-chain"}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length >= 2 ? (
            <Sparkline data={history} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground mb-3">
                <Wallet className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {history.length === 1
                  ? "First snapshot recorded — chart appears tomorrow"
                  : "Chart builds as daily snapshots accumulate"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-6">
        ICP from NNS neurons · OGY and WTN from SNS API ·
        Prices via Binance + CoinGecko + ICPSwap · History on-chain
      </p>
    </section>
  );
}
