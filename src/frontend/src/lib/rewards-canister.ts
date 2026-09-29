/**
 * Queries to the sns_rewards canister via get_all_neurons_maturity + get_neuron_by_id.
 *
 * The payment round queries (get_historic_payment_round / _rounds) exceed the
 * IC instruction limit due to an O(n) scan over all history. Instead we use:
 *
 *   get_all_neurons_maturity() → all neurons' accumulated + rewarded maturity
 *   get_neuron_by_id(id)       → single neuron lookup
 *
 * Share = neuron_delta / total_delta (identical across all reward tokens).
 *
 * Reference token priority: GLDT (monthly, rarely 0) > WTN > GOLDAO > ICP > OGY.
 * Falls back to cached share from localStorage when all deltas are 0
 * (brief window right after distribution).
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

const SNS_REWARDS_CANISTER = "iyehc-lqaaa-aaaap-ab25a-cai";
const CACHE_KEY = "goldao_rewards_canister_cache";

/* ── Candid IDL ──────────────────────────────────────────────────────────── */

const rewardsIdlFactory = (({ IDL }: { IDL: typeof IDLType }) => {
  const TokenSymbol = IDL.Variant({
    ICP: IDL.Null,
    OGY: IDL.Null,
    WTN: IDL.Null,
    GOLDAO: IDL.Null,
    GLDT: IDL.Null,
  });

  const NeuronId = IDL.Record({ id: IDL.Vec(IDL.Nat8) });

  const NeuronInfo = IDL.Record({
    accumulated_maturity: IDL.Nat64,
    last_synced_maturity: IDL.Nat64,
    rewarded_maturity: IDL.Vec(IDL.Tuple(TokenSymbol, IDL.Nat64)),
    last_disburse_event_considered: IDL.Opt(IDL.Nat64),
  });

  return IDL.Service({
    get_all_neurons_maturity: IDL.Func(
      [],
      [IDL.Vec(IDL.Tuple(NeuronId, NeuronInfo))],
      ["query"],
    ),
    get_neuron_by_id: IDL.Func(
      [NeuronId],
      [IDL.Opt(NeuronInfo)],
      ["query"],
    ),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/* ── Shared anonymous agent ──────────────────────────────────────────────── */

let agentPromise: Promise<HttpAgent> | null = null;

function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) {
    agentPromise = HttpAgent.create({ host: "https://icp-api.io" });
  }
  return agentPromise!;
}

/* ── Types ───────────────────────────────────────────────────────────────── */

type TokenKey = "ICP" | "OGY" | "WTN" | "GOLDAO" | "GLDT";

export interface TokenDeltaStats {
  token: TokenKey;
  totalDelta: bigint;
  neuronsWithDelta: number;
}

export interface RewardsCanisterData {
  /** Total neurons tracked by the canister */
  totalNeurons: number;
  /** Delta stats per token (all 5) */
  tokenStats: TokenDeltaStats[];
  /** Reference token used for share calc (highest priority with delta > 0) */
  referenceToken: TokenKey;
  /** Total delta of the reference token (denominator) */
  totalDelta: bigint;
  /** Neuron count with delta > 0 for reference token */
  activeNeurons: number;
  /** Timestamp of fetch */
  fetchedAt: number;
  /** Whether this data came from cache */
  fromCache: boolean;
}

export interface NeuronMaturityData {
  neuronIdHex: string;
  accumulatedMaturity: bigint;
  /** Delta per token (accumulated - rewarded) */
  deltas: Partial<Record<TokenKey, bigint>>;
  /** Share using the reference token's delta */
  share: number | null;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const TOKEN_KEYS: TokenKey[] = ["ICP", "OGY", "WTN", "GOLDAO", "GLDT"];

/** Priority order: GLDT first (monthly = rarely 0) */
const REF_PRIORITY: TokenKey[] = ["GLDT", "WTN", "GOLDAO", "ICP", "OGY"];

function hexToBytes(hex: string): number[] {
  return (hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16));
}

function getDelta(
  info: any,
  token: TokenKey,
): bigint {
  const acc: bigint = BigInt(info.accumulated_maturity);
  const rewarded: [Record<string, null>, bigint][] = info.rewarded_maturity ?? [];
  const entry = rewarded.find(([t]: [Record<string, null>, bigint]) => token in t);
  const rew = entry ? BigInt(entry[1]) : 0n;
  const delta = acc - rew;
  return delta > 0n ? delta : 0n;
}

/* ── Cache ───────────────────────────────────────────────────────────────── */

interface CachedData {
  referenceToken: TokenKey;
  totalDelta: string;
  activeNeurons: number;
  totalNeurons: number;
  fetchedAt: number;
}

function saveCache(data: RewardsCanisterData): void {
  try {
    const c: CachedData = {
      referenceToken: data.referenceToken,
      totalDelta: data.totalDelta.toString(),
      activeNeurons: data.activeNeurons,
      totalNeurons: data.totalNeurons,
      fetchedAt: data.fetchedAt,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* localStorage unavailable */ }
}

function loadCache(): RewardsCanisterData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c: CachedData = JSON.parse(raw);
    // Cache valid for 24h
    if (Date.now() - c.fetchedAt > 24 * 60 * 60 * 1000) return null;
    return {
      totalNeurons: c.totalNeurons,
      tokenStats: [],
      referenceToken: c.referenceToken,
      totalDelta: BigInt(c.totalDelta),
      activeNeurons: c.activeNeurons,
      fetchedAt: c.fetchedAt,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Fetch all neurons' maturity from the sns_rewards canister.
 * Computes total delta per token, picks the best reference token.
 */
export async function fetchRewardsMaturity(): Promise<RewardsCanisterData | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(rewardsIdlFactory, {
      agent,
      canisterId: SNS_REWARDS_CANISTER,
    });

    const raw = (await actor.get_all_neurons_maturity()) as any[];

    const stats: TokenDeltaStats[] = TOKEN_KEYS.map((token) => {
      let totalDelta = 0n;
      let neuronsWithDelta = 0;
      for (const entry of raw) {
        const info = entry[1] ?? entry;
        const d = getDelta(info, token);
        if (d > 0n) {
          totalDelta += d;
          neuronsWithDelta++;
        }
      }
      return { token, totalDelta, neuronsWithDelta };
    });

    // Pick best reference: first in priority order with delta > 0
    let refToken: TokenKey = "GLDT";
    let refStats = stats.find((s) => s.token === "GLDT")!;

    for (const tok of REF_PRIORITY) {
      const s = stats.find((st) => st.token === tok)!;
      if (s.totalDelta > 0n) {
        refToken = tok;
        refStats = s;
        break;
      }
    }

    // If all zeros, try cache
    if (refStats.totalDelta === 0n) {
      console.info("[rewards-canister] all deltas zero (just distributed), using cache");
      return loadCache();
    }

    const data: RewardsCanisterData = {
      totalNeurons: raw.length,
      tokenStats: stats,
      referenceToken: refToken,
      totalDelta: refStats.totalDelta,
      activeNeurons: refStats.neuronsWithDelta,
      fetchedAt: Date.now(),
      fromCache: false,
    };

    saveCache(data);

    console.info(
      `[rewards-canister] ${raw.length} neurons, ref=${refToken}: ` +
        `${refStats.neuronsWithDelta} active, total_delta=${refStats.totalDelta}`,
    );

    return data;
  } catch (e) {
    console.error("[rewards-canister] fetchRewardsMaturity failed:", e);
    return loadCache();
  }
}

/**
 * Fetch a single neuron's maturity data and compute its share.
 */
export async function fetchNeuronMaturity(
  neuronIdHex: string,
  canisterData: RewardsCanisterData,
): Promise<NeuronMaturityData | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(rewardsIdlFactory, {
      agent,
      canisterId: SNS_REWARDS_CANISTER,
    });

    const bytes = hexToBytes(neuronIdHex);
    const result = (await actor.get_neuron_by_id({ id: bytes })) as any[];

    if (!result || result.length === 0 || !result[0]) return null;

    const info = result[0];
    const deltas: Partial<Record<TokenKey, bigint>> = {};
    for (const tok of TOKEN_KEYS) {
      const d = getDelta(info, tok);
      if (d > 0n) deltas[tok] = d;
    }

    const refDelta = deltas[canisterData.referenceToken] ?? 0n;
    const share =
      canisterData.totalDelta > 0n
        ? Number(refDelta) / Number(canisterData.totalDelta)
        : null;

    return {
      neuronIdHex: neuronIdHex.toLowerCase(),
      accumulatedMaturity: BigInt(info.accumulated_maturity),
      deltas,
      share,
    };
  } catch (e) {
    console.warn("[rewards-canister] fetchNeuronMaturity failed:", e);
    return null;
  }
}

/**
 * Compute a neuron's share from pre-fetched canister data.
 * Used when we already have the neuron's delta from a previous call.
 */
export function computeShare(
  neuronDelta: bigint,
  totalDelta: bigint,
): number {
  if (totalDelta === 0n || neuronDelta === 0n) return 0;
  return Number(neuronDelta) / Number(totalDelta);
}
