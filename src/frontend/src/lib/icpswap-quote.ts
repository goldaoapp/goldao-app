/**
 * Lightweight ICPSwap pool quote via Candid.
 * Replaces the ~700 KB /tickers HTTP endpoint with direct
 * query calls (~0.5 KB each) to individual pool canisters.
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

/* ── IDL factory (only the `quote` method) ──────────────────────────────── */

const swapPoolIdlFactory = (({ IDL }: { IDL: typeof IDLType }) => {
  const SwapError = IDL.Variant({
    CommonError: IDL.Null,
    InternalError: IDL.Text,
    UnsupportedToken: IDL.Text,
    InsufficientFunds: IDL.Null,
  });
  return IDL.Service({
    quote: IDL.Func(
      [
        IDL.Record({
          amountIn: IDL.Text,
          zeroForOne: IDL.Bool,
          amountOutMinimum: IDL.Text,
        }),
      ],
      [IDL.Variant({ ok: IDL.Nat, err: SwapError })],
      ["query"],
    ),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/* ── Shared anonymous agent (created once, reused) ──────────────────────── */

let agentPromise: Promise<HttpAgent> | null = null;

function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) {
    agentPromise = HttpAgent.create({ host: "https://icp-api.io" });
  }
  return agentPromise!;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

interface QuoteResult {
  ok: bigint;
}

/**
 * Get a swap quote from an ICPSwap V3 pool canister.
 *
 * @param poolCanisterId - The pool canister ID
 * @param amountIn - Amount in (as string in e8s / smallest unit)
 * @param zeroForOne - Swap direction: true = token0→token1, false = token1→token0
 * @returns Output amount as bigint, or null on error
 */
export async function getPoolQuote(
  poolCanisterId: string,
  amountIn: string,
  zeroForOne: boolean,
): Promise<bigint | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(swapPoolIdlFactory, {
      agent,
      canisterId: poolCanisterId,
    });
    const result = (await actor.quote({
      amountIn,
      zeroForOne,
      amountOutMinimum: "0",
    })) as QuoteResult | { err: unknown };

    if ("err" in result) return null;
    return result.ok;
  } catch (_) {
    return null;
  }
}

/**
 * Get the ratio of tokenOut per 1 tokenIn from an ICPSwap pool.
 * Both tokens assumed to have 8 decimals (ICP/SNS standard).
 *
 * @param poolCanisterId - The pool canister ID
 * @param zeroForOne - Swap direction
 * @returns Ratio (e.g. 405.7 GOLDAO per ICP), or null on error
 */
export async function getPoolRatio(
  poolCanisterId: string,
  zeroForOne: boolean,
): Promise<number | null> {
  const ONE_TOKEN_E8S = "100000000"; // 1e8
  const out = await getPoolQuote(poolCanisterId, ONE_TOKEN_E8S, zeroForOne);
  if (out === null) return null;
  return Number(out) / 1e8;
}
