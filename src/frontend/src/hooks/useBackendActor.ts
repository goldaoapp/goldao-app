// Construye el actor bindgen del backend firmado con la identidad de II.
// Resuelve el canister id igual que lib/treasury-history.ts: primero
// process.env.CANISTER_ID_BACKEND, luego el /env.json inyectado en deploy.

import { useInternetIdentity } from "@/lib/internet-identity";
import { HttpAgent } from "@icp-sdk/core/agent";
import { useEffect, useRef, useState } from "react";
import { type Backend, type ExternalBlob, createActor } from "../backend";

interface EnvConfig {
  backend_canister_id?: string;
  backend_host?: string;
}

let envPromise: Promise<EnvConfig> | null = null;

async function loadEnv(): Promise<EnvConfig> {
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

export function useBackendActor() {
  const { identity } = useInternetIdentity();
  const [actor, setActor] = useState<Backend | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const builtForRef = useRef<string | null>(null);
  const actorRef = useRef<Backend | null>(null);

  useEffect(() => {
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

        const identityKey = identity
          ? (() => {
              try {
                return identity.getPrincipal().toString();
              } catch {
                return "anon";
              }
            })()
          : "anon";

        if (builtForRef.current === identityKey && actorRef.current !== null) {
          if (!cancelled) setIsFetching(false);
          return;
        }

        const agent = HttpAgent.createSync({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          identity: identity as any,
          host: isLocal ? "http://localhost:4943" : "https://icp-api.io",
          // El canister corre en una subnet EcdsaP256 que el SDK v5 no verifica
          // bien en queries. La seguridad real viene de las update calls con
          // consenso y del sistema de roles del canister.
          verifyQuerySignatures: false,
        });

        if (isLocal) {
          await agent.fetchRootKey().catch(() => {});
        }

        // GOLDAO no usa blobs por el actor; los callbacks son posicionales
        // pero nunca se invocan.
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
          builtForRef.current = identityKey;
          actorRef.current = newActor;
          setActor(newActor);
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
  }, [identity]);

  return { actor, isFetching };
}
