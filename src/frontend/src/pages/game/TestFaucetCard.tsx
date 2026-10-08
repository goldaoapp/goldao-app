import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useInternetIdentity } from "@/lib/internet-identity";
import { claimTestTokens, fetchFaucetConfig } from "@/lib/test-faucet";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";
import { inkFaint } from "./game-utils";
import { TEST_TOKEN_LABEL } from "./ledger-mode";
import { errorMessage } from "./useGame";

const E8S = 100_000_000n;

/**
 * Test faucet (GOLDAO TEST only). Temporary: delete this file, lib/test-faucet.ts and the
 * faucet button and the `<TestFaucetCard />` line in WalletPanel.tsx before moving to the real GOLDAO ledger.
 *
 * The tokens are sent by the game canister, from its own account, straight to the player's wallet.
 */
export function TestFaucetCard() {
  const { identity } = useInternetIdentity();
  const { principalId } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cfg = useQuery({
    queryKey: ["game", "faucet", principalId],
    queryFn: () => fetchFaucetConfig(identity),
    enabled: !!identity && !!principalId,
    refetchInterval: 30_000,
    retry: false,
  });

  // A green confirmation goes away by itself; errors stay until the next action.
  useEffect(() => {
    if (!msg?.ok) return;
    const t = window.setTimeout(() => setMsg(null), 6000);
    return () => window.clearTimeout(t);
  }, [msg]);

  const data = cfg.data;
  const left = data
    ? Number(
        (data.capE8s > data.usedE8s ? data.capE8s - data.usedE8s : 0n) / E8S,
      )
    : 0;

  const claim = async (amount: number) => {
    if (!identity || pending !== null) return;
    setMsg(null);
    setPending(amount);
    try {
      await claimTestTokens(identity, amount);
      setMsg({
        ok: true,
        text: `${amount.toLocaleString("en-US")} ${TEST_TOKEN_LABEL} sent to your wallet.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ["game", "faucet"] });
      void queryClient.invalidateQueries({ queryKey: ["game", "wallet"] });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {cfg.isError || (data && !data.enabled) ? (
        <span className="text-xs text-destructive">
          The test faucet is not available right now.
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {(data?.presets ?? []).map((a) => (
            <Button
              key={a}
              size="sm"
              variant="outline"
              disabled={pending !== null || a > left}
              onClick={() => void claim(a)}
              className="font-mono text-xs"
            >
              {pending === a ? <Spinner /> : null}+{a.toLocaleString("en-US")}
            </Button>
          ))}
          {data && (
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {left.toLocaleString("en-US")} left this tournament
            </span>
          )}
        </div>
      )}
      {msg && (
        <span
          className={cn(
            "font-mono text-[11px]",
            msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
          )}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
