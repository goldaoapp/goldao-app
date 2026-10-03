import type { GameConfig } from "@/backend";
import { cn } from "@/lib/utils";
import { BookOpen, Gem } from "lucide-react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  eyebrow,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
} from "./game-utils";

interface Props {
  config: GameConfig | undefined;
}

export function PrizeGuide({ config }: Props) {
  if (!config) {
    return (
      <div className={cn(panel, "flex justify-center p-8")}>
        <Spinner />
      </div>
    );
  }
  const pts = config.pointsTable.map(Number);
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
            Pick a stake and dig. The board has {Number(config.cells)} cells and{" "}
            {Number(config.mines)} of them collapse the mine. Each safe pick
            adds points. Save at any time after {Number(config.safePicks)} safe
            picks to take{" "}
            <span className={ink}>
              {Number(config.payoutBps) / 100}% of stake x points
            </span>
            .
          </p>
          <p>
            If the mine collapses you keep half of the points reached, so the
            loss is the rest of the stake. The stake is only taken from your
            wallet when it collapses; wins are added to your game credit and
            paid out when the tournament closes.
          </p>
          <p className={DIAMOND_TEXT}>
            <Gem className="mr-1 inline size-3.5" />
            Diamonds can appear on safe picks and grow the jackpot prize.
            Jackpots found on the first two picks are confirmed from the third
            pick on.
          </p>
          <p>
            Stakes: {fmtGoldao(config.stakeMinE8s)} minimum, up to{" "}
            {fmtGoldao(config.stakeCapE8s)}. Payout transfers pay a{" "}
            {fmtGoldao(config.feeE8s)} GOLDAO network fee.
          </p>
        </div>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold)}>Points per safe pick</span>
        </div>
        <div className="flex flex-wrap gap-2 p-5 font-mono text-xs">
          {pts.slice(1).map((p, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static table
              key={i}
              className="flex flex-col items-center rounded-md border border-[color:var(--term-border)] px-3 py-1.5"
            >
              <span className={inkFaint}>{i + 1}</span>
              <span className={ink}>{p}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
