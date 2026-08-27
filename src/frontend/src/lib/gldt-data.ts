/**
 * GLDT token live data.
 *
 * Pulls, in parallel and independently (a failing source never breaks the rest):
 *  - GLDT ledger (ICRC-1, on-chain)  -> total supply, decimals, fee, symbol
 *  - GeckoTerminal (CORS, no key)    -> USD price, 24h volume, TVL, 24h change,
 *                                       trades, FDV for the GLDT/ICP pool
 *  - Coinbase spot                   -> ICP/USD (for the GLDT/ICP figure)
 *  - gold-api.com (CORS, no key)     -> gold spot USD/oz
 *
 * Price falls back to an on-chain ICPSwap pool quote if GeckoTerminal is down.
 * Then derives gold-backing and premium/discount metrics.
 *
 * GLDT peg: 1 GLDT = 0.01 g of gold  (100 GLDT = 1 g).
 * Pool 4omhz-…-cai is GLDT/ICP (both 8 decimals).
 */

import { getPoolRatio } from "@/lib/icpswap-quote";
import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";
import { useQuery } from "@tanstack/react-query";

/* ── Constants ───────────────────────────────────────────────────────────── */

export const GLDT_LEDGER_ID = "6c7su-kiaaa-aaaar-qaira-cai";
export const GLDT_POOL_ID = "4omhz-yiaaa-aaaag-qnalq-cai";
const IC_HOST = "https://icp-api.io";
const GECKO_POOL_URL = `https://api.geckoterminal.com/api/v2/networks/icp/pools/${GLDT_POOL_ID}`;

const GLDT_PER_GRAM = 100; // 1 g gold = 100 GLDT
const TROY_OZ_G = 31.1034768;

/* ── Shared anonymous agent ──────────────────────────────────────────────── */

let agentPromise: Promise<HttpAgent> | null = null;
function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) agentPromise = HttpAgent.create({ host: IC_HOST });
  return agentPromise;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ── GLDT ledger (on-chain) ──────────────────────────────────────────────── */

const ledgerIdl = (({ IDL }: { IDL: typeof IDLType }) =>
  IDL.Service({
    icrc1_total_supply: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_decimals: IDL.Func([], [IDL.Nat8], ["query"]),
    icrc1_fee: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_name: IDL.Func([], [IDL.Text], ["query"]),
  })) as unknown as Parameters<typeof Actor.createActor>[0];

interface LedgerInfo {
  symbol: string;
  name: string;
  decimals: number;
  fee: number;
  totalSupply: number;
}

async function fetchLedger(): Promise<LedgerInfo> {
  const agent = await getAgent();
  const actor = Actor.createActor(ledgerIdl, {
    agent,
    canisterId: GLDT_LEDGER_ID,
  });
  const [supply, decimals, fee, symbol, name] = (await Promise.all([
    actor.icrc1_total_supply(),
    actor.icrc1_decimals(),
    actor.icrc1_fee(),
    actor.icrc1_symbol(),
    actor.icrc1_name(),
  ])) as [bigint, number, bigint, string, string];

  const div = 10 ** Number(decimals);
  return {
    symbol,
    name,
    decimals: Number(decimals),
    fee: Number(fee) / div,
    totalSupply: Number(supply) / div,
  };
}

/* ── GeckoTerminal (market data for the GLDT/ICP pool) ───────────────────── */

interface GeckoStats {
  priceUsd: number | null;
  volume24hUsd: number | null;
  tvlUsd: number | null;
  priceChange24h: number | null;
  fdvUsd: number | null;
  trades24h: number | null;
  pair: string | null;
}

async function fetchGecko(): Promise<GeckoStats> {
  const res = await fetch(GECKO_POOL_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const json = (await res.json()) as {
    data?: { attributes?: Record<string, unknown> };
  };
  const a = json.data?.attributes ?? {};

  const name = typeof a.name === "string" ? a.name : null;
  // For the GLDT/ICP pool GLDT is the base token. Guard in case the order flips.
  const baseIsGldt = !name || name.trim().toUpperCase().startsWith("GLDT");
  const priceUsd = parseNum(
    baseIsGldt ? a.base_token_price_usd : a.quote_token_price_usd,
  );

  const vol = a.volume_usd as Record<string, unknown> | undefined;
  const chg = a.price_change_percentage as Record<string, unknown> | undefined;
  const tx = a.transactions as
    | { h24?: { buys?: number; sells?: number } }
    | undefined;
  const trades =
    tx?.h24 != null ? (num(tx.h24.buys) ?? 0) + (num(tx.h24.sells) ?? 0) : null;

  return {
    priceUsd,
    volume24hUsd: parseNum(vol?.h24),
    tvlUsd: parseNum(a.reserve_in_usd),
    priceChange24h: parseNum(chg?.h24),
    fdvUsd: parseNum(a.fdv_usd),
    trades24h: trades,
    pair: name,
  };
}

/* ── On-chain price fallback (ICPSwap pool quote) ────────────────────────── */

const poolMetaIdl = (({ IDL }: { IDL: typeof IDLType }) => {
  const Token = IDL.Record({ address: IDL.Text, standard: IDL.Text });
  return IDL.Service({
    metadata: IDL.Func(
      [],
      [
        IDL.Variant({
          ok: IDL.Record({ token0: Token, token1: Token }),
          err: IDL.Text,
        }),
      ],
      ["query"],
    ),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/** Returns GLDT price in USD from the pool quote, or null. */
async function fetchOnchainPrice(
  icpUsd: number | null,
): Promise<number | null> {
  if (!icpUsd) return null;
  try {
    const agent = await getAgent();
    const actor = Actor.createActor(poolMetaIdl, {
      agent,
      canisterId: GLDT_POOL_ID,
    });
    const meta = (await actor.metadata()) as
      | { ok: { token0: { address: string }; token1: { address: string } } }
      | { err: string };
    if (!("ok" in meta)) return null;

    // Quote GLDT -> ICP. zeroForOne = token0->token1.
    const gldtIsToken0 = meta.ok.token0.address === GLDT_LEDGER_ID;
    const icpPerGldt = await getPoolRatio(GLDT_POOL_ID, gldtIsToken0);
    return icpPerGldt != null ? icpPerGldt * icpUsd : null;
  } catch {
    return null;
  }
}

/* ── ICP + gold ──────────────────────────────────────────────────────────── */

async function fetchIcpUsd(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/ICP-USD/spot");
  if (!res.ok) throw new Error("ICP price fetch failed");
  const json = (await res.json()) as { data?: { amount?: string } };
  const v = Number(json.data?.amount);
  if (!Number.isFinite(v) || v <= 0) throw new Error("ICP price invalid");
  return v;
}

async function fetchGoldOzUsd(): Promise<number> {
  const res = await fetch("https://api.gold-api.com/price/XAU");
  if (!res.ok) throw new Error("Gold price fetch failed");
  const json = (await res.json()) as { price?: number };
  const v = Number(json.price);
  if (!Number.isFinite(v) || v <= 0) throw new Error("Gold price invalid");
  return v;
}

/* ── Aggregated shape ────────────────────────────────────────────────────── */

export interface GldtData {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  transferFee: number | null;
  totalSupply: number | null;
  // market
  priceUsd: number | null;
  priceIcp: number | null;
  icpUsd: number | null;
  priceChange24h: number | null;
  volume24hUsd: number | null;
  tvlUsd: number | null;
  trades24h: number | null;
  fdvUsd: number | null;
  pair: string | null;
  marketCapUsd: number | null;
  // gold
  goldSpotOzUsd: number | null;
  goldGramsBacked: number | null;
  goldOzBacked: number | null;
  backingValueUsd: number | null;
  impliedGoldOzUsd: number | null;
  intrinsicPerGldtUsd: number | null;
  premiumPct: number | null;
  // meta
  fetchedAt: number;
}

async function fetchGldtData(): Promise<GldtData> {
  const [ledgerR, geckoR, icpR, goldR] = await Promise.allSettled([
    fetchLedger(),
    fetchGecko(),
    fetchIcpUsd(),
    fetchGoldOzUsd(),
  ]);

  const ledger = ledgerR.status === "fulfilled" ? ledgerR.value : null;
  const gecko = geckoR.status === "fulfilled" ? geckoR.value : null;
  const icpUsd = icpR.status === "fulfilled" ? icpR.value : null;
  const goldOz = goldR.status === "fulfilled" ? goldR.value : null;

  const totalSupply = num(ledger?.totalSupply);
  const goldSpotOzUsd = num(goldOz);

  // Price: GeckoTerminal first, on-chain quote as a fallback.
  let priceUsd = num(gecko?.priceUsd);
  if (priceUsd === null) priceUsd = await fetchOnchainPrice(icpUsd);

  const marketCapUsd =
    totalSupply !== null && priceUsd !== null ? totalSupply * priceUsd : null;
  const priceIcp = priceUsd !== null && icpUsd ? priceUsd / icpUsd : null;

  const goldGramsBacked =
    totalSupply !== null ? totalSupply / GLDT_PER_GRAM : null;
  const goldOzBacked =
    goldGramsBacked !== null ? goldGramsBacked / TROY_OZ_G : null;
  const backingValueUsd =
    goldOzBacked !== null && goldSpotOzUsd !== null
      ? goldOzBacked * goldSpotOzUsd
      : null;
  const impliedGoldOzUsd =
    priceUsd !== null ? priceUsd * GLDT_PER_GRAM * TROY_OZ_G : null;
  const intrinsicPerGldtUsd =
    goldSpotOzUsd !== null ? (goldSpotOzUsd / TROY_OZ_G) * 0.01 : null;
  const premiumPct =
    priceUsd !== null && intrinsicPerGldtUsd
      ? (priceUsd / intrinsicPerGldtUsd - 1) * 100
      : null;

  return {
    symbol: ledger?.symbol ?? null,
    name: ledger?.name ?? null,
    decimals: ledger?.decimals ?? null,
    transferFee: num(ledger?.fee),
    totalSupply,
    priceUsd,
    priceIcp,
    icpUsd: num(icpUsd),
    priceChange24h: num(gecko?.priceChange24h),
    volume24hUsd: num(gecko?.volume24hUsd),
    tvlUsd: num(gecko?.tvlUsd),
    trades24h: num(gecko?.trades24h),
    fdvUsd: num(gecko?.fdvUsd),
    pair: gecko?.pair ?? null,
    marketCapUsd,
    goldSpotOzUsd,
    goldGramsBacked,
    goldOzBacked,
    backingValueUsd,
    impliedGoldOzUsd,
    intrinsicPerGldtUsd,
    premiumPct,
    fetchedAt: Date.now(),
  };
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useGldtData() {
  return useQuery({
    queryKey: ["gldt-data"],
    queryFn: fetchGldtData,
    refetchInterval: 90_000,
    staleTime: 60_000,
  });
}
