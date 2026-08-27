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
  /** II inicializando o login en curso */
  isLoading: boolean;
  /** Resolviendo rol/admin desde el canister */
  roleLoading: boolean;
  isAdmin: boolean;
  role: UserRole | null;
  principalId: string | null;
  actor: Backend | null;
  login: (options?: { identityProvider?: string }) => void;
  logout: () => void;
  /** Re-lee isCallerAdmin/getCallerUserRole (p.ej. tras asignarse un rol) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    login,
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

  // Limpiar al cerrar sesión
  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdmin(false);
      setRole(null);
      setRoleLoading(false);
      initializedFor.current = null;
    }
  }, [isAuthenticated]);

  // Autenticado + actor listo: inicializar control de acceso y resolver rol.
  useEffect(() => {
    if (!actor || !isAuthenticated || !principalId) return;
    if (initializedFor.current === principalId) return;
    initializedFor.current = principalId;

    void (async () => {
      setRoleLoading(true);
      try {
        // Idempotente: el primer principal que lo llama queda como admin;
        // el resto queda registrado como user. Seguro de llamar en cada login.
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
