import type { Dashboard, ExcavationView, Ranking } from "@/backend";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getBoard } from "./board-store";

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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [KEY, "dashboard", principalId],
    queryFn: async () => {
      const fresh = await actor!.gameMyDashboard();
      if (!getBoard().hold) return fresh;
      // A jackpot or auto run is still being shown: keep the balance on screen.
      const shown = queryClient.getQueryData<Dashboard>([
        KEY,
        "dashboard",
        principalId,
      ]);
      return shown
        ? { ...fresh, credit: shown.credit, pool: shown.pool }
        : fresh;
    },
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

/** Total GOLDAO burned by the game (public). */
export function useBurned() {
  const { actor } = useAuth();
  return useQuery({
    queryKey: [KEY, "burned"],
    queryFn: () => actor!.gameBurned(),
    enabled: !!actor,
    refetchInterval: 15_000,
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

/** The backend answered that the caller is not an admin: a final answer, not a failure. */
class NotAdminError extends Error {}

export function useAdminView(enabled: boolean) {
  const { actor, principalId } = useAuth();
  return useQuery({
    queryKey: [KEY, "admin", principalId],
    queryFn: async () => {
      const res = await actor!.gameAdminView();
      if (res.__kind__ === "err") throw new NotAdminError(res.err);
      return res.ok;
    },
    enabled: !!actor && enabled,
    // Non-admins get an answer once and polling stops. A network failure is retried, and
    // polling goes on, so an admin never loses the tab because of one bad request.
    refetchInterval: (q) =>
      q.state.error instanceof NotAdminError ? false : 30_000,
    retry: (count, error) => !(error instanceof NotAdminError) && count < 3,
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

export function useSecurityLog(day: number, enabled: boolean) {
  const { actor, principalId } = useAuth();
  return useQuery({
    queryKey: [KEY, "security-log", principalId, day],
    queryFn: async () => {
      const res = await actor!.gameAdminSecurityLog(BigInt(day));
      if (res.__kind__ === "err") throw new Error(res.err);
      return res.ok;
    },
    enabled: !!actor && enabled,
    refetchInterval: (q) => (q.state.status === "error" ? false : 30_000),
    retry: false,
  });
}

/** Every payout of one tournament (the payment log). */
export function usePayouts(tournament: number | null) {
  const { actor, principalId } = useAuth();
  return useQuery({
    queryKey: [KEY, "payouts", principalId, tournament],
    queryFn: async () => {
      const res = await actor!.gameAdminPayouts(BigInt(tournament ?? 0));
      if (res.__kind__ === "err") throw new Error(res.err);
      return res.ok;
    },
    enabled: !!actor && tournament !== null,
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
  // A refetch already in flight would overwrite these values with older ones when it lands, so it
  // is cancelled first (the cache is written only after the cancellation has settled).
  const setOpenExcavation = useCallback(
    async (open: ExcavationView | null) => {
      await queryClient.cancelQueries({ queryKey: [KEY, "dashboard"] });
      queryClient.setQueriesData<Dashboard>(
        { queryKey: [KEY, "dashboard"] },
        (old) => (old ? { ...old, open: open ?? undefined } : old),
      );
    },
    [queryClient],
  );

  const setCredit = useCallback(
    async (credit: bigint, pool: bigint) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: [KEY, "dashboard"] }),
        queryClient.cancelQueries({ queryKey: [KEY, "ranking"] }),
      ]);
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
