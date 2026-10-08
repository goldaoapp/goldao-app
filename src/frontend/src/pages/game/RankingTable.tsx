import type { GameSummary, PlayerRow, TournamentSummary } from "@/backend";
import { RankingSort } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Gem, ListOrdered } from "lucide-react";
import { useState } from "react";
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
  panel,
  panelHeader,
  shortPrincipal,
} from "./game-utils";
import { useRankingPage } from "./useGame";

const SORTS: ReadonlyArray<readonly [RankingSort, string]> = [
  [RankingSort.volume, "Volume"],
  [RankingSort.net, "Net"],
  [RankingSort.bestPrize, "Best prize"],
  [RankingSort.jackpot, "Jackpots"],
];

interface Props {
  summary: GameSummary | undefined;
  tournaments: TournamentSummary[] | undefined;
}

/**
 * The ranking tab. It is mounted only while the tab is open, so the ranking is requested only
 * when someone looks at it. The backend orders all the players and sends one page.
 */
export function RankingTable({ summary, tournaments }: Props) {
  const { principalId } = useAuth();
  const [sort, setSort] = useState<RankingSort>(RankingSort.volume);
  const [asked, setAsked] = useState(0);
  const { data: ranking, isError, refetch } = useRankingPage(sort, asked);

  const rows: PlayerRow[] = ranking?.rows ?? [];
  // The backend may clamp the page asked for; what it sent is what is shown.
  const page = ranking ? Number(ranking.page) : asked;
  const pageSize = ranking ? Number(ranking.pageSize) : 1;
  const total = ranking ? Number(ranking.totalPlayers) : 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const mine = ranking?.mine;
  // The player's own row is pinned under the page when it is on another page.
  const pinned =
    mine && !rows.some((r) => r.player.toText() === mine.player.toText())
      ? mine
      : undefined;

  const pick = (k: RankingSort) => {
    setSort(k);
    setAsked(0);
  };

  return (
    <div className="flex flex-col gap-6">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Jackpot pool" value={fmtGoldao(summary.pool)} diamond />
          <Kpi label="Top 10 pool" value={fmtGoldao(summary.top10Pool)} />
          <Kpi label="Volume" value={fmtGoldao(summary.staked)} />
          <Kpi label="Players" value={String(Number(summary.totalPlayers))} />
          <Kpi label="Ends in" value={fmtCountdown(summary.endsAt)} />
        </div>
      )}

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <ListOrdered className="size-3.5" /> Ranking
          </span>
          <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5 font-mono text-[11px]">
            {SORTS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => pick(k)}
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
          isError ? (
            <p className={cn("p-5 text-sm", inkFaint)}>
              The ranking could not be loaded.{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="underline"
              >
                Try again
              </button>
            </p>
          ) : (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          )
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
                {(pinned ? [...rows, pinned] : rows).map((p) => {
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
                          p.net > 0n ? "text-[color:var(--term-green)]" : ink,
                        )}
                      >
                        {fmtSigned(p.net)}
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
        {pages > 1 && (
          <div
            className={cn(
              "flex items-center justify-between border-t border-[color:var(--term-border-faint)] px-5 py-2 font-mono text-xs",
              inkFaint,
            )}
          >
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setAsked(Math.max(0, page - 1))}
              className="rounded p-1 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              Page {page + 1} of {pages} · {total} players
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page + 1 >= pages}
              onClick={() => setAsked(page + 1)}
              className="rounded p-1 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
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
            {ranking.jackpots.map((j) => (
              <li
                key={`${j.player.toText()}-${String(j.at)}`}
                className="flex items-center justify-between px-5 py-2.5"
              >
                <span className={ink}>{shortPrincipal(j.player.toText())}</span>
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
