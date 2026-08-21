/**
 * Shared hook: fetches live market data and GOLDAO parameters.
 * Returns the latest values + a flash set for visual feedback.
 *
 * Used by FairValuePage (form sync) and HomePage (display only).
 * All fetch logic lives here — consumers never call APIs directly.
 */

import {
  API,
  type DissolveGroup,
  type OGYNeuronResponse,
  POLL,
  POOLS,
  type SNSProposalsResponse,
} from "@/lib/api";
import type { FairValueParams } from "@/lib/fairvalue-calc";
import { getPoolRatio } from "@/lib/icpswap-quote";
import { useEffect, useRef, useState } from "react";

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
  /** Total WTN across 3 neurons (stake + maturity) */
  wtnTotal: number | null;
  /** WTN value in ICP (wtnTotal / wtnPerIcp) */
  wtnIcp: number | null;
  /** Current GOLDAO supply */
  supply: number | null;
  /** Total GOLDAO burned (1B - supply) */
  totalBurned: number | null;
}

export interface LiveData {
  /** Latest values fetched from APIs (subset of FairValueParams) */
  params: Partial<FairValueParams>;
  /** Keys that were updated in the last 1.5 s (for flash animation) */
  flash: Set<string>;
  /** Non-calculation stats (members, proposals, supply) */
  extra: LiveExtra;
}

export function useLiveData(): LiveData {
  const [params, setParams] = useState<Partial<FairValueParams>>({});
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<LiveExtra>({
    members: null,
    proposalsActive: null,
    proposalsTotal: null,
    wtnTotal: null,
    wtnIcp: null,
    supply: null,
    totalBurned: null,
  });
  const icpswapRef = useRef<{
    ogyPerIcp: number | null;
    wtnPerIcp: number | null;
    wtnTotal: number | null;
    icpUsd: number | null;
  }>({ ogyPerIcp: null, wtnPerIcp: null, wtnTotal: null, icpUsd: null });

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

    // ── SLOW: ICPSwap pool quotes via Candid (~0.5 KB each, every 120 s) ──
    async function fetchPoolQuotes() {
      // GOLDAO/ICP ratio
      const goldaoRatio = await getPoolRatio(
        POOLS.GOLDAO_ICP.id,
        POOLS.GOLDAO_ICP.zeroForOne,
      );
      apply("market_ratio", goldaoRatio);

      // OGY/ICP ratio (for OGY price derivation)
      const ogyRatio = await getPoolRatio(
        POOLS.OGY_ICP.id,
        POOLS.OGY_ICP.zeroForOne,
      );
      if (ogyRatio) {
        icpswapRef.current.ogyPerIcp = ogyRatio;
        // Derive OGY USD immediately if ICP price already available
        const icp = icpswapRef.current.icpUsd;
        if (icp !== null) {
          apply("price_ogy_usd", icp / ogyRatio);
        }
      }

      // WTN/ICP ratio
      const wtnRatio = await getPoolRatio(
        POOLS.WTN_ICP.id,
        POOLS.WTN_ICP.zeroForOne,
      );
      if (wtnRatio) {
        icpswapRef.current.wtnPerIcp = wtnRatio;
        apply("wtn_per_icp", wtnRatio);
      }

      // Recalc WTN ICP value if we have both
      const wtn = icpswapRef.current.wtnTotal;
      const wtnRate = icpswapRef.current.wtnPerIcp;
      if (wtn !== null && wtnRate !== null && wtnRate > 0) {
        setExtra((prev) => ({ ...prev, wtnIcp: wtn / wtnRate }));
      }
    }

    // ── ONE-TIME: WTN neurons (3 neurons, no polling) ──
    async function fetchWTN() {
      try {
        const results = await Promise.all(
          API.WTN_NEURONS.map(async (url) => {
            const res = await fetch(url);
            if (!res.ok) return 0;
            const data: OGYNeuronResponse = await res.json();
            return (data.stake_e8s + data.total_maturity_e8s_equivalent) / 1e8;
          }),
        );
        const total = Math.round(results.reduce((a, b) => a + b, 0));
        icpswapRef.current.wtnTotal = total;
        setExtra((prev) => ({ ...prev, wtnTotal: total }));
        apply("wtn_total", total);
        // Calc ICP value if price already available
        const wtnRate = icpswapRef.current.wtnPerIcp;
        if (wtnRate !== null && wtnRate > 0) {
          apply("wtn_per_icp", wtnRate);
          setExtra((prev) => ({ ...prev, wtnIcp: total / wtnRate }));
        }
      } catch (_) {
        /* default */
      }
    }

    // ── ONE-TIME: GOLDAO supply (no polling) ──
    const ORIGINAL_SUPPLY = 1_000_000_000;
    async function fetchSupply() {
      try {
        const res = await fetch(API.GOLDAO_SNS_INFO);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { total_supply_e8s: number } = await res.json();
        const supply = Math.round(data.total_supply_e8s / 1e8);
        const burned = ORIGINAL_SUPPLY - supply;
        setExtra((prev) => ({ ...prev, supply, totalBurned: burned }));
      } catch (_) {
        /* default */
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

      // 2 — ICP price USD (Binance + Coinbase)
      let binanceIcp: number | null = null;
      let coinbaseIcp: number | null = null;

      try {
        const res = await fetch(API.BINANCE);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { price: string } = await res.json();
        binanceIcp = validNum(Number.parseFloat(data.price));
      } catch (_) {
        /* fallback */
      }

      try {
        const res = await fetch(API.COINBASE_ICP);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { data: { amount: string } } = await res.json();
        coinbaseIcp = validNum(Number.parseFloat(data.data.amount));
      } catch (_) {
        /* fallback */
      }

      const icpUsd = avg(binanceIcp, coinbaseIcp);
      icpswapRef.current.icpUsd = icpUsd;
      apply("price_icp_usd", icpUsd);

      // 3 — OGY price (ICPSwap-derived: OGY/ICP × ICP/USD)
      let icpswapOgyUsd: number | null = null;
      const ogyPerIcp = icpswapRef.current.ogyPerIcp;
      if (ogyPerIcp !== null && icpUsd !== null) {
        icpswapOgyUsd = icpUsd / ogyPerIcp;
      }
      apply("price_ogy_usd", icpswapOgyUsd);

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
        if (res.ok) {
          const body = await res.json();
          const proposals: SNSProposalsResponse["data"] = Array.isArray(body)
            ? body
            : (body.data ?? []);
          if (proposals.length > 0) {
            const total = Math.max(...proposals.map((p) => Number(p.id)));
            const active = proposals.filter(
              (p) => p.decided_timestamp_seconds === 0,
            ).length;
            setExtra((prev) => ({
              ...prev,
              proposalsActive: active,
              proposalsTotal: total,
            }));
          }
        }
      } catch (_) {
        /* default */
      }
    }

    // Initial fetch: all (WTN + supply only once)
    fetchPoolQuotes();
    fetchLight();
    fetchWTN();
    fetchSupply();

    const fastId = setInterval(fetchLight, POLL.FAST);
    const slowId = setInterval(fetchPoolQuotes, POLL.SLOW);
    return () => {
      cancelled = true;
      clearInterval(fastId);
      clearInterval(slowId);
    };
  }, []);

  return { params, flash, extra };
}
