import type { GameConfig } from "@/backend";
import { cn } from "@/lib/utils";
import { BookOpen, Gem, Mountain } from "lucide-react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
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
  const d1 = Number(config.diamond1Bps) / 10_000;
  const d2 = Number(config.diamond2Bps) / 10_000;
  const perGoldao = Number(config.diamond3PerGoldao) / Number(1e8);
  const jackpotChance = (stake: bigint) =>
    d1 * d2 * (Number(stake / 100_000_000n) * perGoldao);

  const rows = pts
    .map((p, picks) => ({ picks, p }))
    .filter((r) => r.picks > safe);

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
            below, rounded down to 2 decimals.
          </p>
          <p>
            Before digging, load credit into To collect from your wallet. Every
            stake comes out of it: wins are added, and if the mine collapses you
            get half of the points reached (rounded up), shown in the If it
            collapses column; the rest of the stake is deducted. The wallet is
            only touched when you load credit, and each load pays the{" "}
            {fmtGoldao(config.feeE8s)} GOLDAO network fee.
          </p>
          <p>
            When the tournament closes, To collect is paid to your wallet if it
            is at least {fmtGoldao(config.minPayoutE8s)} GOLDAO (the payment
            costs the network fee). Smaller balances stay in To collect for the
            next tournament.
          </p>
          <p>
            Top 10: {Number(config.top10Bps) / 100}% of every stake goes to a
            prize pool paid when the tournament closes to the ten players with
            the most volume staked (
            {config.top10Weights.map((w) => `${Number(w)}%`).join(", ")} of the
            pool, from first to tenth). You need at least{" "}
            {fmtGoldao(config.top10MinVolumeE8s)} GOLDAO staked to qualify; the
            shares nobody qualifies for stay in the pool for the next
            tournament. Your place shows next to To collect.
          </p>
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
                <th className="px-5 py-2 font-medium">Save at pick</th>
                <th className="px-3 py-2 font-medium">Prize</th>
                <th className="px-3 py-2 font-medium">Multiplier</th>
                <th className="px-3 py-2 font-medium">If it collapses</th>
                <th className="px-5 py-2 text-right font-medium">
                  Chance to reach
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ picks, p }) => {
                const prize = prizeName(picks);
                const Icon = prize.icon;
                return (
                  <tr
                    key={picks}
                    className="border-t border-[color:var(--term-border-faint)]"
                  >
                    <td className={cn("px-5 py-2.5", ink)}>{picks}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                          prize.pill,
                        )}
                      >
                        <Icon className="size-3" />
                        {prize.name}
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5 tabular-nums", ink)}>
                      {fmtMult(p, bps)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <Mountain className="mr-1 inline size-3" />
                      {fmtMult(collapsePoints(p), bps)}
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
            Any safe pick can reveal a diamond. Three diamonds in a row win the
            whole jackpot. A jackpot found on the first two picks is confirmed
            from the third pick on. The bigger the stake, the better the chance.
          </p>
          {stakes && stakes.length === 3 && (
            <div className="flex flex-wrap gap-3 font-mono text-xs">
              {stakes.map((s, i) => (
                <span
                  key={STAKE_LABELS[i]}
                  className="rounded-md border border-[color:var(--term-border)] px-3 py-1.5"
                >
                  {STAKE_LABELS[i]} {fmtGoldao(s)}:{" "}
                  <span className={ink}>
                    1 in{" "}
                    {Math.round(1 / jackpotChance(s)).toLocaleString("en-US")}
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
