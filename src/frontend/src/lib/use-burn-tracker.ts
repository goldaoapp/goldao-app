/**
 * Real-time GOLDAO burn tracker.
 *
 * Polls icrc1_total_supply every 5 s straight from the ledger. Any drop in
 * supply is GOLDAO burned (explicit burns + the 10 GOLDAO fee of every
 * transfer/approve), so no transaction scanning is needed. The indexer is
 * only used for the "Last burn" label (explicit burn blocks).
 */

import {
  GOLDAO_ORIGINAL_SUPPLY,
  type LastBurn,
  fetchLastBurn,
  fetchTotalSupply,
} from "@/lib/goldao-ledger";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 5_000;
const LAST_BURN_REFRESH_MS = 60_000;
const ANIM_MS = 1_500;

export interface BurnPulse {
  id: number;
  amount: number;
  source: "last-burn" | "live";
}

export interface BurnTracker {
  /** Real burned total (whole GOLDAO) */
  burned: number | null;
  /** Animated value, use this for the bar and the counter */
  displayBurned: number | null;
  supply: number | null;
  original: number;
  lastBurn: LastBurn | null;
  /** Latest burn event to animate; id changes on every new event */
  pulse: BurnPulse | null;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function useBurnTracker(): BurnTracker {
  const [burned, setBurned] = useState<number | null>(null);
  const [displayBurned, setDisplayBurned] = useState<number | null>(null);
  const [supply, setSupply] = useState<number | null>(null);
  const [lastBurn, setLastBurn] = useState<LastBurn | null>(null);
  const [pulse, setPulse] = useState<BurnPulse | null>(null);

  const displayRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pulseId = useRef(0);

  function animateTo(target: number, from?: number) {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const start = from ?? displayRef.current ?? target;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ANIM_MS);
      const v = start + (target - start) * easeOut(t);
      displayRef.current = v;
      setDisplayBurned(v);
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function emitPulse(amount: number, source: BurnPulse["source"]) {
    pulseId.current += 1;
    setPulse({ id: pulseId.current, amount, source });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only polling loop
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let lbTimer: ReturnType<typeof setInterval> | null = null;
    let lastSupply: number | null = null;

    async function refreshLastBurn() {
      const lb = await fetchLastBurn();
      if (!cancelled && lb) {
        setLastBurn((prev) => (prev?.index === lb.index ? prev : lb));
      }
    }

    async function poll() {
      const s = await fetchTotalSupply();
      if (cancelled) return;
      if (s !== null && lastSupply !== null && s !== lastSupply) {
        const delta = lastSupply - s;
        const b = GOLDAO_ORIGINAL_SUPPLY - s;
        setSupply(s);
        setBurned(b);
        if (delta > 0) {
          animateTo(b);
          emitPulse(delta, "live");
          void refreshLastBurn();
        } else {
          // mint: supply grew, jump without burn animation
          displayRef.current = b;
          setDisplayBurned(b);
        }
      }
      if (s !== null) lastSupply = s;
      pollTimer = setTimeout(poll, POLL_MS);
    }

    async function init() {
      const [s, lb] = await Promise.all([fetchTotalSupply(), fetchLastBurn()]);
      if (cancelled) return;
      if (s !== null) {
        const b = GOLDAO_ORIGINAL_SUPPLY - s;
        lastSupply = s;
        setSupply(s);
        setBurned(b);
        if (lb && lb.amount > 0 && lb.amount <= b) {
          // Startup: replay only the last burn
          displayRef.current = b - lb.amount;
          setDisplayBurned(b - lb.amount);
          animateTo(b, b - lb.amount);
          emitPulse(lb.amount, "last-burn");
        } else {
          displayRef.current = b;
          setDisplayBurned(b);
        }
      }
      if (lb) setLastBurn(lb);
      pollTimer = setTimeout(poll, POLL_MS);
      lbTimer = setInterval(refreshLastBurn, LAST_BURN_REFRESH_MS);
    }

    void init();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (lbTimer) clearInterval(lbTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    burned,
    displayBurned,
    supply,
    original: GOLDAO_ORIGINAL_SUPPLY,
    lastBurn,
    pulse,
  };
}
