/**
 * Fetches ICP balances for key accounts in the reward flow.
 * Called once when the Reward Flow tab mounts — no polling.
 *
 * Uses the ICP Ledger API (ledger-api.internetcomputer.org) which returns
 * account data by AccountIdentifier (64-char hex hash of principal + subaccount).
 */

const LEDGER_API = "https://ledger-api.internetcomputer.org/accounts";
const ICRC_API = "https://icrc-api.internetcomputer.org/api/v1/ledgers";

/** Principal of the sns_rewards canister (reward pool for all tokens) */
const SNS_REWARDS = "iyehc-lqaaa-aaaap-ab25a-cai";

/** ICRC ledger canister IDs for tokens distributed by sns_rewards */
const TOKEN_LEDGERS = {
  ogy: "lkwrt-vyaaa-aaaaq-aadhq-cai",
  gldt: "6c7su-kiaaa-aaaar-qaira-cai",
} as const;

/**
 * Known ICP accounts in the reward pipeline (ICP Ledger AccountIdentifiers).
 */
const ACCOUNTS: Record<string, string> = {
  cycle: "a51ceabd4d86c16c94936db0422d9b814b4f20e58fa013aeace0053af2305e8c",
  rewards: "6dc2515bbb9b0a97b8d977ebac3eba643a1fb4b6da8b33455e0dba957f0ce7da",
  buyback: "31836130dcff35502d04752ea5b82a24e44d41955f2a30bb8c2d284f4a318d82",
  gldt: "7cfd793d618d7000b8d845104396a714045438b67b8f213811f0c1ac37086eac",
};

export interface FlowBalances {
  [flowKey: string]: number | null;
}

/** Fetch ICP balance from the ICP Ledger API (returns e8s). */
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

function fmtIcp(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K ICP`;
  return `${v.toFixed(2)} ICP`;
}

function fmtToken(v: number, symbol: string): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M ${symbol}`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K ${symbol}`;
  return `${v.toFixed(2)} ${symbol}`;
}

/**
 * Fetch all known balances in parallel. Returns a map of flowKey → display string.
 * Called once on mount — no polling.
 *
 * Keys returned:
 * - cycle, rewards, buyback, gldt → ICP balances from the ICP Ledger
 * - pool_ogy → OGY balance in the sns_rewards reward pool
 * - pool_gldt → GLDT balance in the sns_rewards reward pool
 */
export async function fetchFlowBalances(): Promise<Record<string, string>> {
  const icpEntries = Object.entries(ACCOUNTS);

  const [icpResults, ogyBal, gldtBal] = await Promise.all([
    Promise.allSettled(
      icpEntries.map(([, accountId]) => fetchIcpBalance(accountId)),
    ),
    fetchIcrcBalance(TOKEN_LEDGERS.ogy, SNS_REWARDS, 8),
    fetchIcrcBalance(TOKEN_LEDGERS.gldt, SNS_REWARDS, 8),
  ]);

  const out: Record<string, string> = {};

  icpEntries.forEach(([key], i) => {
    const r = icpResults[i];
    const val = r.status === "fulfilled" ? r.value : null;
    if (val !== null) out[key] = fmtIcp(val);
  });

  if (ogyBal !== null) out.pool_ogy = fmtToken(ogyBal, "OGY");
  if (gldtBal !== null) out.pool_gldt = fmtToken(gldtBal, "GLDT");

  return out;
}
