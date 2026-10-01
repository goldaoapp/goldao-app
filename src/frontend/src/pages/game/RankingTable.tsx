import type { Ranking, WeekSummary } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Gem, ListOrdered, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { TierSummary } from "./PlayerDashboard";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  eyebrow,
  fmtAvg,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  shortPrincipal,
} from "./game-utils";

type SortKey = "result" | "avg" | "diamonds";

const TOP = 20;

interface Props {
  ranking: Ranking | undefined;
  weeks: WeekSummary[] | undefined;
}

export function RankingTable({ ranking, weeks }: Props) {
  const { principalId } = useAuth();
  const [sort, setSort] = useState<SortKey>("result");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    if (!ranking) return [];
    // Return = what the player would receive now / what they paid.
    const ratio = (p: (typeof ranking.players)[number]) =>
      Number(p.paid) > 0 ? Number(p.estimatedReceive) / Number(p.paid) : 0;
    const base = [...ranking.players];
    const sorted =
      sort === "diamonds"
        ? base.sort(
            (a, b) =>
              Number(b.diamonds) - Number(a.diamonds) || ratio(b) - ratio(a),
          )
        : sort === "avg"
          ? base.sort((a, b) => Number(b.avgX100) - Number(a.avgX100))
          : base.sort(
              (a, b) =>
                ratio(b) - ratio(a) || Number(b.avgX100) - Number(a.avgX100),
            );
    return sorted.map((p, i) => ({ ...p, pos: i + 1 }));
  }, [ranking, sort]);

  // Top 20 plus the signed-in player, unless the full list is expanded.
  const visible = useMemo(() => {
    if (showAll || rows.length <= TOP) return rows;
    const top = rows.slice(0, TOP);
    const mine = rows.find((r) => r.player.toText() === principalId);
    return mine && !top.includes(mine) ? [...top, mine] : top;
  }, [rows, showAll, principalId]);

  return (
    <div className="flex flex-col gap-6">
      {ranking && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Prize pool"
            value={`${fmtGoldao(ranking.pot)}`}
            unit="GOLDAO"
          />
          <Kpi
            label="Treasure prize"
            value={
              ranking.treasurePerChip > 0n
                ? fmtGoldao(ranking.treasurePerChip)
                : "—"
            }
            unit={
              ranking.treasurePerChip > 0n
                ? "per chip"
                : "No Treasure yet · needs 11+ chips"
            }
          />
          <Kpi
            label="Diamond draw"
            value={`${fmtGoldao(ranking.drawPrize)}`}
            unit="GOLDAO"
            diamond
          />
          <Kpi
            label="Players · chips"
            value={`${ranking.players.length} · ${Number(ranking.chips)}`}
          />
        </div>
      )}

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <ListOrdered className="size-3.5" /> Ranking
          </span>
          <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5">
            {(
              [
                ["result", "Return"],
                ["avg", "Average"],
                ["diamonds", "Diamonds"],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 font-mono text-[11px] transition-smooth",
                  sort === k ? "bg-primary text-primary-foreground" : inkMid,
                )}
              >
                {k === "diamonds" && <Gem className="size-3" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {!ranking ? (
          <p className={cn("flex items-center gap-2 p-5 text-sm", inkFaint)}>
            <Spinner /> Loading ranking
          </p>
        ) : rows.length === 0 ? (
          <p className={cn("p-5 text-sm", inkFaint)}>
            No chips played this week yet.
          </p>
        ) : (
          <>
            {/* Mobile: one card per player */}
            <ul className="sm:hidden">
              {visible.map((r) => {
                const p = r.player.toText();
                const me = p === principalId;
                const diff = Number(r.estimatedReceive) - Number(r.paid);
                return (
                  <motion.li
                    key={p}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                      "flex flex-col gap-2 border-t border-[color:var(--term-border-faint)] px-4 py-3 font-mono text-xs",
                      me && "bg-primary/10",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("tabular-nums", inkFaint)}>
                          {r.pos}
                        </span>
                        <span
                          className={cn("truncate", me ? gold : ink)}
                          title={p}
                        >
                          {me ? "You" : shortPrincipal(p)}
                        </span>
                        {r.playing && (
                          <span className={inkFaint}>· playing</span>
                        )}
                      </span>
                      <span className={cn("shrink-0 tabular-nums", ink)}>
                        avg {fmtAvg(r.avgX100)}
                      </span>
                    </div>
                    <TierSummary tiers={r.tiers} />
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "flex items-center gap-1 tabular-nums",
                          Number(r.diamonds) > 0 ? DIAMOND_TEXT : inkFaint,
                        )}
                      >
                        <Gem className="size-3" /> {Number(r.diamonds)}
                      </span>
                      <span className="tabular-nums">
                        <span className={inkFaint}>Payout </span>
                        <span className={ink}>
                          {fmtGoldao(r.estimatedReceive)}
                        </span>
                        <span
                          className={cn(
                            "ml-1.5 text-[10px]",
                            diff > 0
                              ? "text-[color:var(--term-green)]"
                              : diff < 0
                                ? "text-destructive"
                                : inkFaint,
                          )}
                        >
                          {diff === 0
                            ? "="
                            : `${diff > 0 ? "+" : ""}${(diff / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                        </span>
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className={cn("text-left", inkFaint)}>
                    <th className="px-5 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Player</th>
                    <th className="px-3 py-2 text-right font-medium">Avg</th>
                    <th className="px-3 py-2 font-medium">Chip prizes</th>
                    <th className="px-3 py-2 text-right font-medium">
                      <Gem className={cn("ml-auto size-3.5", DIAMOND_TEXT)} />
                    </th>
                    <th className="px-5 py-2 text-right font-medium">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => {
                    const p = r.player.toText();
                    const me = p === principalId;
                    const diff = Number(r.estimatedReceive) - Number(r.paid);
                    return (
                      <motion.tr
                        key={p}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 20) * 0.015 }}
                        className={cn(
                          "border-t border-[color:var(--term-border-faint)]",
                          me && "bg-primary/10",
                        )}
                      >
                        <td
                          className={cn("px-5 py-2.5 tabular-nums", inkFaint)}
                        >
                          {r.pos}
                        </td>
                        <td
                          className={cn("px-3 py-2.5", me ? gold : ink)}
                          title={p}
                        >
                          {me ? "You" : shortPrincipal(p)}
                          {r.playing && (
                            <span className={cn("ml-1.5", inkFaint)}>
                              · playing
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            ink,
                          )}
                        >
                          {fmtAvg(r.avgX100)}
                        </td>
                        <td className="px-3 py-2.5">
                          <TierSummary tiers={r.tiers} />
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right tabular-nums",
                            Number(r.diamonds) > 0 ? DIAMOND_TEXT : inkFaint,
                          )}
                        >
                          {Number(r.diamonds)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          <span className={ink}>
                            {fmtGoldao(r.estimatedReceive)}
                          </span>
                          <span
                            className={cn(
                              "ml-1.5 text-[10px]",
                              diff > 0
                                ? "text-[color:var(--term-green)]"
                                : diff < 0
                                  ? "text-destructive"
                                  : inkFaint,
                            )}
                          >
                            {diff === 0
                              ? "="
                              : `${diff > 0 ? "+" : ""}${(diff / 1e8).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {rows.length > TOP && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              "w-full border-t border-[color:var(--term-border-faint)] py-2.5 font-mono text-[11px] transition-smooth hover:text-[color:var(--term-ink)]",
              gold,
            )}
          >
            {showAll ? "Show top 20" : `Show all ${rows.length} players`}
          </button>
        )}
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-3 font-mono text-[11px]",
            inkFaint,
          )}
        >
          Sorted by return (payout ÷ spent). Prizes are decided chip by chip, so
          a good average can still lose if a chip ends in Rock. Unfinished chips
          count each missing excavation as 100 points (what the weekly close
          auto-plays). Everything is provisional until the close.
        </p>
      </div>

      {/* Closed weeks with draw verification data */}
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <ShieldCheck className="size-3.5" /> Past weeks
          </span>
        </div>
        {!weeks ? (
          <p className={cn("flex items-center gap-2 p-5 text-sm", inkFaint)}>
            <Spinner /> Loading past weeks
          </p>
        ) : weeks.length === 0 ? (
          <p className={cn("p-5 text-sm", inkFaint)}>No past weeks yet.</p>
        ) : (
          <>
            {/* Mobile: one card per week */}
            <ul className="sm:hidden">
              {[...weeks].reverse().map((w) => (
                <li
                  key={String(w.week)}
                  className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[color:var(--term-border-faint)] px-4 py-3 font-mono text-xs"
                >
                  <span className={ink}>Week #{Number(w.week)}</span>
                  <span className={cn("text-right", inkMid)}>
                    Pool {fmtGoldao(w.pot)}
                  </span>
                  <span className={inkMid}>
                    Treasure {fmtGoldao(w.treasurePerChip)}
                  </span>
                  <span className={cn("text-right", DIAMOND_TEXT)}>
                    Draw {fmtGoldao(w.drawPrize)}
                  </span>
                  <span
                    className={cn("col-span-2", inkFaint)}
                    title={`raw_rand: ${String(w.drawRandom)}`}
                  >
                    {w.drawWinner
                      ? `Winner ${shortPrincipal(w.drawWinner.toText())} · ticket #${Number(w.drawTicket)} of ${Number(w.drawTickets)}`
                      : "No diamonds · rolled over"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className={cn("text-left", inkFaint)}>
                    <th className="px-5 py-2 font-medium">Week</th>
                    <th className="px-3 py-2 font-medium">Prize pool</th>
                    <th className="px-3 py-2 font-medium">Treasure / chip</th>
                    <th className="px-3 py-2 font-medium">Diamond draw</th>
                    <th className="px-5 py-2 font-medium">Winner · ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weeks].reverse().map((w) => (
                    <tr
                      key={String(w.week)}
                      className="border-t border-[color:var(--term-border-faint)]"
                    >
                      <td className={cn("px-5 py-2.5", ink)}>
                        #{Number(w.week)}
                      </td>
                      <td className={cn("px-3 py-2.5", inkMid)}>
                        {fmtGoldao(w.pot)}
                      </td>
                      <td className={cn("px-3 py-2.5", inkMid)}>
                        {fmtGoldao(w.treasurePerChip)}
                      </td>
                      <td className={cn("px-3 py-2.5", DIAMOND_TEXT)}>
                        {fmtGoldao(w.drawPrize)}
                      </td>
                      <td
                        className={cn("px-5 py-2.5", inkMid)}
                        title={`raw_rand: ${String(w.drawRandom)}`}
                      >
                        {w.drawWinner
                          ? `${shortPrincipal(w.drawWinner.toText())} · #${Number(w.drawTicket)} of ${Number(w.drawTickets)}`
                          : "No diamonds · rolled over"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  diamond,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  diamond?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(panel, "flex flex-col gap-1 p-4")}
    >
      <span className={cn(eyebrow, inkFaint)}>{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-semibold tabular-nums",
          diamond ? DIAMOND_TEXT : ink,
        )}
      >
        {value}
      </span>
      {unit && (
        <span className={cn("font-mono text-[10px]", inkFaint)}>{unit}</span>
      )}
    </motion.div>
  );
}
