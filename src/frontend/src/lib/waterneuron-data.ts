/**
 * WaterNeuron protocol data for ICP reward estimation.
 *
 * Gold DAO holds WTN in 4 SNS neurons. WaterNeuron distributes 10% of
 * the ICP maturity from its NNS neurons to WTN SNS stakers by VP share.
 *
 * This module fetches:
 *   1. WaterNeuron's 8-year NNS neuron → estimated annual ICP maturity
 *   2. WaterNeuron's 6-month NNS neuron → maturity when active (not dissolving)
 *   3. Total VP in WTN governance → from a recent WTN SNS proposal tally
 *
 * Gold DAO's WTN VP comes from use-live-data.ts (existing fetchWTN, extended).
 *
 * Formula:
 *   icp_from_wtn = maturity_annual × 10% × (gold_dao_vp / total_vp)
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

const NNS_GOVERNANCE = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const WTN_SNS_ROOT = "jmod6-4iaaa-aaaaq-aadkq-cai";

const WTN_8Y_NEURON = 433047053926084807n;
const WTN_6M_NEURON = 13680855657433416220n;

/** 10% of ICP maturity goes to WTN SNS stakers (protocol constant) */
export const WTN_FEE_PCT = 0.10;

/* ── NNS governance IDL ────────────────────────────────────────────────── */

const nnsGovernanceIdlFactory = (({ IDL }: { IDL: typeof IDLType }) => {
  const NeuronInfo = IDL.Record({
    dissolve_delay_seconds: IDL.Nat64,
    recent_ballots: IDL.Vec(
      IDL.Record({
        vote: IDL.Int32,
        proposal_id: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
      }),
    ),
    neuron_type: IDL.Opt(IDL.Int32),
    created_timestamp_seconds: IDL.Nat64,
    state: IDL.Int32,
    stake_e8s: IDL.Nat64,
    joined_community_fund_timestamp_seconds: IDL.Opt(IDL.Nat64),
    retrieved_at_timestamp_seconds: IDL.Nat64,
    visibility: IDL.Opt(IDL.Int32),
    known_neuron_data: IDL.Opt(
      IDL.Record({ name: IDL.Text, description: IDL.Opt(IDL.Text) }),
    ),
    voting_power: IDL.Nat64,
    age_seconds: IDL.Nat64,
  });
  const GovernanceError = IDL.Record({
    error_type: IDL.Int32,
    error_message: IDL.Text,
  });
  return IDL.Service({
    get_neuron_info: IDL.Func(
      [IDL.Nat64],
      [IDL.Variant({ Ok: NeuronInfo, Err: GovernanceError })],
      ["query"],
    ),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface NnsNeuronInfo {
  stakedIcp: number;
  votingPower: number;
  dissolveDelaySec: number;
  ageSec: number;
  state: number;
  dissolving: boolean;
}

export interface WaterNeuronData {
  neuron8y: NnsNeuronInfo | null;
  neuron6m: NnsNeuronInfo | null;
  /** Estimated annual ICP maturity (both neurons, 6m only when active) */
  estimatedAnnualMaturity: number;
  /** Total VP in WTN governance (from last decided proposal) */
  totalWtnVp: number;
}

/* ── Agent singleton ────────────────────────────────────────────────────── */

let agentPromise: Promise<HttpAgent> | null = null;
function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) {
    agentPromise = HttpAgent.create({ host: "https://icp-api.io" });
  }
  return agentPromise!;
}

/* ── 1. Fetch NNS neuron ───────────────────────────────────────────────── */

async function fetchNnsNeuron(
  neuronId: bigint,
): Promise<NnsNeuronInfo | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(nnsGovernanceIdlFactory, {
      agent,
      canisterId: NNS_GOVERNANCE,
    });
    const result = (await actor.get_neuron_info(neuronId)) as
      | { Ok: Record<string, bigint | number> }
      | { Err: unknown };
    if ("Err" in result) return null;
    const info = result.Ok;
    const state = Number(info.state);
    return {
      stakedIcp: Number(info.stake_e8s) / 1e8,
      votingPower: Number(info.voting_power) / 1e8,
      dissolveDelaySec: Number(info.dissolve_delay_seconds),
      ageSec: Number(info.age_seconds),
      state,
      dissolving: state === 2,
    };
  } catch {
    return null;
  }
}

/* ── APY estimation ────────────────────────────────────────────────────── */

/**
 * Calibrated against dashboard Sep 2026: 8y neuron → ~7.98% effective APY.
 */
const BASE_NNS_APY = 0.09;
const MAX_DD_SEC = 8 * 365.25 * 24 * 3600;
const MAX_AGE_SEC = 4 * 365.25 * 24 * 3600;

function estimateEffectiveApy(neuron: NnsNeuronInfo): number {
  const ddFrac = Math.min(neuron.dissolveDelaySec / MAX_DD_SEC, 1);
  const ddBonus = 1 + 2.0 * ddFrac; // max +200%
  const ageFrac = Math.min(neuron.ageSec / MAX_AGE_SEC, 1);
  const ageBonus = 1 + 0.25 * ageFrac; // max +25%
  const gangBonus = ddFrac >= 0.99 ? 1.10 : 1.0; // 8y gang +10%
  const maxMult = 3.0 * 1.25 * 1.10; // 4.125
  return BASE_NNS_APY * ((ddBonus * ageBonus * gangBonus) / maxMult);
}

/* ── 2. Fetch total WTN VP from recent proposal ────────────────────────── */

async function fetchTotalWtnVp(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://sns-api.internetcomputer.org/api/v1/snses/${WTN_SNS_ROOT}/proposals?offset=0&limit=5&sort_by=-id`,
    );
    if (!res.ok) return null;
    const body = await res.json();
    const proposals = Array.isArray(body) ? body : (body.data ?? []);
    for (const p of proposals) {
      const tally = p.tally ?? p.latest_tally;
      if (tally && tally.total > 0) {
        return Number(tally.total) / 1e8;
      }
    }
  } catch {
    /* fallback */
  }
  return null;
}

/* ── Defaults (dashboard Sep 2026) ─────────────────────────────────────── */

export const DEFAULTS = {
  neuron8yStakedIcp: 1_061_875,
  neuron8yApy: 0.0798,
  neuron6mStakedIcp: 1_342_869,
  neuron6mApy: 0.025, // conservative when active
  /** Total VP from neurons overview screenshot */
  totalWtnVp: 209_130_000,
} as const;

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Fetch WaterNeuron protocol data. Called once on load.
 */
export async function fetchWaterNeuronData(): Promise<WaterNeuronData> {
  const [neuron8y, neuron6m, totalWtnVpLive] = await Promise.all([
    fetchNnsNeuron(WTN_8Y_NEURON),
    fetchNnsNeuron(WTN_6M_NEURON),
    fetchTotalWtnVp(),
  ]);

  // Annual maturity from both neurons
  let maturity = 0;
  if (neuron8y) {
    maturity += neuron8y.stakedIcp * estimateEffectiveApy(neuron8y);
  } else {
    maturity += DEFAULTS.neuron8yStakedIcp * DEFAULTS.neuron8yApy;
  }
  if (neuron6m && !neuron6m.dissolving) {
    maturity += neuron6m.stakedIcp * estimateEffectiveApy(neuron6m);
  }
  // When 6m dissolving → skip (minimal maturity)

  return {
    neuron8y,
    neuron6m,
    estimatedAnnualMaturity: maturity,
    totalWtnVp: totalWtnVpLive ?? DEFAULTS.totalWtnVp,
  };
}

/**
 * ICP/year Gold DAO receives from WTN rewards.
 *
 * @param annualMaturity  Total ICP maturity/year from WaterNeuron NNS neurons
 * @param goldDaoVp       Gold DAO's WTN neuron VP (from use-live-data.ts)
 * @param totalVp         Total VP in WTN governance
 */
export function calcIcpFromWtn(
  annualMaturity: number,
  goldDaoVp: number,
  totalVp: number,
): number {
  if (totalVp <= 0 || goldDaoVp <= 0 || annualMaturity <= 0) return 0;
  return annualMaturity * WTN_FEE_PCT * (goldDaoVp / totalVp);
}
