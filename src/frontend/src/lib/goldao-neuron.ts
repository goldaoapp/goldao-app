/**
 * Look up a single GOLDAO SNS neuron by id via the public SNS API.
 * Returns its GOLDAO stake, dissolve state, voting power, and reward
 * eligibility so the simulator can resolve "by neuron" input.
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
  /** total voting power (bonuses baked in), whole tokens; null if absent */
  votingPower: number | null;
  /** ≥ 2 years and not dissolving; null when it can't be determined */
  eligible: boolean | null;
}

/** The SNS API field names vary across snapshots; read defensively. */
interface RawNeuron {
  stake_e8s?: number | string;
  cached_neuron_stake_e8s?: number | string;
  staked_maturity_e8s_equivalent?: number | string;
  voting_power?: number | string;
  /** "NotDissolving" | "Dissolving" | "Dissolved" */
  state?: string;
  /** flat delay in seconds (present on the neuron-detail endpoint) */
  current_dissolve_delay_seconds?: number | string;
  /** variant object: { DissolveDelaySeconds } | { WhenDissolvedTimestampSeconds } */
  dissolve_state?:
    | { DissolveDelaySeconds?: number | string }
    | { WhenDissolvedTimestampSeconds?: number | string }
    | string;
  [k: string]: unknown;
}

function num(v: number | string | undefined | null): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Trim, drop 0x, lowercase — accept the hex id as shown in wallets. */
function normalizeId(raw: string): string {
  return raw.trim().replace(/^0x/i, "").replace(/\s+/g, "").toLowerCase();
}

/** Read the dissolve delay from whichever field the snapshot provides. */
function readDelaySeconds(raw: RawNeuron): number | null {
  if (raw.current_dissolve_delay_seconds !== undefined)
    return num(raw.current_dissolve_delay_seconds);

  const ds = raw.dissolve_state;
  if (ds && typeof ds === "object" && "DissolveDelaySeconds" in ds)
    return num(ds.DissolveDelaySeconds);

  // Dissolving neuron: remaining delay = when_dissolved - now.
  if (ds && typeof ds === "object" && "WhenDissolvedTimestampSeconds" in ds) {
    const when = num(ds.WhenDissolvedTimestampSeconds);
    const now = Math.floor(Date.now() / 1000);
    return Math.max(when - now, 0);
  }
  return null;
}

/** True if the neuron is dissolving or already dissolved. */
function readDissolving(raw: RawNeuron): boolean {
  if (typeof raw.state === "string")
    return raw.state.toLowerCase() !== "notdissolving";

  const ds = raw.dissolve_state;
  if (ds && typeof ds === "object")
    return "WhenDissolvedTimestampSeconds" in ds;
  return false;
}

export async function lookupNeuron(rawId: string): Promise<NeuronLookup> {
  const id = normalizeId(rawId);
  if (!id) throw new Error("Enter a neuron id.");

  const res = await fetch(`${SNS_API}/${GOLDAO_SNS}/neurons/${id}`);
  if (res.status === 404)
    throw new Error("Neuron not found in the GOLDAO SNS.");
  if (!res.ok) throw new Error(`Lookup failed (HTTP ${res.status}).`);

  const raw = (await res.json()) as RawNeuron;

  const stake = num(raw.stake_e8s ?? raw.cached_neuron_stake_e8s);
  const stakedMaturity = num(raw.staked_maturity_e8s_equivalent);
  const goldao = (stake + stakedMaturity) / 1e8;

  const vp =
    raw.voting_power !== undefined ? num(raw.voting_power) / 1e8 : null;

  const dissolveDelaySeconds = readDelaySeconds(raw);
  const dissolving = readDissolving(raw);

  const eligible =
    dissolveDelaySeconds !== null
      ? dissolveDelaySeconds >= TWO_YEARS_SECONDS && !dissolving
      : null;

  return {
    id,
    goldao,
    dissolveDelaySeconds,
    dissolving,
    votingPower: vp,
    eligible,
  };
}
