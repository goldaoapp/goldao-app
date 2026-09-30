import { useBurnTracker } from "@/lib/use-burn-tracker";
import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
import { useEffect, useState } from "react";

/*
 * GOLDAO burn panel. The bar shows ALL GOLDAO burned so far vs the original
 * 1,000M supply. The tip of the bar glows and throws sparks to suggest a
 * continuous burn; every time the tracker detects a supply drop the counter
 * rolls up, a sweep runs along the bar and "+X GOLDAO burned" appears, where
 * X is the difference between the old and the new total.
 */

const PULSE_VISIBLE_MS = 4_000;

const BURN_KEYFRAMES = `
@keyframes emberFlicker{0%,100%{opacity:.85;transform:translate(-50%,-50%) scale(1)}30%{opacity:1;transform:translate(-50%,-50%) scale(1.25)}60%{opacity:.7;transform:translate(-50%,-50%) scale(.9)}}
@keyframes sparkRise{0%{opacity:0;transform:translate(0,0) scale(1)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),-26px) scale(.3)}}
@keyframes burnSweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
@keyframes burnPanelGlow{0%,100%{box-shadow:inset 0 0 0 0 rgba(234,88,12,0)}40%{box-shadow:inset 0 0 48px 2px rgba(234,88,12,.22)}}
@keyframes burnChipIn{0%{opacity:0;transform:translateY(8px)}15%{opacity:1;transform:translateY(0)}85%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}
@media (prefers-reduced-motion: reduce){.burn-anim{animation:none!important}}
`;

const SPARKS = [
  { dx: "-6px", delay: "0s", dur: "1.6s" },
  { dx: "4px", delay: ".5s", dur: "1.9s" },
  { dx: "-2px", delay: "1s", dur: "1.4s" },
  { dx: "7px", delay: "1.3s", dur: "2.1s" },
];

const ink = "text-[color:var(--term-ink)]";
const inkMid = "text-[color:var(--term-ink-mid)]";
const inkFaint = "text-[color:var(--term-ink-faint)]";
const border = "border-[color:var(--term-border)]";

const fmtM = (v: number) =>
  `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}M`;
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "font-mono text-[10px] font-semibold uppercase tracking-[0.16em]",
        inkMid,
      )}
    >
      {children}
    </div>
  );
}

export default function BurnBar() {
  const { displayBurned, burned, supply, original, lastBurn, pulse } =
    useBurnTracker();
  const [visiblePulse, setVisiblePulse] = useState(pulse);

  useEffect(() => {
    const id = "burn-bar-keyframes";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = BURN_KEYFRAMES;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (!pulse) return;
    setVisiblePulse(pulse);
    const t = setTimeout(() => setVisiblePulse(null), PULSE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [pulse]);

  const shown = displayBurned ?? burned;
  const pct = shown !== null ? (shown / original) * 100 : 0;
  const ready = shown !== null;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border bg-[var(--term-card)]",
        border,
      )}
      aria-label="GOLDAO burn"
    >
      {visiblePulse && (
        <div
          key={visiblePulse.id}
          className="burn-anim pointer-events-none absolute inset-0 rounded-xl"
          style={{ animation: "burnPanelGlow 1.4s ease-in-out 2" }}
          aria-hidden="true"
        />
      )}
      <header
        className={cn(
          "flex items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-6",
          border,
        )}
      >
        <span
          className={cn(
            "font-mono text-xs font-semibold uppercase tracking-[0.18em]",
            ink,
          )}
        >
          GOLDAO{" "}
          <span className="text-orange-600 dark:text-orange-400">Burn</span>
        </span>
        <span
          className={cn(
            "flex items-center gap-2 font-mono text-[11px] tracking-[0.14em]",
            inkMid,
          )}
        >
          <span
            className="burn-anim inline-block size-2 rounded-full bg-orange-500"
            style={{ animation: "emberFlicker 1.6s ease-in-out infinite" }}
          />
          LIVE
        </span>
      </header>

      <div className="flex flex-col gap-4 px-5 pt-6 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="min-w-0">
          <Label>Total Burned</Label>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span
              className="font-display text-4xl font-semibold tabular-nums text-orange-600 sm:text-6xl dark:text-orange-400"
              data-testid="burn-total"
            >
              {ready ? fmtFull(shown) : "—"}
            </span>
            <span className={cn("font-mono text-sm", inkMid)}>GOLDAO</span>
          </div>
        </div>
        <div className="h-7">
          {visiblePulse && (
            <span
              key={visiblePulse.id}
              className="burn-anim inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 font-mono text-xs font-semibold text-orange-600 dark:text-orange-400"
              style={{
                animation: `burnChipIn ${PULSE_VISIBLE_MS}ms ease-out forwards`,
              }}
            >
              <Flame className="size-3.5" aria-hidden="true" />+
              {fmtAmount(visiblePulse.amount)} GOLDAO burned
            </span>
          )}
        </div>
      </div>

      {/* Bar: total burned vs original supply */}
      <div className="px-5 pb-2 pt-6 sm:px-6">
        <div className="relative">
          <div
            className="relative h-4 w-full overflow-hidden rounded-full bg-[var(--term-border-faint)]"
            role="progressbar"
            tabIndex={0}
            aria-label="GOLDAO burned"
            aria-valuemin={0}
            aria-valuemax={original}
            aria-valuenow={burned ?? 0}
          >
            <div
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-orange-700 via-orange-500 to-amber-400"
              style={{ width: `${pct}%` }}
            >
              {visiblePulse && (
                <div
                  key={visiblePulse.id}
                  className="burn-anim absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                  style={{ animation: "burnSweep 1.2s ease-in-out 2" }}
                />
              )}
            </div>
          </div>

          {/* Ember at the burning edge (outside the clipped track) */}
          {ready && (
            <div
              className="pointer-events-none absolute top-1/2"
              style={{ left: `${pct}%` }}
              aria-hidden="true"
            >
              <span
                className="burn-anim absolute left-0 top-0 size-5 rounded-full bg-amber-300/80 blur-[3px]"
                style={{
                  animation: "emberFlicker 1.1s ease-in-out infinite",
                  transform: "translate(-50%,-50%)",
                }}
              />
              <span className="absolute left-0 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100" />
              {SPARKS.map((s) => (
                <span
                  key={s.delay}
                  className="burn-anim absolute -left-0.5 -top-0.5 size-1 rounded-full bg-orange-400"
                  style={
                    {
                      "--dx": s.dx,
                      animation: `sparkRise ${s.dur} ease-out ${s.delay} infinite`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "mt-2 flex justify-between font-mono text-[11px]",
            inkFaint,
          )}
        >
          <span>{pct.toFixed(2)}% of original supply burned</span>
          <span>{fmtM(original)} original</span>
        </div>
      </div>

      <div
        className={cn(
          "mt-4 grid grid-cols-1 divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0",
          border,
          "divide-[color:var(--term-border)]",
        )}
      >
        <div className="px-5 py-3.5 sm:px-6">
          <Label>Supply</Label>
          <div className={cn("mt-1 font-mono text-sm tabular-nums", ink)}>
            {supply !== null ? `${fmtM(supply)} GOLDAO` : "—"}
          </div>
        </div>
        <div className="px-5 py-3.5 sm:px-6">
          <Label>Last burn</Label>
          <div className={cn("mt-1 font-mono text-sm tabular-nums", ink)}>
            {lastBurn
              ? `${fmtAmount(lastBurn.amount)} GOLDAO · ${timeAgo(lastBurn.timestamp)}`
              : "—"}
          </div>
        </div>
        <div className="px-5 py-3.5 sm:px-6">
          <Label>How it burns</Label>
          <div
            className={cn("mt-1 font-mono text-[11px] leading-snug", inkMid)}
          >
            Buyback burns + the 10 GOLDAO fee of every transfer
          </div>
        </div>
      </div>
    </section>
  );
}
