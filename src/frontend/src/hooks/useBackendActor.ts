// Builds the bindgen backend actor signed with the Internet Identity identity.
// Resolves the canister id like lib/treasury-history.ts: first
// process.env.CANISTER_ID_BACKEND, then the /env.json injected at deploy time.

import { useInternetIdentity } from "@/lib/internet-identity";
import { HttpAgent, type Identity } from "@icp-sdk/core/agent";
import { useEffect, useRef, useState } from "react";
import { type Backend, type ExternalBlob, createActor } from "../backend";

interface EnvConfig {
  backend_canister_id?: string;
  backend_host?: string;
}

let envPromise: Promise<EnvConfig> | null = null;

export async function loadEnv(): Promise<EnvConfig> {
  const canisterId = process.env.CANISTER_ID_BACKEND as string | undefined;
  const network = process.env.DFX_NETWORK as string | undefined;
  if (canisterId && canisterId !== "undefined")
    return { backend_canister_id: canisterId, backend_host: network };

  if (!envPromise) {
    envPromise = fetch(`${location.origin}/env.json`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<EnvConfig>) : {}))
      .catch(() => ({}) as EnvConfig);
  }
  return envPromise;
}

interface Built {
  /** Principal the actor was built for ("anon" without a session). */
  key: string;
  actor: Backend;
}

function identityKey(identity: Identity | null): string {
  if (!identity) return "anon";
  try {
    return identity.getPrincipal().toString();
  } catch {
    return "anon";
  }
}

/**
 * The actor is only handed out while it belongs to the current identity. After a login or a
 * reload the principal is known a moment before the signed actor is ready; in that gap the
 * actor is null, so no query can go out with the anonymous actor under the new principal.
 */
export function useBackendActor() {
  const { identity } = useInternetIdentity();
  const key = identityKey(identity);
  const [built, setBuilt] = useState<Built | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const builtRef = useRef<Built | null>(null);

  useEffect(() => {
    if (builtRef.current?.key === key) {
      setIsFetching(false);
      return;
    }
    let cancelled = false;

    async function build() {
      setIsFetching(true);
      try {
        const env = await loadEnv();
        const canisterId = env.backend_canister_id ?? "";
        const network = env.backend_host ?? "ic";
        const isLocal = network === "local";

        if (!canisterId || canisterId === "undefined") {
          if (!cancelled) setIsFetching(false);
          return;
        }

        const agent = HttpAgent.createSync({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          identity: identity as any,
          host: isLocal ? "http://localhost:4943" : "https://icp-api.io",
          // The canister runs on an EcdsaP256 subnet that SDK v5 does not verify
          // well on queries. Real security comes from update calls (which go
          // through consensus) and from the canister role system.
          verifyQuerySignatures: false,
        });

        if (isLocal) {
          await agent.fetchRootKey().catch(() => {});
        }

        // GOLDAO does not use blobs through the actor; the callbacks are
        // positional but are never called.
        const uploadFile = async (_f: ExternalBlob): Promise<Uint8Array> => {
          throw new Error("Blob upload not supported.");
        };
        const downloadFile = async (_b: Uint8Array): Promise<ExternalBlob> => {
          throw new Error("Blob download not supported.");
        };

        const newActor = createActor(canisterId, uploadFile, downloadFile, {
          agent,
        });

        if (!cancelled) {
          const next: Built = { key, actor: newActor };
          builtRef.current = next;
          setBuilt(next);
          setIsFetching(false);
        }
      } catch {
        if (!cancelled) setIsFetching(false);
      }
    }

    void build();
    return () => {
      cancelled = true;
    };
  }, [identity, key]);

  return { actor: built?.key === key ? built.actor : null, isFetching };
}
