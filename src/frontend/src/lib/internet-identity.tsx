// Internet Identity provider for GOLDAO using @icp-sdk/auth v7.
// Exposes { isAuthenticated, isInitializing, isLoggingIn, login, clear, identity }.
//
// Notes on the v7 API (different from @dfinity/auth-client):
//  - import from "@icp-sdk/auth/client" (the root module throws on purpose)
//  - create with `new AuthClient(opts)` (there is no static `create()`)
//  - `identityProvider` and `derivationOrigin` are fixed in the constructor
//  - `signIn()/signOut()` replace `login()/logout()` and return Promises (no callbacks)
//  - `getIdentity()` is async; `isAuthenticated()` is sync
//  - `openIdProvider` ('google'|'apple'|'microsoft') allows a direct login.

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
import {
  ADMIN_SESSION_MS,
  PLAYER_SESSION_MS,
  msToNs,
  sessionEndsAtMs,
} from "./session";

// II authorize URL: resolved by vite.config.js (process.env.II_URL) from
// DFX_NETWORK; falls back to id.ai in production.
function iiUrl(): string {
  const url = process.env.II_URL as string | undefined;
  return url && url !== "undefined" ? url : "https://id.ai/authorize";
}

// derivationOrigin is injected into /env.json at deploy time. It is used only
// when it holds a real value (the repo ships "undefined"). It keeps the principal
// stable across the origins the app is served from.
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
  /** Overrides the identityProvider (for example a different authorize URL). */
  identityProvider?: string;
  /** Direct login with an OpenID provider, skipping the II screen. */
  openIdProvider?: OpenIdProvider;
  /** Short sign-in (8 hours) for the game admin; otherwise it lasts 7 days. */
  shortSession?: boolean;
}

interface InternetIdentityContextValue {
  isAuthenticated: boolean;
  isInitializing: boolean;
  isLoggingIn: boolean;
  identity: Identity | null;
  login: (options?: LoginOptions) => void;
  /** Signs in again with the short admin duration. Must be called from a click. */
  renewShort: () => void;
  /** End of the current sign-in (ms), or null when it cannot be read. */
  sessionEndsAt: number | null;
  clear: () => void;
}

const InternetIdentityContext =
  createContext<InternetIdentityContextValue | null>(null);

const IDLE_OPTIONS = {
  disableIdle: true,
  disableDefaultIdleCallback: true,
} as const;

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

  // Init: resolve derivationOrigin, create the client and restore a previous session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      derivationOriginRef.current = await readDerivationOrigin();
      const client = buildClient();
      if (cancelled) return;
      clientRef.current = client;

      // getIdentity() restores the stored session if there is one.
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

  const signIn = useCallback((client: AuthClient, short: boolean) => {
    setIsLoggingIn(true);
    client
      .signIn({
        maxTimeToLive: msToNs(short ? ADMIN_SESSION_MS : PLAYER_SESSION_MS),
      })
      .then((id) => {
        setIdentity(id);
        setIsAuthenticated(true);
      })
      .catch(() => {})
      .finally(() => setIsLoggingIn(false));
  }, []);

  // The admin signs in again for 8 hours. A new client is used and the old session stays until the
  // new one is confirmed. Nothing is awaited before signIn, so the browser still allows the popup.
  const renewShort = useCallback(() => {
    if (isLoggingIn) return;
    const client = buildClient();
    clientRef.current = client;
    signIn(client, true);
  }, [isLoggingIn, buildClient, signIn]);

  const login = useCallback(
    (options?: LoginOptions) => {
      if (isLoggingIn || isAuthenticated) return;

      // A provider override needs a new client (those options go in the constructor).
      // Without an override the base client is reused.
      const client =
        options?.identityProvider || options?.openIdProvider
          ? buildClient(options)
          : clientRef.current;
      if (!client) return;
      clientRef.current = client;

      signIn(client, options?.shortSession === true);
    },
    [isLoggingIn, isAuthenticated, buildClient, signIn],
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
        renewShort,
        sessionEndsAt: sessionEndsAtMs(identity),
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
