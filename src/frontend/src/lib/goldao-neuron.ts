/**
 * Look up a single GOLDAO SNS neuron by id via the public SNS API.
 * Returns its GOLDAO stake, dissolve state, and reward eligibility so the
 * simulator can resolve "by neuron" input to an eligible GOLDAO amount.
 */

const GOLDAO_SNS = "tw2vt-hqaaa-aaaaq-aab6a-cai";
const SNS_API = "https://sns-api.internetcomputer.org/api/v1/snses";
const TWO_YEARS_SECONDS = 63_072_000;

export interface NeuronLookup {
  id: string;
  /** GOLDAO stake + staked maturity, whole tokens */
  goldao: number;
  /** dissolve delay in seconds, if the API exposes it */
  dissolveDelaySeconds: number | null;
  dissolving: boolean;
  /** ≥ 2 years and not dissolving; null when it can't be determined */
  eligible: boolean | null;
}

/** The SNS API field names vary across snapshots; read defensively. */
interface RawNeuron {
  stake_e8s?: number | string;
  staked_maturity_e8s_equivalent?: number | string;
  total_maturity_e8s_equivalent?: number | string;
  maturity_e8s_equivalent?: number | string;
  dissolve_delay_seconds?: number | string;
  dissolve_delay?: number | string;
  dissolve_state?: string;
  state?: string;
  [k: string]: unknown;
}

function num(v: number | string | undefined): number {
  if (v === undefined) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Trim, drop 0x, lowercase — accept the hex id as shown in wallets. */
function normalizeId(raw: string): string {
  return raw.trim().replace(/^0x/i, "").replace(/\s+/g, "").toLowerCase();
}

export async function lookupNeuron(rawId: string): Promise<NeuronLookup> {
  const id = normalizeId(rawId);
  if (!id) throw new Error("Enter a neuron id.");

  const res = await fetch(`${SNS_API}/${GOLDAO_SNS}/neurons/${id}`);
  if (res.status === 404)
    throw new Error("Neuron not found in the GOLDAO SNS.");
  if (!res.ok) throw new Error(`Lookup failed (HTTP ${res.status}).`);

  const raw = (await res.json()) as RawNeuron;

  const stake = num(raw.stake_e8s);
  const stakedMaturity = num(raw.staked_maturity_e8s_equivalent);
  const goldao = (stake + stakedMaturity) / 1e8;

  const delayRaw = raw.dissolve_delay_seconds ?? raw.dissolve_delay;
  const dissolveDelaySeconds = delayRaw !== undefined ? num(delayRaw) : null;

  const stateStr = `${raw.dissolve_state ?? raw.state ?? ""}`.toLowerCase();
  const dissolving = stateStr.includes("dissolv") && !stateStr.includes("not");

  let eligible: boolean | null = null;
  if (dissolveDelaySeconds !== null) {
    eligible = dissolveDelaySeconds >= TWO_YEARS_SECONDS && !dissolving;
  }

  return { id, goldao, dissolveDelaySeconds, dissolving, eligible };
}
