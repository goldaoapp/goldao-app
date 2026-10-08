import type { Dashboard, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Coins, ShieldCheck, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";
import { TestFaucetCard } from "./TestFaucetCard";
import { WalletTokens } from "./WalletTokens";
import { eyebrow, fmtGoldao, gold, ink, inkFaint, panel } from "./game-utils";
import { TEST_TOKEN_LABEL, isTestLedger } from "./ledger-mode";
import { errorMessage, useGameAction } from "./useGame";
import { useWallet } from "./useWallet";

const LOAD_PRESETS = [200, 500, 1_000, 2_000, 5_000];
const E8S = 100_000_000n;

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function WalletPanel({ dashboard, config }: Props) {
  const { actor } = useAuth();
  const { run, pending } = useGameAction();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { balance, allowance, ensureAllowance } = useWallet(config);
  // GOLDAO TEST: the game runs on the test ledger. Only the wallet shows the test name.
  const testLedger = isTestLedger(config);
  const [amount, setAmount] = useState(500);
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
  const loadBlock = !dashboard
    ? "Loading"
    : dashboard.paused
      ? "Bets are paused."
      : !canLoad
        ? `Accumulated prize is full (limit ${fmtGoldao(config?.creditCapE8s ?? 0n)} GOLDAO). You can load again after you use some of it.`
        : amount < loadMin || amount > maxLoad
          ? `Choose between ${loadMin.toLocaleString("en-US")} and ${maxLoad.toLocaleString("en-US")} GOLDAO.`
          : balance < need
            ? "Not enough GOLDAO in your wallet."
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
        text: `Accumulated prize is now ${fmtGoldao(total)} GOLDAO.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(panel, "grid gap-0 overflow-hidden md:grid-cols-3")}>
      <div className="flex flex-col gap-2 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
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
            {testLedger ? TEST_TOKEN_LABEL : "GOLDAO"}
          </span>
        </motion.span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {testLedger
            ? `${TEST_TOKEN_LABEL} ledger (no value)`
            : "GOLDAO ledger"}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Coins className="size-3.5" /> Load balance
        </span>
        <span
          className={cn(
            "font-display text-2xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(dashboard.credit) : <Spinner />}
          <span className={cn("ml-2 font-mono text-xs", gold)}>GOLDAO</span>
        </span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {dashboard && dashboard.pendingPayout > 0n
            ? `Pending payout from last tournament: ${fmtGoldao(dashboard.pendingPayout)}`
            : "Accumulated prize. Backs your stakes. Paid when the tournament closes"}
        </span>
        {config && (
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Limit {fmtGoldao(config.creditCapE8s)} GOLDAO.{" "}
            {canLoad
              ? `You can load up to ${maxLoad.toLocaleString("en-US")} more now.`
              : "It is full, so loading is off until you use some of it."}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
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
        </div>
        <Button
          size="sm"
          disabled={loading || !!pending || !!loadBlock}
          onClick={() => void loadCredit()}
          className="w-fit gradient-primary text-primary-foreground"
        >
          {loading ? <Spinner /> : null}
          Load {amount.toLocaleString("en-US")} GOLDAO
        </Button>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {loadBlock && dashboard
            ? loadBlock
            : needsAuthFee
              ? `Your wallet pays ${amount.toLocaleString("en-US")} + ${fmtGoldao(fee)} network fee, plus ${fmtGoldao(fee)} the first time to authorize the game.`
              : `Your wallet pays ${amount.toLocaleString("en-US")} + ${fmtGoldao(fee)} network fee.`}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <ShieldCheck className="size-3.5" /> Wallet play
        </span>
        <span className={cn("text-xs", inkFaint)}>
          The game authorizes itself the first time you load balance. Your
          wallet is only charged when you load.
        </span>
        {testLedger && <TestFaucetCard />}
      </div>

      <WalletTokens config={config} />

      {msg && (
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-2 font-mono text-xs md:col-span-3",
            msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
