import type { GameConfig } from "@/backend";
import { cn } from "@/lib/utils";
import { BookOpen, Gem, Mountain } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  MAX_PICKS,
  STAKE_LABELS,
  collapsePoints,
  eyebrow,
  fmtGoldao,
  fmtMult,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  prizeName,
} from "./game-utils";
import { RTP_RANGE_TEXT, diamondChances } from "./rtp";

interface Props {
  config: GameConfig | undefined;
  stakes: bigint[] | undefined;
}

/** Chance (%) of reaching `picks` safe picks: the first two are free. */
function reachPct(picks: number, cells: number, mines: number, safe: number) {
  let p = 1;
  for (let n = safe; n < picks; n++) p *= 1 - mines / (cells - n);
  return p * 100;
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
      <span className={cn("shrink-0 font-semibold sm:w-36", ink)}>{title}</span>
      <p>{children}</p>
    </div>
  );
}

export function PrizeGuide({ config, stakes }: Props) {
  if (!config) {
    return (
      <div className={cn(panel, "flex justify-center p-8")}>
        <Spinner />
      </div>
    );
  }
  const cells = Number(config.cells);
  const mines = Number(config.mines);
  const safe = Number(config.safePicks);
  const pts = config.pointsTable.map(Number);
  const bps = Number(config.payoutBps);
  const miniPct = Number(config.miniBps) / 100;
  const closeMinutes = Math.round(
    Number(config.closeWindowNs) / 60_000_000_000,
  );
  const oneIn = (chance: number) =>
    Math.round(1 / chance).toLocaleString("en-US");

  const rows = pts
    .map((p, picks) => ({ picks, p }))
    .filter((r) => r.picks >= safe);

  return (
    <div className="flex flex-col gap-6">
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <BookOpen className="size-3.5" /> How it works
          </span>
        </div>
        <div className={cn("flex flex-col gap-4 p-5 text-sm", inkMid)}>
          <Step title="Dig">
            Pick cells on a board of {cells}. {mines} of them collapse the
            mine. The first {safe} picks are always safe. From pick {safe + 1}{" "}
            you can save and receive{" "}
            <span className={ink}>your stake x the multiplier</span> (see the
            table below).
          </Step>
          <Step title="Accumulated prize">
            Load balance from your wallet first ({fmtGoldao(config.feeE8s)}{" "}
            GOLDAO network fee per load). Each stake is taken from it at your
            first pick and wins are added back. It stays in the game between
            tournaments until you withdraw. If an excavation cannot start, the
            stake is returned.
          </Step>
          <Step title="If it collapses">
            You keep part of your stake secured, about half or more (see the
            collapse column below). The rest is lost.
          </Step>
          <Step title="Tournament end">
            An open excavation has {closeMinutes} minutes to finish. After
            that it is saved if you reached pick {safe + 1}, and lost otherwise.
          </Step>
          <Step title="Withdraw">
            Any time, minimum {fmtGoldao(config.withdrawMinE8s)} GOLDAO (the
            network fee comes out of it). It stays open while a tournament
            closes, except for a few seconds while the Top 10 prizes are
            checked, and it is not available during a safety pause. If the game
            closes, every balance is sent back to its wallet.
          </Step>
          <Step title="Top 10">
            {Number(config.top10Bps) / 100}% of every stake goes to a prize
            pool for the ten players with the most volume staked (
            {config.top10Weights.map((w) => `${Number(w)}%`).join(", ")} of the
            pool, first to tenth). Minimum {fmtGoldao(config.top10MinVolumeE8s)}{" "}
            GOLDAO staked to qualify. Unclaimed shares roll over to the next
            tournament. Ties: more excavations, then deepest pick, then fewer
            collapses, then higher net result.
          </Step>
          <div className="mt-2 flex flex-col gap-1 border-t border-[color:var(--term-border-faint)] pt-4">
            <span className={cn(eyebrow, gold)}>RTP</span>
            <span className={cn("font-mono text-lg font-semibold", ink)}>
              {RTP_RANGE_TEXT}
            </span>
            <p>
              Average return to players, based on thousands of simulations:
              ~98.5%, rising with the jackpot pool.
            </p>
          </div>
        </div>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold)}>Prize per pick</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className={cn("text-left", inkFaint)}>
                <th className="px-5 py-2 font-medium">Save after pick</th>
                <th className="px-3 py-2 font-medium">Prize</th>
                <th className="px-3 py-2 font-medium">Multiplier</th>
                <th className="px-3 py-2 font-medium">
                  If the next pick collapses
                </th>
                <th className="px-5 py-2 text-right font-medium">
                  Chance to reach
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ picks, p }) => {
                const prize = prizeName(picks);
                const Icon = prize.icon;
                // Saving unlocks after pick 3, and pick 10 is collected by itself.
                const canSaveHere = picks > safe;
                const lastPick = picks >= MAX_PICKS;
                return (
                  <tr
                    key={picks}
                    className="border-t border-[color:var(--term-border-faint)]"
                  >
                    <td className={cn("px-5 py-2.5", ink)}>{picks}</td>
                    <td className="px-3 py-2.5">
                      {canSaveHere ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                            prize.pill,
                          )}
                        >
                          <Icon className="size-3" />
                          {prize.name}
                        </span>
                      ) : (
                        <span className={inkFaint}>Cannot save yet</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-2.5 tabular-nums", ink)}>
                      {canSaveHere ? fmtMult(p, bps) : "-"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {lastPick ? (
                        <span className={inkFaint}>-</span>
                      ) : (
                        <>
                          <Mountain className="mr-1 inline size-3" />
                          {fmtMult(collapsePoints(p), bps)}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {reachPct(picks, cells, mines, safe).toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-3 font-mono text-[11px]",
            inkFaint,
          )}
        >
          Each row is a moment of the excavation: the picks you have already
          made safely. The collapse column is what you get if you keep digging
          and the very next pick collapses. The first {safe} picks are always
          safe, so the next pick is the first with real risk. At pick 10 the
          prize is collected automatically.
        </p>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span
            className={cn(eyebrow, DIAMOND_TEXT, "flex items-center gap-2")}
          >
            <Gem className="size-3.5" /> Diamond jackpot
          </span>
        </div>
        <div className={cn("flex flex-col gap-3 p-5 text-sm", inkMid)}>
          <p>
            Every safe pick can reveal up to three diamonds. One diamond pays
            nothing, two diamonds win the mini jackpot ({miniPct}% of the pool)
            and three diamonds win the whole jackpot. A jackpot found on the
            first two picks is confirmed from the third pick on. The bigger the
            stake, the better the chance.
          </p>
          {stakes && stakes.length === 3 && (
            <div className="flex flex-wrap gap-3 font-mono text-xs">
              {stakes.map((s, i) => (
                <span
                  key={STAKE_LABELS[i]}
                  className="rounded-md border border-[color:var(--term-border)] px-3 py-1.5"
                >
                  {STAKE_LABELS[i]} {fmtGoldao(s)}: mini{" "}
                  <span className={ink}>
                    1 in {oneIn(diamondChances(config, s).mini)}
                  </span>
                  , full{" "}
                  <span className={ink}>
                    1 in {oneIn(diamondChances(config, s).full)}
                  </span>{" "}
                  per safe pick
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
