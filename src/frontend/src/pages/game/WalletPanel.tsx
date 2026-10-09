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
import { eyebrow, fmtGoldao, gold, ink, inkFaint, panel } from "./game-utils";
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

  const { balance, allowance, ensureAllowance } = useWallet(config);
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
  const fee = config?.feeE8s ?? 1_000_000_000n;
  const credit = dashboard?.credit ?? 0n;
  const need = BigInt(amount) * E8S + fee;
  // If the game is not authorized yet (first load, or the authorization expired), the wallet
  // also pays the fee of that authorization.
  const needsAuthFee = allowance < need;
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
  const loadBlock = !dashboard
    ? "Loading"
    : dashboard.paused
      ? "Bets are paused."
      : !canLoad
        ? `Accumulated prize is full (limit ${fmtGoldao(config?.creditCapE8s ?? 0n)} ${tokenName}). You can load again after you use some of it.`
        : amount < loadMin || amount > maxLoad
          ? `Choose between ${loadMin.toLocaleString("en-US")} and ${maxLoad.toLocaleString("en-US")} ${tokenName}.`
          : balance < need
            ? `Not enough ${tokenName} in your wallet.`
            : null;

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

  const loadCredit = async () => {
    if (!actor || loading || loadBlock) return;
    setMsg(null);
    setLoading(true);
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
        {other && (
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Also in your wallet: {fmtGoldao(otherBalance)} {other.label}
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
      </div>

      <div className="flex flex-col gap-3 p-5">
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
            disabled={loading || !!pending || !!loadBlock}
            onClick={() => void loadCredit()}
            className="gradient-primary text-primary-foreground"
          >
            {loading ? <Spinner /> : null}
            Load {amount.toLocaleString("en-US")}
          </Button>
        </div>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {loadBlock && dashboard
            ? loadBlock
            : dashboard && dashboard.pendingPayout > 0n
              ? `Pending payout: ${fmtGoldao(dashboard.pendingPayout)}`
              : `Fee ${fmtGoldao(fee)}${needsAuthFee ? ` + ${fmtGoldao(fee)} to authorize the game` : ""}`}
        </span>
      </div>

      {open && (
        <div className="border-t border-[color:var(--term-border-faint)] p-5 md:col-span-2">
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
