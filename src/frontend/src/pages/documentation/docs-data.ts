/**
 * Live values shown inside the Docs pages (stakes, states). Fetched once when
 * the Docs page mounts. `undefined` = loading, `null` = unavailable.
 */

import { API } from "@/lib/api";
import { fetchIcpNeuronTotals } from "@/lib/icp-neuron";
import { useEffect, useState } from "react";

export const NNS_NEURON_ID = "7446549063176501841";
export const OGY_NEURON_ID =
  "bf941a42ede5c1513b87375677e30fe6174a5f790be5850290182ebfa3b5f74d";
export const WTN_MAIN_NEURON_ID =
  "cdeea7c0fcb8ded7c04ad21fbfdcd64347abfd6593e40d7e8e18f0e2b984f7ba";

export interface SnsNeuronInfo {
  id: string;
  stake: number;
  maturity: number;
  dissolving: boolean;
  /** years of dissolve delay left */
  dissolveDelayYears: number;
  /** unix seconds when a dissolving neuron becomes fully dissolved */
  dissolvedAt: number | null;
}

export interface DocsLive {
  nnsStaked?: number | null;
  nnsMaturity?: number | null;
  ogy?: SnsNeuronInfo | null;
  wtn?: SnsNeuronInfo[] | null;
}

async function fetchSnsNeuron(url: string): Promise<SnsNeuronInfo | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const ds = j.dissolve_state ?? {};
    return {
      id: url.split("/").pop() ?? "",
      stake: Number(j.stake_e8s ?? 0) / 1e8,
      maturity: Number(j.total_maturity_e8s_equivalent ?? 0) / 1e8,
      dissolving: j.state === "Dissolving",
      dissolveDelayYears:
        Number(j.current_dissolve_delay_seconds ?? 0) / 31_557_600,
      dissolvedAt:
        ds.WhenDissolvedTimestampSeconds != null
          ? Number(ds.WhenDissolvedTimestampSeconds)
          : null,
    };
  } catch {
    return null;
  }
}

export function useDocsLive(): DocsLive {
  const [live, setLive] = useState<DocsLive>({});

  useEffect(() => {
    let cancelled = false;
    fetchIcpNeuronTotals().then((t) => {
      if (!cancelled)
        setLive((p) => ({
          ...p,
          nnsStaked: t?.staked ?? null,
          nnsMaturity: t?.maturity ?? null,
        }));
    });
    fetchSnsNeuron(API.OGY_NEURON).then((ogy) => {
      if (!cancelled) setLive((p) => ({ ...p, ogy }));
    });
    Promise.all(API.WTN_NEURONS.map(fetchSnsNeuron)).then((list) => {
      if (cancelled) return;
      const ok = list.filter((n): n is SnsNeuronInfo => n !== null);
      setLive((p) => ({ ...p, wtn: ok.length ? ok : null }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return live;
}
