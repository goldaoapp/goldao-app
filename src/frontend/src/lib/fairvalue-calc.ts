/**
 * GOLDAO vs ICP — Fair Value Calculator
 *
 * Direct yield to stakers:
 *   33% gross NNS ICP → direct ICP to eligible holders
 *   33% gross NNS ICP → GLDT (same ICP value) to eligible holders
 *   OGY neuron rewards → converted to ICP → to eligible holders
 *   WTN neurons → total value in ICP, amortized as annual yield
 *
 * The 33% buyback (burn/OGY/compound) and 1% Good DAO are NOT staker
 * yield — they are treasury actions.
 *
 * Equilibrium: price at which annual GOLDAO yield equals NNS APY.
 *   price_eq = yield_per_goldao / APY_NNS
 *   ratio_eq = 1 / price_eq
 */

export interface FairValueParams {
  // NNS
  icp_staked: number;
  nns_apy: number;
  price_icp_usd: number;

  // Distribution (33/33/33/1)
  pct_stakers: number;
  pct_gldt: number;
  pct_burn: number;
  pct_cecil: number;

  // OGY
  ogy_staked: number;
  ogy_apy: number;
  price_ogy_usd: number;

  // WTN (amortized distribution)
  wtn_total: number;
  wtn_per_icp: number;
  wtn_annual_icp: number;

  // GOLDAO supply
  goldao_eligible: number;

  // Market
  market_ratio: number;
}

export interface FairValueResult {
  // Step 1 — Gross ICP
  icp_gross: number;

  // Step 2 — Distribution
  total_pct: number;
  icp_stakers: number;
  icp_gldt: number;
  icp_burn: number;
  icp_cecil: number;

  // Step 3 — OGY → ICP
  ogy_rewards: number;
  ogy_usd: number;
  ogy_icp: number;

  // Step 4 — WTN → ICP
  wtn_icp: number;
  wtn_daily_icp: number;

  // Step 5 — Direct yield
  pool_directo: number;
  yield_directo: number;

  // Step 6 — Effective APY
  price_goldao_icp_mkt: number;
  apy_efectivo: number;

  // Step 7 — Equilibrium
  precio_eq: number;
  ratio_eq: number;
  precio_eq_usd: number;

  // Step 8 — Market vs Equilibrium
  market_ratio: number;
  diferencia_pct: number;
  esta_barato: boolean;
}

export const DEFAULTS: FairValueParams = {
  icp_staked: 555_888,
  nns_apy: 8.15,
  price_icp_usd: 0,

  pct_stakers: 33,
  pct_gldt: 33,
  pct_burn: 33,
  pct_cecil: 1,

  ogy_staked: 0,
  ogy_apy: 6,
  price_ogy_usd: 0,

  wtn_total: 0,
  wtn_per_icp: 0,
  wtn_annual_icp: 400,

  goldao_eligible: 0,

  market_ratio: 0,
};

export function calcular(p: FairValueParams): FairValueResult {
  // Step 1 — Gross ICP from NNS neurons
  const icp_gross = p.icp_staked * (p.nns_apy / 100);

  // Step 2 — Distribution (only stakers + GLDT count toward yield)
  const total_pct = p.pct_stakers + p.pct_gldt + p.pct_burn + p.pct_cecil;
  const icp_stakers = icp_gross * (p.pct_stakers / 100);
  const icp_gldt = icp_gross * (p.pct_gldt / 100);
  const icp_burn = icp_gross * (p.pct_burn / 100);
  const icp_cecil = icp_gross * (p.pct_cecil / 100);

  // Step 3 — OGY rewards → ICP equivalent
  const ogy_rewards = p.ogy_staked * (p.ogy_apy / 100);
  const ogy_usd = ogy_rewards * p.price_ogy_usd;
  const ogy_icp = p.price_icp_usd > 0 ? ogy_usd / p.price_icp_usd : 0;

  // Step 4 — WTN → ICP amortized (total value treated as annual yield)
  const wtn_icp = p.wtn_per_icp > 0 ? p.wtn_total / p.wtn_per_icp : 0;
  const wtn_daily_icp = wtn_icp / 365;

  // Step 5 — Direct yield to eligible holders (ICP + GLDT + OGY + WTN)
  const pool_directo =
    icp_stakers + icp_gldt + ogy_icp + wtn_icp + p.wtn_annual_icp;
  const elig = p.goldao_eligible > 0 ? p.goldao_eligible : 1;
  const yield_directo = pool_directo / elig;

  // Step 6 — Effective APY at market price
  const mkt = p.market_ratio > 0 ? p.market_ratio : 1;
  const price_goldao_icp_mkt = 1 / mkt;
  const apy_efectivo = (yield_directo / price_goldao_icp_mkt) * 100;

  // Step 7 — Equilibrium price and ratio
  const apy = p.nns_apy / 100;
  let precio_eq = 0;
  let ratio_eq = 0;

  if (apy > 0 && yield_directo > 0) {
    precio_eq = yield_directo / apy;
    ratio_eq = 1 / precio_eq;
  }
  const precio_eq_usd = precio_eq * p.price_icp_usd;

  // Step 8 — Market vs Equilibrium
  const diferencia_pct =
    ratio_eq > 0 ? ((p.market_ratio - ratio_eq) / ratio_eq) * 100 : 0;
  const esta_barato = p.market_ratio > ratio_eq;

  return {
    icp_gross,
    total_pct,
    icp_stakers,
    icp_gldt,
    icp_burn,
    icp_cecil,
    ogy_rewards,
    ogy_usd,
    ogy_icp,
    wtn_icp,
    wtn_daily_icp,
    pool_directo,
    yield_directo,
    price_goldao_icp_mkt,
    apy_efectivo,
    precio_eq,
    ratio_eq,
    precio_eq_usd,
    market_ratio: p.market_ratio,
    diferencia_pct,
    esta_barato,
  };
}
