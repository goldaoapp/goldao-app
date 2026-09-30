import { useBurnTracker } from "@/lib/use-burn-tracker";
import { useEffect, useState } from "react";

const PULSE_VISIBLE_MS = 4_000;

const fmtM = (v: number) => `${(v / 1e6).toFixed(1)} M`;
const fmtFull = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtAmount = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 });

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BurnBar() {
  const { displayBurned, burned, supply, original, lastBurn, pulse } =
    useBurnTracker();
  const [visiblePulse, setVisiblePulse] = useState(pulse);

  useEffect(() => {
    if (!pulse) return;
    setVisiblePulse(pulse);
    const t = setTimeout(() => setVisiblePulse(null), PULSE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [pulse]);

  const shown = displayBurned ?? burned;
  const pct = shown !== null ? (shown / original) * 100 : 0;

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] sm:text-xs text-muted-foreground">
            Total Burned
          </div>
          <div
            className="font-mono text-lg sm:text-2xl font-bold text-primary tabular-nums"
            data-testid="burn-total"
          >
            {shown !== null ? fmtFull(shown) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] sm:text-xs text-muted-foreground">
            Supply
          </div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-foreground tabular-nums">
            {supply !== null ? fmtM(supply) : "—"}
          </div>
        </div>
      </div>

      <div className="relative pt-7">
        <div
          className="relative h-5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          tabIndex={0}
          aria-label="GOLDAO burned"
          aria-valuemin={0}
          aria-valuemax={original}
          aria-valuenow={burned ?? 0}
          style={{
            animation: visiblePulse ? "burnGlow 1.2s ease-in-out 3" : undefined,
          }}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-600 to-amber-400"
            style={{ width: `${pct}%` }}
          />
        </div>

        {visiblePulse && (
          <div
            key={visiblePulse.id}
            className="absolute top-0 animate-fade-in-up font-mono text-xs font-bold text-orange-500 whitespace-nowrap"
            style={{
              left: `clamp(0%, calc(${pct}% - 3rem), calc(100% - 7rem))`,
            }}
          >
            +{fmtAmount(visiblePulse.amount)} GOLDAO burned
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between font-mono text-[10px] sm:text-xs text-muted-foreground">
        <span>{pct.toFixed(2)}% burned</span>
        <span>{fmtM(original)} original</span>
      </div>

      <div className="mt-3 border-t border-border/50 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs">
        <span className="text-muted-foreground">Last burn</span>
        <span className="font-mono text-foreground">
          {lastBurn
            ? `${fmtAmount(lastBurn.amount)} GOLDAO · ${timeAgo(lastBurn.timestamp)}`
            : "—"}
        </span>
      </div>
    </div>
  );
}
