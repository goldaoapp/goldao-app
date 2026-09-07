/**
 * Reads the DAO's NNS neurons directly from the icp_neuron canister via Candid.
 * icp_neuron (j4jiq-sqaaa-aaaap-ab23a-cai) is the controller of the 7 NNS
 * neurons, so its `list_neurons` query returns real staked ICP + maturity.
 *
 * Called once on load (values change slowly). Returns aggregate totals so the
 * whole app can replace the hardcoded icp_staked default with live data.
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

const ICP_NEURON_CANISTER = "j4jiq-sqaaa-aaaap-ab23a-cai";

/* ── IDL factory (only `list_neurons`) ──────────────────────────────────── */

const icpNeuronIdlFactory = (({ IDL }: { IDL: typeof IDLType }) => {
  const Account = IDL.Record({
    owner: IDL.Opt(IDL.Principal),
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const DepositAccount = IDL.Record({
    legacy_account_id: IDL.Text,
    icrc_account: Account,
  });
  const NeuronWithMetric = IDL.Record({
    id: IDL.Nat64,
    dissolve_delay: IDL.Nat64,
    voting_power_refreshed_timestamp_seconds: IDL.Opt(IDL.Nat64),
    maturity: IDL.Nat64,
    staked_amount: IDL.Nat64,
    deposit_account: IDL.Opt(DepositAccount),
    dissolving: IDL.Bool,
  });
  const NeuronList = IDL.Record({
    active: IDL.Vec(NeuronWithMetric),
    disbursed: IDL.Vec(IDL.Nat64),
    spawning: IDL.Vec(IDL.Nat64),
  });
  const ListNeuronsResponse = IDL.Record({ neurons: NeuronList });
  return IDL.Service({
    list_neurons: IDL.Func([], [ListNeuronsResponse], ["query"]),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

let agentPromise: Promise<HttpAgent> | null = null;
function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) {
    agentPromise = HttpAgent.create({ host: "https://icp-api.io" });
  }
  return agentPromise!;
}

interface NeuronMetric {
  id: bigint;
  maturity: bigint;
  staked_amount: bigint;
  dissolving: boolean;
}
interface ListNeuronsResult {
  neurons: { active: NeuronMetric[] };
}

export interface IcpNeuronTotals {
  /** Total staked ICP across all active NNS neurons (whole ICP) */
  staked: number;
  /** Total maturity across all active NNS neurons (whole ICP) */
  maturity: number;
  /** staked + maturity */
  total: number;
  /** Number of active neurons */
  count: number;
}

/**
 * Fetch and aggregate the DAO's NNS neuron balances. Returns null on error so
 * callers can fall back to the hardcoded default.
 */
export async function fetchIcpNeuronTotals(): Promise<IcpNeuronTotals | null> {
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(icpNeuronIdlFactory, {
      agent,
      canisterId: ICP_NEURON_CANISTER,
    });
    const res = (await actor.list_neurons()) as ListNeuronsResult;
    const active = res?.neurons?.active ?? [];
    if (active.length === 0) return null;

    let stakedE8s = 0n;
    let maturityE8s = 0n;
    for (const n of active) {
      stakedE8s += n.staked_amount;
      maturityE8s += n.maturity;
    }
    const staked = Number(stakedE8s) / 1e8;
    const maturity = Number(maturityE8s) / 1e8;
    return {
      staked,
      maturity,
      total: staked + maturity,
      count: active.length,
    };
  } catch {
    return null;
  }
}
