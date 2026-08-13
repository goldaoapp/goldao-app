/**
 * GOLDAO vs ICP — Fair Value Calculator (port exacto de goldao_calculator.py)
 *
 * Modelo: 33/33/33/1 split del ICP bruto NNS
 *   33% → stakers (ICP directo, solo elegibles: 2 años sin disolver)
 *   33% → GLDT rewards (mismo valor ICP, va a elegibles)
 *   33% → bucket condicional buyback:
 *          - compra + quema GOLDAO si ratio ≥ 1:500
 *          - si no, compra + stakea OGY si ratio ≥ 1:1000
 *          - si no, compound ICP
 *    1% → The Good DAO (externo)
 *   OGY neuron: 100% rewards → stakers elegibles
 *
 * Equilibrio: precio al que yield anual por GOLDAO iguala APY NNS.
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
  supply_current: number;
  burn_team: number;
  burn_treasury: number;

  // Mercado / triggers
  market_ratio: number;
  trigger_goldao: number;
  trigger_ogy: number;
}

export interface FairValueResult {
  // Supply
  supply_eff: number;
  burn_total_pend: number;

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
  yield_burn: number;

  // Paso 6
  yield_total: number;

  // Paso 7
  price_goldao_icp_mkt: number;
  apy_efectivo: number;

  // Paso 8
  precio_eq: number;
  ratio_eq: number;
  precio_eq_usd: number;
  ratio_eq_solo_directo: number;

  // Paso 9
  market_ratio: number;
  diferencia_pct: number;
  esta_barato: boolean;

  // Triggers
  trigger_goldao: number;
  trigger_ogy: number;
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
  supply_current: 570_300_000,
  burn_team: 100_000_000,
  burn_treasury: 28_300_000,

  market_ratio: 500,
  trigger_goldao: 500,
  trigger_ogy: 1000,
};

export function calcular(p: FairValueParams): FairValueResult {
  // Supply efectivo
  const supply_eff = Math.max(p.supply_current - p.burn_team - p.burn_treasury, 1);
  const burn_total_pend = p.burn_team + p.burn_treasury;

  // Paso 1 — ICP bruto NNS
  const icp_gross = p.icp_staked * (p.nns_apy / 100);

  // Paso 2 — Distribución
  const total_pct = p.pct_stakers + p.pct_gldt + p.pct_burn + p.pct_cecil;
  const icp_stakers = icp_gross * (p.pct_stakers / 100);
  const icp_gldt = icp_gross * (p.pct_gldt / 100);
  const icp_burn = icp_gross * (p.pct_burn / 100);
  const icp_cecil = icp_gross * (p.pct_cecil / 100);

  // Paso 3 — OGY → ICP equivalente
  const ogy_rewards = p.ogy_staked * (p.ogy_apy / 100);
  const ogy_usd = ogy_rewards * p.price_ogy_usd;
  const ogy_icp = p.price_icp_usd > 0 ? ogy_usd / p.price_icp_usd : 0;

  // Paso 4 — Yield directo a elegibles
  const pool_directo = icp_stakers + icp_gldt + ogy_icp;
  const elig = p.goldao_eligible > 0 ? p.goldao_eligible : 1;
  const yield_directo = pool_directo / elig;

  // Paso 5 — Yield del burn sobre supply efectivo
  const yield_burn = icp_burn / supply_eff;

  // Paso 6 — Yield total
  const yield_total = yield_directo + yield_burn;

  // Paso 7 — APY efectivo
  const mkt = p.market_ratio > 0 ? p.market_ratio : 1;
  const price_goldao_icp_mkt = 1 / mkt;
  const apy_efectivo = (yield_total / price_goldao_icp_mkt) * 100;

  // Paso 8 — Precio y ratio de equilibrio
  const apy = p.nns_apy / 100;
  let precio_eq = 0;
  let ratio_eq = 0;
  let ratio_eq_solo_directo = 0;

  if (apy > 0) {
    precio_eq = yield_total / apy;
    ratio_eq = precio_eq > 0 ? 1 / precio_eq : 0;
    ratio_eq_solo_directo =
      yield_directo > 0 ? 1 / (yield_directo / apy) : 0;
  }
  const precio_eq_usd = precio_eq * p.price_icp_usd;

  // Paso 9 — Mercado vs equilibrio
  const diferencia_pct =
    ratio_eq > 0 ? ((p.market_ratio - ratio_eq) / ratio_eq) * 100 : 0;
  const esta_barato = p.market_ratio > ratio_eq;

  return {
    supply_eff,
    burn_total_pend,
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
    yield_burn,
    yield_total,
    price_goldao_icp_mkt,
    apy_efectivo,
    precio_eq,
    ratio_eq,
    precio_eq_usd,
    ratio_eq_solo_directo,
    market_ratio: p.market_ratio,
    diferencia_pct,
    esta_barato,
    trigger_goldao: p.trigger_goldao,
    trigger_ogy: p.trigger_ogy,
  };
}
