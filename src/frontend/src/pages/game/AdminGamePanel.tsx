import { type AdminView, type Payout, WithdrawKind } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { loadEnv } from "@/hooks/useBackendActor";
import { GOLDAO_FEE_E8S, approveSpender } from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gem, Landmark, Shield } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { CopyField } from "./CopyField";
import { ModeStatusCard } from "./ModeStatusCard";
import { PayoutLogPanel } from "./PayoutLogPanel";
import { SecurityLogPanel } from "./SecurityLogPanel";
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
  4: "unexplained bank withdrawal",
  5: "fund drop",
  6: "ledger fee changed",
};

const E8S = 100_000_000n;
// Fixed choices only: no free-text numbers, so a typo cannot reach the canister.
const TEST_DEPOSITS = [10_000, 30_000, 100_000, 200_000];
const DURATIONS = [1, 3, 7, 14, 30];
// Fallback pool range while the config loads. The backend's own range (gameConfig) wins.
const POOL_SEED_MIN_FALLBACK = 5_000;
const POOL_SEED_MAX_FALLBACK = 20_000;
// The wallet authorization given to the backend lives only this long.
const WITHDRAW_WINDOW_MS = 2 * 60_000;
const PAY_WINDOW_MS = 10 * 60_000;
// Hard ceiling for any single authorization signed from this panel. The amounts come from
// unverified queries, so a wrong answer can never make the wallet approve more than this.
const MAX_AUTHORIZE_E8S = 1_000_000n * E8S;

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
  const { actor, principalId } = useAuth();
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { run, pending } = useGameAction();
  const { data: security } = useSecurityView(!!view);
  const { data: config } = useGameConfig();
  const minPayout = config ? fmtGoldao(config.minPayoutE8s) : "-";
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [deposit, setDeposit] = useState(String(TEST_DEPOSITS[1]));
  const [days, setDays] = useState("");
  const [seed, setSeed] = useState(String(POOL_SEED_MIN_FALLBACK));
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);

  const working = !!pending || busy;
  const real = !!view?.realLedger;
  const bankText = view?.bankAccount?.toText();
  const selfText = view?.selfId?.toText();
  // The game account comes from the deployment itself (env.json), not from a query to the
  // canister. The view is only used to check that both agree.
  const envQuery = useQuery({
    queryKey: ["game", "spender"],
    queryFn: async () => (await loadEnv()).backend_canister_id ?? "",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const envId =
    envQuery.data && envQuery.data !== "undefined" ? envQuery.data : "";

  const unpaid = view?.payouts.filter((p) => !p.paid) ?? [];
  const unpaidTotal = view?.unpaidPayouts ?? 0n;

  // Every action goes through here: one at a time, result always shown.
  const act = async <T,>(
    name: string,
    call: () => Promise<Res<T>>,
    text: (v: T) => string,
    before?: () => Promise<void>,
    after?: () => Promise<void>,
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
      if (after) await after();
      setBusy(false);
    }
  };

  const confirmThen = (a: Ask) => setAsk(a);

  // Real mode: the backend spends an allowance the admin wallet grants.
  // It is set right before the action to exactly what the action needs, and the
  // ledger drops it by itself after `windowMs`, used or not.
  // With `reuseMin`, an authorization that already covers it is kept (no new approval fee).
  const authorize = async (
    required: bigint,
    windowMs: number,
    reuseMin?: bigint,
  ) => {
    if (!real) return;
    if (!identity || !bankText || !envId) {
      throw new Error("Sign in with the admin wallet first.");
    }
    if (selfText !== envId) {
      throw new Error(
        "The game account does not match this canister. Nothing was authorized.",
      );
    }
    if (required > MAX_AUTHORIZE_E8S) {
      throw new Error(
        "The amount is above the safety limit. Nothing was authorized.",
      );
    }
    if (identity.getPrincipal().toText() !== bankText) {
      throw new Error("This session is not the bank wallet.");
    }
    if (reuseMin !== undefined && actor) {
      const cur = await actor.gameAdminLedgerAllowance(
        Principal.fromText(bankText),
        Principal.fromText(envId),
      );
      if (cur.__kind__ === "ok" && cur.ok >= reuseMin) return;
    }
    await approveSpender(identity, envId, required, windowMs, config?.ledgerId);
  };

  // Asks the backend (a free query) whether it would refuse the action, before the wallet signs
  // an authorization: that signature costs a network fee even when the action is then refused.
  const preflight = async (check: () => Promise<Res<unknown>>) => {
    if (!real || !actor) return;
    const r = await check();
    if (r.__kind__ === "err") throw new Error(r.err);
  };

  // Right after an operation, cancels whatever authorization is left. A dust
  // amount is not worth another network fee: it expires within minutes.
  const revokeLeftover = async () => {
    if (
      !real ||
      !actor ||
      !identity ||
      !bankText ||
      !envId ||
      selfText !== envId
    )
      return;
    try {
      const cur = await actor.gameAdminLedgerAllowance(
        Principal.fromText(bankText),
        Principal.fromText(envId),
      );
      if (cur.__kind__ === "ok" && cur.ok > GOLDAO_FEE_E8S) {
        await approveSpender(identity, envId, 0n, undefined, config?.ledgerId);
      }
    } catch {
      // The expiry set when it was granted still applies.
    }
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
  const poolSeedMin = config
    ? Number(config.poolSeedE8s / E8S)
    : POOL_SEED_MIN_FALLBACK;
  const poolSeedMax = config
    ? Number(config.poolSeedMaxE8s / E8S)
    : POOL_SEED_MAX_FALLBACK;
  const seedNum = /^\d+$/.test(seed) ? Number(seed) : 0;
  const seedValid = seedNum >= poolSeedMin && seedNum <= poolSeedMax;
  const seedTarget = BigInt(seedNum) * E8S;
  const poolGap =
    view && seedValid && view.pool < seedTarget ? seedTarget - view.pool : 0n;

  const allBlockers: string[] = [];
  if (view) {
    if (!halted) allBlockers.push("pause new excavations first");
    if (view.owed > 0n)
      allBlockers.push(
        "players still hold an Accumulated prize or unpaid prizes (use Close and pay everything, then Pay pending)",
      );
    if (unpaid.length > 0) allBlockers.push("pending payouts must be paid");
    if (bank <= GOLDAO_FEE_E8S) allBlockers.push("the wallet is empty");
  }

  // One authorization for the whole run, then every batch of 20 back to back.
  const payNow = async () => {
    if (!actor || working) return;
    setMsg(null);
    setBusy(true);
    let paid = 0;
    let failed = 0;
    let remaining = unpaid.length;
    try {
      await preflight(() => actor.gameAdminCheckPay());
      await authorize(unpaidTotal, PAY_WINDOW_MS);
      for (let i = 0; i < 500; i++) {
        const r = await run("pay", () => actor.gameAdminPay(20n), false);
        paid += Number(r.paid);
        failed += Number(r.failed);
        remaining = Number(r.remaining);
        if (remaining === 0 || r.paid === 0n) break;
      }
      setMsg({
        ok: failed === 0 && remaining === 0,
        text: `Paid ${paid}, failed ${failed}, remaining ${remaining}.`,
      });
    } catch (e) {
      setMsg({
        ok: false,
        text:
          paid > 0
            ? `Paid ${paid} before an error: ${errorMessage(e)}`
            : errorMessage(e),
      });
    } finally {
      await revokeLeftover();
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      setBusy(false);
    }
  };

  // One payout. The authorization covers every pending payout, and it is reused by the next
  // clicks while it is enough, so paying one by one does not cost a network fee each time.
  const payOne = async (p: Payout, renew: boolean) => {
    if (!actor || working) return;
    setMsg(null);
    setBusy(true);
    try {
      const need = p.amount + GOLDAO_FEE_E8S;
      await preflight(() => actor.gameAdminCheckPay());
      await authorize(
        unpaidTotal > need ? unpaidTotal : need,
        PAY_WINDOW_MS,
        need,
      );
      const tx = await run(
        "pay-one",
        () => actor.gameAdminPayOne(p.id, renew),
        "all",
      );
      setMsg({
        ok: true,
        text:
          tx !== undefined
            ? `Paid ${fmtGoldao(p.amount)} GOLDAO. Ledger transaction ${tx}.`
            : `Paid ${fmtGoldao(p.amount)} GOLDAO (test mode, no ledger transaction).`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      setBusy(false);
    }
  };

  // The next `n` smallest pending payouts, the same order the backend uses.
  const payNext = async (n: number) => {
    if (!actor || working) return;
    setMsg(null);
    setBusy(true);
    try {
      const batch = [...unpaid]
        .sort((a, b) =>
          a.amount === b.amount
            ? Number(a.id - b.id)
            : a.amount < b.amount
              ? -1
              : 1,
        )
        .slice(0, n);
      const need = batch.reduce((s, p) => s + p.amount + GOLDAO_FEE_E8S, 0n);
      await preflight(() => actor.gameAdminCheckPay());
      await authorize(need, PAY_WINDOW_MS);
      const r = await run("pay", () => actor.gameAdminPay(BigInt(n)), "all");
      setMsg({
        ok: r.failed === 0n,
        text: `Paid ${Number(r.paid)}, failed ${Number(r.failed)}, remaining ${Number(r.remaining)}.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      await revokeLeftover();
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      setBusy(false);
    }
  };

  const markPaid = (p: Payout, txId: bigint) =>
    act(
      "mark-paid",
      () => actor!.gameAdminMarkPaid(p.id, txId),
      () => `Recorded as paid with transaction ${txId}.`,
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
      <ModeStatusCard view={view} config={config} />
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
          sub="accumulated prizes"
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
          label="Top 10 pool"
          value={view ? fmtGoldao(view.top10) : <Spinner />}
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
              {fmtGoldao(view.owed)} GOLDAO
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 p-5 font-mono text-xs sm:grid-cols-4">
            <Item
              label={`Accumulated prize (${Number(view.toCollectPlayers)} players)`}
              value={fmtGoldao(view.toCollect)}
            />
            <Item
              label="Pending payouts (with fees)"
              value={fmtGoldao(view.unpaidPayouts)}
            />
            <Item
              label="Jackpots in play"
              value={fmtGoldao(view.heldJackpots)}
            />
            <Item
              label={`Under ${minPayout} (${Number(view.smallPlayers)} players)`}
              value={fmtGoldao(view.smallBalances)}
            />
          </dl>
          <p className={cn("px-5 pb-5 font-mono text-[11px]", inkFaint)}>
            Owed = Accumulated prize + pending payouts + jackpots in play. The
            last figure is already inside Accumulated prize: balances under the
            minimum are not paid at a normal close and carry over to the next
            tournament.
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
          <CopyField
            label={
              real
                ? "Admin wallet address: send GOLDAO here to fund the game"
                : "Admin wallet address: it becomes the bank when you enable the real ledger"
            }
            value={bankText ?? principalId ?? ""}
          />
          {view && !real && (
            <Row title="Test bank" hint="Adds the preset to the test balance.">
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
                    title: `Add ${Number(deposit).toLocaleString("en-US")} GOLDAO to the test bank?`,
                    detail:
                      "Test mode only. The amount is added to the current test balance.",
                    go: () =>
                      act(
                        "deposit",
                        () => actor!.gameAdminTestDeposit(BigInt(deposit)),
                        (v) => `Bank is now ${fmtGoldao(v)}.`,
                      ),
                  })
                }
              >
                Add to test bank
              </Button>
            </Row>
          )}

          <Row
            title="Jackpot pool"
            hint={
              !seedValid
                ? `Choose between ${poolSeedMin.toLocaleString("en-US")} and ${poolSeedMax.toLocaleString("en-US")} GOLDAO.`
                : poolGap > 0n
                  ? `Tops the pool up to ${fmtGoldao(seedTarget)} using ${fmtGoldao(poolGap)} from the fund.`
                  : `The pool is already at or above ${fmtGoldao(seedTarget)}.`
            }
          >
            <input
              type="number"
              inputMode="numeric"
              min={poolSeedMin}
              max={poolSeedMax}
              step={1000}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={working}
              className={inputCls}
            />
            <Button
              variant="outline"
              disabled={working || !view || !seedValid || poolGap === 0n}
              onClick={() =>
                confirmThen({
                  title: `Seed the jackpot pool with ${fmtGoldao(poolGap)} GOLDAO?`,
                  detail: `The pool will be ${fmtGoldao(seedTarget)}. The amount comes out of the bank fund.`,
                  go: () =>
                    act(
                      "seed",
                      () => actor!.gameAdminSeedPool(BigInt(seedNum)),
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
            hint={`Takes ${fmtGoldao(availableOut)} GOLDAO (cycles first, then the surplus over the fund target) to the fixed treasury address. Network fee: ${fmtGoldao(GOLDAO_FEE_E8S)}.${real ? " The wallet authorization is set for that amount only and expires in 2 minutes." : ""}`}
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
                      async () => {
                        await preflight(() =>
                          actor!.gameAdminCheckWithdraw(WithdrawKind.available),
                        );
                        await authorize(
                          availableOut + GOLDAO_FEE_E8S,
                          WITHDRAW_WINDOW_MS,
                        );
                      },
                      revokeLeftover,
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
                ? `Empties the wallet (${fmtGoldao(bank - GOLDAO_FEE_E8S)} GOLDAO) to the fixed treasury address and resets pool, reserve, Top 10 pool and cycles.`
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
                      async () => {
                        const fresh = await actor!.gameAdminRefreshBank();
                        if (fresh.__kind__ === "err")
                          throw new Error(fresh.err);
                        await preflight(() =>
                          actor!.gameAdminCheckWithdraw(WithdrawKind.all),
                        );
                        // The authorization costs one fee first, then the transfer.
                        await authorize(
                          fresh.ok - GOLDAO_FEE_E8S,
                          WITHDRAW_WINDOW_MS,
                        );
                      },
                      revokeLeftover,
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
            hint={`Ends it now. Accumulated prize balances of at least ${minPayout} GOLDAO become payouts; smaller ones stay for the next tournament.`}
          >
            <Button
              variant="outline"
              disabled={working}
              onClick={() =>
                confirmThen({
                  title: "Close the current tournament now?",
                  detail:
                    "It cannot be undone. Large Accumulated prize balances become pending payouts.",
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
                ? "Pays every Accumulated prize balance, small ones included. Each payment costs the network fee, taken from the player's balance. Use it before withdrawing everything."
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
                    "Every Accumulated prize balance becomes a payout, whatever its size. Each payout costs the network fee, taken from the player's balance.",
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
                : `${fmtGoldao(unpaidTotal)} GOLDAO pending including fees, smallest first, in batches of 20 until done. A payout that does not fit the funds or the authorization waits for the next run.${real ? " The wallet authorization is set automatically for exactly that amount and expires in 10 minutes." : ""}`
            }
          >
            <Button
              disabled={working || unpaid.length === 0}
              className="gradient-primary text-primary-foreground"
              onClick={() =>
                confirmThen({
                  title: `Pay all pending payouts (${fmtGoldao(unpaidTotal)} GOLDAO)?`,
                  detail:
                    "Funds leave the admin wallet to the players. Keep this page open until it finishes.",
                  go: payNow,
                })
              }
            >
              Pay pending ({unpaid.length})
            </Button>
            {real && (
              <Button
                variant="outline"
                disabled={working}
                onClick={() =>
                  void act(
                    "revoke",
                    async () => {
                      await revokeLeftover();
                      return { __kind__: "ok" as const, ok: null };
                    },
                    () => "Authorization revoked.",
                  )
                }
              >
                Revoke authorization
              </Button>
            )}
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

          {view && (
            <div className="flex flex-col gap-2 border-b border-[color:var(--term-border-faint)] pb-5">
              <span className={cn("text-sm font-medium", ink)}>
                Switching ledger (test token to real GOLDAO)
              </span>
              <ol
                className={cn(
                  "list-decimal space-y-1 pl-5 font-mono text-[11px]",
                  inkFaint,
                )}
              >
                <li>
                  Check your admin principal: it must be the same one that holds
                  the bank. A different login origin gives a different
                  principal.
                </li>
                <li>
                  Pause new excavations by hand, wait for the tournament to
                  close, and pay or mark as paid every payout.
                </li>
                <li>
                  Withdraw everything (all) to the treasury. Owed, credits and
                  open excavations must be zero.
                </li>
                <li>
                  Change the ledger id in the backend code and deploy. Nothing
                  changes in the game until step 5.
                </li>
                <li>
                  Run the ledger change below with the bank wallet. It checks
                  the fee, reads the bank balance and erases all game data.
                </li>
                <li>
                  Fund the pool again, check the bank balance and the ledger id
                  shown here, then resume the game.
                </li>
              </ol>
            </div>
          )}

          {view && real && (
            <Row
              title="Change ledger"
              hint={`The game uses ${config?.ledgerId ?? "-"}. After changing the ledger code, pause the game, close the tournament, pay everything and withdraw everything. This re-reads the bank, checks the fee and erases all game data.`}
            >
              <span className="font-mono text-xs">
                {envId ? `Game account ${envId}` : "Game account unknown"}
              </span>
              <Button
                variant="outline"
                disabled={working || !parsePrincipal(envId)}
                onClick={() =>
                  confirmThen({
                    title: "Change the ledger?",
                    detail:
                      "The game must be paused and empty. All game data is erased and the bank is read from the new ledger.",
                    word: "CHANGE LEDGER",
                    go: () =>
                      act(
                        "real",
                        () =>
                          actor!.gameAdminSetRealLedger(parsePrincipal(envId)!),
                        (v) => `Ledger changed. Bank is ${fmtGoldao(v)}.`,
                      ),
                  })
                }
              >
                Change
              </Button>
            </Row>
          )}

          {view && !real && (
            <Row
              title="Real ledger"
              hint="Switches from test to real GOLDAO. Needs no pending payouts. Irreversible."
            >
              <span className="font-mono text-xs">
                {envId ? `Game account ${envId}` : "Game account unknown"}
              </span>
              <Button
                variant="outline"
                disabled={working || !parsePrincipal(envId)}
                onClick={() =>
                  confirmThen({
                    title: "Enable the real ledger?",
                    detail: "From now on the admin wallet holds real GOLDAO.",
                    word: "GO REAL",
                    go: () =>
                      act(
                        "real",
                        () =>
                          actor!.gameAdminSetRealLedger(parsePrincipal(envId)!),
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

      {security && <SecurityLogPanel />}

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
            <Item label="Volume" value={fmtGoldao(view.lastClose.staked)} />
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
        <PayoutLogPanel
          view={view}
          working={working}
          onPayOne={(p, renew) =>
            renew
              ? confirmThen({
                  title: "Renew this payout?",
                  detail:
                    "Only if you checked in the ledger that it was NOT sent. A new timestamp is assigned and the next payment sends it for real.",
                  word: "RENEW",
                  go: () => payOne(p, true),
                })
              : void payOne(p, false)
          }
          onPayNext={(n) =>
            confirmThen({
              title: `Pay the next ${n} payouts?`,
              detail:
                "Smallest first. Funds leave the admin wallet to the players. Keep this page open until it finishes.",
              go: () => payNext(n),
            })
          }
          onMarkPaid={(p, txId) =>
            confirmThen({
              title: `Mark as paid with transaction ${txId}?`,
              detail: `${shortPrincipal(p.to.toText())} · ${fmtGoldao(p.amount)} GOLDAO. Only if you saw this transaction in the ledger.`,
              go: () => markPaid(p, txId),
            })
          }
        />
      )}

      {ask && (
        <ConfirmDialog
          key={ask.title}
          title={ask.title}
          detail={ask.detail}
          word={ask.word}
          busy={working}
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            const go = ask.go;
            setAsk(null);
            void go();
          }}
        />
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
