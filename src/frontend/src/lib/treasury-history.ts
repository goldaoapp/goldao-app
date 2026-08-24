/**
 * Treasury history — on-chain persistence for daily snapshots.
 *
 * Standalone Actor (no bindgen dependency). Three functions:
 *   hasSnapshot(date) → bool     — cheap query, check before saving
 *   saveSnapshot(data) → bool    — write-once per day, canister rejects dupes
 *   getHistory() → Snapshot[]    — full history sorted by date
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface TreasurySnapshot {
  date: string;
  icp_amount: number;
  icp_usd: number;
  ogy_amount: number;
  ogy_usd: number;
  wtn_amount: number;
  wtn_usd: number;
  total_usd: number;
  timestamp: bigint;
}

/* ── IDL (only treasury methods) ─────────────────────────────────────────── */

const idlFactory = (({ IDL }: { IDL: typeof IDLType }) => {
  const Snapshot = IDL.Record({
    date: IDL.Text,
    icp_amount: IDL.Float64,
    icp_usd: IDL.Float64,
    ogy_amount: IDL.Float64,
    ogy_usd: IDL.Float64,
    wtn_amount: IDL.Float64,
    wtn_usd: IDL.Float64,
    total_usd: IDL.Float64,
    timestamp: IDL.Nat64,
  });
  return IDL.Service({
    hasSnapshot: IDL.Func([IDL.Text], [IDL.Bool], ["query"]),
    saveTreasurySnapshot: IDL.Func([Snapshot], [IDL.Bool], []),
    getTreasuryHistory: IDL.Func([], [IDL.Vec(Snapshot)], ["query"]),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/* ── Actor singleton ─────────────────────────────────────────────────────── */

let actorPromise: Promise<any | null> | null = null;

// Resolve the backend canister id the SAME way the rest of the app does:
// build-time process.env (vite-plugin-environment, prefix CANISTER_), then the
// runtime env.json served next to the SPA. import.meta.env never carries the
// CANISTER_ vars, so the previous lookup was always undefined.
async function resolveCanisterId(): Promise<string | null> {
  const fromEnv = process.env.CANISTER_ID_BACKEND;
  if (fromEnv && fromEnv !== "undefined") return fromEnv;

  try {
    const base = document.baseURI.endsWith("/")
      ? document.baseURI
      : `${document.baseURI}/`;
    const res = await fetch(`${base}env.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const cfg = await res.json();
    const id = cfg?.backend_canister_id;
    return id && id !== "undefined" ? id : null;
  } catch {
    return null;
  }
}

function getActor(): Promise<any | null> {
  if (actorPromise) return actorPromise;

  actorPromise = (async () => {
    const id = await resolveCanisterId();
    if (!id) return null;
    const agent = await HttpAgent.create({ host: "https://icp-api.io" });
    return Actor.createActor(idlFactory, { agent, canisterId: id });
  })().then((actor) => {
    if (!actor) actorPromise = null; // failed to resolve — allow retry next call
    return actor;
  });

  return actorPromise;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export async function hasSnapshot(date: string): Promise<boolean> {
  try {
    const a = await getActor();
    if (!a) return false;
    return (await a.hasSnapshot(date)) as boolean;
  } catch {
    return false;
  }
}

export async function saveSnapshot(
  data: Omit<TreasurySnapshot, "date" | "timestamp">,
): Promise<boolean> {
  try {
    const a = await getActor();
    if (!a) return false;
    const snapshot: TreasurySnapshot = {
      ...data,
      date: new Date().toISOString().slice(0, 10),
      timestamp: BigInt(Date.now()),
    };
    return (await a.saveTreasurySnapshot(snapshot)) as boolean;
  } catch {
    return false;
  }
}

export async function getHistory(): Promise<TreasurySnapshot[]> {
  try {
    const a = await getActor();
    if (!a) return [];
    return (await a.getTreasuryHistory()) as TreasurySnapshot[];
  } catch {
    return [];
  }
}
