/**
 * Fetches ICP balances for key accounts in the reward flow.
 * Called once when the Reward Flow tab mounts — no polling.
 *
 * Uses the ICP Ledger API (ledger-api.internetcomputer.org) which returns
 * account data by AccountIdentifier (64-char hex hash of principal + subaccount).
 */

const LEDGER_API = "https://ledger-api.internetcomputer.org/accounts";

/**
 * Known accounts in the reward pipeline.
 * - cycle: cycle management account (set by governance, pre-split diversion)
 * - rewards: sns_rewards canister default account (receives 33% for stakers)
 * - buyback: buyback_burn canister default account (receives 33% for buyback)
 *
 * Account identifiers are SHA-224 hashes of (domain_sep + principal + subaccount).
 * These are stable unless governance changes the recipients.
 */
const ACCOUNTS: Record<string, string> = {
  // Cycle management — direct account identifier from governance config
  cycle: "a51ceabd4d86c16c94936db0422d9b814b4f20e58fa013aeace0053af2305e8c",

  // sns_rewards canister (iyehc-lqaaa-aaaap-ab25a-cai) default account
  // Subaccount for staker rewards: 6dc2515bbb9b...
  // We query the default account to see total ICP held by the canister
  rewards: "6dc2515bbb9b2a46cca51089319c52c549e52f5e53fe5e00fcfde72cd2e2f7b1",

  // buyback_burn canister (atslz-hiaaa-aaaam-acq6q-cai) default account
  // This canister handles both GOLDAO buyback and GLDT purchases
  buyback: "31836130dcff35502d04752ea5b82a24e44d41955f2a30bb8c2d284f4a318d82",
};

export interface FlowBalances {
  [flowKey: string]: number | null;
}

async function fetchBalance(accountId: string): Promise<number | null> {
  try {
    const res = await fetch(`${LEDGER_API}/${accountId}`);
    if (!res.ok) return null;
    const data = await res.json();
    // The ledger API returns balance in e8s
    const raw = data?.balance ?? data?.balances?.e8s ?? null;
    if (raw === null || raw === undefined) return null;
    return Number(raw) / 1e8;
  } catch {
    return null;
  }
}

function fmtIcp(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K ICP`;
  return `${v.toFixed(2)} ICP`;
}

/**
 * Fetch all known balances in parallel. Returns a map of flowKey → display string.
 * Called once on mount.
 */
export async function fetchFlowBalances(): Promise<Record<string, string>> {
  const entries = Object.entries(ACCOUNTS);
  const results = await Promise.allSettled(
    entries.map(([, accountId]) => fetchBalance(accountId)),
  );

  const out: Record<string, string> = {};
  entries.forEach(([key], i) => {
    const r = results[i];
    const val = r.status === "fulfilled" ? r.value : null;
    if (val !== null) {
      out[key] = fmtIcp(val);
    }
  });
  return out;
}
