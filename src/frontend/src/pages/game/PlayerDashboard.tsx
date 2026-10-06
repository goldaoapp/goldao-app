import type { Dashboard } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Gem, History, LayoutDashboard } from "lucide-react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  bestPrizeText,
  eyebrow,
  fmtCountdown,
  fmtGoldao,
  fmtSigned,
  gold,
  ink,
  inkFaint,
  netOf,
  panel,
  panelHeader,
} from "./game-utils";
import { useGameConfig } from "./useGame";

interface Props {
  dashboard: Dashboard | undefined;
}

export function PlayerDashboard({ dashboard }: Props) {
  const { isAuthenticated } = useAuth();
  const { data: config } = useGameConfig();

  if (!dashboard) {
    return (
      <div
        className={cn(
          panel,
          "flex items-center justify-center gap-2 p-8 text-sm",
          inkFaint,
        )}
      >
        {isAuthenticated ? (
          <>
            <Spinner /> Loading your tournament
          </>
        ) : (
          "Sign in to see your tournament."
        )}
      </div>
    );
  }

  const s = dashboard.stats;
  const net = netOf(s);
  // Same text as the Ranking: prize name and multiplier of the best saved excavation.
  const bestPrize = config
    ? bestPrizeText(config.pointsTable.map(Number), Number(s.bestPoints))
    : "-";
  const jackpots = s.jackpotWon > 0n ? fmtGoldao(s.jackpotWon) : "-";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Excavations" value={String(Number(s.excavations))} />
        <Kpi label="Staked" value={fmtGoldao(s.staked)} />
        <Kpi label="Returned" value={fmtGoldao(s.returned)} />
        <Kpi
          label="Net result"
          value={fmtSigned(net)}
          tone={net > 0n ? "up" : net < 0n ? "down" : undefined}
        />
        <Kpi label="Jackpots" value={jackpots} diamond />
        <Kpi label="Collapses" value={String(Number(s.collapses))} />
        <Kpi label="Best prize" value={bestPrize} />
        <Kpi label="Deepest pick" value={String(Number(s.deepest))} />
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <LayoutDashboard className="size-3.5" /> Tournament #
            {Number(dashboard.tournament)}
          </span>
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            {fmtCountdown(dashboard.endsAt)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-5 font-mono text-xs sm:grid-cols-3">
          <Item label="To collect" value={fmtGoldao(dashboard.credit)} />
          <Item
            label="Pending payout"
            value={fmtGoldao(dashboard.pendingPayout)}
          />
          <Item label="Jackpot pool" value={fmtGoldao(dashboard.pool)} />
        </dl>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <History className="size-3.5" /> Past tournaments
          </span>
        </div>
        {dashboard.history.length === 0 ? (
          <p className={cn("p-5 text-sm", inkFaint)}>Nothing yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className={cn("text-left", inkFaint)}>
                  <th className="px-5 py-2 font-medium">Tournament</th>
                  <th className="px-3 py-2 font-medium">Excavations</th>
                  <th className="px-3 py-2 font-medium">Staked</th>
                  <th className="px-3 py-2 font-medium">Net result</th>
                  <th className="px-5 py-2 text-right font-medium">Paid out</th>
                </tr>
              </thead>
              <tbody>
                {[...dashboard.history].reverse().map((h) => (
                  <tr
                    key={String(h.tournament)}
                    className="border-t border-[color:var(--term-border-faint)]"
                  >
                    <td className={cn("px-5 py-2.5", ink)}>
                      #{Number(h.tournament)}
                    </td>
                    <td className="px-3 py-2.5">
                      {Number(h.stats.excavations)}
                    </td>
                    <td className="px-3 py-2.5">{fmtGoldao(h.stats.staked)}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {fmtSigned(netOf(h.stats))}
                    </td>
                    <td
                      className={cn("px-5 py-2.5 text-right tabular-nums", ink)}
                    >
                      {fmtGoldao(h.payout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  diamond,
  tone,
}: {
  label: string;
  value: string;
  diamond?: boolean;
  tone?: "up" | "down";
}) {
  return (
    <div className={cn(panel, "flex flex-col gap-1 p-4")}>
      <span
        className={cn(
          eyebrow,
          diamond ? DIAMOND_TEXT : inkFaint,
          "flex items-center gap-1.5",
        )}
      >
        {diamond && <Gem className="size-3.5" />}
        {label}
      </span>
      <span
        className={cn(
          "font-display text-2xl font-semibold tabular-nums",
          diamond ? DIAMOND_TEXT : ink,
          tone === "up" && "text-[color:var(--term-green)]",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={cn("text-[10px] uppercase tracking-wider", inkFaint)}>
        {label}
      </dt>
      <dd className={cn("tabular-nums", ink)}>{value}</dd>
    </div>
  );
}
