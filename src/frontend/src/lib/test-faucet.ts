/**
 * TEST FAUCET client (GOLDAO TEST only). Temporary.
 *
 * Before the game moves to the real GOLDAO ledger, delete this file, pages/game/TestFaucetCard.tsx
 * and the faucet button and card line in pages/game/WalletPanel.tsx (see lib/test-faucet.mo in the backend).
 *
 * It talks to the backend through its own small Candid interface, so it does not depend on the
 * generated bindings and removing it leaves nothing behind.
 */

import { loadEnv } from "@/hooks/useBackendActor";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import type { IDL as IDLType } from "@icp-sdk/core/candid";

export interface FaucetConfig {
  enabled: boolean;
  /** Whole tokens that can be requested per click. */
  presets: number[];
  /** Most one player can receive per tournament (e8s). */
  capE8s: bigint;
  /** Already received by the caller in this tournament (e8s). */
  usedE8s: bigint;
}

interface FaucetActor {
  testFaucetConfig: () => Promise<{
    enabled: boolean;
    presets: bigint[];
    capE8s: bigint;
    usedE8s: bigint;
  }>;
  testFaucetClaim: (
    goldao: bigint,
  ) => Promise<{ ok: bigint } | { err: string }>;
}

const faucetIdl = (({ IDL }: { IDL: typeof IDLType }) => {
  const Config = IDL.Record({
    enabled: IDL.Bool,
    presets: IDL.Vec(IDL.Nat),
    capE8s: IDL.Nat,
    usedE8s: IDL.Nat,
  });
  return IDL.Service({
    testFaucetConfig: IDL.Func([], [Config], ["query"]),
    testFaucetClaim: IDL.Func(
      [IDL.Nat],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

// One actor per signed-in principal.
const actors = new Map<string, Promise<FaucetActor>>();

function principalKey(identity: unknown): string {
  try {
    return (identity as { getPrincipal(): { toText(): string } })
      .getPrincipal()
      .toText();
  } catch {
    return "anon";
  }
}

function getActor(identity: unknown): Promise<FaucetActor> {
  const key = principalKey(identity);
  let a = actors.get(key);
  if (!a) {
    a = (async () => {
      const env = await loadEnv();
      const canisterId = env.backend_canister_id ?? "";
      if (!canisterId || canisterId === "undefined") {
        throw new Error("The game canister is not configured.");
      }
      const isLocal = env.backend_host === "local";
      const agent = await HttpAgent.create({
        identity: identity as never,
        host: isLocal ? "http://localhost:4943" : "https://icp-api.io",
        // Same setting the game actor uses: the canister runs on a subnet whose query
        // signatures the SDK does not verify. Claims are update calls, which are certified.
        verifyQuerySignatures: false,
      });
      if (isLocal) await agent.fetchRootKey().catch(() => {});
      return Actor.createActor(faucetIdl, {
        agent,
        canisterId,
      }) as unknown as FaucetActor;
    })();
    actors.set(key, a);
    a.catch(() => actors.delete(key));
  }
  return a;
}

export async function fetchFaucetConfig(
  identity: unknown,
): Promise<FaucetConfig> {
  const c = await (await getActor(identity)).testFaucetConfig();
  return {
    enabled: c.enabled,
    presets: c.presets.map(Number),
    capE8s: c.capE8s,
    usedE8s: c.usedE8s,
  };
}

/** Asks for `goldao` whole test tokens. Resolves with the ledger block index. */
export async function claimTestTokens(
  identity: unknown,
  goldao: number,
): Promise<bigint> {
  const res = await (await getActor(identity)).testFaucetClaim(BigInt(goldao));
  if ("err" in res) throw new Error(res.err);
  return res.ok;
}
