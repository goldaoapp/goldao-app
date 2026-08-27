/**
 * GLDT token live data — two independent sources for the key figures.
 *
 *  - GLDT ledger (ICRC-1, on-chain)   -> total supply, decimals, fee, symbol
 *  - GeckoTerminal token endpoint     -> AGGREGATED price, TVL and 24h volume
 *                                        across ALL GLDT pools, plus FDV.
 *                                        (Same data ICPSwap's token page shows.)
 *  - ICPSwap on-chain quote           -> a second, independent price, taken from
 *                                        the deepest pool GLDT/ckUSDT (stable
 *                                        pair, so it reads directly in USD).
 *  - Coinbase spot                    -> ICP/USD (for the GLDT/ICP figure)
 *  - gold-api.com                     -> gold spot USD/oz
 *
 * The canonical price used for derived metrics is the GeckoTerminal aggregate
 * (representative across pools), falling back to the on-chain quote.
 *
 * GLDT peg: 1 GLDT = 0.01 g of gold  (100 GLDT = 1 g).
 */

import { getPoolQuote } from "@/lib/icpswap-quote";
import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";
import { useQuery } from "@tanstack/react-query";

/* ── Constants ───────────────────────────────────────────────────────────── */

export const GLDT_LEDGER_ID = "6c7su-kiaaa-aaaar-qaira-cai";
// Deepest GLDT pool on ICPSwap (GLDT/ckUSDT). Used for the on-chain price.
export const GLDT_USDT_POOL_ID = "4jnbn-vqaaa-aaaag-qnala-cai";
const IC_HOST = "https://icp-api.io";
const GECKO_TOKEN_URL = `https://api.geckoterminal.com/api/v2/networks/icp/tokens/${GLDT_LEDGER_ID}`;

const GLDT_PER_GRAM = 100; // 1 g gold = 100 GLDT
const TROY_OZ_G = 31.1034768;

/* ── Shared anonymous agent ──────────────────────────────────────────────── */

let agentPromise: Promise<HttpAgent> | null = null;
function getAgent(): Promise<HttpAgent> {
  if (!agentPromise) agentPromise = HttpAgent.create({ host: IC_HOST });
  return agentPromise;
}

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

const decimalsIdl = (({ IDL }: { IDL: typeof IDLType }) =>
  IDL.Service({
    icrc1_decimals: IDL.Func([], [IDL.Nat8], ["query"]),
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

async function fetchTokenDecimals(canisterId: string): Promise<number> {
  const agent = await getAgent();
  const actor = Actor.createActor(decimalsIdl, { agent, canisterId });
  return Number((await actor.icrc1_decimals()) as number);
}

/* ── GeckoTerminal token endpoint (aggregated across all GLDT pools) ─────── */

interface GeckoToken {
  priceUsd: number | null;
  tvlTotalUsd: number | null; // reserve summed across all pools
  volume24hUsd: number | null; // volume summed across all pools
  fdvUsd: number | null;
}

async function fetchGeckoToken(): Promise<GeckoToken> {
  const res = await fetch(GECKO_TOKEN_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const json = (await res.json()) as {
    data?: { attributes?: Record<string, unknown> };
  };
  const a = json.data?.attributes ?? {};
  const vol = a.volume_usd as Record<string, unknown> | undefined;
  return {
    priceUsd: parseNum(a.price_usd),
    tvlTotalUsd: parseNum(a.total_reserve_in_usd),
    volume24hUsd: parseNum(vol?.h24),
    fdvUsd: parseNum(a.fdv_usd),
  };
}

/* ── ICPSwap on-chain price (deepest pool, GLDT/ckUSDT ≈ USD) ─────────────── */

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

async function fetchOnchainPriceUsd(): Promise<number | null> {
  try {
    const agent = await getAgent();
    const pool = Actor.createActor(poolMetaIdl, {
      agent,
      canisterId: GLDT_USDT_POOL_ID,
    });
    const meta = (await pool.metadata()) as
      | { ok: { token0: { address: string }; token1: { address: string } } }
      | { err: string };
    if (!("ok" in meta)) return null;

    const gldtIsToken0 = meta.ok.token0.address === GLDT_LEDGER_ID;
    const quoteTokenId = gldtIsToken0
      ? meta.ok.token1.address
      : meta.ok.token0.address;
    const quoteDecimals = await fetchTokenDecimals(quoteTokenId);

    // Quote 1 GLDT (1e8 units) -> ckUSDT. zeroForOne = token0 -> token1.
    const out = await getPoolQuote(
      GLDT_USDT_POOL_ID,
      "100000000",
      gldtIsToken0,
    );
    if (out === null) return null;
    return Number(out) / 10 ** quoteDecimals; // ckUSDT ≈ USD
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
  // market — two price sources + aggregated figures
  priceUsd: number | null; // canonical (gecko aggregate, else on-chain)
  priceUsdGecko: number | null;
  priceUsdOnchain: number | null;
  priceIcp: number | null;
  icpUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  tvlTotalUsd: number | null;
  volume24hUsd: number | null;
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
  const [ledgerR, geckoR, onchainR, icpR, goldR] = await Promise.allSettled([
    fetchLedger(),
    fetchGeckoToken(),
    fetchOnchainPriceUsd(),
    fetchIcpUsd(),
    fetchGoldOzUsd(),
  ]);

  const ledger = ledgerR.status === "fulfilled" ? ledgerR.value : null;
  const gecko = geckoR.status === "fulfilled" ? geckoR.value : null;
  const onchainPrice = onchainR.status === "fulfilled" ? onchainR.value : null;
  const icpUsd = icpR.status === "fulfilled" ? icpR.value : null;
  const goldOz = goldR.status === "fulfilled" ? goldR.value : null;

  const totalSupply = num(ledger?.totalSupply);
  const goldSpotOzUsd = num(goldOz);

  const priceUsdGecko = num(gecko?.priceUsd);
  const priceUsdOnchain = num(onchainPrice);
  const priceUsd = priceUsdGecko ?? priceUsdOnchain;

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
    priceUsdGecko,
    priceUsdOnchain,
    priceIcp,
    icpUsd: num(icpUsd),
    marketCapUsd,
    fdvUsd: num(gecko?.fdvUsd),
    tvlTotalUsd: num(gecko?.tvlTotalUsd),
    volume24hUsd: num(gecko?.volume24hUsd),
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
