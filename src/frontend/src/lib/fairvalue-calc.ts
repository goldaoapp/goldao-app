/**
 * GOLDAO vs ICP — Fair Value Calculator
 *
 * Solo cuenta lo que el staker REALMENTE recibe como reward directo:
 *   33% ICP bruto NNS → ICP directo a elegibles
 *   33% ICP bruto NNS → GLDT (mismo valor ICP) a elegibles
 *   OGY neuron rewards → convertidos a ICP → a elegibles
 *
 * El 33% buyback (quema/OGY/compound) y el 1% Good DAO NO son yield
 * del staker — son acciones de tesorería que afectan supply o principal
 * futuro, pero no generan flujo al holder en el período.
 *
 * Equilibrio: precio al que yield directo anual por GOLDAO iguala APY NNS.
 *   precio_eq = yield_por_goldao / APY_NNS
 *   ratio_eq  = 1 / precio_eq
 */

export interface FairValueParams {
  // NNS
  icp_staked: number;
  nns_apy: number;
  price_icp_usd: number;

  // Distribución (33/33/33/1)
  pct_stakers: number;
  pct_gldt: number;
  pct_burn: number;
  pct_cecil: number;

  // OGY
  ogy_staked: number;
  ogy_apy: number;
  price_ogy_usd: number;

  // Supply GOLDAO
  goldao_eligible: number;

  // Mercado
  market_ratio: number;
}

export interface FairValueResult {
  // Paso 1
  icp_gross: number;

  // Paso 2
  total_pct: number;
  icp_stakers: number;
  icp_gldt: number;
  icp_burn: number;
  icp_cecil: number;

  // Paso 3
  ogy_rewards: number;
  ogy_usd: number;
  ogy_icp: number;

  // Paso 4
  pool_directo: number;
  yield_directo: number;

  // Paso 5
  price_goldao_icp_mkt: number;
  apy_efectivo: number;

  // Paso 6
  precio_eq: number;
  ratio_eq: number;
  precio_eq_usd: number;

  // Paso 7
  market_ratio: number;
  diferencia_pct: number;
  esta_barato: boolean;
}

export const DEFAULTS: FairValueParams = {
  icp_staked: 555_888,
  nns_apy: 8.4,
  price_icp_usd: 2.35,

  pct_stakers: 33,
  pct_gldt: 33,
  pct_burn: 33,
  pct_cecil: 1,

  ogy_staked: 500_000_000,
  ogy_apy: 6,
  price_ogy_usd: 0.000864,

  goldao_eligible: 300_000_000,

  market_ratio: 500,
};

export function calcular(p: FairValueParams): FairValueResult {
  // Paso 1 — ICP bruto NNS
  const icp_gross = p.icp_staked * (p.nns_apy / 100);

  // Paso 2 — Distribución (informativo, el equilibrio solo usa stakers + gldt)
  const total_pct = p.pct_stakers + p.pct_gldt + p.pct_burn + p.pct_cecil;
  const icp_stakers = icp_gross * (p.pct_stakers / 100);
  const icp_gldt = icp_gross * (p.pct_gldt / 100);
  const icp_burn = icp_gross * (p.pct_burn / 100);
  const icp_cecil = icp_gross * (p.pct_cecil / 100);

  // Paso 3 — OGY → ICP equivalente
  const ogy_rewards = p.ogy_staked * (p.ogy_apy / 100);
  const ogy_usd = ogy_rewards * p.price_ogy_usd;
  const ogy_icp = p.price_icp_usd > 0 ? ogy_usd / p.price_icp_usd : 0;

  // Paso 4 — Yield directo a elegibles (solo lo que el staker cobra)
  const pool_directo = icp_stakers + icp_gldt + ogy_icp;
  const elig = p.goldao_eligible > 0 ? p.goldao_eligible : 1;
  const yield_directo = pool_directo / elig;

  // Paso 5 — APY efectivo (a precio de mercado)
  const mkt = p.market_ratio > 0 ? p.market_ratio : 1;
  const price_goldao_icp_mkt = 1 / mkt;
  const apy_efectivo = (yield_directo / price_goldao_icp_mkt) * 100;

  // Paso 6 — Precio y ratio de equilibrio
  const apy = p.nns_apy / 100;
  let precio_eq = 0;
  let ratio_eq = 0;

  if (apy > 0 && yield_directo > 0) {
    precio_eq = yield_directo / apy;
    ratio_eq = 1 / precio_eq;
  }
  const precio_eq_usd = precio_eq * p.price_icp_usd;

  // Paso 7 — Mercado vs equilibrio
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
