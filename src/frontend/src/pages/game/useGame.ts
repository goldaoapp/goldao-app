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

export function useWeeks() {
  const { actor } = useAuth();
  return useQuery({
    queryKey: [KEY, "weeks"],
    queryFn: () => actor!.gameWeeks(),
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

type Res<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

/**
 * Runs a backend call that returns a Result, tracks a pending flag and
 * refreshes every game query afterwards. Throws with the backend message on #err.
 */
export function useGameAction() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <T>(
      name: string,
      call: () => Promise<Res<T>>,
      refresh = true,
    ): Promise<T> => {
      setPending(name);
      try {
        const res = await call();
        if (res.__kind__ === "err") throw new Error(res.err);
        return res.ok;
      } finally {
        setPending(null);
        if (refresh) void queryClient.invalidateQueries({ queryKey: [KEY] });
      }
    },
    [queryClient],
  );

  const refreshAll = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [KEY] }),
    [queryClient],
  );

  return { run, pending, refreshAll };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    // Agent errors carry the reject text deep inside the message.
    const m = e.message.match(/Reject text: (.*)/);
    return m ? m[1] : e.message;
  }
  return "Something went wrong. Try again.";
}
