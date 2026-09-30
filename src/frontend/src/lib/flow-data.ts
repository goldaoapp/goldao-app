/**
 * Live balances for the Reward Flow diagram.
 * Called once when the Reward Flow tab mounts — no polling.
 *
 * ICP balances come from the ICP Ledger API by AccountIdentifier (64-char hex
 * of principal + subaccount). Every value is `null` when its source fails, so
 * the UI can show "—" instead of a made-up number.
 */

import { API, POOLS, type SnsNeuronResponse } from "@/lib/api";
import { getPoolRatio } from "@/lib/icpswap-quote";

const LEDGER_API = "https://ledger-api.internetcomputer.org/accounts";
const ICRC_API = "https://icrc-api.internetcomputer.org/api/v1/ledgers";

/** Principal of the sns_rewards canister (reward pool for all tokens) */
const SNS_REWARDS = "iyehc-lqaaa-aaaap-ab25a-cai";

/** ICRC ledger canister IDs for tokens distributed by sns_rewards */
const TOKEN_LEDGERS = {
  ogy: "lkwrt-vyaaa-aaaaq-aadhq-cai",
  gldt: "6c7su-kiaaa-aaaar-qaira-cai",
} as const;

/** Known ICP accounts in the reward pipeline (ICP Ledger AccountIdentifiers). */
const ACCOUNTS = {
  /** Cycle management — pre-split diversion if below 1,000 ICP */
  cycle: "a51ceabd4d86c16c94936db0422d9b814b4f20e58fa013aeace0053af2305e8c",
  /** sns_rewards ICP reward pool — paid out on Wednesdays */
  rewards: "6dc2515bbb9b0a97b8d977ebac3eba643a1fb4b6da8b33455e0dba957f0ce7da",
  /** buyback_burn ICP — spent by the GOLDAO / OGY / compound cascade */
  buyback: "31836130dcff35502d04752ea5b82a24e44d41955f2a30bb8c2d284f4a318d82",
  /** GLDT job ICP — spent buying GLDT for stakers */
  gldt: "7cfd793d618d7000b8d845104396a714045438b67b8f213811f0c1ac37086eac",
} as const;

export interface FlowBalances {
  /** ICP in the cycle management account */
  cycle: number | null;
  /** ICP waiting in the staker reward pool */
  rewards: number | null;
  /** ICP available to the buyback cascade */
  buyback: number | null;
  /** ICP available to the GLDT job */
  gldt: number | null;
  /** OGY waiting in the staker reward pool */
  poolOgy: number | null;
  /** GLDT waiting in the staker reward pool */
  poolGldt: number | null;
  /** GOLDAO received for 1 ICP (ICPSwap quote — same check as the canister) */
  goldaoRatio: number | null;
  /** OGY received for 1 ICP */
  ogyRatio: number | null;
  /** OGY staked in the DAO's ORIGYN neuron (stake + maturity) */
  ogyStaked: number | null;
}

/** Fetch ICP balance from the ICP Ledger API (whole ICP). */
async function fetchIcpBalance(accountId: string): Promise<number | null> {
  try {
    const res = await fetch(`${LEDGER_API}/${accountId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.balance ?? data?.balances?.e8s ?? null;
    if (raw === null || raw === undefined) return null;
    return Number(raw) / 1e8;
  } catch {
    return null;
  }
}

/** Fetch ICRC token balance from the ICRC API by principal. */
async function fetchIcrcBalance(
  ledgerCanisterId: string,
  principal: string,
  decimals: number,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${ICRC_API}/${ledgerCanisterId}/accounts/${principal}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.balance ?? null;
    if (raw === null || raw === undefined) return null;
    return Number(raw) / 10 ** decimals;
  } catch {
    return null;
  }
}

/** Fetch OGY neuron total (stake + maturity) in whole OGY. */
async function fetchOgyStaked(): Promise<number | null> {
  try {
    const res = await fetch(API.OGY_NEURON);
    if (!res.ok) return null;
    const data: SnsNeuronResponse = await res.json();
    return (data.stake_e8s + data.total_maturity_e8s_equivalent) / 1e8;
  } catch {
    return null;
  }
}

async function safe<T>(p: Promise<T | null>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** Fetch all flow balances in parallel. */
export async function fetchFlowBalances(): Promise<FlowBalances> {
  const [
    cycle,
    rewards,
    buyback,
    gldt,
    poolOgy,
    poolGldt,
    goldaoRatio,
    ogyRatio,
    ogyStaked,
  ] = await Promise.all([
    fetchIcpBalance(ACCOUNTS.cycle),
    fetchIcpBalance(ACCOUNTS.rewards),
    fetchIcpBalance(ACCOUNTS.buyback),
    fetchIcpBalance(ACCOUNTS.gldt),
    fetchIcrcBalance(TOKEN_LEDGERS.ogy, SNS_REWARDS, 8),
    fetchIcrcBalance(TOKEN_LEDGERS.gldt, SNS_REWARDS, 8),
    safe(getPoolRatio(POOLS.GOLDAO_ICP.id, POOLS.GOLDAO_ICP.zeroForOne)),
    safe(getPoolRatio(POOLS.OGY_ICP.id, POOLS.OGY_ICP.zeroForOne)),
    fetchOgyStaked(),
  ]);
  return {
    cycle,
    rewards,
    buyback,
    gldt,
    poolOgy,
    poolGldt,
    goldaoRatio,
    ogyRatio,
    ogyStaked,
  };
}
