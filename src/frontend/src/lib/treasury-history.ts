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

let actorPromise: Promise<any> | null = null;

function getActor(): Promise<any> | null {
  if (actorPromise) return actorPromise;

  const id =
    (import.meta as any).env?.CANISTER_BACKEND_CANISTER_ID ??
    (import.meta as any).env?.VITE_BACKEND_CANISTER_ID ??
    null;
  if (!id || id === "undefined") return null;

  actorPromise = HttpAgent.create({ host: "https://icp-api.io" }).then(
    (agent) => Actor.createActor(idlFactory, { agent, canisterId: id }),
  );
  return actorPromise;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export async function hasSnapshot(date: string): Promise<boolean> {
  try {
    const p = getActor();
    if (!p) return false;
    const a = await p;
    return (await a.hasSnapshot(date)) as boolean;
  } catch {
    return false;
  }
}

export async function saveSnapshot(
  data: Omit<TreasurySnapshot, "date" | "timestamp">,
): Promise<boolean> {
  try {
    const p = getActor();
    if (!p) return false;
    const a = await p;
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
    const p = getActor();
    if (!p) return [];
    const a = await p;
    return (await a.getTreasuryHistory()) as TreasurySnapshot[];
  } catch {
    return [];
  }
}
