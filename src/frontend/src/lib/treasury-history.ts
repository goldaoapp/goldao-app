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

// Runtime config served at the site root. caffeine injects the real ids here at
// deploy time; the repo copy ships every field as "undefined".
async function readEnvJson(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${location.origin}/env.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, string>;
  } catch {
    return null;
  }
}

// Resolve the backend canister id: build-time env first, then the runtime
// env.json at the site root. NOTE: the id must be the BACKEND (motoko) canister,
// not the frontend asset canister that serves the page.
async function resolveCanisterId(): Promise<string | null> {
  const fromEnv = process.env.CANISTER_ID_BACKEND;
  if (fromEnv && fromEnv !== "undefined") return fromEnv;

  const cfg = await readEnvJson();
  const id = cfg?.backend_canister_id;
  return id && id !== "undefined" ? id : null;
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

/** Diagnostic only: the backend canister id currently resolved, or null. */
export async function getCanisterId(): Promise<string | null> {
  return resolveCanisterId();
}

/** Diagnostic only: raw backend_canister_id from the runtime env.json.
 *  Returns the literal value (including "undefined") so the UI can show
 *  exactly what the deployment injected, or null if env.json is unreachable. */
export async function getEnvJsonCanisterId(): Promise<string | null> {
  const cfg = await readEnvJson();
  return cfg?.backend_canister_id ?? null;
}
