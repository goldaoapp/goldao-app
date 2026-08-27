// Proveedor de Internet Identity para GOLDAO usando @icp-sdk/auth v7.
// Expone { isAuthenticated, isInitializing, isLoggingIn, login, clear, identity }.
//
// Notas de la API v7 (distinta a @dfinity/auth-client):
//  - se importa desde "@icp-sdk/auth/client" (el módulo raíz lanza error a propósito)
//  - se instancia con `new AuthClient(opts)` (no hay `create()` estático)
//  - `identityProvider` y `derivationOrigin` se fijan en el constructor
//  - `signIn()/signOut()` en vez de `login()/logout()`, con Promises (sin callbacks)
//  - `getIdentity()` es async; `isAuthenticated()` es sync
//  - `openIdProvider` ('google'|'apple'|'microsoft') permite login directo.

import { AuthClient, type OpenIdProvider } from "@icp-sdk/auth/client";
import type { Identity } from "@icp-sdk/core/agent";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// authorize de II: lo resuelve vite.config.js (process.env.II_URL) según
// DFX_NETWORK; fallback a id.ai en producción.
function iiUrl(): string {
  const url = process.env.II_URL as string | undefined;
  return url && url !== "undefined" ? url : "https://id.ai/authorize";
}

// derivationOrigin lo inyecta caffeine en /env.json al deployar. Solo se usa
// si trae un valor real (el repo shipea "undefined"). Mantiene el principal
// estable entre los distintos orígenes desde los que se sirve la app.
async function readDerivationOrigin(): Promise<string | undefined> {
  try {
    const res = await fetch(`${location.origin}/env.json`, {
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const cfg = (await res.json()) as { ii_derivation_origin?: string };
    const v = cfg.ii_derivation_origin;
    return v && v !== "undefined" ? v : undefined;
  } catch {
    return undefined;
  }
}

interface LoginOptions {
  /** Override del identityProvider (p.ej. un authorize distinto). */
  identityProvider?: string;
  /** Login directo con un proveedor OpenID, salteando la pantalla de II. */
  openIdProvider?: OpenIdProvider;
}

interface InternetIdentityContextValue {
  isAuthenticated: boolean;
  isInitializing: boolean;
  isLoggingIn: boolean;
  identity: Identity | null;
  login: (options?: LoginOptions) => void;
  clear: () => void;
}

const InternetIdentityContext =
  createContext<InternetIdentityContextValue | null>(null);

const IDLE_OPTIONS = {
  disableIdle: true,
  disableDefaultIdleCallback: true,
} as const;

const THIRTY_DAYS_NS = BigInt(30 * 24 * 60 * 60) * BigInt(1_000_000_000);

export function InternetIdentityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);

  const clientRef = useRef<AuthClient | null>(null);
  const derivationOriginRef = useRef<string | undefined>(undefined);

  const buildClient = useCallback((overrides?: LoginOptions): AuthClient => {
    return new AuthClient({
      idleOptions: IDLE_OPTIONS,
      identityProvider: overrides?.identityProvider ?? iiUrl(),
      derivationOrigin: derivationOriginRef.current,
      ...(overrides?.openIdProvider
        ? { openIdProvider: overrides.openIdProvider }
        : {}),
    });
  }, []);

  // Init: resolver derivationOrigin, crear cliente y restaurar sesión previa.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      derivationOriginRef.current = await readDerivationOrigin();
      const client = buildClient();
      if (cancelled) return;
      clientRef.current = client;

      // getIdentity() restaura la sesión persistida si existe.
      const restored = await client.getIdentity();
      if (cancelled) return;
      if (client.isAuthenticated()) {
        setIdentity(restored);
        setIsAuthenticated(true);
      }
      setIsInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildClient]);

  const login = useCallback(
    (options?: LoginOptions) => {
      if (isLoggingIn || isAuthenticated) return;

      // Un override de proveedor requiere reconstruir el cliente (esas opciones
      // van en el constructor). Si no hay override, reusamos el cliente base.
      const client =
        options?.identityProvider || options?.openIdProvider
          ? buildClient(options)
          : clientRef.current;
      if (!client) return;
      clientRef.current = client;

      setIsLoggingIn(true);
      client
        .signIn({ maxTimeToLive: THIRTY_DAYS_NS })
        .then((id) => {
          setIdentity(id);
          setIsAuthenticated(true);
        })
        .catch(() => {})
        .finally(() => setIsLoggingIn(false));
    },
    [isLoggingIn, isAuthenticated, buildClient],
  );

  const clear = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    void client.signOut().then(() => {
      setIdentity(null);
      setIsAuthenticated(false);
    });
  }, []);

  return (
    <InternetIdentityContext.Provider
      value={{
        isAuthenticated,
        isInitializing,
        isLoggingIn,
        identity,
        login,
        clear,
      }}
    >
      {children}
    </InternetIdentityContext.Provider>
  );
}

export function useInternetIdentity(): InternetIdentityContextValue {
  const ctx = useContext(InternetIdentityContext);
  if (!ctx) {
    throw new Error(
      "useInternetIdentity must be used within InternetIdentityProvider",
    );
  }
  return ctx;
}
