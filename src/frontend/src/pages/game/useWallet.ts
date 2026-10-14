import type { GameConfig } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import {
  GOLDAO_FEE_E8S,
  approveSpender,
  fetchAllowanceInfo,
  fetchWalletBalance,
} from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
import { trustedSpender } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { AUTHORIZE_DAYS, AUTHORIZE_GOLDAO } from "./game-utils";
import { usePageCanister } from "./usePageCanister";

const E8S = 100_000_000n;

/**
 * Wallet balance and game authorization on the ledger the game uses.
 * ensureAllowance authorizes the game automatically when a stake needs it.
 */
export function useWallet(config: GameConfig | undefined) {
  const { principalId } = useAuth();
  const { identity } = useInternetIdentity();
  const ledgerId = config?.ledgerId;

  // The game's own account, told by the game itself. It is used only if it is the canister this
  // page is talking to: an answer from a query is not certified and could be forged.
  const pageCanister = usePageCanister();
  const spender = trustedSpender(config?.spender, pageCanister.data);

  const ledger = useQuery({
    queryKey: ["game", "wallet", principalId, spender, ledgerId],
    queryFn: async () => {
      const [balance, auth] = await Promise.all([
        fetchWalletBalance(principalId as string, ledgerId),
        fetchAllowanceInfo(principalId as string, spender, ledgerId),
      ]);
      return { balance, ...auth };
    },
    enabled: !!principalId && !!spender && !!ledgerId,
    refetchInterval: 15_000,
  });

  const balance = ledger.data?.balance ?? 0n;
  const allowance = ledger.data?.allowance ?? 0n;
  const expiresAtMs = ledger.data?.expiresAtMs;

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
      if (!identity || !spender) {
        throw new Error("Sign in again to continue.");
      }
      await approveSpender(
        identity,
        spender,
        BigInt(AUTHORIZE_GOLDAO) * E8S,
        AUTHORIZE_DAYS * 24 * 60 * 60 * 1000,
        ledgerId,
      );
      await ledger.refetch();
    },
    [ledger, identity, spender, ledgerId],
  );

  /** Takes the authorization back. The player can authorize again at any time. */
  const revoke = useCallback(async (): Promise<void> => {
    if (!identity || !spender) throw new Error("Sign in again to continue.");
    await approveSpender(identity, spender, 0n, undefined, ledgerId);
    await ledger.refetch();
  }, [ledger, identity, spender, ledgerId]);

  return {
    balance,
    allowance,
    expiresAtMs,
    ensureAllowance,
    revoke,
    spenderMissing: !!config && !pageCanister.isLoading && !spender,
  };
}
