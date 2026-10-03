import type { Dashboard } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Gem, History, LayoutDashboard } from "lucide-react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  eyebrow,
  fmtGoldao,
  fmtTimeLeft,
  gold,
  ink,
  inkFaint,
  panel,
  panelHeader,
} from "./game-utils";

interface Props {
  dashboard: Dashboard | undefined;
}

export function PlayerDashboard({ dashboard }: Props) {
  const { isAuthenticated } = useAuth();

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
  const net = Number(s.returned) + Number(s.jackpotWon) - Number(s.charged);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Excavations" value={String(Number(s.excavations))} />
        <Kpi label="Staked" value={fmtGoldao(s.staked)} />
        <Kpi label="Credit" value={fmtGoldao(dashboard.credit)} />
        <Kpi label="Jackpots won" value={fmtGoldao(s.jackpotWon)} diamond />
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <LayoutDashboard className="size-3.5" /> Tournament #
            {Number(dashboard.tournament)}
          </span>
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Ends in {fmtTimeLeft(dashboard.endsAt)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-5 font-mono text-xs sm:grid-cols-4">
          <Item label="Returned" value={fmtGoldao(s.returned, 2)} />
          <Item label="Charged on collapse" value={fmtGoldao(s.charged, 2)} />
          <Item
            label="Net"
            value={`${net >= 0 ? "+" : ""}${(net / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
          />
          <Item label="Collapses" value={String(Number(s.collapses))} />
          <Item label="Best points" value={String(Number(s.bestPoints))} />
          <Item label="Deepest run" value={String(Number(s.deepest))} />
          <Item label="Jackpots" value={String(Number(s.jackpots))} />
          <Item
            label="Pending payout"
            value={fmtGoldao(dashboard.pendingPayout, 2)}
          />
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
                  <th className="px-5 py-2 text-right font-medium">Payout</th>
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
                    <td
                      className={cn("px-5 py-2.5 text-right tabular-nums", ink)}
                    >
                      {fmtGoldao(h.payout, 2)}
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
}: { label: string; value: string; diamond?: boolean }) {
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
