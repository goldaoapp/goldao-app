/**
 * Shared API endpoints and response types.
 * Single source of truth — imported by use-live-data.ts and any future module.
 */

export const API = {
  /** GOLDAO eligible neurons (24-month max delay group) */
  DISSOLVE:
    "https://api.gldt.org/v1/daos/golddao/neurons/dissolve-delays",

  /** ICP/USDT spot price */
  BINANCE:
    "https://api.binance.com/api/v3/ticker/price?symbol=ICPUSDT",

  /** ICP + OGY prices in USD (single call) */
  COINGECKO:
    "https://api.coingecko.com/api/v3/simple/price?ids=internet-computer,origyn-foundation&vs_currencies=usd",

  /** All ICPSwap pool tickers (~700 KB) */
  ICPSWAP_TICKERS:
    "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/tickers",

  /** OGY SNS neuron (stake + maturity) */
  OGY_NEURON:
    "https://sns-api.internetcomputer.org/api/v1/snses/leu43-oiaaa-aaaaq-aadgq-cai/neurons/bf941a42ede5c1513b87375677e30fe6174a5f790be5850290182ebfa3b5f74d",

  /** GOLDAO SNS proposals — latest (for total count) */
  GOLDAO_PROPOSALS_LATEST:
    "https://sns-api.internetcomputer.org/api/v2/snses/tw2vt-hqaaa-aaaaq-aab6a-cai/proposals?limit=1",

  /** GOLDAO SNS proposals — open only */
  GOLDAO_PROPOSALS_OPEN:
    "https://sns-api.internetcomputer.org/api/v2/snses/tw2vt-hqaaa-aaaaq-aab6a-cai/proposals?limit=50&status=Open",
} as const;

/** ICPSwap pool canister IDs used for price lookup */
export const POOLS = {
  GOLDAO_ICP: "k46ek-4qaaa-aaaag-qcyzq-cai",
  OGY_ICP: "ttnzy-lyaaa-aaaag-qj2bq-cai",
} as const;

/** Polling intervals */
export const POLL = {
  FAST: 30_000,   // Binance, CoinGecko, gldt.org, SNS neuron
  SLOW: 120_000,  // ICPSwap /tickers (~700 KB)
} as const;

/* ── Response types ──────────────────────────────────────────────────────── */

export interface DissolveGroup {
  dissolve_delay_group: string;
  total_stake: number;
  unique_owners: number;
}

export interface ICPSwapTicker {
  ticker_id: string;
  ticker_name: string;
  last_price: string;
}

export interface OGYNeuronResponse {
  stake_e8s: number;
  total_maturity_e8s_equivalent: number;
}

export interface SNSProposal {
  id: number;
  status: string;
}

export interface SNSProposalsResponse {
  data: SNSProposal[];
}
