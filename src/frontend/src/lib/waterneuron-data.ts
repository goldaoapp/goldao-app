/**
 * Protocol reward calculations for Gold DAO's SNS neuron positions.
 *
 * 1. WTN rewards:
 *    A) ICP from 10% WaterNeuron maturity fee (VP-proportional)
 *    B) WTN earned from 3% SNS staking → ICP equivalent
 *
 * 2. ORIGYN–Gold DAO Partnership:
 *    ORIGYN holds 100M GOLDAO staked → earns ICP/GLDT/OGY/WTN →
 *    non-OGY swapped to OGY → distributed to 5y OGY stakers →
 *    Gold DAO captures ~26% (largest OGY neuron: 503M OGY)
 */

/** 10% of ICP maturity goes to WTN SNS stakers (protocol constant) */
export const WTN_FEE_PCT = 0.10;
/** VP multiplier for Gold DAO's WTN neurons (fixed for now) */
export const WTN_VP_MULTIPLIER = 2.88;
/** WTN SNS governance reward rate */
export const WTN_REWARD_RATE = 0.03;

/** ORIGYN's staked GOLDAO (fixed per partnership agreement) */
export const ORIGYN_GOLDAO_STAKED = 100_000_000;

const WTN_SNS_ROOT = "jmod6-4iaaa-aaaaq-aadkq-cai";
const OGY_SNS_ROOT = "leu43-oiaaa-aaaaq-aadgq-cai";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface WtnRewardBreakdown {
  icpFromFee: number;
  wtnEarned: number;
  wtnAsIcp: number;
  totalIcpAnnual: number;
}

export interface OrigynPartnershipBreakdown {
  /** ORIGYN's share of GOLDAO eligible */
  origynShare: number;
  /** Total non-OGY ICP earned by ORIGYN from GOLDAO staking */
  origynNonOgyIcp: number;
  /** OGY bought with non-OGY ICP */
  ogyFromSwap: number;
  /** Native OGY earned by ORIGYN from GOLDAO staking */
  ogyNative: number;
  /** Total OGY distributed to 5y stakers */
  totalOgyDistributed: number;
  /** Gold DAO's VP share of ORIGYN governance */
  gdOgyVpShare: number;
  /** OGY received by Gold DAO */
  gdOgyReceived: number;
  /** ICP equivalent of OGY received */
  gdOgyAsIcp: number;
}

export interface ProtocolRewardsData {
  wtnAnnualMaturity: number;
  totalWtnVp: number;
  totalOgyVp: number;
}

/* ── Defaults (dashboard Sep 2026) ─────────────────────────────────────── */

export const DEFAULTS = {
  neuron8yStakedIcp: 1_061_875,
  neuron8yApy: 0.0798,
  totalWtnVp: 244_461_491,
  totalOgyVp: 3_911_139_204,
  /** Gold DAO OGY neuron VP */
  gdOgyVp: 1_007_704_798,
} as const;

/* ── Fetch total VP from SNS proposals ─────────────────────────────────── */

async function fetchSnsVp(snsRoot: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://sns-api.internetcomputer.org/api/v1/snses/${snsRoot}/proposals?offset=0&limit=5&sort_by=-id`,
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

export async function fetchProtocolRewardsData(): Promise<ProtocolRewardsData> {
  const [totalWtnVp, totalOgyVp] = await Promise.all([
    fetchSnsVp(WTN_SNS_ROOT),
    fetchSnsVp(OGY_SNS_ROOT),
  ]);
  return {
    wtnAnnualMaturity: DEFAULTS.neuron8yStakedIcp * DEFAULTS.neuron8yApy,
    totalWtnVp: totalWtnVp ?? DEFAULTS.totalWtnVp,
    totalOgyVp: totalOgyVp ?? DEFAULTS.totalOgyVp,
  };
}

/**
 * WTN reward breakdown (sources A + B).
 */
export function calcWtnRewards(
  annualMaturity: number,
  goldDaoWtn: number,
  totalWtnVp: number,
  wtnPerIcp: number,
): WtnRewardBreakdown {
  let icpFromFee = 0;
  if (totalWtnVp > 0 && goldDaoWtn > 0) {
    const goldDaoVp = goldDaoWtn * WTN_VP_MULTIPLIER;
    icpFromFee = annualMaturity * WTN_FEE_PCT * (goldDaoVp / totalWtnVp);
  }
  const wtnEarned = goldDaoWtn * WTN_REWARD_RATE;
  const wtnAsIcp = wtnPerIcp > 0 ? wtnEarned / wtnPerIcp : 0;
  return {
    icpFromFee,
    wtnEarned,
    wtnAsIcp,
    totalIcpAnnual: icpFromFee + wtnAsIcp,
  };
}

/**
 * ORIGYN–Gold DAO Partnership flywheel.
 *
 * @param icpPoolStakers    ICP/year distributed to GOLDAO stakers (33%)
 * @param gldtPoolStakers   GLDT ICP-equiv/year (33%)
 * @param wtnIcpAnnual      WTN ICP/year for all GOLDAO stakers
 * @param ogyPoolAnnual     OGY/year distributed to GOLDAO stakers
 * @param goldaoEligible    Total eligible GOLDAO
 * @param ogyPerIcp         OGY/ICP exchange ratio
 * @param gdOgyVp           Gold DAO's OGY neuron VP
 * @param totalOgyVp        Total VP in ORIGYN governance
 */
export function calcOrigynPartnership(
  icpPoolStakers: number,
  gldtPoolStakers: number,
  wtnIcpAnnual: number,
  ogyPoolAnnual: number,
  goldaoEligible: number,
  ogyPerIcp: number,
  gdOgyVp: number,
  totalOgyVp: number,
): OrigynPartnershipBreakdown {
  const origynShare =
    goldaoEligible > 0 ? ORIGYN_GOLDAO_STAKED / goldaoEligible : 0;

  // What ORIGYN earns from their 100M GOLDAO
  const origynIcp = icpPoolStakers * origynShare;
  const origynGldt = gldtPoolStakers * origynShare; // same ICP value
  const origynWtnIcp = wtnIcpAnnual * origynShare;
  const ogyNative = ogyPoolAnnual * origynShare;

  // Non-OGY → swap to OGY
  const origynNonOgyIcp = origynIcp + origynGldt + origynWtnIcp;
  const ogyFromSwap = ogyPerIcp > 0 ? origynNonOgyIcp * ogyPerIcp : 0;

  // Total OGY distributed to 5-year stakers
  const totalOgyDistributed = ogyFromSwap + ogyNative;

  // Gold DAO captures its VP share
  const gdOgyVpShare = totalOgyVp > 0 ? gdOgyVp / totalOgyVp : 0;
  const gdOgyReceived = totalOgyDistributed * gdOgyVpShare;
  const gdOgyAsIcp = ogyPerIcp > 0 ? gdOgyReceived / ogyPerIcp : 0;

  return {
    origynShare,
    origynNonOgyIcp,
    ogyFromSwap,
    ogyNative,
    totalOgyDistributed,
    gdOgyVpShare,
    gdOgyReceived,
    gdOgyAsIcp,
  };
}
