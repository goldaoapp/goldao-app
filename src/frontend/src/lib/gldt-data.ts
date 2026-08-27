/**
 * GLDT token live data.
 *
 * Pulls, in parallel and independently (a failing source never breaks the rest):
 *  - GLDT ledger (ICRC-1, on-chain)      -> total supply, decimals, fee, symbol
 *  - ICPSwap NodeIndex getAllPools       -> USD price, 24h/7d/total volume, TVL, fees
 *  - Coinbase spot                       -> ICP/USD (for the GLDT/ICP figure)
 *  - gold-api.com (CORS, no key)         -> gold spot USD/oz
 *
 * Then derives gold-backing and premium/discount metrics.
 *
 * GLDT peg: 1 GLDT = 0.01 g of gold  (100 GLDT = 1 g).
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";
import { useQuery } from "@tanstack/react-query";

/* ── Constants ───────────────────────────────────────────────────────────── */

export const GLDT_LEDGER_ID = "6c7su-kiaaa-aaaar-qaira-cai";
export const GLDT_POOL_ID = "4omhz-yiaaa-aaaag-qnalq-cai";
const ICPSWAP_NODE_INDEX_ID = "ggzvv-5qaaa-aaaag-qck7a-cai";
const IC_HOST = "https://icp-api.io";

const GLDT_PER_GRAM = 100; // 1 g gold = 100 GLDT
const TROY_OZ_G = 31.1034768;

/* ── Shared anonymous agent ──────────────────────────────────────────────── */

let agentPromise: Promise<HttpAgent> | null = null;
function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) agentPromise = HttpAgent.create({ host: IC_HOST });
  return agentPromise;
}

/* ── IDL factories ───────────────────────────────────────────────────────── */

const ledgerIdl = (({ IDL }: { IDL: typeof IDLType }) =>
  IDL.Service({
    icrc1_total_supply: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_decimals: IDL.Func([], [IDL.Nat8], ["query"]),
    icrc1_fee: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_name: IDL.Func([], [IDL.Text], ["query"]),
  })) as unknown as Parameters<typeof Actor.createActor>[0];

// Only the fields we consume. Candid record subtyping lets the client declare a
// subset; unknown fields on the wire are skipped by the decoder.
const nodeIndexIdl = (({ IDL }: { IDL: typeof IDLType }) => {
  const PublicPoolOverView = IDL.Record({
    pool: IDL.Text,
    token0Id: IDL.Text,
    token1Id: IDL.Text,
    token0Symbol: IDL.Text,
    token1Symbol: IDL.Text,
    token0Price: IDL.Float64,
    token1Price: IDL.Float64,
    volumeUSD: IDL.Float64,
    volumeUSD7d: IDL.Float64,
    totalVolumeUSD: IDL.Float64,
    feesUSD: IDL.Float64,
    txCount: IDL.Nat,
    liquidity: IDL.Nat,
  });
  return IDL.Service({
    getAllPools: IDL.Func([], [IDL.Vec(PublicPoolOverView)], ["query"]),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/* ── Individual fetchers ─────────────────────────────────────────────────── */

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

  const d = Number(decimals);
  const div = 10 ** d;
  return {
    symbol,
    name,
    decimals: d,
    fee: Number(fee) / div,
    totalSupply: Number(supply) / div,
  };
}

interface PoolStats {
  priceUsd: number;
  volume24hUsd: number;
  volume7dUsd: number;
  totalVolumeUsd: number;
  feesUsd: number;
  txCount: number;
  liquidity: number;
  token0Symbol: string;
  token1Symbol: string;
}

interface PoolRow {
  pool: string;
  token0Id: string;
  token1Id: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Price: number;
  token1Price: number;
  volumeUSD: number;
  volumeUSD7d: number;
  totalVolumeUSD: number;
  feesUSD: number;
  txCount: bigint;
  liquidity: bigint;
}

async function fetchPool(): Promise<PoolStats> {
  const agent = await getAgent();
  const actor = Actor.createActor(nodeIndexIdl, {
    agent,
    canisterId: ICPSWAP_NODE_INDEX_ID,
  });
  const pools = (await actor.getAllPools()) as PoolRow[];
  const row = pools.find((p) => p.pool === GLDT_POOL_ID);
  if (!row) throw new Error("GLDT pool not found in ICPSwap index");

  // token0Price / token1Price are USD prices per token. Pick GLDT's side.
  const gldtIsToken0 =
    row.token0Id === GLDT_LEDGER_ID ||
    row.token0Symbol.toUpperCase() === "GLDT";
  const priceUsd = gldtIsToken0 ? row.token0Price : row.token1Price;

  return {
    priceUsd,
    volume24hUsd: row.volumeUSD,
    volume7dUsd: row.volumeUSD7d,
    totalVolumeUsd: row.totalVolumeUSD,
    feesUsd: row.feesUSD,
    txCount: Number(row.txCount),
    liquidity: Number(row.liquidity),
    token0Symbol: row.token0Symbol,
    token1Symbol: row.token1Symbol,
  };
}

async function fetchIcpUsd(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/ICP-USD/spot");
  if (!res.ok) throw new Error("ICP price fetch failed");
  const json = (await res.json()) as { data?: { amount?: string } };
  const v = Number(json.data?.amount);
  if (!Number.isFinite(v) || v <= 0) throw new Error("ICP price invalid");
  return v;
}

async function fetchGoldOzUsd(): Promise<number> {
  // gold-api.com: free, CORS-enabled, no key. Price per troy ounce, USD.
  const res = await fetch("https://api.gold-api.com/price/XAU");
  if (!res.ok) throw new Error("Gold price fetch failed");
  const json = (await res.json()) as { price?: number };
  const v = Number(json.price);
  if (!Number.isFinite(v) || v <= 0) throw new Error("Gold price invalid");
  return v;
}

/* ── Aggregated shape ────────────────────────────────────────────────────── */

export interface GldtData {
  // ledger (on-chain)
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  transferFee: number | null;
  totalSupply: number | null;
  // market (ICPSwap)
  priceUsd: number | null;
  priceIcp: number | null;
  icpUsd: number | null;
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  totalVolumeUsd: number | null;
  feesUsd: number | null;
  txCount: number | null;
  liquidity: number | null;
  pair: string | null;
  marketCapUsd: number | null;
  // gold
  goldSpotOzUsd: number | null;
  goldGramsBacked: number | null;
  goldOzBacked: number | null;
  backingValueUsd: number | null;
  impliedGoldOzUsd: number | null; // gold price implied by the GLDT market price
  intrinsicPerGldtUsd: number | null; // gold value of the 0.01 g behind 1 GLDT
  premiumPct: number | null; // GLDT market price vs its intrinsic gold value
  // meta
  fetchedAt: number;
}

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
}

async function fetchGldtData(): Promise<GldtData> {
  const [ledgerR, poolR, icpR, goldR] = await Promise.allSettled([
    fetchLedger(),
    fetchPool(),
    fetchIcpUsd(),
    fetchGoldOzUsd(),
  ]);

  const ledger = ledgerR.status === "fulfilled" ? ledgerR.value : null;
  const pool = poolR.status === "fulfilled" ? poolR.value : null;
  const icpUsd = icpR.status === "fulfilled" ? icpR.value : null;
  const goldOz = goldR.status === "fulfilled" ? goldR.value : null;

  const totalSupply = num(ledger?.totalSupply);
  const priceUsd = num(pool?.priceUsd);
  const goldSpotOzUsd = num(goldOz);

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
    volume24hUsd: num(pool?.volume24hUsd),
    volume7dUsd: num(pool?.volume7dUsd),
    totalVolumeUsd: num(pool?.totalVolumeUsd),
    feesUsd: num(pool?.feesUsd),
    txCount: num(pool?.txCount),
    liquidity: num(pool?.liquidity),
    pair: pool ? `${pool.token0Symbol}/${pool.token1Symbol}` : null,
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
