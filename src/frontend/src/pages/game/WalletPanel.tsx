import type { Dashboard, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Coins, Droplets, ShieldCheck, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Spinner } from "./Spinner";
import { eyebrow, fmtGoldao, gold, ink, inkFaint, panel } from "./game-utils";
import { errorMessage, useGameAction } from "./useGame";

const FAUCET_PRESETS = [1_000, 5_000, 10_000, 20_000];
const APPROVE_PRESETS = [1_000, 10_000, 100_000];

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function WalletPanel({ dashboard, config }: Props) {
  const { actor } = useAuth();
  const { run, pending } = useGameAction();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const real = config?.realLedger ?? false;
  const faucetLeft = dashboard ? Number(dashboard.faucetRemaining) / 1e8 : 0;

  const act = async (
    name: string,
    call: () => Promise<
      { __kind__: "ok"; ok: bigint } | { __kind__: "err"; err: string }
    >,
    text: string,
  ) => {
    setMsg(null);
    try {
      await run(name, call);
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <div className={cn(panel, "grid gap-0 overflow-hidden md:grid-cols-3")}>
      <div className="flex flex-col gap-2 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Wallet className="size-3.5" /> Wallet
        </span>
        <motion.span
          key={String(dashboard?.balance)}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(dashboard.balance) : <Spinner />}
          <span className={cn("ml-2 font-mono text-xs", gold)}>GOLDAO</span>
        </motion.span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          Approved to the game:{" "}
          {dashboard ? fmtGoldao(dashboard.allowance) : <Spinner />}
          {real ? "" : " · test tokens"}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Coins className="size-3.5" /> Game credit
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
          Pending payout:{" "}
          {dashboard ? fmtGoldao(dashboard.pendingPayout) : <Spinner />}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        {real ? (
          <>
            <span
              className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}
            >
              <ShieldCheck className="size-3.5" /> Allowance
            </span>
            <span className={cn("text-xs", inkFaint)}>
              Approve the game on the GOLDAO ledger to play from your wallet.
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}
            >
              <Droplets className="size-3.5" /> Test faucet
            </span>
            <div className="flex flex-wrap gap-2">
              {FAUCET_PRESETS.map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant="outline"
                  disabled={!!pending || a > faucetLeft}
                  onClick={() =>
                    void act(
                      "faucet",
                      () => actor!.gameRequestTestTokens(BigInt(a)),
                      `${a.toLocaleString("en-US")} test GOLDAO added.`,
                    )
                  }
                  className="font-mono text-xs"
                >
                  +{a.toLocaleString("en-US")}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("font-mono text-[11px]", inkFaint)}>
                Approve
              </span>
              {APPROVE_PRESETS.map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant="outline"
                  disabled={!!pending}
                  onClick={() =>
                    void act(
                      "approve",
                      () => actor!.gameTestApprove(BigInt(a)),
                      `Approved ${a.toLocaleString("en-US")} GOLDAO.`,
                    )
                  }
                  className="font-mono text-xs"
                >
                  {a.toLocaleString("en-US")}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

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
