import type { AdminView } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  Flame,
  Gem,
  Landmark,
  Lock,
  Send,
  Shield,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TierSummary } from "./PlayerDashboard";
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
  shortPrincipal,
} from "./game-utils";
import { errorMessage, useGameAction } from "./useGame";

type Step = "close" | "pay" | null;

export function AdminGamePanel({ view }: { view: AdminView | undefined }) {
  const { actor } = useAuth();
  const { run, pending } = useGameAction();
  const [confirm, setConfirm] = useState<Step>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const status = view?.status;
  const last = view?.lastClose;

  const closeWeek = async () => {
    if (!actor) return;
    setMsg(null);
    try {
      const s = await run("close", () => actor.gameAdminCloseWeek(), "all");
      setMsg({
        ok: true,
        text: s.drawWinner
          ? `Week ${Number(s.week)} closed. Draw ticket #${Number(s.drawTicket)} of ${Number(s.drawTickets)}.`
          : `Week ${Number(s.week)} closed. No diamonds: the draw rolls over.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setConfirm(null);
    }
  };

  const recover = async () => {
    if (!actor) return;
    setMsg(null);
    try {
      await run("recover", () => actor.gameAdminRecoverClosing(), "all");
      setMsg({ ok: true, text: "Week reopened. Run the close again." });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };

  const payAndOpen = async () => {
    if (!actor) return;
    setMsg(null);
    try {
      const total = await run(
        "pay",
        () => actor.gameAdminPayAndOpenNext(),
        "all",
      );
      setMsg({
        ok: true,
        text: `Paid ${fmtGoldao(total)} GOLDAO. Next week is open.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          icon={CalendarCheck}
          label="Week"
          value={view ? `#${Number(view.week)}` : "—"}
          sub={status ?? ""}
        />
        <Kpi
          icon={Landmark}
          label="Game balance"
          value={view ? fmtGoldao(view.treasury) : "—"}
          sub="GOLDAO (simulated)"
        />
        <Kpi
          icon={Flame}
          label="Burned fees"
          value={view ? fmtGoldao(view.burned) : "—"}
          sub="GOLDAO"
        />
        <Kpi
          icon={Gem}
          label="Draw rollover"
          value={view ? fmtGoldao(view.drawCarry) : "—"}
          sub="GOLDAO"
          diamond
        />
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Shield className="size-3.5" /> Weekly close
          </span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <p className={cn("text-sm", inkMid)}>
            1. Close the week: open excavations are saved, unused ones
            auto-played, chips ranked and the diamond draw is run. 2. Review the
            payouts. 3. Pay and open the next week.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={status !== "open" || !!pending}
              onClick={() => setConfirm("close")}
            >
              <Lock className="size-4" />
              Close week
            </Button>
            <Button
              disabled={status !== "closed" || !!pending}
              onClick={() => setConfirm("pay")}
              className="gradient-primary text-primary-foreground"
            >
              <Send className="size-4" />
              Pay and open next week
            </Button>
            {status === "closing" && (
              <Button
                variant="outline"
                disabled={!!pending}
                onClick={() => void recover()}
              >
                Recover interrupted close
              </Button>
            )}
          </div>

          <AnimatePresence>
            {confirm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden rounded-lg border border-[color:var(--term-border)] bg-[var(--term-header)]"
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className={cn("text-sm", inkMid)}>
                    {confirm === "close"
                      ? "Close the current week? Players can't dig until the next one opens."
                      : `Credit ${view?.payouts.length ?? 0} payouts and open the next week?`}
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!pending}
                      onClick={() =>
                        void (confirm === "close" ? closeWeek() : payAndOpen())
                      }
                      className="gradient-primary text-primary-foreground"
                    >
                      {pending ? "Working…" : "Confirm"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {msg && (
            <p
              className={cn(
                "font-mono text-xs",
                msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
              )}
            >
              {msg.text}
            </p>
          )}
        </div>
      </div>

      {last && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>
              Last close · week #{Number(last.week)}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 p-5 font-mono text-xs sm:grid-cols-4">
            <Item label="Prize pool" value={fmtGoldao(last.pot)} />
            <Item
              label="Chips · players"
              value={`${Number(last.chips)} · ${Number(last.players)}`}
            />
            <Item
              label="Treasure per chip"
              value={fmtGoldao(last.treasurePerChip)}
            />
            <Item
              label="Kept for cycles"
              value={fmtGoldao(last.treasuryKeep)}
            />
            <Item label="Draw prize" value={fmtGoldao(last.drawPrize)} />
            <Item
              label="Draw ticket"
              value={
                last.drawWinner
                  ? `#${Number(last.drawTicket)} of ${Number(last.drawTickets)}`
                  : "Rolled over"
              }
            />
            <Item
              label="Winner"
              value={
                last.drawWinner ? shortPrincipal(last.drawWinner.toText()) : "—"
              }
            />
            <Item
              label="raw_rand"
              value={String(last.drawRandom).slice(0, 12)}
            />
          </dl>
        </div>
      )}

      {view && view.payouts.length > 0 && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>Pending payouts</span>
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {view.payouts.length} transfers · net of the 10 fee
            </span>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className={cn("text-left", inkFaint)}>
                  <th className="px-5 py-2 font-medium">Principal</th>
                  <th className="px-3 py-2 font-medium">Concept</th>
                  <th className="px-5 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {view.payouts.map((p, i) => (
                  <tr
                    key={`${p.to.toText()}-${i}`}
                    className="border-t border-[color:var(--term-border-faint)]"
                  >
                    <td
                      className={cn("px-5 py-2.5", ink)}
                      title={p.to.toText()}
                    >
                      {shortPrincipal(p.to.toText())}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.concept === "draw" ? (
                        <span
                          className={cn(
                            "flex items-center gap-1",
                            DIAMOND_TEXT,
                          )}
                        >
                          <Gem className="size-3" /> Diamond draw
                        </span>
                      ) : (
                        <TierSummary tiers={p.tiers} />
                      )}
                    </td>
                    <td
                      className={cn("px-5 py-2.5 text-right tabular-nums", ink)}
                    >
                      {fmtGoldao(p.amount)}
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
  icon: Icon,
  label,
  value,
  sub,
  diamond,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  diamond?: boolean;
}) {
  return (
    <div className={cn(panel, "flex flex-col gap-1 p-4")}>
      <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
        <Icon className="size-3.5" /> {label}
      </span>
      <span
        className={cn(
          "font-display text-2xl font-semibold tabular-nums",
          diamond ? DIAMOND_TEXT : ink,
        )}
      >
        {value}
      </span>
      <span className={cn("font-mono text-[10px] capitalize", inkFaint)}>
        {sub}
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
