/**
 * GOLDAO staking rewards simulator.
 *
 * A holder's reward is their share of each weekly reward pool, where share =
 * eligible GOLDAO held / total eligible GOLDAO. Distributions are weekly
 * (Wednesdays 14:00 UTC for ICP/OGY).
 *
 * ICP sources:
 *   - 33% of NNS maturity → direct ICP to stakers
 *   - 33% of NNS maturity → GLDT (same ICP value) to stakers
 *   - WTN rewards → 10% of WaterNeuron maturity, proportional to Gold DAO VP
 *
 * All three are recurring weekly streams.
 */

const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

export interface RewardPools {
  /** ICP/year routed directly to stakers (33% of gross NNS maturity) */
  icp_annual: number;
  /** GLDT ICP-equivalent/year (33% of gross NNS maturity, same value) */
  gldt_icp_annual: number;
  /** OGY/year distributed to stakers, native OGY */
  ogy_annual: number;
  /** ICP/year from WTN rewards (10% of WaterNeuron maturity × VP share) */
  wtn_icp_annual: number;
  /** Total eligible GOLDAO — the reward denominator */
  goldao_eligible: number;
  price_icp_usd: number;
  price_ogy_usd: number;
}

export interface TokenReward {
  token: string;
  recurring: boolean;
  weekly: number;
  monthly: number;
  annual: number;
  weekly_usd: number;
  monthly_usd: number;
  annual_usd: number;
}

export interface RewardResult {
  share: number;
  eligible: number;
  user_goldao: number;
  icp: TokenReward;
  gldt: TokenReward;
  ogy: TokenReward;
  wtn_icp: TokenReward;
  /** recurring USD total (ICP + GLDT + OGY + WTN ICP) */
  total_weekly_usd: number;
  total_monthly_usd: number;
  total_annual_usd: number;
}

function tokenReward(
  token: string,
  annual: number,
  priceUsd: number,
): TokenReward {
  const weekly = annual / WEEKS_PER_YEAR;
  const monthly = annual / MONTHS_PER_YEAR;
  return {
    token,
    recurring: true,
    weekly,
    monthly,
    annual,
    weekly_usd: weekly * priceUsd,
    monthly_usd: monthly * priceUsd,
    annual_usd: annual * priceUsd,
  };
}

export function simulate(
  pools: RewardPools,
  userGoldao: number,
  shareOverride?: number,
): RewardResult {
  const eligible = pools.goldao_eligible > 0 ? pools.goldao_eligible : 0;
  const share =
    shareOverride !== undefined
      ? shareOverride
      : eligible > 0
        ? userGoldao / eligible
        : 0;

  const icp = tokenReward("ICP", pools.icp_annual * share, pools.price_icp_usd);
  const gldt = tokenReward(
    "GLDT",
    pools.gldt_icp_annual * share,
    pools.price_icp_usd,
  );
  const ogy = tokenReward("OGY", pools.ogy_annual * share, pools.price_ogy_usd);
  const wtn_icp = tokenReward(
    "ICP (WTN)",
    pools.wtn_icp_annual * share,
    pools.price_icp_usd,
  );

  const sumWeekly =
    icp.weekly_usd + gldt.weekly_usd + ogy.weekly_usd + wtn_icp.weekly_usd;
  const sumMonthly =
    icp.monthly_usd + gldt.monthly_usd + ogy.monthly_usd + wtn_icp.monthly_usd;
  const sumAnnual =
    icp.annual_usd + gldt.annual_usd + ogy.annual_usd + wtn_icp.annual_usd;

  return {
    share,
    eligible,
    user_goldao: userGoldao,
    icp,
    gldt,
    ogy,
    wtn_icp,
    total_weekly_usd: sumWeekly,
    total_monthly_usd: sumMonthly,
    total_annual_usd: sumAnnual,
  };
}

/** Assumptions that feed the pools — editable in the UI, seeded from live data. */
export interface RewardAssumptions {
  icp_staked: number;
  nns_apy: number;
  pct_stakers: number;
  pct_gldt: number;
  ogy_staked: number;
  ogy_apy: number;
  /** ICP/year from WTN (calculated by waterneuron-data.ts) */
  wtn_icp_annual: number;
  goldao_eligible: number;
  price_icp_usd: number;
  price_ogy_usd: number;
}

export const ASSUMPTION_DEFAULTS: RewardAssumptions = {
  icp_staked: 555_888,
  nns_apy: 8.15,
  pct_stakers: 33,
  pct_gldt: 33,
  ogy_staked: 0,
  ogy_apy: 6,
  wtn_icp_annual: 0,
  goldao_eligible: 0,
  price_icp_usd: 0,
  price_ogy_usd: 0,
};

/** Derive reward pools from editable assumptions. */
export function poolsFrom(a: RewardAssumptions): RewardPools {
  const icp_gross = a.icp_staked * (a.nns_apy / 100);
  const icp_annual = icp_gross * (a.pct_stakers / 100);
  const gldt_icp_annual = icp_gross * (a.pct_gldt / 100);
  const ogy_annual = a.ogy_staked * (a.ogy_apy / 100);
  return {
    icp_annual,
    gldt_icp_annual,
    ogy_annual,
    wtn_icp_annual: a.wtn_icp_annual,
    goldao_eligible: a.goldao_eligible,
    price_icp_usd: a.price_icp_usd,
    price_ogy_usd: a.price_ogy_usd,
  };
}
