/**
 * GOLDAO staking rewards simulator.
 *
 * A holder's reward is their share of each weekly reward pool, where share =
 * eligible GOLDAO held / total eligible GOLDAO. Distributions are weekly
 * (Wednesdays 14:00 UTC for ICP/OGY). WTN is a future one-time distribution on
 * neuron dissolve, shown here amortized over a year for comparison.
 *
 * Approximation: reward weight is modeled by stake share within the max-delay
 * (reward-eligible) cohort. Actual weighting is by maturity delta, so figures
 * are estimates, not guarantees.
 */

const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

export interface RewardPools {
  /** ICP/year routed directly to stakers (33% of gross NNS maturity) */
  icp_annual: number;
  /** OGY/year distributed to stakers, native OGY */
  ogy_annual: number;
  /** Total WTN held by the DAO across its neurons (one-time on dissolve) */
  wtn_total: number;
  /** Total eligible GOLDAO — the reward denominator */
  goldao_eligible: number;
  price_icp_usd: number;
  price_ogy_usd: number;
  price_wtn_usd: number;
}

export interface TokenReward {
  token: "ICP" | "OGY" | "WTN";
  /** true for ICP/OGY (weekly stream), false for WTN (one-time, amortized) */
  recurring: boolean;
  weekly: number;
  monthly: number;
  annual: number;
  weekly_usd: number;
  monthly_usd: number;
  annual_usd: number;
  /** WTN only: the holder's estimated total share paid at dissolve */
  one_time?: number;
  one_time_usd?: number;
}

export interface RewardResult {
  /** holder GOLDAO / eligible GOLDAO, 0..1 */
  share: number;
  eligible: number;
  user_goldao: number;
  icp: TokenReward;
  ogy: TokenReward;
  wtn: TokenReward;
  /** recurring USD only (ICP + OGY), WTN excluded */
  total_weekly_usd: number;
  total_monthly_usd: number;
  total_annual_usd: number;
}

function tokenReward(
  token: TokenReward["token"],
  annual: number,
  priceUsd: number,
  recurring: boolean,
): TokenReward {
  const weekly = annual / WEEKS_PER_YEAR;
  const monthly = annual / MONTHS_PER_YEAR;
  const base: TokenReward = {
    token,
    recurring,
    weekly,
    monthly,
    annual,
    weekly_usd: weekly * priceUsd,
    monthly_usd: monthly * priceUsd,
    annual_usd: annual * priceUsd,
  };
  if (!recurring) {
    base.one_time = annual;
    base.one_time_usd = annual * priceUsd;
  }
  return base;
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

  const icp = tokenReward(
    "ICP",
    pools.icp_annual * share,
    pools.price_icp_usd,
    true,
  );
  const ogy = tokenReward(
    "OGY",
    pools.ogy_annual * share,
    pools.price_ogy_usd,
    true,
  );
  // WTN: holder's total share of the one-time pool, amortized over a year.
  const wtn = tokenReward(
    "WTN",
    pools.wtn_total * share,
    pools.price_wtn_usd,
    false,
  );

  return {
    share,
    eligible,
    user_goldao: userGoldao,
    icp,
    ogy,
    wtn,
    total_weekly_usd: icp.weekly_usd + ogy.weekly_usd,
    total_monthly_usd: icp.monthly_usd + ogy.monthly_usd,
    total_annual_usd: icp.annual_usd + ogy.annual_usd,
  };
}

/** Assumptions that feed the pools — editable in the UI, seeded from live data. */
export interface RewardAssumptions {
  icp_staked: number;
  nns_apy: number;
  pct_stakers: number;
  ogy_staked: number;
  ogy_apy: number;
  wtn_total: number;
  wtn_per_icp: number;
  goldao_eligible: number;
  price_icp_usd: number;
  price_ogy_usd: number;
}

export const ASSUMPTION_DEFAULTS: RewardAssumptions = {
  icp_staked: 555_888,
  nns_apy: 8.15,
  pct_stakers: 33,
  ogy_staked: 0,
  ogy_apy: 6,
  wtn_total: 0,
  wtn_per_icp: 0,
  goldao_eligible: 0,
  price_icp_usd: 0,
  price_ogy_usd: 0,
};

/** Derive reward pools from editable assumptions. */
export function poolsFrom(a: RewardAssumptions): RewardPools {
  const icp_gross = a.icp_staked * (a.nns_apy / 100);
  const icp_annual = icp_gross * (a.pct_stakers / 100);
  const ogy_annual = a.ogy_staked * (a.ogy_apy / 100);
  const price_wtn_usd = a.wtn_per_icp > 0 ? a.price_icp_usd / a.wtn_per_icp : 0;
  return {
    icp_annual,
    ogy_annual,
    wtn_total: a.wtn_total,
    goldao_eligible: a.goldao_eligible,
    price_icp_usd: a.price_icp_usd,
    price_ogy_usd: a.price_ogy_usd,
    price_wtn_usd,
  };
}
