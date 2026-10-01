import type { GameConfig, Ranking } from "@/backend";
import { cn } from "@/lib/utils";
import { BookOpen, Compass, Gem } from "lucide-react";
import { motion } from "motion/react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  STRATEGY_GUIDE,
  TIERS,
  TYPICAL_CUTS_X100,
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
  // With few chips the week's own cutoffs are distorted (a tier may hold a single
  // chip, and Treasure needs 11 chips): show typical ones until every tier exists.
  const liveCuts = ranking?.cutsX100 ?? [];
  const estimated = liveCuts.length !== 4 || liveCuts.some((c) => c == null);
  const cuts: (bigint | number | null)[] = estimated
    ? TYPICAL_CUTS_X100
    : liveCuts;
  const chipPrice = config ? Number(config.chipPriceE8s) / 1e8 : 1000;
  const excPerChip = config ? Number(config.excavationsPerChip) : 5;
  const mines = config ? Number(config.mines) : 5;
  const drawPct = config ? Number(config.drawBps) / 100 : 2.4;
  const treasuryPct = config ? Number(config.treasuryBps) / 100 : 1;
  // Ring while the ranking loads; a dash only when the value does not exist.
  const missing = ranking ? "—" : <Spinner />;
  const minChips = config ? Number(config.minChips) : 20;
  const minPlayers = config ? Number(config.minPlayers) : 5;

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
                      : missing
                    : cut != null
                      ? `${fmtAvg(cut)}+`
                      : missing}
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
          {estimated
            ? "Typical cutoffs (average points per chip), shown until this week has enough chips to have its own."
            : "Current cutoffs (average points per chip; unfinished chips count each missing excavation as 100)."}{" "}
          The percentage of each prize is fixed; the cutoffs move with how
          everyone plays and are confirmed at the weekly close.
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
        <div className="flex flex-col gap-3 px-5 py-4">
          <div
            className={cn(
              "grid grid-cols-[64px_minmax(0,1fr)_56px] items-end gap-3 font-mono text-[10px] uppercase sm:grid-cols-[80px_minmax(0,1fr)_96px]",
              inkFaint,
            )}
          >
            <span>Save at</span>
            <span>Where the chip ends</span>
            <span className="text-right">Win or break even</span>
          </div>
          {STRATEGY_GUIDE.map((s, row) => (
            <div
              key={s.saveAt}
              className="grid grid-cols-[64px_minmax(0,1fr)_56px] items-start gap-3 sm:grid-cols-[80px_minmax(0,1fr)_96px]"
            >
              <span className={cn("font-mono text-xs leading-7", ink)}>
                {s.saveAt} picks
              </span>
              <div className="flex flex-col gap-1">
                <div className="flex h-7 w-full divide-x divide-white/40 overflow-hidden rounded-md border border-[color:var(--term-border-faint)]">
                  {s.odds.map((pct, t) =>
                    pct > 0 ? (
                      <motion.div
                        key={TIERS[t].name}
                        title={`${TIERS[t].name}: ${pct}%`}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${pct}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: row * 0.06 }}
                        className={cn(
                          "flex items-center justify-center overflow-hidden font-mono text-[10px] font-medium",
                          TIERS[t].pill,
                        )}
                      >
                        {pct >= 8 ? `${pct}%` : ""}
                      </motion.div>
                    ) : null,
                  )}
                </div>
                {/* Segments too narrow for a label; always rendered so rows keep the same height */}
                <span className={cn("h-3.5 font-mono text-[10px]", inkFaint)}>
                  {s.odds
                    .map((pct, t) =>
                      pct > 0 && pct < 8 ? `${TIERS[t].name} ${pct}%` : null,
                    )
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span
                className={cn(
                  "text-right font-mono text-xs leading-7 tabular-nums",
                  ink,
                )}
              >
                {100 - s.odds[4]}%
              </span>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {TIERS.map((t) => (
              <span
                key={t.name}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  t.pill,
                )}
              >
                <t.icon className="size-2.5" />
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-3 font-mono text-[11px]",
            inkFaint,
          )}
        >
          Where a chip ends at the weekly close if all its excavations save at
          that pick, compared with everyone else. This is not the per-pick
          &quot;safe&quot; chance shown while digging. Simulated with a mixed
          set of players; every row adds up to 100%. Saving starts at pick 3:
          the first two picks are free.
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
            If a chip pays out, every fee you paid is refunded with your prize.
          </Rule>
          <Rule
            title={
              <span className={cn("flex items-center gap-1", DIAMOND_TEXT)}>
                <Gem className="size-3.5" /> Diamonds
              </span>
            }
          >
            2% chance on every safe pick. Each diamond is a ticket for the
            weekly draw of {drawPct}% of the prize pool. One winner, verifiable
            on chain.
          </Rule>
          <Rule title="Running costs">
            {treasuryPct}% of the prize pool is kept to pay for the cycles that
            run the game.
          </Rule>
          <Rule title="Weekly close">
            Open excavations are saved and unused ones are auto-played saving at
            3. A week needs at least {minChips} chips from {minPlayers}{" "}
            different players to close.
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
