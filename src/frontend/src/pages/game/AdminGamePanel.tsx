import { type AdminView, WithdrawKind } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { GOLDAO_FEE_E8S, fetchWalletBalance } from "@/lib/goldao-ledger";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gem, Landmark, Shield } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { CopyField } from "./CopyField";
import { ModeStatusCard } from "./ModeStatusCard";
import { SecurityLogPanel } from "./SecurityLogPanel";
import { Spinner } from "./Spinner";
import { TransferLogPanel } from "./TransferLogPanel";
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
import { TEST_TOKEN_LABEL, isTestLedger } from "./ledger-mode";
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
  7: "game being closed",
  8: "tournament review failed",
};

const E8S = 100_000_000n;
// Fixed choices only: no free-text numbers, so a typo cannot reach the canister.
const DURATIONS = [1, 3, 7, 14, 30];
// Fallback pool range while the config loads. The backend's own range (gameConfig) wins.
const POOL_SEED_MIN_FALLBACK = 5_000;
const POOL_SEED_MAX_FALLBACK = 20_000;
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

/** Why the game is paused, from the code the backend reports, in words for the admin. */
function pauseReason(view: AdminView): string {
  const open = Number(view.openExcavations);
  switch (Number(view.pauseCode)) {
    case 7:
      return "The game is being closed: loads, plays and withdrawals are stopped until the balances are sent or the evacuation is cancelled.";
    case 8: {
      const by = new Date(Number(view.closeEndsAt / 1_000_000n));
      return `The tournament is closing: new excavations and loads are paused until the next one starts. ${open} open excavation${open === 1 ? "" : "s"} can still be finished; the close is done by ${by.toLocaleTimeString()} at the latest. Withdrawals stay open.`;
    }
    case 6:
      return "The next tournament is waiting to start after the review of the last one. Balances stay in the game.";
    case 5:
      return "Bets are paused: the stakes are not ready.";
    case 4:
      return "Bets are paused: the bank is not ready or does not match the ledger.";
    case 2:
      return `Bets are paused: play was halted by the safety check. ${open} open excavation${open === 1 ? "" : "s"} waiting.`;
    case 1:
      return "Bets are paused: play was halted by the admin.";
    default:
      return view.stakes.length === 0
        ? "Bets are paused: the bank fund is below its floor."
        : "Bets are paused.";
  }
}
export function AdminGamePanel({ view }: { view: AdminView | undefined }) {
  const { actor } = useAuth();
  const queryClient = useQueryClient();
  const { run, pending } = useGameAction();
  const { data: security } = useSecurityView(!!view);
  const { data: config } = useGameConfig();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [days, setDays] = useState("");
  const [seed, setSeed] = useState(String(POOL_SEED_MIN_FALLBACK));
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);

  const working = !!pending || busy;
  const connected = !!view?.realLedger;
  const bankText = view?.bankAccount?.toText();
  const selfText = view?.selfId?.toText();
  // The bank is the account of the game canister itself. Until the ledger is changed, a game that
  // was connected by an older version still has another account as its bank and moves no money.
  const bankReady = !!bankText && bankText === selfText;
  // Display only: the bank balance read straight from the ledger. The backend does its own reads.
  const bankAddr = bankText ?? selfText ?? "";
  const { data: ledgerBalance } = useQuery({
    queryKey: ["game", "bank-balance", bankAddr, config?.ledgerId],
    queryFn: () => fetchWalletBalance(bankAddr, config?.ledgerId),
    enabled: !!bankAddr && !!config?.ledgerId,
    refetchInterval: 15_000,
  });

  // Every action goes through here: one at a time, result always shown.
  const act = async <T,>(
    name: string,
    call: () => Promise<Res<T>>,
    text: (v: T) => string,
  ) => {
    if (!actor || working) return;
    setMsg(null);
    setBusy(true);
    try {
      const v = await run(name, call, "all");
      setMsg({ ok: true, text: text(v) });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const confirmThen = (a: Ask) => setAsk(a);

  const parsePrincipal = (t: string): Principal | null => {
    try {
      return Principal.fromText(t.trim());
    } catch {
      return null;
    }
  };

  const halted = !!security?.halted;
  // Evacuation is a full pause with halt code 7.
  const evacuating = halted && security?.haltCode === 7n;
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
    if (!evacuating) allBlockers.push("start the evacuation first");
    if (view.owed > 0n)
      allBlockers.push(
        "players still hold balances (send them with the evacuation first)",
      );
    if (view.pendingLoads > 0n)
      allBlockers.push("a load is still waiting for the ledger");
    if (bank <= GOLDAO_FEE_E8S) allBlockers.push("the bank is empty");
  }

  // Sends the balances in batches until none is left, or until a batch sends nothing.
  const evacSend = async () => {
    if (!actor || working) return;
    setMsg(null);
    setBusy(true);
    let sent = 0;
    let failed = 0;
    let remaining = 0;
    try {
      for (let i = 0; i < 500; i++) {
        const r = await run(
          "evac-send",
          () => actor.gameAdminEvacSend(),
          false,
        );
        sent += Number(r.sent);
        failed = Number(r.failed);
        remaining = Number(r.remaining);
        if (remaining === 0 || r.sent === 0n) break;
      }
      setMsg({
        ok: remaining === 0,
        text:
          remaining === 0
            ? `All balances sent (${sent} in this run).`
            : `Sent ${sent}, not sent yet ${failed}, remaining ${remaining}. Press the button again.`,
      });
    } catch (e) {
      setMsg({
        ok: false,
        text:
          sent > 0
            ? `Sent ${sent} before an error: ${errorMessage(e)}`
            : errorMessage(e),
      });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {view?.paused && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          {pauseReason(view)}
        </div>
      )}
      {connected && view && !bankReady && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 font-mono text-xs text-destructive">
          The bank is not in the game account yet, so the game moves no money.
          Start the evacuation, send every balance and withdraw everything, send
          the GOLDAO to the game account address shown under Funds, then delete
          the game data so the game connects again.
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
          label="Bank (game account)"
          value={view ? fmtGoldao(view.bank) : <Spinner />}
          sub="GOLDAO (ledger)"
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
              label="Pending withdrawals"
              value={fmtGoldao(view.pendingWithdrawals)}
            />
            <Item
              label="Jackpots in play"
              value={fmtGoldao(view.heldJackpots)}
            />
            <Item
              label={`At or under the fee (${Number(view.smallPlayers)} players)`}
              value={fmtGoldao(view.smallBalances)}
            />
          </dl>
          <p className={cn("px-5 pb-5 font-mono text-[11px]", inkFaint)}>
            Owed = Accumulated prize + pending withdrawals + the stakes and
            jackpots of excavations in play. Balances stay in the game until
            their owner withdraws them. The last figure is already inside
            Accumulated prize: balances at or under the network fee cannot be
            withdrawn and are written off in an evacuation.
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
          <div className="flex items-baseline gap-2">
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              Game account balance on the ledger
            </span>
            <span className={cn("font-mono text-sm", ink)}>
              {ledgerBalance === undefined ? "-" : fmtGoldao(ledgerBalance)}{" "}
              {isTestLedger(config) ? TEST_TOKEN_LABEL : "GOLDAO"}
            </span>
          </div>
          <CopyField
            label={
              connected && bankReady
                ? "Game account address (the bank): send GOLDAO here to fund the game"
                : "Game account address: it becomes the bank when the game connects"
            }
            value={
              selfText ??
              "Not available yet: the backend has not reported the game account."
            }
          />
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
                      (v) =>
                        `Done. Sent ${fmtGoldao(v)} GOLDAO to the treasury.`,
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
                ? `Empties the bank (${fmtGoldao(bank - GOLDAO_FEE_E8S)} GOLDAO) to the fixed treasury address and resets pool, reserve, Top 10 pool and cycles.`
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
                      (v) =>
                        `Done. Sent ${fmtGoldao(v)} GOLDAO to the treasury.`,
                    ),
                })
              }
            >
              Withdraw everything
            </Button>
          </Row>

          {connected && (
            <Row
              title="Refresh bank"
              hint="Reads the bank balance from the ledger."
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
            title="Start tournament"
            hint={
              view?.endsAt === 0n
                ? "The next tournament is waiting. It starts by itself after the review of the previous one, or start it now."
                : "Not available: a tournament is already running."
            }
          >
            <Button
              className="gradient-primary text-primary-foreground"
              disabled={working || view?.endsAt !== 0n}
              onClick={() =>
                confirmThen({
                  title: "Start the tournament now?",
                  detail:
                    "A new tournament opens right away, without waiting for the review timer.",
                  word: "START",
                  go: () =>
                    act(
                      "start",
                      () => actor!.gameAdminStartTournament(),
                      () => "Tournament started.",
                    ),
                })
              }
            >
              Start now
            </Button>
          </Row>

          <Row
            title="Close tournament"
            hint="Ends it now, without the closing window or the review: open excavations are saved from the third pick and the others get their stake back. The Top 10 prize is added to the winners' balances. Balances stay in the game, and the next tournament waits for Start."
          >
            <Button
              variant="outline"
              disabled={working}
              onClick={() =>
                confirmThen({
                  title: "Close the current tournament now?",
                  detail:
                    "It cannot be undone. The Top 10 prize is added to the winners' balances; nothing is paid out.",
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
            title="Close open excavations"
            hint={
              halted
                ? "Ends every excavation in progress without closing the tournament. Saved ones are settled, the ones still on their free picks get their stake back."
                : "Not available: pause new excavations first."
            }
          >
            <Button
              variant="outline"
              disabled={working || !halted}
              onClick={() =>
                confirmThen({
                  title: "Close all open excavations?",
                  detail:
                    "The tournament keeps running. Players who reached the third pick are saved. The others get their stake back and any jackpot found on the free picks returns to the pool.",
                  word: "CLOSE OPEN",
                  go: () =>
                    act(
                      "close-open",
                      () => actor!.gameAdminCloseOpen(),
                      (n) => `${n} open excavation(s) closed.`,
                    ),
                })
              }
            >
              Close open excavations
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
        </div>
      </div>

      {view && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
              <Shield className="size-3.5" /> Evacuation
            </span>
            <span
              className={cn(
                "font-mono text-[11px]",
                evacuating ? "text-destructive" : inkFaint,
              )}
            >
              {evacuating ? "Active" : "Not active"}
            </span>
          </div>
          <div className="flex flex-col gap-5 p-5">
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              To empty the bank (an update, say): 1. Start the evacuation, which
              stops loads, plays and withdrawals. 2. Close the tournament. 3.
              Send the balances to their owners; repeat until none is left.
              Balances at or under the network fee stay in the bank. 4. Withdraw
              everything to the treasury. Only the bank admin can do these
              steps.
            </span>
            <Row
              title="Start evacuation"
              hint={
                evacuating
                  ? "The evacuation is active."
                  : "Stops the game completely. Cancel it any time before the final withdrawal."
              }
            >
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive"
                disabled={working || evacuating}
                onClick={() =>
                  confirmThen({
                    title: "Start the evacuation?",
                    detail:
                      "Players cannot load, play or withdraw until it is cancelled or finished.",
                    word: "EVACUATE",
                    go: () =>
                      act(
                        "evac-start",
                        () => actor!.gameAdminEvacStart(),
                        () => "Evacuation started.",
                      ),
                  })
                }
              >
                Start evacuation
              </Button>
            </Row>
            <Row
              title="Send balances"
              hint={
                !evacuating
                  ? "Not available: start the evacuation first."
                  : view.endsAt !== 0n
                    ? "Not available: close the tournament first."
                    : `${Number(view.toCollectPlayers) - Number(view.smallPlayers)} balances to send, ${Number(view.smallPlayers)} at or under the fee (${fmtGoldao(view.smallBalances)} GOLDAO, they stay in the bank), ${view.withdrawals.length} withdrawals waiting, ${Number(view.pendingLoads)} loads waiting.`
              }
            >
              <Button
                className="gradient-primary text-primary-foreground"
                disabled={working || !evacuating || view.endsAt !== 0n}
                onClick={() =>
                  confirmThen({
                    title: "Send the balances to their owners?",
                    detail:
                      "Each player's balance goes to their own wallet, minus the network fee. Keep this page open until it finishes.",
                    go: evacSend,
                  })
                }
              >
                Send balances
              </Button>
            </Row>
            <Row
              title="Cancel evacuation"
              hint="Opens the game again. Balances already sent stay sent."
            >
              <Button
                variant="outline"
                disabled={working || !evacuating}
                onClick={() =>
                  confirmThen({
                    title: "Cancel the evacuation?",
                    detail:
                      "The game opens again. The next tournament waits for Start.",
                    go: () =>
                      act(
                        "evac-cancel",
                        () => actor!.gameAdminResume(),
                        () => "Evacuation cancelled.",
                      ),
                  })
                }
              >
                Cancel evacuation
              </Button>
            </Row>
          </div>
        </div>
      )}

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
                    word: "RESUME",
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
                  : `Accounting check failed (${Number(security.saturations)}). Withdrawals blocked.`}
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

      {view && view.withdrawals.length > 0 && (
        <div className={panel}>
          <div className={panelHeader}>
            <span className={cn(eyebrow, gold)}>
              Pending withdrawals · {fmtGoldao(view.pendingWithdrawals)} GOLDAO
            </span>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <span className={cn("text-[11px]", inkFaint)}>
              A withdrawal that got no answer from the ledger. The player can
              repeat it until its timestamp expires; after that, check the
              player's wallet and settle it here. "Sent" if the GOLDAO arrived,
              "Give back" if it did not.
            </span>
            {view.withdrawals.map((w) => {
              const who = w.player.toText();
              return (
                <div
                  key={who}
                  className="flex flex-wrap items-center gap-3 font-mono text-xs"
                >
                  <span className="break-all">{who}</span>
                  <span>
                    {fmtGoldao(w.amount - GOLDAO_FEE_E8S)} GOLDAO to the wallet
                  </span>
                  <span className={inkFaint}>
                    {new Date(Number(w.at / 1_000_000n)).toLocaleString()}
                  </span>
                  <span className={w.expired ? "text-destructive" : inkFaint}>
                    {w.expired ? "expired" : "player can still repeat"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working || !w.expired}
                    onClick={() =>
                      confirmThen({
                        title: "Settle as sent?",
                        detail: `Only if ${fmtGoldao(w.amount - GOLDAO_FEE_E8S)} GOLDAO arrived in the wallet of ${who}. The credit is not given back.`,
                        word: "SENT",
                        go: () =>
                          act(
                            "withdraw-sent",
                            () =>
                              actor!.gameAdminResolveWithdrawal(w.player, true),
                            () => "Withdrawal settled as sent.",
                          ),
                      })
                    }
                  >
                    Sent
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working || !w.expired}
                    onClick={() =>
                      confirmThen({
                        title: "Give the credit back?",
                        detail: `Only if nothing arrived in the wallet of ${who}. ${fmtGoldao(w.amount)} GOLDAO returns to the player's game balance.`,
                        word: "GIVE BACK",
                        go: () =>
                          act(
                            "withdraw-back",
                            () =>
                              actor!.gameAdminResolveWithdrawal(
                                w.player,
                                false,
                              ),
                            () => "Credit given back to the player.",
                          ),
                      })
                    }
                  >
                    Give back
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {security && <SecurityLogPanel />}

      {security && <TransferLogPanel />}

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
              label="Jackpots (full + mini)"
              value={String(Number(view.lastClose.jackpots))}
            />
            <Item
              label="Jackpot paid (full + mini)"
              value={fmtGoldao(view.lastClose.jackpotPaid)}
            />
            <Item
              label="Of which mini"
              value={`${Number(view.lastClose.minis)} · ${fmtGoldao(view.lastClose.miniPaid)}`}
            />
          </dl>
        </div>
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
