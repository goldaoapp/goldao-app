import { type SecurityEvent, SecurityLevel } from "@/backend";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import {
  eyebrow,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
} from "./game-utils";
import { useSecurityLog } from "./useGame";

const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;
const CHIP_DAYS = 14;

const LEVEL_STYLE: Record<
  SecurityLevel,
  { label: string; box: string; badge: string }
> = {
  [SecurityLevel.info]: {
    label: "Info",
    box: "border-[color:var(--term-border)] bg-[var(--term-alt)]",
    badge: "border-[color:var(--term-border)] text-[color:var(--term-ink-mid)]",
  },
  [SecurityLevel.warning]: {
    label: "Warning",
    box: "border-[color:var(--term-warn)]/40 bg-[var(--term-warn-bg)]",
    badge:
      "border-[color:var(--term-warn)] bg-[var(--term-warn-bg)] text-[color:var(--term-warn)]",
  },
  [SecurityLevel.critical]: {
    label: "Needs attention",
    box: "border-destructive/50 bg-destructive/10",
    badge: "border-destructive bg-destructive/10 text-destructive",
  },
};

const utcDay = (ms: number) => Math.floor(ms / DAY_MS);
const dayToIso = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);
const isoToDay = (iso: string) => utcDay(Date.parse(`${iso}T00:00:00Z`));
const timeOf = (ns: bigint) =>
  new Date(Number(ns / 1_000_000n)).toISOString().slice(11, 19);

function EventCard({ e }: { e: SecurityEvent }) {
  const style = LEVEL_STYLE[e.level];
  return (
    <div
      className={cn("flex flex-col gap-1.5 rounded-lg border p-3", style.box)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
            style.badge,
          )}
        >
          {style.label}
        </span>
        <span className={cn("text-sm font-medium", ink)}>{e.title}</span>
        <span className={cn("ml-auto font-mono text-[11px]", inkFaint)}>
          {timeOf(e.at)} UTC
          {e.count > 1n && ` · ×${Number(e.count)} · last ${timeOf(e.lastAt)}`}
        </span>
      </div>
      <p className={cn("font-mono text-xs leading-relaxed", inkMid)}>
        {e.description}
      </p>
    </div>
  );
}

/** Daily security log of the game: one page per UTC day, browsable by date. */
export function SecurityLogPanel() {
  const today = utcDay(Date.now());
  const [day, setDay] = useState(today);
  const { data } = useSecurityLog(day, true);

  const days = data?.days ?? [];
  const recentAlerts = days
    .filter((d) => Number(d.day) > today - RECENT_DAYS)
    .reduce((n, d) => n + Number(d.attention), 0);
  const chips = days.slice(0, CHIP_DAYS);

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
          <ScrollText className="size-3.5" /> Security log
        </span>
        <span
          className={cn(
            "font-mono text-[11px]",
            recentAlerts > 0 ? "text-destructive" : inkFaint,
          )}
        >
          {recentAlerts > 0
            ? `${recentAlerts} alert${recentAlerts === 1 ? "" : "s"} in the last ${RECENT_DAYS} days`
            : `No alerts in the last ${RECENT_DAYS} days`}
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="Previous day"
            onClick={() => setDay((d) => d - 1)}
          >
            <ChevronLeft />
          </Button>
          <input
            type="date"
            value={dayToIso(day)}
            max={dayToIso(today)}
            onChange={(ev) => {
              if (ev.target.value) setDay(isoToDay(ev.target.value));
            }}
            className="rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            aria-label="Next day"
            disabled={day >= today}
            onClick={() => setDay((d) => d + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={day === today}
            onClick={() => setDay(today)}
          >
            Today
          </Button>
          <span className={cn("ml-auto font-mono text-[11px]", inkFaint)}>
            Days and times are UTC
          </span>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((d) => (
              <button
                key={String(d.day)}
                type="button"
                onClick={() => setDay(Number(d.day))}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                  Number(d.day) === day
                    ? "border-[color:var(--term-gold)] text-[color:var(--term-gold)]"
                    : "border-[color:var(--term-border)] text-[color:var(--term-ink-mid)] hover:border-[color:var(--term-gold)]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    d.attention > 0n
                      ? "bg-destructive"
                      : "bg-[color:var(--term-ink-faint)]",
                  )}
                />
                {dayToIso(Number(d.day)).slice(5)} · {Number(d.events)}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {data && data.events.length === 0 && (
            <p className={cn("font-mono text-xs", inkFaint)}>
              No events on {dayToIso(day)}.
            </p>
          )}
          {data?.events.map((e) => (
            <EventCard key={`${e.code}-${String(e.at)}`} e={e} />
          ))}
        </div>
      </div>
    </div>
  );
}
