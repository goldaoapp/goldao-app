import type { GameConfig, Ranking } from "@/backend";
import { cn } from "@/lib/utils";
import { BookOpen, Compass, Gem } from "lucide-react";
import { motion } from "motion/react";
import {
  DIAMOND_TEXT,
  STRATEGY_GUIDE,
  TIERS,
  eyebrow,
  fmtAvg,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
} from "./game-utils";

interface Props {
  ranking: Ranking | undefined;
  config: GameConfig | undefined;
}

export function PrizeGuide({ ranking, config }: Props) {
  const cuts = ranking?.cutsX100 ?? [];
  const chipPrice = config ? Number(config.chipPriceE8s) / 1e8 : 1000;
  const excPerChip = config ? Number(config.excavationsPerChip) : 10;
  const mines = config ? Number(config.mines) : 5;
  const drawPct = config ? Number(config.drawBps) / 100 : 2.4;
  const treasuryPct = config ? Number(config.treasuryBps) / 100 : 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Current cutoffs */}
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Compass className="size-3.5" /> How to reach each prize
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-5 sm:p-5">
          {TIERS.map((t, i) => {
            const cut = cuts[i];
            const nextUp = i === 4 ? cuts[3] : null;
            return (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex flex-col gap-2 rounded-lg border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] p-4"
              >
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    t.pill,
                  )}
                >
                  <t.icon className="size-3" />
                  {t.name}
                </span>
                <span
                  className={cn(
                    "font-display text-2xl font-semibold tabular-nums",
                    ink,
                  )}
                >
                  {i === 4
                    ? nextUp != null
                      ? `< ${fmtAvg(nextUp)}`
                      : "—"
                    : cut != null
                      ? `${fmtAvg(cut)}+`
                      : "—"}
                </span>
                <span className={cn("font-mono text-[10px]", inkFaint)}>
                  {t.pct}% of chips · pays {t.payout}
                </span>
              </motion.div>
            );
          })}
        </div>
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-3 font-mono text-[11px]",
            inkFaint,
          )}
        >
          Current cutoffs (average points per chip). The percentage of each
          prize is fixed; the cutoffs move with how everyone plays and are
          confirmed at the weekly close.
        </p>
      </div>

      {/* Strategy */}
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold)}>Strategy</span>
        </div>
        <p className={cn("px-5 pt-4 text-sm", inkMid)}>
          Saving early protects you from Rock. To fight for the Treasure you
          have to keep digging.
        </p>
        <div className="overflow-x-auto p-2 sm:p-3">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className={cn("text-left", inkFaint)}>
                <th className="px-3 py-2 font-medium">Save at</th>
                <th className="px-3 py-2 font-medium">Treasure</th>
                <th className="px-3 py-2 font-medium">Ingot</th>
                <th className="px-3 py-2 font-medium">Rock</th>
                <th className="px-3 py-2 font-medium">Typical range</th>
              </tr>
            </thead>
            <tbody>
              {STRATEGY_GUIDE.map((s) => (
                <tr
                  key={s.saveAt}
                  className="border-t border-[color:var(--term-border-faint)]"
                >
                  <td className={cn("px-3 py-2.5", ink)}>{s.saveAt} picks</td>
                  <td className={cn("px-3 py-2.5", inkMid)}>{s.treasure}</td>
                  <td className={cn("px-3 py-2.5", inkMid)}>{s.ingot}</td>
                  <td className={cn("px-3 py-2.5", inkMid)}>{s.rock}</td>
                  <td className={cn("px-3 py-2.5", inkMid)}>{s.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-3 font-mono text-[11px]",
            inkFaint,
          )}
        >
          Approximate odds per chip, simulated with a mixed set of players.
        </p>
      </div>

      {/* Rules */}
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <BookOpen className="size-3.5" /> Rules
          </span>
        </div>
        <ul className={cn("grid gap-3 p-5 text-sm sm:grid-cols-2", inkMid)}>
          <Rule title="Chips">
            {chipPrice.toLocaleString("en-US")} GOLDAO buys one chip with{" "}
            {excPerChip} excavations. Every chip competes on its own, so playing
            more never gives an edge.
          </Rule>
          <Rule title="The mine">
            {mines} hidden collapses in 25 cells. The first two picks are always
            safe and worth 100 points. You can save from the third pick on.
          </Rule>
          <Rule title="Collapses">
            A collapse ends the excavation and keeps half of the points you had.
          </Rule>
          <Rule title="Ranking">
            Your chip&apos;s average points decide its prize. Ties go to whoever
            finished first.
          </Rule>
          <Rule title="Fees">
            If you receive anything, every fee you paid is refunded with your
            prize.
          </Rule>
          <Rule
            title={
              <span className={cn("flex items-center gap-1", DIAMOND_TEXT)}>
                <Gem className="size-3.5" /> Diamonds
              </span>
            }
          >
            2% chance on every safe pick. Each diamond is a ticket for the
            weekly draw of {drawPct}% of the pot. One winner, verifiable on
            chain.
          </Rule>
          <Rule title="Treasury">
            {treasuryPct}% of the pot stays in the treasury to pay for cycles.
          </Rule>
          <Rule title="Weekly close">
            Open excavations are saved and unused ones are auto-played saving at
            3. A week needs at least 20 chips to close.
          </Rule>
        </ul>
      </div>
    </div>
  );
}

function Rule({
  title,
  children,
}: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] p-4">
      <span className={cn("font-display text-sm font-semibold", ink)}>
        {title}
      </span>
      <span className="text-[13px] leading-relaxed">{children}</span>
    </li>
  );
}
