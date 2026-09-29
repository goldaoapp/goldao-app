/**
 * Candid query to the sns_rewards canister (hidden API).
 *
 * Fetches the latest ICP payment round via `get_historic_payment_round`.
 * Only ICP is needed — the neuron share (delta / total_delta) is identical
 * across all reward tokens because maturity deltas scale proportionally.
 *
 * Distribution cadence: GLDT = monthly, everything else = weekly.
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

const SNS_REWARDS_CANISTER = "iyehc-lqaaa-aaaap-ab25a-cai";

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

  const PaymentStatus = IDL.Variant({
    Pending: IDL.Null,
    Triggered: IDL.Null,
    Completed: IDL.Null,
    Failed: IDL.Text,
  });

  const Payment = IDL.Tuple(IDL.Nat, PaymentStatus, IDL.Nat64);

  const PaymentRound = IDL.Record({
    id: IDL.Nat16,
    round_funds_total: IDL.Nat,
    tokens_to_distribute: IDL.Nat,
    fees: IDL.Nat,
    ledger_id: IDL.Principal,
    token: TokenSymbol,
    date_initialized: IDL.Nat64,
    total_neuron_maturity: IDL.Nat64,
    payments: IDL.Vec(IDL.Tuple(NeuronId, Payment)),
    retries: IDL.Nat8,
  });

  return IDL.Service({
    get_historic_payment_round: IDL.Func(
      [IDL.Record({ token: TokenSymbol, round_id: IDL.Nat16 })],
      [IDL.Vec(IDL.Tuple(IDL.Nat16, PaymentRound))],
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

export interface NeuronPayment {
  neuronIdHex: string;
  reward: bigint;
  maturityDelta: bigint;
}

export interface RoundData {
  roundId: number;
  totalNeuronMaturity: bigint;
  tokensToDistribute: bigint;
  dateInitialized: bigint;
  payments: NeuronPayment[];
}

export interface RewardsCanisterData {
  /** Latest ICP round — share from this applies to all tokens */
  icpRound: RoundData;
  fetchedAt: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function neuronIdToHex(idBytes: number[] | Uint8Array): string {
  return Array.from(idBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseRound(raw: any): RoundData | null {
  if (!raw) return null;
  const payments: NeuronPayment[] = [];
  for (const [neuronId, payment] of raw.payments ?? []) {
    payments.push({
      neuronIdHex: neuronIdToHex(neuronId.id),
      reward: BigInt(payment[0]),
      maturityDelta: BigInt(payment[2]),
    });
  }
  return {
    roundId: Number(raw.id),
    totalNeuronMaturity: BigInt(raw.total_neuron_maturity),
    tokensToDistribute: BigInt(raw.tokens_to_distribute),
    dateInitialized: BigInt(raw.date_initialized),
    payments,
  };
}

/* ── Probe: fetch one ICP round by id ────────────────────────────────────── */

async function fetchIcpRound(
  actor: any,
  roundId: number,
): Promise<RoundData | null> {
  try {
    const result = (await actor.get_historic_payment_round({
      token: { ICP: null },
      round_id: roundId,
    })) as any[];
    if (!result || result.length === 0) return null;
    const entry = result[0];
    return parseRound(entry[1] ?? entry);
  } catch {
    return null;
  }
}

/* ── Find latest round_id ────────────────────────────────────────────────── */

async function findLatestRoundId(actor: any): Promise<number> {
  // Probe anchors in parallel
  const probes = [300, 200, 150, 100, 50, 25, 10];
  const results = await Promise.all(
    probes.map(async (id) => ({
      id,
      found: (await fetchIcpRound(actor, id)) !== null,
    })),
  );

  let hi = 0;
  for (const r of results) {
    if (r.found && r.id > hi) hi = r.id;
  }
  if (hi === 0) return 0;

  // Ceiling: lowest probe above hi that returned nothing
  let ceil = 500;
  for (const r of results) {
    if (!r.found && r.id > hi && r.id < ceil) ceil = r.id;
  }

  // Scan up from hi in batches to find the exact latest
  const BATCH = 10;
  for (let start = hi + 1; start < ceil; start += BATCH) {
    const batch = Array.from(
      { length: Math.min(BATCH, ceil - start) },
      (_, i) => start + i,
    );
    const found = await Promise.all(
      batch.map(async (id) => ({
        id,
        found: (await fetchIcpRound(actor, id)) !== null,
      })),
    );
    let anyFound = false;
    for (const r of found) {
      if (r.found && r.id > hi) {
        hi = r.id;
        anyFound = true;
      }
    }
    if (!anyFound) break;
  }

  return hi;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Fetch the latest completed ICP payment round from the sns_rewards canister.
 * The neuron share derived from this round applies to all reward tokens.
 */
export async function fetchRewardRounds(): Promise<RewardsCanisterData | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(rewardsIdlFactory, {
      agent,
      canisterId: SNS_REWARDS_CANISTER,
    });

    const latestId = await findLatestRoundId(actor);
    if (latestId === 0) {
      console.warn("[rewards-canister] no ICP rounds found");
      return null;
    }

    const icpRound = await fetchIcpRound(actor, latestId);
    if (!icpRound) {
      console.warn("[rewards-canister] failed to fetch ICP round", latestId);
      return null;
    }

    console.info(
      `[rewards-canister] ICP round #${icpRound.roundId}: ` +
      `${icpRound.payments.length} neurons, ` +
      `pool ${Number(icpRound.tokensToDistribute) / 1e8} ICP, ` +
      `total_maturity ${icpRound.totalNeuronMaturity}`,
    );

    return { icpRound, fetchedAt: Date.now() };
  } catch (e) {
    console.error("[rewards-canister] fetch failed:", e);
    return null;
  }
}

/* ── Reward helpers ──────────────────────────────────────────────────────── */

/**
 * Compute a neuron's exact share from the ICP payment map.
 * This share applies to ALL reward tokens (ICP, GLDT, OGY, etc).
 * Returns null if the neuron is not in the map.
 */
export function neuronShareFromRound(
  neuronIdHex: string,
  round: RoundData,
): { share: number; delta: bigint } | null {
  const normalized = neuronIdHex.toLowerCase();
  const entry = round.payments.find((p) => p.neuronIdHex === normalized);
  if (!entry || round.totalNeuronMaturity === 0n) return null;
  return {
    share: Number(entry.maturityDelta) / Number(round.totalNeuronMaturity),
    delta: entry.maturityDelta,
  };
}

/**
 * Annualize a single round's pool.
 * GLDT = monthly (×12), everything else = weekly (×52).
 */
export function annualizePool(
  tokensToDistribute: bigint,
  isGldt: boolean,
): number {
  const poolTokens = Number(tokensToDistribute) / 1e8;
  return poolTokens * (isGldt ? 12 : 52);
}
