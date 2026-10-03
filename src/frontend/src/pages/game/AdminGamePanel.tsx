import type { AdminView } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { Gem, Landmark, Shield } from "lucide-react";
import { useState } from "react";
import { Spinner } from "./Spinner";
import {
  DIAMOND_TEXT,
  eyebrow,
  fmtCountdown,
  fmtDate,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  shortPrincipal,
} from "./game-utils";
import { errorMessage, useGameAction, useSecurityView } from "./useGame";

const HALT_TEXT: Record<number, string> = {
  1: "flagged accounts",
  2: "ledger failures",
  3: "manual",
};

type Res<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

export function AdminGamePanel({ view }: { view: AdminView | undefined }) {
  const { actor } = useAuth();
  const { run, pending } = useGameAction();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [amount, setAmount] = useState("100000");
  const [days, setDays] = useState("7");
  const [who, setWho] = useState("");
  const [selfId, setSelfId] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [flags, setFlags] = useState("");
  const [windowMin, setWindowMin] = useState("");
  const { data: security } = useSecurityView(!!view);

  const act = async <T,>(
    name: string,
    call: () => Promise<Res<T>>,
    text: (v: T) => string,
  ) => {
    if (!actor) return;
    setMsg(null);
    try {
      const v = await run(name, call, "all");
      setMsg({ ok: true, text: text(v) });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setConfirm(null);
    }
  };

  const n = () => {
    const v = Number.parseInt(amount, 10);
    return Number.isFinite(v) && v > 0 ? BigInt(v) : 0n;
  };

  const parsePrincipal = (t: string): Principal | null => {
    try {
      return Principal.fromText(t.trim());
    } catch {
      return null;
    }
  };

  const unpaid = view?.payouts.filter((p) => !p.paid) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {view?.paused && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          Bets are paused:{" "}
          {view.stakes.length === 0
            ? "the bank fund is below its floor."
            : "play was halted."}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Tournament"
          value={view ? `#${Number(view.tournament)}` : <Spinner />}
          sub={view ? `ends in ${fmtCountdown(view.endsAt)}` : ""}
        />
        <Kpi
          label="Admin wallet"
          value={view ? fmtGoldao(view.bank) : <Spinner />}
          sub={view?.realLedger ? "GOLDAO (ledger)" : "GOLDAO (test)"}
        />
        <Kpi
          label="Owed to players"
          value={view ? fmtGoldao(view.owed) : <Spinner />}
          sub="credits to collect"
        />
        <Kpi
          label="Bank fund"
          value={
            view ? fmtGoldao(view.fund < 0n ? 0n : view.fund) : <Spinner />
          }
          sub="drives the stakes"
        />
        <Kpi
          label="Jackpot pool"
          value={view ? fmtGoldao(view.pool) : <Spinner />}
          sub="GOLDAO"
          diamond
        />
        <Kpi
          label="Jackpot reserve"
          value={view ? fmtGoldao(view.reserve) : <Spinner />}
          sub="GOLDAO"
        />
        <Kpi
          label="Cycles accrued"
          value={view ? fmtGoldao(view.cycles) : <Spinner />}
          sub="GOLDAO"
        />
        <Kpi
          label="Available to withdraw"
          value={view ? fmtGoldao(view.withdrawable) : <Spinner />}
          sub="GOLDAO"
        />
        <Kpi
          label="Stakes now"
          value={
            view ? (
              view.stakes.length === 3 ? (
                view.stakes.map((x) => fmtGoldao(x)).join(" / ")
              ) : (
                "Paused"
              )
            ) : (
              <Spinner />
            )
          }
          sub="min / mid / max"
        />
        <Kpi
          label="Burned fees"
          value={view ? fmtGoldao(view.burned) : <Spinner />}
          sub="GOLDAO"
        />
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Landmark className="size-3.5" /> Funds
          </span>
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Whole GOLDAO
          </span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            className="w-48 rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-3">
            {view && !view.realLedger && (
              <Button
                variant="outline"
                disabled={!!pending || n() === 0n}
                onClick={() =>
                  void act(
                    "deposit",
                    () => actor!.gameAdminTestDeposit(n()),
                    (v) => `Bank is now ${fmtGoldao(v)}.`,
                  )
                }
              >
                Set test bank
              </Button>
            )}
            {view && !view.realLedger && (
              <Button
                variant="outline"
                disabled={!!pending || n() === 0n}
                onClick={() =>
                  void act(
                    "tapprove",
                    () => actor!.gameAdminTestApprove(n()),
                    (v) => `Bank allowance is now ${fmtGoldao(v)}.`,
                  )
                }
              >
                Set bank allowance
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!!pending || n() === 0n}
              onClick={() =>
                void act(
                  "seed",
                  () => actor!.gameAdminSeedPool(n()),
                  (v) => `Pool is now ${fmtGoldao(v)}.`,
                )
              }
            >
              Seed jackpot pool
            </Button>
            <Button
              variant="outline"
              disabled={!!pending || n() === 0n}
              onClick={() => setConfirm("withdraw")}
            >
              Withdraw
            </Button>
            <Button
              variant="outline"
              disabled={!!pending}
              onClick={() =>
                void act(
                  "refresh",
                  () => actor!.gameAdminRefreshBank(),
                  (v) => `Bank is ${fmtGoldao(v)}.`,
                )
              }
            >
              Refresh bank
            </Button>
          </div>
          {confirm === "withdraw" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--term-border)] bg-[var(--term-header)] p-3">
              <span className={cn("text-sm", inkMid)}>
                Withdraw {n().toString()} GOLDAO from the fund?
              </span>
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
                className="gradient-primary text-primary-foreground"
                onClick={() =>
                  void act(
                    "withdraw",
                    () => actor!.gameAdminWithdraw(n()),
                    (v) => `Bank is now ${fmtGoldao(v)}.`,
                  )
                }
              >
                Confirm
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Shield className="size-3.5" /> Tournament
          </span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className="w-20 rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-sm"
            />
            <Button
              variant="outline"
              disabled={!!pending || !days}
              onClick={() =>
                void act(
                  "duration",
                  () => actor!.gameAdminSetDuration(BigInt(days)),
                  () => `Duration set to ${days} days.`,
                )
              }
            >
              Set duration (days)
            </Button>
            <Button
              variant="outline"
              disabled={!!pending}
              onClick={() => setConfirm("close")}
            >
              Close now
            </Button>
            <Button
              disabled={!!pending || unpaid.length === 0}
              className="gradient-primary text-primary-foreground"
              onClick={() =>
                void act(
                  "pay",
                  () => actor!.gameAdminPay(),
                  (v) =>
                    `Paid ${Number(v.paid)}, failed ${Number(v.failed)}, remaining ${Number(v.remaining)}.`,
                )
              }
            >
              Pay pending ({unpaid.length})
            </Button>
          </div>
          {confirm === "close" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--term-border)] bg-[var(--term-header)] p-3">
              <span className={cn("text-sm", inkMid)}>
                Close the current tournament now?
              </span>
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
                className="gradient-primary text-primary-foreground"
                onClick={() =>
                  void act(
                    "close",
                    () => actor!.gameAdminCloseTournament(),
                    () => "Close requested.",
                  )
                }
              >
                Confirm
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Player principal"
              className="w-80 max-w-full rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
            />
            <Button
              variant="outline"
              disabled={!!pending || !parsePrincipal(who)}
              onClick={() =>
                void act(
                  "release",
                  () => actor!.gameAdminReleaseBusy(parsePrincipal(who)!),
                  () => "Excavation released.",
                )
              }
            >
              Release busy
            </Button>
            <Button
              variant="outline"
              disabled={!!pending || !parsePrincipal(who)}
              onClick={() =>
                void act(
                  "unblock",
                  () => actor!.gameAdminUnblock(parsePrincipal(who)!),
                  () => "Player unblocked.",
                )
              }
            >
              Unblock
            </Button>
          </div>

          {view && !view.realLedger && (
            <div className="flex flex-col gap-2 border-t border-[color:var(--term-border-faint)] pt-4">
              <span className={cn("font-mono text-[11px]", inkFaint)}>
                Switch to the real ledger (needs no pending payouts)
              </span>
              <div className="flex flex-wrap gap-3">
                <input
                  value={selfId}
                  onChange={(e) => setSelfId(e.target.value)}
                  placeholder="Canister principal"
                  className="w-80 max-w-full rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  disabled={!!pending || !parsePrincipal(selfId)}
                  onClick={() =>
                    void act(
                      "real",
                      () =>
                        actor!.gameAdminSetRealLedger(parsePrincipal(selfId)!),
                      (v) => `Real ledger enabled. Bank is ${fmtGoldao(v)}.`,
                    )
                  }
                >
                  Enable
                </Button>
              </div>
            </div>
          )}

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

      {security && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
              <Shield className="size-3.5" /> Security
            </span>
            <span
              className={cn(
                "font-mono text-[11px]",
                security.halted ? "text-destructive" : inkFaint,
              )}
            >
              {security.halted
                ? `Halted (${HALT_TEXT[Number(security.haltCode)] ?? "unknown"}) · ${fmtDate(security.haltedAt)}`
                : "Running"}
            </span>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={!!pending || security.halted}
                onClick={() =>
                  void act(
                    "halt",
                    () => actor!.gameAdminHalt(),
                    () => "New excavations are halted.",
                  )
                }
              >
                Halt new excavations
              </Button>
              <Button
                disabled={!!pending || !security.halted}
                className="gradient-primary text-primary-foreground"
                onClick={() =>
                  void act(
                    "resume",
                    () => actor!.gameAdminResume(),
                    () => "Play resumed.",
                  )
                }
              >
                Resume
              </Button>
              <span className={cn("font-mono text-[11px]", inkFaint)}>
                Ledger failures in a row: {Number(security.ledgerFails)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={flags}
                onChange={(e) => setFlags(e.target.value.replace(/\D/g, ""))}
                placeholder={`Flags (now ${Number(security.breakerMax)})`}
                inputMode="numeric"
                className="w-36 rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
              />
              <input
                value={windowMin}
                onChange={(e) =>
                  setWindowMin(e.target.value.replace(/\D/g, ""))
                }
                placeholder={`Minutes (now ${Number(security.breakerWindowMin)})`}
                inputMode="numeric"
                className="w-40 rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
              />
              <Button
                variant="outline"
                disabled={!!pending || !flags || !windowMin}
                onClick={() =>
                  void act(
                    "breaker",
                    () =>
                      actor!.gameAdminSetBreaker(
                        BigInt(flags),
                        BigInt(windowMin),
                      ),
                    () => "Limits updated.",
                  )
                }
              >
                Set limits
              </Button>
            </div>
            <div className="max-h-64 overflow-auto">
              {security.flagged.length === 0 ? (
                <p className={cn("text-sm", inkFaint)}>
                  No accounts under review.
                </p>
              ) : (
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className={cn("text-left", inkFaint)}>
                      <th className="py-2 font-medium">Account</th>
                      <th className="px-3 py-2 font-medium">Flagged</th>
                      <th className="py-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...security.flagged]
                      .sort((x, y) => Number(y.at - x.at))
                      .map((f) => (
                        <tr
                          key={f.player.toText()}
                          className="border-t border-[color:var(--term-border-faint)]"
                        >
                          <td
                            className={cn("py-2.5", ink)}
                            title={f.player.toText()}
                          >
                            {shortPrincipal(f.player.toText())}
                          </td>
                          <td className="px-3 py-2.5">{fmtDate(f.at)}</td>
                          <td className="py-2.5 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!pending}
                              onClick={() =>
                                void act(
                                  "clear",
                                  () => actor!.gameAdminUnblock(f.player),
                                  () => "Account cleared.",
                                )
                              }
                            >
                              Clear
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {view?.lastClose && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>
              Last close · #{Number(view.lastClose.tournament)}
            </span>
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {fmtDate(view.lastClose.closedAt)}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 p-5 font-mono text-xs sm:grid-cols-4">
            <Item
              label="Players"
              value={String(Number(view.lastClose.players))}
            />
            <Item
              label="Excavations"
              value={String(Number(view.lastClose.excavations))}
            />
            <Item label="Staked" value={fmtGoldao(view.lastClose.staked)} />
            <Item label="Returned" value={fmtGoldao(view.lastClose.returned)} />
            <Item
              label="Jackpots"
              value={String(Number(view.lastClose.jackpots))}
            />
            <Item
              label="Jackpot paid"
              value={fmtGoldao(view.lastClose.jackpotPaid)}
            />
            <Item
              label="Payouts"
              value={fmtGoldao(view.lastClose.payoutTotal)}
            />
            <Item
              label="Forfeited"
              value={fmtGoldao(view.lastClose.forfeited)}
            />
          </dl>
        </div>
      )}

      {view && view.payouts.length > 0 && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>Payouts</span>
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {unpaid.length} pending
            </span>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className={cn("text-left", inkFaint)}>
                  <th className="px-5 py-2 font-medium">Principal</th>
                  <th className="px-3 py-2 font-medium">Tournament</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {view.payouts.map((p) => (
                  <tr
                    key={String(p.id)}
                    className="border-t border-[color:var(--term-border-faint)]"
                  >
                    <td
                      className={cn("px-5 py-2.5", ink)}
                      title={p.to.toText()}
                    >
                      {shortPrincipal(p.to.toText())}
                    </td>
                    <td className="px-3 py-2.5">#{Number(p.tournament)}</td>
                    <td className="px-3 py-2.5">
                      {p.paid ? "paid" : "pending"}
                    </td>
                    <td
                      className={cn("px-5 py-2.5 text-right tabular-nums", ink)}
                    >
                      {fmtGoldao(p.amount, 2)}
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
  label,
  value,
  sub,
  diamond,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  diamond?: boolean;
}) {
  return (
    <div className={cn(panel, "flex flex-col gap-1 p-4")}>
      <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
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
      <span className={cn("font-mono text-[10px]", inkFaint)}>{sub}</span>
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
