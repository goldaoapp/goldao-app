/**
 * Candid queries to the sns_rewards canister (hidden API).
 *
 * `get_historic_payment_rounds()` returns every completed PaymentRound.
 * We extract the LATEST round per token to get:
 *   - total_neuron_maturity  (denominator for share calc)
 *   - tokens_to_distribute   (pool for that round)
 *   - payments map            (per-neuron maturity delta + reward)
 *
 * Distribution cadence: GLDT = monthly, everything else = weekly.
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

const SNS_REWARDS_CANISTER = "iyehc-lqaaa-aaaap-ab25a-cai";

/* ── Candid IDL (only what we need) ──────────────────────────────────────── */

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
    get_historic_payment_rounds: IDL.Func(
      [],
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

/** Token key as lowercase string for indexing */
export type TokenKey = "ICP" | "OGY" | "WTN" | "GOLDAO" | "GLDT";

/** Per-neuron payment entry from the canister */
export interface NeuronPayment {
  neuronIdHex: string;
  reward: bigint;
  maturityDelta: bigint;
}

/** Parsed data from a single PaymentRound */
export interface RoundData {
  roundId: number;
  token: TokenKey;
  totalNeuronMaturity: bigint;
  tokensToDistribute: bigint;
  dateInitialized: bigint;
  payments: NeuronPayment[];
}

/** Latest round per token + aggregated stats */
export interface RewardsCanisterData {
  rounds: Partial<Record<TokenKey, RoundData>>;
  /** Timestamp of fetch */
  fetchedAt: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function tokenVariantToKey(v: Record<string, null>): TokenKey | null {
  const keys = Object.keys(v);
  if (keys.length !== 1) return null;
  const k = keys[0] as TokenKey;
  if (["ICP", "OGY", "WTN", "GOLDAO", "GLDT"].includes(k)) return k;
  return null;
}

function neuronIdToHex(idBytes: number[] | Uint8Array): string {
  return Array.from(idBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Fetch all historic payment rounds and return the latest completed
 * round per token. The canister returns Vec<(u16, PaymentRound)>.
 */
export async function fetchRewardRounds(): Promise<RewardsCanisterData | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(rewardsIdlFactory, {
      agent,
      canisterId: SNS_REWARDS_CANISTER,
    });

    // biome-ignore lint: canister returns dynamic shape
    const raw: any[] = await actor.get_historic_payment_rounds();

    // raw is Vec<(u16, PaymentRound)> — an array of [roundId, round] tuples
    const rounds: Partial<Record<TokenKey, RoundData>> = {};

    for (const entry of raw) {
      // Each entry is a 2-element array: [u16, PaymentRound]
      const round = entry[1] ?? entry;

      const token = tokenVariantToKey(round.token);
      if (!token) continue;

      const roundId = Number(round.id);
      const existing = rounds[token];

      // Keep only the latest round per token (highest id)
      if (existing && existing.roundId >= roundId) continue;

      const payments: NeuronPayment[] = [];
      const paymentsRaw: Array<[{ id: number[] | Uint8Array }, [bigint, unknown, bigint]]> =
        round.payments ?? [];

      for (const [neuronId, payment] of paymentsRaw) {
        payments.push({
          neuronIdHex: neuronIdToHex(neuronId.id),
          reward: BigInt(payment[0]),
          maturityDelta: BigInt(payment[2]),
        });
      }

      rounds[token] = {
        roundId,
        token,
        totalNeuronMaturity: BigInt(round.total_neuron_maturity),
        tokensToDistribute: BigInt(round.tokens_to_distribute),
        dateInitialized: BigInt(round.date_initialized),
        payments,
      };
    }

    return { rounds, fetchedAt: Date.now() };
  } catch (e) {
    console.warn("[rewards-canister] fetch failed:", e);
    return null;
  }
}

/* ── Reward calculation from canister data ────────────────────────────────── */

const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

/**
 * Given a neuron's maturity delta from the latest round, compute its
 * annualized reward for that token.
 *
 * @param neuronDelta    Maturity delta of the neuron in this round
 * @param totalMaturity  Sum of all deltas (denominator)
 * @param poolE8s        tokens_to_distribute for this round (in e8s)
 * @param isGldt         GLDT rounds are monthly; everything else weekly
 * @returns Annual reward in whole tokens (not e8s)
 */
export function annualizeNeuronReward(
  neuronDelta: bigint,
  totalMaturity: bigint,
  poolE8s: bigint,
  isGldt: boolean,
): number {
  if (totalMaturity === 0n || neuronDelta === 0n) return 0;
  // reward_this_round = neuronDelta / totalMaturity * poolE8s
  const rewardE8s = (neuronDelta * poolE8s) / totalMaturity;
  const rewardTokens = Number(rewardE8s) / 1e8;
  const periodsPerYear = isGldt ? MONTHS_PER_YEAR : WEEKS_PER_YEAR;
  return rewardTokens * periodsPerYear;
}

/**
 * Derive maturity-per-GOLDAO from the latest round's payment map.
 * Uses the median delta/stake ratio from all neurons with known stake.
 * Falls back to a simple average if we can't get individual stakes.
 *
 * For "by amount" mode: user_annual = amount × maturityPerGoldao / totalMaturity × pool × periods
 *
 * @param round          The latest round data for a token
 * @param goldaoEligible Total eligible GOLDAO (used for per-token derivation)
 * @param isGldt         Monthly cadence?
 * @returns Annual pool in whole tokens (for the FULL eligible cohort)
 */
export function annualizePool(
  round: RoundData,
  isGldt: boolean,
): number {
  const poolTokens = Number(round.tokensToDistribute) / 1e8;
  const periodsPerYear = isGldt ? MONTHS_PER_YEAR : WEEKS_PER_YEAR;
  return poolTokens * periodsPerYear;
}

/**
 * Compute a neuron's exact share from the payment map.
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
