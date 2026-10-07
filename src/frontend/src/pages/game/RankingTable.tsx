import type { Ranking, TournamentSummary } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Gem, ListOrdered } from "lucide-react";
import { useMemo, useState } from "react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  eyebrow,
  fmtCountdown,
  fmtDate,
  fmtGoldao,
  fmtSigned,
  gold,
  ink,
  inkFaint,
  netOf,
  panel,
  panelHeader,
  shortPrincipal,
} from "./game-utils";

type SortKey = "volume" | "net" | "points" | "jackpot";

const TOP = 20;

interface Props {
  ranking: Ranking | undefined;
  tournaments: TournamentSummary[] | undefined;
}

export function RankingTable({ ranking, tournaments }: Props) {
  const { principalId } = useAuth();
  const [sort, setSort] = useState<SortKey>("volume");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    if (!ranking) return [];
    const base = [...ranking.players];
    const key = (p: (typeof base)[number]) =>
      sort === "volume"
        ? Number(p.staked)
        : sort === "points"
          ? Number(p.bestReturn)
          : sort === "jackpot"
            ? Number(p.jackpotWon)
            : Number(netOf(p));
    return base
      .sort((a, b) => key(b) - key(a))
      .map((p, i) => ({ ...p, pos: i + 1 }));
  }, [ranking, sort]);

  const visible = useMemo(() => {
    if (showAll || rows.length <= TOP) return rows;
    const top = rows.slice(0, TOP);
    const mine = rows.find((r) => r.player.toText() === principalId);
    return mine && !top.includes(mine) ? [...top, mine] : top;
  }, [rows, showAll, principalId]);

  return (
    <div className="flex flex-col gap-6">
      {ranking && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Jackpot pool" value={fmtGoldao(ranking.pool)} diamond />
          <Kpi label="Top 10 pool" value={fmtGoldao(ranking.top10Pool)} />
          <Kpi label="Volume" value={fmtGoldao(ranking.staked)} />
          <Kpi label="Players" value={String(Number(ranking.totalPlayers))} />
          <Kpi label="Ends in" value={fmtCountdown(ranking.endsAt)} />
        </div>
      )}

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <ListOrdered className="size-3.5" /> Ranking
          </span>
          <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5 font-mono text-[11px]">
            {(
              [
                ["volume", "Volume"],
                ["net", "Net"],
                ["points", "Best prize"],
                ["jackpot", "Jackpots"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn(
                  "rounded px-2 py-1",
                  sort === k ? "bg-primary text-primary-foreground" : inkFaint,
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {!ranking ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <p className={cn("p-5 text-sm", inkFaint)}>No players yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className={cn("text-left", inkFaint)}>
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Player</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">
                    Excavations
                  </th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">
                    Volume
                  </th>
                  <th className="px-3 py-2 font-medium">Top 10</th>
                  <th className="px-3 py-2 font-medium">Net result</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">
                    Best prize
                  </th>
                  <th className="px-5 py-2 text-right font-medium">Jackpots</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const me = p.player.toText() === principalId;
                  return (
                    <tr
                      key={p.player.toText()}
                      className={cn(
                        "border-t border-[color:var(--term-border-faint)]",
                        me && "bg-primary/10",
                      )}
                    >
                      <td className={cn("px-5 py-2.5", ink)}>{p.pos}</td>
                      <td className={cn("px-3 py-2.5", ink)}>
                        {shortPrincipal(p.player.toText())}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {Number(p.excavations)}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {fmtGoldao(p.staked)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          p.prize > 0n ? gold : inkFaint,
                        )}
                      >
                        #{Number(p.rank)}
                        {p.prize > 0n ? ` +${fmtGoldao(p.prize)}` : ""}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 tabular-nums",
                          netOf(p) > 0n
                            ? "text-[color:var(--term-green)]"
                            : ink,
                        )}
                      >
                        {fmtSigned(netOf(p))}
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        {p.bestReturn > 0n ? fmtGoldao(p.bestReturn) : "-"}
                      </td>
                      <td
                        className={cn(
                          "px-5 py-2.5 text-right tabular-nums",
                          p.jackpotWon > 0n ? DIAMOND_TEXT : ink,
                        )}
                      >
                        {p.jackpotWon > 0n ? fmtGoldao(p.jackpotWon) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > TOP && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              "w-full border-t px-5 py-2 font-mono text-xs",
              inkFaint,
            )}
          >
            {showAll ? "Show top 20" : `Show all ${rows.length}`}
          </button>
        )}
      </div>

      {ranking && ranking.lastTop10.length > 0 && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>
              Top 10 winners · tournament{" "}
              {Number(ranking.lastTop10[0].tournament)}
            </span>
          </div>
          <ul className="divide-y divide-[color:var(--term-border-faint)] font-mono text-xs">
            {ranking.lastTop10.map((w) => (
              <li
                key={`${w.player.toText()}-${String(w.rank)}`}
                className="flex items-center justify-between px-5 py-2.5"
              >
                <span className={ink}>
                  #{Number(w.rank)} {shortPrincipal(w.player.toText())}
                </span>
                <span className={inkFaint}>{fmtGoldao(w.volume)} volume</span>
                <span className={cn("tabular-nums", gold)}>
                  +{fmtGoldao(w.prize)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranking && ranking.jackpots.length > 0 && (
        <div className={panel}>
          <div className={panelHeader}>
            <span
              className={cn(eyebrow, DIAMOND_TEXT, "flex items-center gap-2")}
            >
              <Gem className="size-3.5" /> Recent jackpots
            </span>
          </div>
          <ul className="divide-y divide-[color:var(--term-border-faint)] font-mono text-xs">
            {[...ranking.jackpots]
              .reverse()
              .slice(0, 10)
              .map((j) => (
                <li
                  key={`${j.player.toText()}-${String(j.at)}`}
                  className="flex items-center justify-between px-5 py-2.5"
                >
                  <span className={ink}>
                    {shortPrincipal(j.player.toText())}
                  </span>
                  <span className={inkFaint}>{fmtDate(j.at)}</span>
                  <span className={cn("tabular-nums", DIAMOND_TEXT)}>
                    {fmtGoldao(j.amount)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {tournaments && tournaments.length > 0 && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>Past tournaments</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className={cn("text-left", inkFaint)}>
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Players</th>
                  <th className="px-3 py-2 font-medium">Excavations</th>
                  <th className="px-3 py-2 font-medium">Volume</th>
                  <th className="px-5 py-2 text-right font-medium">Jackpots</th>
                </tr>
              </thead>
              <tbody>
                {[...tournaments].reverse().map((t) => (
                  <tr
                    key={String(t.tournament)}
                    className="border-t border-[color:var(--term-border-faint)]"
                  >
                    <td className={cn("px-5 py-2.5", ink)}>
                      {Number(t.tournament)}
                    </td>
                    <td className="px-3 py-2.5">{Number(t.players)}</td>
                    <td className="px-3 py-2.5">{Number(t.excavations)}</td>
                    <td className="px-3 py-2.5">{fmtGoldao(t.staked)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {fmtGoldao(t.jackpotPaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  diamond,
}: { label: string; value: string; diamond?: boolean }) {
  return (
    <div className={cn(panel, "flex flex-col gap-1 p-4")}>
      <span className={cn(eyebrow, inkFaint)}>{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-semibold tabular-nums",
          diamond ? DIAMOND_TEXT : ink,
        )}
      >
        {value}
      </span>
    </div>
  );
}
