import { loadEnv } from "@/hooks/useBackendActor";
import { useQuery } from "@tanstack/react-query";

/** The canister this page was built to talk to (from the deployment files, not from a query). */
export function usePageCanister() {
  return useQuery({
    queryKey: ["game", "page-canister"],
    queryFn: async () => (await loadEnv()).backend_canister_id ?? "",
    staleTime: Number.POSITIVE_INFINITY,
  });
}
