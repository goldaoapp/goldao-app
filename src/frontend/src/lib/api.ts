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

  /** OGY SNS neuron (stake + maturity) */
  OGY_NEURON:
    "https://sns-api.internetcomputer.org/api/v1/snses/leu43-oiaaa-aaaaq-aadgq-cai/neurons/bf941a42ede5c1513b87375677e30fe6174a5f790be5850290182ebfa3b5f74d",

  /** GOLDAO SNS proposals — latest 10 (v1, newest first) */
  GOLDAO_PROPOSALS:
    "https://sns-api.internetcomputer.org/api/v1/snses/tw2vt-hqaaa-aaaaq-aab6a-cai/proposals?offset=0&limit=10&sort_by=-id",

  /** WTN SNS neurons (3 neurons held by Gold DAO) */
  WTN_NEURONS: [
    "https://sns-api.internetcomputer.org/api/v1/snses/jmod6-4iaaa-aaaaq-aadkq-cai/neurons/884ce73eb8022314f5a454feba94656a7bf3b80c2173c898dae0d7fcdd25b356",
    "https://sns-api.internetcomputer.org/api/v1/snses/jmod6-4iaaa-aaaaq-aadkq-cai/neurons/238d59f677414f0f82c09b4c4b6975c3768818a0400f1c6ae5bad618be51bc22",
    "https://sns-api.internetcomputer.org/api/v1/snses/jmod6-4iaaa-aaaaq-aadkq-cai/neurons/e6b2425b794513f375f8b44b94b6a41152db76b0b0c1122a863ee14a02f38a77",
  ],

  /** GOLDAO SNS info (supply, metadata) */
  GOLDAO_SNS_INFO:
    "https://sns-api.internetcomputer.org/api/v1/snses/tw2vt-hqaaa-aaaaq-aab6a-cai",
} as const;

/** ICPSwap pool canister IDs and swap directions for ICP→token quotes */
export const POOLS = {
  /** token0=ICP, token1=GOLDAO → ICP→GOLDAO = zeroForOne: true */
  GOLDAO_ICP: { id: "k46ek-4qaaa-aaaag-qcyzq-cai", zeroForOne: true },
  /** token0=OGY, token1=ICP → ICP→OGY = zeroForOne: false */
  OGY_ICP: { id: "ttnzy-lyaaa-aaaag-qj2bq-cai", zeroForOne: false },
  /** token0=WTN, token1=ICP → ICP→WTN = zeroForOne: false */
  WTN_ICP: { id: "oqn67-kaaaa-aaaag-qj72q-cai", zeroForOne: false },
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

export interface OGYNeuronResponse {
  stake_e8s: number;
  total_maturity_e8s_equivalent: number;
}

export interface SNSProposal {
  id: string;
  decided_timestamp_seconds: number;
  executed_timestamp_seconds: number;
  failed_timestamp_seconds: number;
}

export interface SNSProposalsResponse {
  data: SNSProposal[];
}
