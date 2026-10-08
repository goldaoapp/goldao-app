import type { GameConfig } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { loadEnv } from "@/hooks/useBackendActor";
import {
  GOLDAO_FEE_E8S,
  approveSpender,
  fetchAllowance,
  fetchWalletBalance,
} from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { AUTHORIZE_DAYS, AUTHORIZE_GOLDAO } from "./game-utils";

const E8S = 100_000_000n;

/**
 * Wallet balance and game authorization on the ledger the game uses.
 * ensureAllowance authorizes the game automatically when a stake needs it.
 */
export function useWallet(config: GameConfig | undefined) {
  const { principalId } = useAuth();
  const { identity } = useInternetIdentity();
  const ledgerId = config?.ledgerId;

  const spender = useQuery({
    queryKey: ["game", "spender"],
    queryFn: async () => (await loadEnv()).backend_canister_id ?? "",
    staleTime: Number.POSITIVE_INFINITY,
  });

  const ledger = useQuery({
    queryKey: ["game", "wallet", principalId, spender.data, ledgerId],
    queryFn: async () => {
      const [balance, allowance] = await Promise.all([
        fetchWalletBalance(principalId as string, ledgerId),
        fetchAllowance(principalId as string, spender.data as string, ledgerId),
      ]);
      return { balance, allowance };
    },
    enabled: !!principalId && !!spender.data && !!ledgerId,
    refetchInterval: 15_000,
  });

  const balance = ledger.data?.balance ?? 0n;
  const allowance = ledger.data?.allowance ?? 0n;

  /** Authorizes the game when `need` (e8s, fee included) is not covered. */
  const ensureAllowance = useCallback(
    async (need: bigint): Promise<void> => {
      if (need === 0n) return;
      const wallet = (await ledger.refetch()).data;
      const have = wallet?.allowance ?? 0n;
      const funds = wallet?.balance ?? 0n;
      if (have >= need) return;
      if (funds < need + GOLDAO_FEE_E8S) {
        throw new Error("Insufficient GOLDAO in your wallet.");
      }
      if (!identity || !spender.data) {
        throw new Error("Sign in again to continue.");
      }
      await approveSpender(
        identity,
        spender.data,
        BigInt(AUTHORIZE_GOLDAO) * E8S,
        AUTHORIZE_DAYS * 24 * 60 * 60 * 1000,
        ledgerId,
      );
      await ledger.refetch();
    },
    [ledger, identity, spender.data, ledgerId],
  );

  return { balance, allowance, ensureAllowance };
}
