import { useBackendActor } from "@/hooks/useBackendActor";
import { useInternetIdentity } from "@/lib/internet-identity";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Backend, UserRole } from "../backend";

interface AuthContextValue {
  isAuthenticated: boolean;
  /** II is initializing or a login is in progress */
  isLoading: boolean;
  /** Resolving the role/admin from the canister */
  roleLoading: boolean;
  isAdmin: boolean;
  role: UserRole | null;
  principalId: string | null;
  actor: Backend | null;
  login: (options?: { identityProvider?: string }) => void;
  /** Admin of the game: sign in again for 8 hours (call from a click). */
  renewShort: () => void;
  /** End of the current sign-in (ms), or null when it cannot be read. */
  sessionEndsAt: number | null;
  logout: () => void;
  /** Re-reads isCallerAdmin/getCallerUserRole (for example after a role is assigned) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    login,
    renewShort,
    sessionEndsAt,
    clear,
    identity,
  } = useInternetIdentity();
  const { actor } = useBackendActor();
  const queryClient = useQueryClient();

  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const actorRef = useRef(actor);
  actorRef.current = actor;
  const initializedFor = useRef<string | null>(null);

  const principalId = identity
    ? (() => {
        try {
          return identity.getPrincipal().toString();
        } catch {
          return null;
        }
      })()
    : null;

  const refresh = useCallback(async () => {
    const a = actorRef.current;
    if (!a) return;
    setRoleLoading(true);
    try {
      const [admin, r] = await Promise.all([
        a.isCallerAdmin(),
        a.getCallerUserRole(),
      ]);
      setIsAdmin(admin);
      setRole(r);
    } catch {
      setIsAdmin(false);
      setRole(null);
    } finally {
      setRoleLoading(false);
    }
  }, []);

  // Clean up on sign out
  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdmin(false);
      setRole(null);
      setRoleLoading(false);
      initializedFor.current = null;
    }
  }, [isAuthenticated]);

  // Signed in and actor ready: initialize access control and resolve the role.
  useEffect(() => {
    if (!actor || !isAuthenticated || !principalId) return;
    if (initializedFor.current === principalId) return;
    initializedFor.current = principalId;

    void (async () => {
      setRoleLoading(true);
      try {
        // Idempotent: safe to call on every login.
        await actor._initialize_access_control();
      } catch {}
      await refresh();
    })();
  }, [actor, isAuthenticated, principalId, refresh]);

  const logout = useCallback(() => {
    clear();
    queryClient.clear();
    setIsAdmin(false);
    setRole(null);
    initializedFor.current = null;
  }, [clear, queryClient]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading: isInitializing || isLoggingIn,
        roleLoading,
        isAdmin,
        role,
        principalId,
        actor,
        login,
        renewShort,
        sessionEndsAt,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
