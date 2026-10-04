import { type AdminView, WithdrawKind } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { GOLDAO_FEE_E8S, approveSpender } from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
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
import {
  errorMessage,
  useGameAction,
  useGameConfig,
  useSecurityView,
} from "./useGame";

const HALT_TEXT: Record<number, string> = {
  2: "ledger failures",
  3: "manual",
};

const E8S = 100_000_000n;
// Fixed choices only: no free-text numbers, so a typo cannot reach the canister.
const TEST_DEPOSITS = [10_000, 30_000, 100_000, 200_000];
const DURATIONS = [1, 3, 7, 14, 30];
const POOL_SEED = 5_000n * E8S;

type Res<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface Ask {
  title: string;
  detail: string;
  word?: string;
  go: () => Promise<void>;
}

const selectCls =
  "rounded-md border border-[color:var(--term-border)] bg-[var(--term-card)] px-3 py-1.5 font-mono text-sm";
const inputCls =
  "w-80 max-w-full rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs";

export function AdminGamePanel({ view }: { view: AdminView | undefined }) {
  const { actor } = useAuth();
  const { identity } = useInternetIdentity();
  const { run, pending } = useGameAction();
  const { data: security } = useSecurityView(!!view);
  const { data: config } = useGameConfig();
  const minPayout = config ? fmtGoldao(config.minPayoutE8s) : "-";
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [typed, setTyped] = useState("");
  const [deposit, setDeposit] = useState(String(TEST_DEPOSITS[1]));
  const [days, setDays] = useState("");
  const [who, setWho] = useState("");
  const [selfId, setSelfId] = useState("");
  const [busy, setBusy] = useState(false);

  const working = !!pending || busy;
  const real = !!view?.realLedger;
  const bankText = view?.bankAccount?.toText();
  const selfText = view?.selfId?.toText();

  const unpaid = view?.payouts.filter((p) => !p.paid) ?? [];
  const unpaidTotal = unpaid.reduce(
    (t, p) => t + p.amount + GOLDAO_FEE_E8S,
    0n,
  );

  // Every action goes through here: one at a time, result always shown.
  const act = async <T,>(
    name: string,
    call: () => Promise<Res<T>>,
    text: (v: T) => string,
    before?: () => Promise<void>,
  ) => {
    if (!actor || working) return;
    setMsg(null);
    setBusy(true);
    try {
      if (before) await before();
      const v = await run(name, call, "all");
      setMsg({ ok: true, text: text(v) });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const confirmThen = (a: Ask) => {
    setTyped("");
    setAsk(a);
  };

  // Real mode: the backend spends an allowance the admin wallet grants.
  // It is set here, right before the action, to exactly what that action needs.
  const ensureAllowance = async (required: bigint) => {
    if (!real) return;
    if (!identity || !bankText || !selfText || !actor) {
      throw new Error("Sign in with the admin wallet first.");
    }
    if (identity.getPrincipal().toText() !== bankText) {
      throw new Error("This session is not the bank wallet.");
    }
    const cur = await actor.gameAdminLedgerAllowance(
      Principal.fromText(bankText),
      Principal.fromText(selfText),
    );
    if (cur.__kind__ === "err") throw new Error(cur.err);
    if (cur.ok >= required) return;
    await approveSpender(identity, selfText, required);
  };

  const parsePrincipal = (t: string): Principal | null => {
    try {
      return Principal.fromText(t.trim());
    } catch {
      return null;
    }
  };

  const halted = !!security?.halted;
  const bank = view?.bank ?? 0n;
  const availableOut = (() => {
    if (!view) return 0n;
    const cap = bank > GOLDAO_FEE_E8S ? bank - GOLDAO_FEE_E8S : 0n;
    return view.withdrawable < cap ? view.withdrawable : cap;
  })();
  const poolGap = view && view.pool < POOL_SEED ? POOL_SEED - view.pool : 0n;

  const allBlockers: string[] = [];
  if (view) {
    if (!halted) allBlockers.push("pause new excavations first");
    if (view.owed > 0n)
      allBlockers.push(
        "players still hold To collect or unpaid prizes (use Close and pay everything, then Pay pending)",
      );
    if (unpaid.length > 0) allBlockers.push("pending payouts must be paid");
    if (bank <= GOLDAO_FEE_E8S) allBlockers.push("the wallet is empty");
  }

  const payNow = () =>
    act(
      "pay",
      () => actor!.gameAdminPay(),
      (v) =>
        `Paid ${Number(v.paid)}, failed ${Number(v.failed)}, remaining ${Number(v.remaining)}.`,
      () => ensureAllowance(unpaidTotal),
    );

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
          sub={real ? "GOLDAO (ledger)" : "GOLDAO (test)"}
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

      {view && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
              <Landmark className="size-3.5" /> Owed to players
            </span>
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {fmtGoldao(view.owed, 2)} GOLDAO
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 p-5 font-mono text-xs sm:grid-cols-4">
            <Item
              label={`To collect (${Number(view.toCollectPlayers)} players)`}
              value={fmtGoldao(view.toCollect, 2)}
            />
            <Item
              label="Pending payouts (with fees)"
              value={fmtGoldao(view.unpaidPayouts, 2)}
            />
            <Item
              label="Jackpots in play"
              value={fmtGoldao(view.heldJackpots, 2)}
            />
            <Item
              label={`Under ${minPayout} (${Number(view.smallPlayers)} players)`}
              value={fmtGoldao(view.smallBalances, 2)}
            />
          </dl>
          <p className={cn("px-5 pb-5 font-mono text-[11px]", inkFaint)}>
            Owed = To collect + pending payouts + jackpots in play. The last
            figure is already inside To collect: balances under the minimum are
            not paid at a normal close and carry over to the next tournament.
          </p>
        </div>
      )}

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Landmark className="size-3.5" /> Funds
          </span>
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Each button asks for confirmation
          </span>
        </div>
        <div className="flex flex-col gap-5 p-5">
          {view && !real && (
            <Row
              title="Test bank"
              hint="Replaces the test balance with a preset."
            >
              <select
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                disabled={working}
                className={selectCls}
              >
                {TEST_DEPOSITS.map((d) => (
                  <option key={d} value={d}>
                    {d.toLocaleString("en-US")} GOLDAO
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={working}
                onClick={() =>
                  confirmThen({
                    title: `Set the test bank to ${Number(deposit).toLocaleString("en-US")} GOLDAO?`,
                    detail:
                      "Test mode only. The previous test balance is replaced.",
                    go: () =>
                      act(
                        "deposit",
                        () => actor!.gameAdminTestDeposit(BigInt(deposit)),
                        (v) => `Bank is now ${fmtGoldao(v)}.`,
                      ),
                  })
                }
              >
                Set test bank
              </Button>
            </Row>
          )}

          <Row
            title="Jackpot pool"
            hint={
              poolGap > 0n
                ? `Tops the pool up to ${fmtGoldao(POOL_SEED)} using ${fmtGoldao(poolGap)} from the fund.`
                : `Already at the minimum (${fmtGoldao(POOL_SEED)}).`
            }
          >
            <Button
              variant="outline"
              disabled={working || !view || poolGap === 0n}
              onClick={() =>
                confirmThen({
                  title: `Seed the jackpot pool with ${fmtGoldao(poolGap)} GOLDAO?`,
                  detail: `The pool will be ${fmtGoldao(POOL_SEED)}. The amount comes out of the bank fund.`,
                  go: () =>
                    act(
                      "seed",
                      () => actor!.gameAdminSeedPool(),
                      (v) => `Pool is now ${fmtGoldao(v)}.`,
                    ),
                })
              }
            >
              Seed jackpot pool
            </Button>
          </Row>

          <Row
            title="Withdraw earnings"
            hint={`Takes ${fmtGoldao(availableOut)} GOLDAO (cycles first, then the surplus over the fund target) to the fixed treasury address. Network fee: ${fmtGoldao(GOLDAO_FEE_E8S)}.`}
          >
            <Button
              variant="outline"
              disabled={working || !view || availableOut === 0n}
              onClick={() =>
                confirmThen({
                  title: `Withdraw ${fmtGoldao(availableOut)} GOLDAO?`,
                  detail: "Sent to the fixed treasury address.",
                  go: () =>
                    act(
                      "withdraw",
                      () => actor!.gameAdminWithdraw(WithdrawKind.available),
                      (v) => `Done. Bank is now ${fmtGoldao(v)}.`,
                      () => ensureAllowance(availableOut + GOLDAO_FEE_E8S),
                    ),
                })
              }
            >
              Withdraw earnings
            </Button>
          </Row>

          <Row
            title="Withdraw everything"
            hint={
              allBlockers.length === 0
                ? `Empties the wallet (${fmtGoldao(bank - GOLDAO_FEE_E8S)} GOLDAO) to the fixed treasury address and resets pool, reserve and cycles.`
                : `Not available: ${allBlockers.join(", ")}.`
            }
          >
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive"
              disabled={working || !view || allBlockers.length > 0}
              onClick={() =>
                confirmThen({
                  title: `Withdraw ALL ${fmtGoldao(bank - GOLDAO_FEE_E8S)} GOLDAO?`,
                  detail:
                    "The game will have no funds left. Sent to the fixed treasury address.",
                  word: "WITHDRAW ALL",
                  go: () =>
                    act(
                      "withdraw-all",
                      () => actor!.gameAdminWithdraw(WithdrawKind.all),
                      (v) => `Done. Bank is now ${fmtGoldao(v)}.`,
                      () => ensureAllowance(bank),
                    ),
                })
              }
            >
              Withdraw everything
            </Button>
          </Row>

          {real && (
            <Row
              title="Refresh bank"
              hint="Reads the wallet balance from the ledger."
            >
              <Button
                variant="outline"
                disabled={working}
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
            </Row>
          )}
        </div>
      </div>

      <div className={panel}>
        <div className={panelHeader}>
          <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
            <Shield className="size-3.5" /> Tournament
          </span>
        </div>
        <div className="flex flex-col gap-5 p-5">
          <Row
            title="Duration"
            hint={`Now ${view ? Number(view.durationDays) : "-"} days. Applies to the next tournament.`}
          >
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={working}
              className={selectCls}
            >
              <option value="">Choose</option>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "day" : "days"}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={working || !days}
              onClick={() =>
                confirmThen({
                  title: `Set the duration to ${days} days?`,
                  detail: "Applies to the next tournament.",
                  go: () =>
                    act(
                      "duration",
                      () => actor!.gameAdminSetDuration(BigInt(days)),
                      () => `Duration set to ${days} days.`,
                    ),
                })
              }
            >
              Set duration
            </Button>
          </Row>

          <Row
            title="Close tournament"
            hint={`Ends it now. To collect balances of at least ${minPayout} GOLDAO become payouts; smaller ones stay for the next tournament.`}
          >
            <Button
              variant="outline"
              disabled={working}
              onClick={() =>
                confirmThen({
                  title: "Close the current tournament now?",
                  detail:
                    "It cannot be undone. Large To collect balances become pending payouts.",
                  word: "CLOSE",
                  go: () =>
                    act(
                      "close",
                      () => actor!.gameAdminCloseTournament(),
                      () => "Close requested.",
                    ),
                })
              }
            >
              Close now
            </Button>
          </Row>

          <Row
            title="Close and pay everything"
            hint={
              halted
                ? "Pays every To collect balance, small ones included. Each payment costs the network fee, taken from the player's balance. Use it before withdrawing everything."
                : "Not available: pause new excavations first."
            }
          >
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive"
              disabled={working || !halted}
              onClick={() =>
                confirmThen({
                  title: "Close the tournament and pay everything?",
                  detail:
                    "Every To collect balance becomes a payout, whatever its size. Each payout costs the network fee, taken from the player's balance.",
                  word: "CLOSE ALL",
                  go: () =>
                    act(
                      "close-all",
                      () => actor!.gameAdminCloseAll(),
                      () => "Closed. Pay the pending payouts next.",
                    ),
                })
              }
            >
              Close and pay everything
            </Button>
          </Row>

          <Row
            title="Pay pending"
            hint={
              unpaid.length === 0
                ? "Nothing to pay."
                : `${unpaid.length} payouts, ${fmtGoldao(unpaidTotal)} GOLDAO including fees. Paid in batches of 20.${real ? " The wallet authorization is set automatically." : ""}`
            }
          >
            <Button
              disabled={working || unpaid.length === 0}
              className="gradient-primary text-primary-foreground"
              onClick={() =>
                confirmThen({
                  title: `Pay ${Math.min(20, unpaid.length)} of ${unpaid.length} pending payouts?`,
                  detail: "Funds leave the admin wallet to the players.",
                  go: payNow,
                })
              }
            >
              Pay pending ({unpaid.length})
            </Button>
          </Row>

          <Row
            title="Player"
            hint="Paste a principal to free a stuck excavation."
          >
            <input
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="Player principal"
              className={inputCls}
            />
            <Button
              variant="outline"
              disabled={working || !parsePrincipal(who)}
              onClick={() =>
                confirmThen({
                  title: "Release this player's excavation?",
                  detail: shortPrincipal(who.trim()),
                  go: () =>
                    act(
                      "release",
                      () => actor!.gameAdminReleaseBusy(parsePrincipal(who)!),
                      () => "Excavation released.",
                    ),
                })
              }
            >
              Release busy
            </Button>
          </Row>

          {view && !real && (
            <Row
              title="Real ledger"
              hint="Switches from test to real GOLDAO. Needs no pending payouts. Irreversible."
            >
              <input
                value={selfId}
                onChange={(e) => setSelfId(e.target.value)}
                placeholder="Canister principal"
                className={inputCls}
              />
              <Button
                variant="outline"
                disabled={working || !parsePrincipal(selfId)}
                onClick={() =>
                  confirmThen({
                    title: "Enable the real ledger?",
                    detail: "From now on the admin wallet holds real GOLDAO.",
                    word: "GO REAL",
                    go: () =>
                      act(
                        "real",
                        () =>
                          actor!.gameAdminSetRealLedger(
                            parsePrincipal(selfId)!,
                          ),
                        (v) => `Real ledger enabled. Bank is ${fmtGoldao(v)}.`,
                      ),
                  })
                }
              >
                Enable
              </Button>
            </Row>
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
                disabled={working || security.halted}
                onClick={() =>
                  confirmThen({
                    title: "Halt new excavations?",
                    detail:
                      "Players cannot start new excavations until you resume.",
                    go: () =>
                      act(
                        "halt",
                        () => actor!.gameAdminHalt(),
                        () => "New excavations are halted.",
                      ),
                  })
                }
              >
                Halt new excavations
              </Button>
              <Button
                disabled={working || !security.halted}
                className="gradient-primary text-primary-foreground"
                onClick={() =>
                  confirmThen({
                    title: "Resume play?",
                    detail: "Players can start new excavations again.",
                    go: () =>
                      act(
                        "resume",
                        () => actor!.gameAdminResume(),
                        () => "Play resumed.",
                      ),
                  })
                }
              >
                Resume
              </Button>
              <span className={cn("font-mono text-[11px]", inkFaint)}>
                Ledger failures in a row: {Number(security.ledgerFails)}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px]",
                  security.accountingOk && security.saturations === 0n
                    ? inkFaint
                    : "text-destructive",
                )}
              >
                {security.accountingOk && security.saturations === 0n
                  ? "Accounting OK"
                  : `Accounting check failed (${Number(security.saturations)}). Payments blocked.`}
              </span>
              {security.accountingOk && security.saturations > 0n && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() =>
                    void act(
                      "ack",
                      () => actor!.gameAdminAckAccounting(),
                      () => "Accounting alert cleared.",
                    )
                  }
                >
                  Clear alert
                </Button>
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

      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[color:var(--term-border)] bg-[var(--term-card)] p-6">
            <p className={cn("font-display text-lg font-semibold", ink)}>
              {ask.title}
            </p>
            <p className={cn("text-sm", inkMid)}>{ask.detail}</p>
            {ask.word && (
              <label className="flex flex-col gap-1.5">
                <span className={cn("font-mono text-[11px]", inkFaint)}>
                  Type {ask.word} to continue
                </span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  className="rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-sm"
                />
              </label>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAsk(null)}>
                Cancel
              </Button>
              <Button
                disabled={working || (!!ask.word && typed !== ask.word)}
                className="gradient-primary text-primary-foreground"
                onClick={() => {
                  const go = ask.go;
                  setAsk(null);
                  void go();
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {(working || msg) && (
        <output
          className={cn(
            "fixed bottom-4 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg border bg-[var(--term-card)] px-4 py-3 font-mono text-xs shadow-lg",
            working
              ? "border-[color:var(--term-border)]"
              : msg?.ok
                ? "border-[color:var(--term-green)] text-[color:var(--term-green)]"
                : "border-destructive text-destructive",
          )}
        >
          {working ? (
            <>
              <Spinner /> Working…
            </>
          ) : (
            <>
              <span>{msg?.text}</span>
              <button
                type="button"
                onClick={() => setMsg(null)}
                className="underline"
              >
                Dismiss
              </button>
            </>
          )}
        </output>
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

function Row({
  title,
  hint,
  children,
}: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-[color:var(--term-border-faint)] pb-5 last:border-0 last:pb-0">
      <span className={cn("text-sm font-medium", ink)}>{title}</span>
      <span className={cn("font-mono text-[11px]", inkFaint)}>{hint}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
