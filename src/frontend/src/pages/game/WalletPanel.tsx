import type { Dashboard, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Droplets,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CopyField } from "./CopyField";
import { Spinner } from "./Spinner";
import { TestFaucetCard } from "./TestFaucetCard";
import { SendForm, useTokenBalances } from "./WalletTokens";
import {
  AUTHORIZE_DAYS,
  AUTHORIZE_GOLDAO,
  eyebrow,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  panel,
  pauseMessage,
} from "./game-utils";
import { TEST_TOKEN_LABEL, isTestLedger } from "./ledger-mode";
import { errorMessage, useGameAction } from "./useGame";
import { useWallet } from "./useWallet";

const LOAD_PRESETS = [2_000, 5_000, 10_000, 20_000, 50_000];
const E8S = 100_000_000n;

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function WalletPanel({ dashboard, config }: Props) {
  const { actor, principalId } = useAuth();
  const { run, pending } = useGameAction();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const {
    balance,
    allowance,
    expiresAtMs,
    ensureAllowance,
    revoke,
    spenderMissing,
  } = useWallet(config);
  const { tokens, active, balances } = useTokenBalances(config);
  // The token the game does not use, shown only as a small note.
  const other = tokens.find((t) => t.ledgerId !== active.ledgerId);
  const otherBalance = (other && balances?.[other.ledgerId]) || 0n;
  // One panel at a time under the wallet: receive, send or the test faucet.
  const [open, setOpen] = useState<"receive" | "send" | "faucet" | null>(null);
  const toggle = (k: "receive" | "send" | "faucet") =>
    setOpen((cur) => (cur === k ? null : k));
  // GOLDAO TEST: the game runs on the test ledger. Only the wallet shows the test name.
  const testLedger = isTestLedger(config);
  const [amount, setAmount] = useState(5_000);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The first load asks for the player's consent to the authorization before it is signed.
  const [consent, setConsent] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const fee = config?.feeE8s ?? 1_000_000_000n;
  const credit = dashboard?.credit ?? 0n;
  const need = BigInt(amount) * E8S + fee;
  // If the game is not authorized yet (first load, or the authorization expired), the wallet
  // also pays the fee of that authorization.
  const needsAuthFee = allowance < need;
  // A load the ledger did not answer yet. Repeating it is safe: it is credited only once.
  const waitingLoad = dashboard?.pendingLoad ?? 0n;
  const authExpiry = expiresAtMs
    ? new Date(expiresAtMs).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;
  const room =
    config && config.creditCapE8s > credit ? config.creditCapE8s - credit : 0n;
  const roomGoldao = Number(room / E8S);
  const loadMin = config ? Number(config.loadMin) : 0;
  // Most that can be loaded now: the per-load maximum or what is left under the Accumulated prize limit.
  const maxLoad = config ? Math.min(Number(config.loadMax), roomGoldao) : 0;
  const canLoad = !config || maxLoad >= loadMin;
  // Only amounts that fit; "Max" covers the rest (for example 50 left under the limit).
  const presets = LOAD_PRESETS.filter(
    (a) => !config || (a >= loadMin && a <= maxLoad),
  );
  const showMax = !!config && canLoad && !presets.includes(maxLoad);
  const tokenName = testLedger ? TEST_TOKEN_LABEL : "GOLDAO";
  // Withdrawals stay open while the tournament closes; the backend only pauses them for the few
  // seconds of the prize check.
  const closeByMs =
    dashboard && dashboard.endsAt !== 0n && config
      ? Number((dashboard.endsAt + config.closeWindowNs) / 1_000_000n)
      : undefined;
  const loadBlock = !dashboard
    ? "Loading"
    : spenderMissing
      ? "The game address could not be verified. Reload the page; do not load until it works."
      : dashboard.paused
        ? pauseMessage(dashboard.pauseCode, closeByMs)
        : !canLoad
          ? `Accumulated prize is full (limit ${fmtGoldao(config?.creditCapE8s ?? 0n)} ${tokenName}). You can load again after you use some of it.`
          : amount < loadMin || amount > maxLoad
            ? `Choose between ${loadMin.toLocaleString("en-US")} and ${maxLoad.toLocaleString("en-US")} ${tokenName}.`
            : balance < need + (needsAuthFee ? fee : 0n)
              ? `Not enough ${tokenName} in your wallet.`
              : null;

  // Withdrawal: the whole game balance goes to the wallet and the network fee comes out of it.
  // A withdrawal that got no answer from the ledger is repeated with the same button.
  const withdrawMin = config?.withdrawMinE8s ?? 0n;
  const waiting = dashboard?.pendingWithdrawal ?? 0n;
  const pauseNo = Number(dashboard?.pauseCode ?? 0n);
  const withdrawBase = waiting > 0n ? waiting : credit;
  const receive = withdrawBase > fee ? withdrawBase - fee : 0n;
  const withdrawBlock = !dashboard
    ? "Loading"
    : waiting > 0n
      ? null
      : pauseNo === 7
        ? "The game is being closed: your balance will be sent to your wallet."
        : pauseNo === 2 || pauseNo === 4
          ? "Withdrawals are paused while the game is being checked. Your balance is safe: try again later."
          : waitingLoad > 0n
            ? "Your last load is still being confirmed. Press Confirm load, then withdraw."
            : credit < withdrawMin
              ? `The minimum withdrawal is ${fmtGoldao(withdrawMin)} ${tokenName}. A smaller balance stays in the game.`
              : null;

  // The confirmation step goes away by itself.
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), 6000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  // If the chosen amount no longer fits (the Accumulated prize grew), move it to the biggest one that does.
  useEffect(() => {
    if (!config || !canLoad || amount <= maxLoad) return;
    const fit = [...presets].reverse().find((a) => a <= maxLoad);
    setAmount(fit ?? maxLoad);
  }, [config, canLoad, amount, maxLoad, presets]);

  // A green confirmation goes away by itself; errors stay until the next action.
  useEffect(() => {
    if (!msg?.ok) return;
    const t = window.setTimeout(() => setMsg(null), 6000);
    return () => window.clearTimeout(t);
  }, [msg]);

  // Changing the amount asks for consent again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the amount changes
  useEffect(() => setConsent(false), [amount]);

  const loadCredit = async () => {
    if (!actor || loading || loadBlock || waitingLoad > 0n) return;
    // Nothing is signed before the player has read what the authorization means.
    if (needsAuthFee && !consent) {
      setConsent(true);
      return;
    }
    setMsg(null);
    setLoading(true);
    setConsent(false);
    try {
      await ensureAllowance(need);
      const total = await run(
        "load",
        () => actor.gameLoadCredit(BigInt(amount)),
        "live",
      );
      setMsg({
        ok: true,
        text: `Accumulated prize is now ${fmtGoldao(total)} ${tokenName}.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  // Repeats a load that got no answer from the ledger, with the amount the game remembers.
  const confirmLoad = async () => {
    if (!actor || loading || waitingLoad === 0n) return;
    setMsg(null);
    setLoading(true);
    try {
      const total = await run(
        "load",
        () => actor.gameLoadCredit(waitingLoad / E8S),
        "live",
      );
      setMsg({
        ok: true,
        text: `Accumulated prize is now ${fmtGoldao(total)} ${tokenName}.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  const revokeAuth = async () => {
    if (revoking) return;
    setMsg(null);
    setRevoking(true);
    try {
      await revoke();
      setMsg({ ok: true, text: "Authorization removed." });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setRevoking(false);
    }
  };

  const withdraw = async () => {
    if (!actor || withdrawing || withdrawBlock) return;
    setMsg(null);
    setWithdrawing(true);
    try {
      const got = await run(
        "withdraw",
        () => actor.gameWithdrawCredit(withdrawBase),
        "live",
      );
      setMsg({
        ok: true,
        text: `${fmtGoldao(got)} ${tokenName} sent to your wallet.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setWithdrawing(false);
      setConfirming(false);
    }
  };

  // One short line under the withdraw button.
  const withdrawHint = !dashboard
    ? null
    : (withdrawBlock ??
      (waiting > 0n
        ? "Waiting for the ledger. Retry: you will not be paid twice."
        : credit > 0n
          ? `You receive ${fmtGoldao(receive)} (fee ${fmtGoldao(fee)})`
          : null));

  return (
    <div className={cn(panel, "grid gap-0 overflow-hidden md:grid-cols-2")}>
      <div className="flex flex-col gap-3 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Wallet className="size-3.5" /> Wallet
        </span>
        <motion.span
          key={String(balance)}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(balance) : <Spinner />}
          <span className={cn("ml-2 font-mono text-xs", gold)}>
            {tokenName}
          </span>
        </motion.span>
        {other && otherBalance > 0n && (
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Also: {fmtGoldao(otherBalance)} {other.label}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={open === "receive" ? "default" : "outline"}
            onClick={() => toggle("receive")}
          >
            <ArrowDownToLine className="size-3.5" /> Receive
          </Button>
          <Button
            size="sm"
            variant={open === "send" ? "default" : "outline"}
            onClick={() => toggle("send")}
          >
            <ArrowUpFromLine className="size-3.5" /> Send
          </Button>
          {testLedger && (
            <Button
              size="sm"
              variant={open === "faucet" ? "default" : "outline"}
              onClick={() => toggle("faucet")}
            >
              <Droplets className="size-3.5" /> Get {TEST_TOKEN_LABEL}
            </Button>
          )}
        </div>
        {open && (
          <div className="border-t border-[color:var(--term-border-faint)] pt-4">
            {open === "receive" && principalId && (
              <CopyField label="Your address" value={principalId} />
            )}
            {open === "send" && (
              <SendForm
                config={config}
                tokens={tokens}
                active={active}
                balances={balances}
                onResult={setMsg}
              />
            )}
            {open === "faucet" && testLedger && <TestFaucetCard />}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-5">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Coins className="size-3.5" /> Game balance
        </span>
        <span
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(dashboard.credit) : <Spinner />}
          <span className={cn("ml-2 font-mono text-xs", gold)}>
            {tokenName}
          </span>
        </span>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((a) => (
              <Button
                key={a}
                size="sm"
                variant={a === amount ? "default" : "outline"}
                disabled={loading || !!pending}
                onClick={() => setAmount(a)}
                className="font-mono text-xs"
              >
                {a.toLocaleString("en-US")}
              </Button>
            ))}
            {showMax && (
              <Button
                size="sm"
                variant={amount === maxLoad ? "default" : "outline"}
                disabled={loading || !!pending}
                onClick={() => setAmount(maxLoad)}
                className="font-mono text-xs"
              >
                Max {maxLoad.toLocaleString("en-US")}
              </Button>
            )}
            <Button
              size="sm"
              disabled={loading || !!pending || !!loadBlock || waitingLoad > 0n}
              onClick={() => void loadCredit()}
              className="gradient-primary text-primary-foreground"
            >
              {loading ? <Spinner /> : null}
              {consent
                ? `Authorize and load ${amount.toLocaleString("en-US")}`
                : `Load ${amount.toLocaleString("en-US")}`}
            </Button>
          </div>
          {consent && (
            <p
              className={cn("font-mono text-[11px] leading-relaxed", inkFaint)}
            >
              This lets the game take up to{" "}
              {AUTHORIZE_GOLDAO.toLocaleString("en-US")} {tokenName} from your
              wallet for {AUTHORIZE_DAYS} days (one-time fee {fmtGoldao(fee)}).
              It only takes what you load. You can revoke it at any time.
            </p>
          )}
          {waitingLoad > 0n && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("font-mono text-[11px]", inkFaint)}>
                Load of {fmtGoldao(waitingLoad)} {tokenName} not confirmed yet.
                You will not be charged twice.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !!pending}
                onClick={() => void confirmLoad()}
              >
                {loading ? <Spinner /> : null}
                Confirm load
              </Button>
            </div>
          )}
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            {loadBlock && dashboard
              ? loadBlock
              : `Fee ${fmtGoldao(fee)}${needsAuthFee ? ` + ${fmtGoldao(fee)} to authorize` : ""}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[color:var(--term-border-faint)] pt-4">
          <Button
            size="sm"
            variant={confirming ? "default" : "outline"}
            disabled={withdrawing || !!pending || !!withdrawBlock}
            onClick={() => {
              if (waiting > 0n || confirming) void withdraw();
              else setConfirming(true);
            }}
          >
            {withdrawing ? (
              <Spinner />
            ) : (
              <ArrowUpFromLine className="size-3.5" />
            )}
            {waiting > 0n
              ? "Retry withdrawal"
              : confirming
                ? `Confirm: receive ${fmtGoldao(receive)}`
                : "Withdraw all"}
          </Button>
          {withdrawHint && (
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {withdrawHint}
            </span>
          )}
        </div>

        {allowance > 0n && (
          <div
            className={cn(
              "flex items-center justify-between gap-2 font-mono text-[11px]",
              inkFaint,
            )}
          >
            <span
              title={`Game authorized for up to ${fmtGoldao(allowance)} ${tokenName}`}
            >
              Game authorized{authExpiry ? ` until ${authExpiry}` : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={revoking || loading}
              onClick={() => void revokeAuth()}
              title={`Removes the authorization. Costs the network fee (${fmtGoldao(fee)}) from your wallet.`}
              className="h-6 px-2 font-mono text-[11px] text-[color:var(--term-ink-faint)] underline-offset-2 hover:underline"
            >
              {revoking ? <Spinner /> : null}
              Revoke
            </Button>
          </div>
        )}
      </div>

      {msg && (
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-2 font-mono text-xs md:col-span-2",
            msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
