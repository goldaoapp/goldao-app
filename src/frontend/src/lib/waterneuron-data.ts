/**
 * WaterNeuron protocol data for ICP reward estimation.
 *
 * Gold DAO holds WTN in 4 SNS neurons. WaterNeuron distributes 10% of
 * the ICP maturity from its 8-year NNS neuron to WTN SNS stakers.
 *
 * Formula:
 *   gold_dao_vp    = gold_dao_wtn_total × VP_MULTIPLIER
 *   total_vp       = fetched from latest WTN SNS proposal tally
 *   icp_from_wtn   = maturity_annual × 10% × (gold_dao_vp / total_vp)
 *
 * VP_MULTIPLIER is fixed at ×2.88 for now (best Gold DAO neuron).
 * TODO: use real per-neuron VP once dissolve delays are optimized.
 */

/** 10% of ICP maturity goes to WTN SNS stakers (protocol constant) */
export const WTN_FEE_PCT = 0.10;

/** VP multiplier applied to Gold DAO's WTN stake. Fixed for now. */
export const VP_MULTIPLIER = 2.88;

const WTN_SNS_ROOT = "jmod6-4iaaa-aaaaq-aadkq-cai";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface WaterNeuronData {
  /** ICP staked in the 8-year NNS neuron */
  neuron8yStakedIcp: number;
  /** Estimated annual ICP maturity from the 8-year neuron */
  estimatedAnnualMaturity: number;
  /** Total VP in WTN governance (from last decided proposal) */
  totalWtnVp: number;
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
 * Uses dashboard-verified APY (7.98%) for the 8y neuron.
 */
export async function fetchWaterNeuronData(): Promise<WaterNeuronData> {
  const totalWtnVpLive = await fetchTotalWtnVp();

  return {
    neuron8yStakedIcp: DEFAULTS.neuron8yStakedIcp,
    estimatedAnnualMaturity:
      DEFAULTS.neuron8yStakedIcp * DEFAULTS.neuron8yApy,
    totalWtnVp: totalWtnVpLive ?? DEFAULTS.totalWtnVp,
  };
}

/**
 * ICP/year Gold DAO receives from WTN rewards.
 *
 * @param annualMaturity  Total ICP maturity/year from WaterNeuron NNS neurons
 * @param goldDaoWtn      Gold DAO's total WTN (from use-live-data.ts wtnTotal)
 * @param totalVp         Total VP in WTN governance
 */
export function calcIcpFromWtn(
  annualMaturity: number,
  goldDaoWtn: number,
  totalVp: number,
): number {
  if (totalVp <= 0 || goldDaoWtn <= 0 || annualMaturity <= 0) return 0;
  const goldDaoVp = goldDaoWtn * VP_MULTIPLIER;
  return annualMaturity * WTN_FEE_PCT * (goldDaoVp / totalVp);
}
