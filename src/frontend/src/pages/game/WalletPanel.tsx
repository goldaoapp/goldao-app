import type { Dashboard, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Coins, Droplets, Pickaxe, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  eyebrow,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
} from "./game-utils";
import { errorMessage, useGameAction } from "./useGame";

const FAUCET_PRESETS = [1_000, 5_000, 10_000, 20_000];
const CHIP_OPTIONS = [1, 2, 5, 10];

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function WalletPanel({ dashboard, config }: Props) {
  const { actor } = useAuth();
  const { run, pending } = useGameAction();
  const [chips, setChips] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const chipPrice = config ? Number(config.chipPriceE8s) / 1e8 : 1000;
  const excPerChip = config ? Number(config.excavationsPerChip) : 5;
  const fee = config ? Number(config.feeE8s) / 1e8 : 10;
  const cost = chips * chipPrice + fee;
  const balance = dashboard ? Number(dashboard.balance) / 1e8 : 0;
  const faucetLeft = dashboard ? Number(dashboard.faucetRemaining) / 1e8 : 0;
  const faucetCap = config ? Number(config.faucetCapE8s) / 1e8 : 20_000;
  const weekOpen = dashboard?.status === "open";

  const requestTokens = async (amount: number) => {
    if (!actor) return;
    setMsg(null);
    try {
      await run("faucet", () => actor.gameRequestTestTokens(BigInt(amount)));
      setMsg({
        ok: true,
        text: `${amount.toLocaleString("en-US")} test GOLDAO added.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };

  const buy = async () => {
    if (!actor) return;
    setMsg(null);
    try {
      await run("buy", () => actor.gameBuyChips(BigInt(chips)));
      setConfirming(false);
      setMsg({
        ok: true,
        text: `${chips} chip${chips > 1 ? "s" : ""} loaded: ${chips * excPerChip} excavations.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <div className={cn(panel, "grid gap-0 overflow-hidden md:grid-cols-3")}>
      {/* Balance */}
      <div className="flex flex-col gap-2 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Wallet className="size-3.5" /> Balance
        </span>
        <motion.span
          key={balance}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(dashboard.balance) : "—"}
          <span className={cn("ml-2 font-mono text-xs", gold)}>GOLDAO</span>
        </motion.span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          Test tokens · simulated mode
        </span>
      </div>

      {/* Faucet */}
      <div className="flex flex-col gap-3 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Droplets className="size-3.5" /> Test faucet
        </span>
        <div className="flex flex-wrap gap-2">
          {FAUCET_PRESETS.map((amount) => (
            <Button
              key={amount}
              size="sm"
              variant="outline"
              disabled={!!pending || amount > faucetLeft}
              onClick={() => void requestTokens(amount)}
              className="font-mono text-xs"
            >
              +{amount.toLocaleString("en-US")}
            </Button>
          ))}
        </div>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {faucetLeft.toLocaleString("en-US")} left this week (max{" "}
          {faucetCap.toLocaleString("en-US")})
        </span>
      </div>

      {/* Buy chips */}
      <div className="flex flex-col gap-3 p-5">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Coins className="size-3.5" /> Play
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-[color:var(--term-border)] p-0.5">
            {CHIP_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setChips(n);
                  setConfirming(false);
                }}
                className={cn(
                  "rounded px-2.5 py-1 font-mono text-xs transition-smooth",
                  chips === n
                    ? "bg-primary text-primary-foreground"
                    : cn(inkMid, "hover:text-[color:var(--term-ink)]"),
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!!pending || !weekOpen || balance < cost}
            onClick={() => setConfirming(true)}
            className="gradient-primary text-primary-foreground"
          >
            <Pickaxe className="size-4" />
            Buy {chips} chip{chips > 1 ? "s" : ""}
          </Button>
        </div>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {(chips * chipPrice).toLocaleString("en-US")} + {fee} fee ·{" "}
          {chips * excPerChip} excavations
        </span>
      </div>

      {/* Confirmation + messages */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[color:var(--term-border)] bg-[var(--term-header)] md:col-span-3"
          >
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn("text-sm", inkMid)}>
                <span className={cn("font-semibold", ink)}>
                  {cost.toLocaleString("en-US")} GOLDAO
                </span>{" "}
                go into the prize pool ({fee} fee included). Each chip competes
                on its own and 8 out of 10 chips win or break even. 100% of the
                prize pool is paid out every week; 1% is withheld from winnings
                to pay for cycles. This can't be undone.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pending === "buy"}
                  onClick={() => void buy()}
                  className="gradient-primary text-primary-foreground"
                >
                  {pending === "buy" ? "Sending…" : "Confirm"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {msg && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "border-t border-[color:var(--term-border-faint)] px-5 py-2 font-mono text-xs md:col-span-3",
              msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
            )}
          >
            {msg.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
