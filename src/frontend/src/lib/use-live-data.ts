/**
 * Shared hook: fetches live market data and GOLDAO parameters.
 * Returns the latest values + a flash set for visual feedback.
 *
 * Used by FairValuePage (form sync) and HomePage (display only).
 * All fetch logic lives here — consumers never call APIs directly.
 */

import { useEffect, useRef, useState } from "react";
import type { FairValueParams } from "@/lib/fairvalue-calc";
import {
  API,
  POOLS,
  POLL,
  type DissolveGroup,
  type ICPSwapTicker,
  type OGYNeuronResponse,
  type SNSProposalsResponse,
} from "@/lib/api";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function validNum(v: number | undefined | null): number | null {
  if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) return v;
  return null;
}

function avg(a: number | null, b: number | null): number | null {
  if (a !== null && b !== null) return (a + b) / 2;
  return a ?? b;
}

/** Round live values for display */
const DECIMALS: Partial<Record<keyof FairValueParams, number>> = {
  price_icp_usd: 3,
  price_ogy_usd: 6,
  market_ratio: 1,
};

function round(key: keyof FairValueParams, val: number): number {
  const d = DECIMALS[key];
  return d !== undefined ? Number(val.toFixed(d)) : val;
}

/* ── Public interface ────────────────────────────────────────────────────── */

export interface LiveExtra {
  members: number | null;
  proposalsActive: number | null;
  proposalsTotal: number | null;
}

export interface LiveData {
  /** Latest values fetched from APIs (subset of FairValueParams) */
  params: Partial<FairValueParams>;
  /** Keys that were updated in the last 1.5 s (for flash animation) */
  flash: Set<string>;
  /** Non-calculation stats (members, proposals) */
  extra: LiveExtra;
}

export function useLiveData(): LiveData {
  const [params, setParams] = useState<Partial<FairValueParams>>({});
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<LiveExtra>({
    members: null,
    proposalsActive: null,
    proposalsTotal: null,
  });
  const icpswapRef = useRef<{ ogyPerIcp: number | null }>({ ogyPerIcp: null });

  useEffect(() => {
    let cancelled = false;

    function triggerFlash(key: string) {
      setFlash((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setFlash((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 1500);
    }

    function apply(key: keyof FairValueParams, val: number | null) {
      if (!cancelled && val !== null && Number.isFinite(val) && val > 0) {
        const rounded = round(key, val);
        setParams((prev) => ({ ...prev, [key]: rounded }));
        triggerFlash(key);
      }
    }

    // ── SLOW: ICPSwap tickers (~700 KB, every 120 s) ──
    async function fetchICPSwap() {
      try {
        const res = await fetch(API.ICPSWAP_TICKERS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const tickers: ICPSwapTicker[] = await res.json();
        for (const t of tickers) {
          if (t.ticker_id === POOLS.GOLDAO_ICP) {
            apply("market_ratio", validNum(Number.parseFloat(t.last_price)));
          }
          if (t.ticker_id === POOLS.OGY_ICP) {
            icpswapRef.current.ogyPerIcp = validNum(
              Number.parseFloat(t.last_price),
            );
          }
        }
      } catch (_) {
        /* fallback */
      }
    }

    // ── FAST: lightweight APIs (every 30 s) ──
    async function fetchLight() {
      // 1 — Eligible GOLDAO + Members
      try {
        const res = await fetch(API.DISSOLVE);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const groups: DissolveGroup[] = await res.json();
        const max = groups.find((g) =>
          g.dissolve_delay_group.includes("max delay"),
        );
        if (max) {
          apply("goldao_eligible", Math.round(max.total_stake));
          setExtra((prev) => ({ ...prev, members: max.unique_owners }));
        }
      } catch (_) {
        /* default */
      }

      // 2 — ICP price USD (Binance + CoinGecko)
      let binanceIcp: number | null = null;
      let geckoIcp: number | null = null;
      let geckoOgy: number | null = null;

      try {
        const res = await fetch(API.BINANCE);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { price: string } = await res.json();
        binanceIcp = validNum(Number.parseFloat(data.price));
      } catch (_) {
        /* fallback */
      }

      try {
        const res = await fetch(API.COINGECKO);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Record<string, { usd?: number }> = await res.json();
        geckoIcp = validNum(data["internet-computer"]?.usd);
        geckoOgy = validNum(data["origyn-foundation"]?.usd);
      } catch (_) {
        /* fallback */
      }

      const icpUsd = avg(binanceIcp, geckoIcp);
      apply("price_icp_usd", icpUsd);

      // 3 — OGY price (CoinGecko + ICPSwap-derived)
      let icpswapOgyUsd: number | null = null;
      const ogyPerIcp = icpswapRef.current.ogyPerIcp;
      if (ogyPerIcp !== null && icpUsd !== null) {
        icpswapOgyUsd = icpUsd / ogyPerIcp;
      }
      apply("price_ogy_usd", avg(geckoOgy, icpswapOgyUsd));

      // 4 — OGY neuron (stake + maturity)
      try {
        const res = await fetch(API.OGY_NEURON);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: OGYNeuronResponse = await res.json();
        const total =
          (data.stake_e8s + data.total_maturity_e8s_equivalent) / 1e8;
        apply("ogy_staked", Math.round(total));
      } catch (_) {
        /* default */
      }

      // 5 — GOLDAO proposals (active + total)
      try {
        const res = await fetch(API.GOLDAO_PROPOSALS);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: SNSProposalsResponse = await res.json();
        const proposals = body.data ?? [];
        const active = proposals.filter(
          (p) => p.status === "Open",
        ).length;
        const total = proposals.length > 0
          ? Math.max(...proposals.map((p) => p.id))
          : 0;
        setExtra((prev) => ({
          ...prev,
          proposalsActive: active,
          proposalsTotal: total,
        }));
      } catch (_) {
        /* default */
      }
    }

    // Initial fetch: both
    fetchICPSwap();
    fetchLight();

    const fastId = setInterval(fetchLight, POLL.FAST);
    const slowId = setInterval(fetchICPSwap, POLL.SLOW);
    return () => {
      cancelled = true;
      clearInterval(fastId);
      clearInterval(slowId);
    };
  }, []);

  return { params, flash, extra };
}
