import type { Dashboard } from "@/backend";
import { cn } from "@/lib/utils";
import {
  Gem,
  History,
  LayoutDashboard,
  Mountain,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { motion } from "motion/react";
import {
  DIAMOND_TEXT,
  TIERS,
  eyebrow,
  fmtAvg,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  tierOf,
} from "./game-utils";
import { useGameConfig } from "./useGame";

interface Props {
  dashboard: Dashboard | undefined;
}

export function PlayerDashboard({ dashboard }: Props) {
  const { data: config } = useGameConfig();
  const excPerChip = config ? Number(config.excavationsPerChip) : 5;

  if (!dashboard) {
    return (
      <div className={cn(panel, "p-8 text-center text-sm", inkFaint)}>
        Sign in to see your week.
      </div>
    );
  }

  const paid = Number(dashboard.paid);
  const receive = Number(dashboard.estimatedReceive);
  const net = receive - paid;
  const totalDiamonds = Number(dashboard.totalDiamonds);
  const myDiamonds = Number(dashboard.diamonds);
  const drawChance = totalDiamonds > 0 ? (myDiamonds / totalDiamonds) * 100 : 0;
  const hasChips = dashboard.chips.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Prize counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TIERS.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(panel, "flex flex-col gap-2 p-4")}
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
                "font-display text-3xl font-semibold tabular-nums",
                ink,
              )}
            >
              {Number(dashboard.tiers[i] ?? 0n)}
            </span>
            <span className={cn("font-mono text-[10px]", inkFaint)}>
              {t.pct}% of chips · {t.payout}
            </span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={cn(panel, "flex flex-col gap-2 p-4")}
        >
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium",
              DIAMOND_TEXT,
            )}
          >
            <Gem className="size-3" /> Diamonds
          </span>
          <span
            className={cn(
              "font-display text-3xl font-semibold tabular-nums",
              DIAMOND_TEXT,
            )}
          >
            {myDiamonds}
          </span>
          <span className={cn("font-mono text-[10px]", inkFaint)}>
            {drawChance > 0
              ? `${drawChance.toFixed(1)}% draw chance`
              : "No tickets yet"}
          </span>
        </motion.div>
      </div>
      <p className={cn("-mt-3 font-mono text-[11px]", inkFaint)}>
        Prizes are provisional until the weekly close.
      </p>

      {/* Money + records */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
              <LayoutDashboard className="size-3.5" /> This week
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-y-4 p-5 font-mono text-sm">
            <Row label="Paid" value={`${fmtGoldao(dashboard.paid)} GOLDAO`} />
            <Row
              label="Receiving now"
              value={`${fmtGoldao(dashboard.estimatedReceive)} GOLDAO`}
            />
            <Row
              label="Result"
              value={
                <span
                  className={cn(
                    "flex items-center gap-1",
                    net > 0
                      ? "text-[color:var(--term-green)]"
                      : net < 0
                        ? "text-destructive"
                        : inkMid,
                  )}
                >
                  {net > 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : net < 0 ? (
                    <TrendingDown className="size-3.5" />
                  ) : null}
                  {net > 0 ? "+" : ""}
                  {(net / 1e8).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              }
            />
            <Row label="Chips" value={String(dashboard.chips.length)} />
          </dl>
        </div>

        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
              <Trophy className="size-3.5" /> Records
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-y-4 p-5 font-mono text-sm">
            <Row
              label="Best excavation"
              value={`${Number(dashboard.stats.best)} pts`}
            />
            <Row
              label="Deepest pick"
              value={String(Number(dashboard.stats.deepest))}
            />
            <Row
              label="Collapses"
              value={
                <span className="flex items-center gap-1">
                  <Mountain className="size-3.5" />{" "}
                  {Number(dashboard.stats.collapses)}
                </span>
              }
            />
            <Row
              label="Purchases"
              value={String(Number(dashboard.stats.playTx))}
            />
          </dl>
        </div>
      </div>

      {/* Chips */}
      {hasChips && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>Your chips</span>
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              Each chip competes on its own
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {dashboard.chips.map((c, i) => {
              const tier = tierOf(c.tier);
              const used = Number(c.used);
              return (
                <motion.div
                  key={String(c.id)}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col gap-2 rounded-lg border border-[color:var(--term-border-faint)] bg-[var(--term-alt)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("font-mono text-[11px]", inkFaint)}>
                      Chip {i + 1} · {used}/{excPerChip}
                    </span>
                    {Number(c.diamonds) > 0 && (
                      <span
                        className={cn(
                          "flex items-center gap-1 font-mono text-[11px]",
                          DIAMOND_TEXT,
                        )}
                      >
                        <Gem className="size-3" /> {Number(c.diamonds)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-display text-xl font-semibold tabular-nums",
                        ink,
                      )}
                    >
                      {used > 0 ? fmtAvg(c.avgX100) : "—"}
                    </span>
                    {used > 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          tier.pill,
                        )}
                      >
                        <tier.icon className="size-3" />
                        {tier.name}
                      </span>
                    )}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-[var(--term-header)]">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${(used / excPerChip) * 100}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                  <span className={cn("font-mono text-[10px]", inkFaint)}>
                    {used === 0
                      ? "Not started"
                      : c.gapToNextX100 !== undefined
                        ? `${fmtAvg(c.gapToNextX100)} pts to ${tierOf(Number(c.tier) - 1).name}`
                        : Number(c.tier) === 0
                          ? "Top prize"
                          : " "}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <History className="size-3.5" /> Past weeks
          </span>
        </div>
        {dashboard.history.length === 0 ? (
          <p className={cn("p-5 text-sm", inkFaint)}>
            Your closed weeks will show up here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className={cn("text-left", inkFaint)}>
                  <th className="px-5 py-2 font-medium">Week</th>
                  <th className="px-3 py-2 font-medium">Chips</th>
                  <th className="px-3 py-2 font-medium">Prizes</th>
                  <th className="px-3 py-2 font-medium">Diamonds</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-5 py-2 text-right font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {[...dashboard.history].reverse().map((h) => {
                  const diff = Number(h.received) - Number(h.paid);
                  return (
                    <tr
                      key={String(h.week)}
                      className="border-t border-[color:var(--term-border-faint)]"
                    >
                      <td className={cn("px-5 py-2.5", ink)}>
                        #{Number(h.week)}
                      </td>
                      <td className={cn("px-3 py-2.5", inkMid)}>
                        {Number(h.chips)}
                      </td>
                      <td className="px-3 py-2.5">
                        <TierSummary tiers={h.tiers} />
                      </td>
                      <td className={cn("px-3 py-2.5", DIAMOND_TEXT)}>
                        {Number(h.diamonds)}
                        {h.drawWon && " · draw won"}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right", inkMid)}>
                        {fmtGoldao(h.paid)}
                      </td>
                      <td
                        className={cn(
                          "px-5 py-2.5 text-right",
                          diff >= 0
                            ? "text-[color:var(--term-green)]"
                            : "text-destructive",
                        )}
                      >
                        {fmtGoldao(h.received)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={cn("text-[10px] uppercase tracking-wider", inkFaint)}>
        {label}
      </dt>
      <dd className={cn("tabular-nums", ink)}>{value}</dd>
    </div>
  );
}

/** "Treasure ×1 · Ingot ×4" style summary, best to worst. */
export function TierSummary({ tiers }: { tiers: bigint[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tiers.map((n, i) => {
        if (Number(n) === 0) return null;
        const t = TIERS[i];
        return (
          <span
            key={t.name}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              t.pill,
            )}
          >
            <t.icon className="size-2.5" />
            {t.name} ×{Number(n)}
          </span>
        );
      })}
    </span>
  );
}
