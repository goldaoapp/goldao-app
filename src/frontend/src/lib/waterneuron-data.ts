/**
 * WaterNeuron protocol data for ICP reward estimation.
 *
 * Gold DAO holds WTN in 4 SNS neurons. Two sources of rewards:
 *
 * A) ICP from 10% maturity fee: WaterNeuron distributes 10% of ICP maturity
 *    from its 8-year NNS neuron to WTN SNS stakers proportional to VP.
 *
 * B) WTN from SNS staking rewards: the WTN SNS has a 3% reward rate.
 *    Gold DAO earns WTN which has ICP value via ICPSwap.
 *
 * Formula:
 *   gold_dao_vp     = gold_dao_wtn × VP_MULTIPLIER
 *   icp_from_fee    = nns_maturity × 10% × (gold_dao_vp / total_vp)
 *   wtn_earned      = gold_dao_wtn × WTN_REWARD_RATE
 *   wtn_as_icp      = wtn_earned / wtn_per_icp_ratio
 *   total_icp       = icp_from_fee + wtn_as_icp
 */

/** 10% of ICP maturity goes to WTN SNS stakers (protocol constant) */
export const WTN_FEE_PCT = 0.10;

/** VP multiplier applied to Gold DAO's WTN stake. Fixed for now. */
export const VP_MULTIPLIER = 2.88;

/** WTN SNS governance reward rate (from SNS config: 3% to 3% over 1 year) */
export const WTN_REWARD_RATE = 0.03;

const WTN_SNS_ROOT = "jmod6-4iaaa-aaaaq-aadkq-cai";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface WaterNeuronData {
  /** Estimated annual ICP maturity from the 8-year NNS neuron */
  estimatedAnnualMaturity: number;
  /** Total VP in WTN governance (from last decided proposal) */
  totalWtnVp: number;
}

export interface WtnRewardBreakdown {
  /** ICP/year from 10% NNS maturity fee */
  icpFromFee: number;
  /** WTN earned/year from 3% SNS staking rewards */
  wtnEarned: number;
  /** ICP equivalent of WTN earned (wtnEarned / wtnPerIcp) */
  wtnAsIcp: number;
  /** Total ICP/year (icpFromFee + wtnAsIcp) */
  totalIcpAnnual: number;
}

/* ── Defaults (dashboard Sep 2026) ─────────────────────────────────────── */

export const DEFAULTS = {
  neuron8yStakedIcp: 1_061_875,
  neuron8yApy: 0.0798,
  totalWtnVp: 244_461_491,
} as const;

/* ── Fetch total WTN VP from recent proposal ───────────────────────────── */

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

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Fetch WaterNeuron protocol data. Called once on load.
 */
export async function fetchWaterNeuronData(): Promise<WaterNeuronData> {
  const totalWtnVpLive = await fetchTotalWtnVp();
  return {
    estimatedAnnualMaturity:
      DEFAULTS.neuron8yStakedIcp * DEFAULTS.neuron8yApy,
    totalWtnVp: totalWtnVpLive ?? DEFAULTS.totalWtnVp,
  };
}

/**
 * Full breakdown of ICP/year Gold DAO receives from WTN.
 *
 * @param annualMaturity  ICP maturity/year from WaterNeuron 8y NNS neuron
 * @param goldDaoWtn      Gold DAO's total WTN (from use-live-data.ts)
 * @param totalVp         Total VP in WTN governance
 * @param wtnPerIcp       WTN/ICP exchange ratio (from ICPSwap)
 */
export function calcIcpFromWtn(
  annualMaturity: number,
  goldDaoWtn: number,
  totalVp: number,
  wtnPerIcp: number,
): WtnRewardBreakdown {
  // Source A: ICP from 10% maturity fee
  let icpFromFee = 0;
  if (totalVp > 0 && goldDaoWtn > 0 && annualMaturity > 0) {
    const goldDaoVp = goldDaoWtn * VP_MULTIPLIER;
    icpFromFee = annualMaturity * WTN_FEE_PCT * (goldDaoVp / totalVp);
  }

  // Source B: WTN earned from 3% SNS reward rate → ICP equivalent
  const wtnEarned = goldDaoWtn * WTN_REWARD_RATE;
  const wtnAsIcp = wtnPerIcp > 0 ? wtnEarned / wtnPerIcp : 0;

  return {
    icpFromFee,
    wtnEarned,
    wtnAsIcp,
    totalIcpAnnual: icpFromFee + wtnAsIcp,
  };
}
