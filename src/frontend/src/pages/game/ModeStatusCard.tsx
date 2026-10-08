import type { AdminView, GameConfig } from "@/backend";
import { loadEnv } from "@/hooks/useBackendActor";
import { fetchWalletBalance } from "@/lib/goldao-ledger";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, FlaskConical, X } from "lucide-react";
import { CopyField } from "./CopyField";
import { Spinner } from "./Spinner";
import {
  eyebrow,
  fmtGoldao,
  gold,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
} from "./game-utils";
import { TEST_TOKEN_LABEL, isTestLedger } from "./ledger-mode";

/**
 * Which ledger the game runs on, and whether it is safe to switch. Read-only: the mode is the
 * MODE constant in the backend (lib/ledger.mo), changed with a deploy, and the switch itself is
 * done with "Change ledger" further down. This card never changes anything.
 */
export function ModeStatusCard({
  view,
  config,
}: {
  view: AdminView | undefined;
  config: GameConfig | undefined;
}) {
  const test = isTestLedger(config);
  const real = !!config?.realLedger;

  // Same query as the admin panel: the game account is the deployed canister itself.
  const envQuery = useQuery({
    queryKey: ["game", "spender"],
    queryFn: async () => (await loadEnv()).backend_canister_id ?? "",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const gameAccount =
    envQuery.data && envQuery.data !== "undefined" ? envQuery.data : "";

  // The faucet sends from the game canister's own account on the test ledger.
  const pool = useQuery({
    queryKey: ["game", "faucet-pool", gameAccount, config?.ledgerId],
    queryFn: () => fetchWalletBalance(gameAccount, config?.ledgerId),
    enabled: test && !!gameAccount,
    refetchInterval: 30_000,
    retry: false,
  });

  const unpaid = view ? view.payouts.filter((p) => !p.paid).length : 0;
  const checks = view
    ? [
        { ok: view.paused, text: "The game is paused" },
        { ok: view.owed === 0n, text: "Nothing is owed to players" },
        { ok: unpaid === 0, text: "There are no pending payouts" },
      ]
    : [];

  const pill = !config
    ? null
    : test
      ? {
          text: TEST_TOKEN_LABEL,
          cls: "border-[color:var(--term-gold)] text-[color:var(--term-gold)]",
        }
      : real
        ? {
            text: "PRODUCTION",
            cls: "border-[color:var(--term-green)] text-[color:var(--term-green)]",
          }
        : {
            text: "SIMULATED",
            cls: "border-[color:var(--term-border)] text-[color:var(--term-ink-faint)]",
          };

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
          <FlaskConical className="size-3.5" /> Ledger mode
        </span>
        {pill ? (
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold",
              pill.cls,
            )}
          >
            {pill.text}
          </span>
        ) : (
          <Spinner />
        )}
      </div>
      <div className="flex flex-col gap-4 p-5">
        <span className={cn("text-xs", inkMid)}>
          {!config
            ? "Loading"
            : test
              ? `The game runs on the ${TEST_TOKEN_LABEL} ledger. These tokens have no value and the test faucet is available.`
              : real
                ? "The game runs on the real GOLDAO ledger. The test faucet is not available."
                : "The game runs without a ledger (simulated balances)."}
        </span>

        {config && (
          <dl className="grid gap-3 font-mono text-xs sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className={inkFaint}>Ledger</dt>
              <dd className="break-all">{config.ledgerId}</dd>
            </div>
            {test && (
              <div className="flex flex-col gap-1">
                <dt className={inkFaint}>Faucet pool</dt>
                <dd>
                  {pool.isError ? (
                    "unavailable"
                  ) : pool.data === undefined ? (
                    <Spinner />
                  ) : (
                    `${fmtGoldao(pool.data)} ${TEST_TOKEN_LABEL}`
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}

        {test && gameAccount && (
          <CopyField
            label={`Game account: send ${TEST_TOKEN_LABEL} here to refill the faucet`}
            value={gameAccount}
          />
        )}

        {checks.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={cn(eyebrow, inkFaint)}>
              Before switching ledger
            </span>
            <ul className="flex flex-col gap-1 font-mono text-xs">
              {checks.map((c) => (
                <li key={c.text} className="flex items-center gap-2">
                  {c.ok ? (
                    <Check className="size-3.5 text-[color:var(--term-green)]" />
                  ) : (
                    <X className="size-3.5 text-destructive" />
                  )}
                  <span className={c.ok ? undefined : inkFaint}>{c.text}</span>
                </li>
              ))}
            </ul>
            <span className={cn("text-[11px]", inkFaint)}>
              To switch: change MODE in the backend (lib/ledger.mo), deploy,
              then use "Change ledger" below. The switch erases all game data.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
