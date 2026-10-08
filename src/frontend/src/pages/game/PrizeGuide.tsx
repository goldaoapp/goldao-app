import type { GameConfig } from "@/backend";
import { cn } from "@/lib/utils";
import { BookOpen, Gem, Mountain } from "lucide-react";
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
import {
  LIVE_RTP_MIN_POOL,
  LONG_RUN_RTP_TEXT,
  diamondChances,
  liveRtpPct,
} from "./rtp";

interface Props {
  config: GameConfig | undefined;
  stakes: bigint[] | undefined;
  /** Current jackpot pool (e8s), used for the live RTP. */
  pool: bigint | undefined;
}

/** Chance (%) of reaching `picks` safe picks: the first two are free. */
function reachPct(picks: number, cells: number, mines: number, safe: number) {
  let p = 1;
  for (let n = safe; n < picks; n++) p *= 1 - mines / (cells - n);
  return p * 100;
}

export function PrizeGuide({ config, stakes, pool }: Props) {
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
  const showLiveRtp = pool !== undefined && pool > LIVE_RTP_MIN_POOL;
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
        <div className={cn("flex flex-col gap-3 p-5 text-sm", inkMid)}>
          <p>
            Choose a stake and dig. The board has {cells} cells and {mines} of
            them collapse the mine. The first {safe} picks are always safe. From
            the third pick you can save: you receive{" "}
            <span className={ink}>your stake x the multiplier</span> shown
            below.
          </p>
          <p>
            Before digging, load balance from your wallet into your Accumulated
            prize. Every stake comes out of it: wins are added, and if the mine
            collapses you keep GOLDAO secured, about half of your stake or more,
            shown in the If it collapses column; the rest of the stake is
            deducted. The wallet is only touched when you load balance, and each
            load pays the {fmtGoldao(config.feeE8s)} GOLDAO network fee.
          </p>
          <p>
            When the tournament closes, your Accumulated prize is paid to your
            wallet if it is at least {fmtGoldao(config.minPayoutE8s)} GOLDAO
            (the payment costs the network fee). Smaller balances stay in your
            Accumulated prize for the next tournament.
          </p>
          <p>
            Top 10: {Number(config.top10Bps) / 100}% of every stake goes to a
            prize pool paid when the tournament closes to the ten players with
            the most volume staked (
            {config.top10Weights.map((w) => `${Number(w)}%`).join(", ")} of the
            pool, from first to tenth). You need at least{" "}
            {fmtGoldao(config.top10MinVolumeE8s)} GOLDAO staked to qualify; the
            shares nobody qualifies for stay in the pool for the next
            tournament. Your place shows next to your Accumulated prize.
          </p>
          <div className="mt-2 flex flex-col gap-2 border-t border-[color:var(--term-border-faint)] pt-4">
            <span className={cn(eyebrow, gold)}>RTP</span>
            <p>
              <span className={cn("font-mono text-lg font-semibold", ink)}>
                RTP: {LONG_RUN_RTP_TEXT}
              </span>
              <br />
              Return to player: on average, about 98.5 GOLDAO come back for
              every 100 GOLDAO staked, counting the jackpots. It is an average
              over many excavations and jackpot pool sizes.
            </p>
            {showLiveRtp && pool !== undefined && (
              <p>
                <span className={cn("font-mono text-lg font-semibold", gold)}>
                  Live RTP: {liveRtpPct(config, pool).toFixed(1)}%
                </span>
                <br />
                The jackpot pool is above {fmtGoldao(LIVE_RTP_MIN_POOL)} GOLDAO
                ({fmtGoldao(pool)} now), so the return of your next excavation
                is above average. It counts the prizes, the Top 10 share and the
                part of the pool that two or three diamonds pay, for a player
                who saves between pick 3 and pick 10, and it changes as the pool
                changes.
              </p>
            )}
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
