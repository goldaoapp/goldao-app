import type { Dashboard, ExcavationView, Ranking } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

const KEY = "game";

/** Rules and points table. Changes only on deploy. */
export function useGameConfig() {
  const { actor } = useAuth();
  return useQuery({
    queryKey: [KEY, "config"],
    queryFn: () => actor!.gameConfig(),
    enabled: !!actor,
    staleTime: 60_000,
  });
}

/** Personal dashboard of the signed-in player. */
export function useDashboard() {
  const { actor, isAuthenticated, principalId } = useAuth();
  return useQuery({
    queryKey: [KEY, "dashboard", principalId],
    queryFn: () => actor!.gameMyDashboard(),
    enabled: !!actor && isAuthenticated && !!principalId,
    refetchInterval: 20_000,
  });
}

export function useRanking() {
  const { actor } = useAuth();
  return useQuery({
    queryKey: [KEY, "ranking"],
    queryFn: () => actor!.gameRanking(),
    enabled: !!actor,
    refetchInterval: 20_000,
  });
}

export function useTournaments() {
  const { actor } = useAuth();
  return useQuery({
    queryKey: [KEY, "tournaments"],
    queryFn: () => actor!.gameTournaments(),
    enabled: !!actor,
    staleTime: 60_000,
  });
}

export function useAdminView(enabled: boolean) {
  const { actor, principalId } = useAuth();
  return useQuery({
    queryKey: [KEY, "admin", principalId],
    queryFn: async () => {
      const res = await actor!.gameAdminView();
      if (res.__kind__ === "err") throw new Error(res.err);
      return res.ok;
    },
    enabled: !!actor && enabled,
    // Non-admins get an error once; stop polling in that case.
    refetchInterval: (q) => (q.state.status === "error" ? false : 30_000),
    retry: false,
  });
}

export function useSecurityView(enabled: boolean) {
  const { actor, principalId } = useAuth();
  return useQuery({
    queryKey: [KEY, "security", principalId],
    queryFn: async () => {
      const res = await actor!.gameAdminSecurity();
      if (res.__kind__ === "err") throw new Error(res.err);
      return res.ok;
    },
    enabled: !!actor && enabled,
    refetchInterval: (q) => (q.state.status === "error" ? false : 15_000),
    retry: false,
  });
}

type Res<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

/**
 * Runs a backend call that returns a Result, tracks a pending flag and
 * refreshes every game query afterwards. Throws with the backend message on #err.
 */
export function useGameAction() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  // "live": only what changes while playing (dashboard and ranking).
  // "all": every game query, for admin actions that change the tournament.
  const refresh = useCallback(
    (scope: "live" | "all") => {
      if (scope === "all") {
        return queryClient.invalidateQueries({ queryKey: [KEY] });
      }
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: [KEY, "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: [KEY, "ranking"] }),
        queryClient.invalidateQueries({ queryKey: [KEY, "wallet"] }),
      ]);
    },
    [queryClient],
  );

  const run = useCallback(
    async <T>(
      name: string,
      call: () => Promise<Res<T>>,
      scope: "live" | "all" | false = "live",
    ): Promise<T> => {
      setPending(name);
      try {
        const res = await call();
        if (res.__kind__ === "err") throw new Error(res.err);
        return res.ok;
      } finally {
        setPending(null);
        if (scope) void refresh(scope);
      }
    },
    [refresh],
  );

  const refreshAll = useCallback(() => refresh("live"), [refresh]);

  // Writes the player's open excavation into the cached dashboard, so the cache
  // matches the backend between polls (picks do not refetch the dashboard).
  const setOpenExcavation = useCallback(
    (open: ExcavationView | null) => {
      queryClient.setQueriesData<Dashboard>(
        { queryKey: [KEY, "dashboard"] },
        (old) => (old ? { ...old, open: open ?? undefined } : old),
      );
    },
    [queryClient],
  );

  const setCredit = useCallback(
    (credit: bigint, pool: bigint) => {
      queryClient.setQueriesData<Dashboard>(
        { queryKey: [KEY, "dashboard"] },
        (old) => (old ? { ...old, credit, pool } : old),
      );
      queryClient.setQueriesData<Ranking>(
        { queryKey: [KEY, "ranking"] },
        (old) => (old ? { ...old, pool } : old),
      );
    },
    [queryClient],
  );

  return { run, pending, refreshAll, setOpenExcavation, setCredit };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    // Agent errors carry the reject text deep inside the message.
    const m = e.message.match(/Reject text: (.*)/);
    return m ? m[1] : e.message;
  }
  return "Something went wrong. Try again.";
}
