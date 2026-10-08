import type { AdminView, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { loadEnv } from "@/hooks/useBackendActor";
import { fetchWalletBalance } from "@/lib/goldao-ledger";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FlaskConical, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
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
import { errorMessage } from "./useGame";

/**
 * Which ledger the game runs on, and the one button that moves it to another ledger.
 *
 * The ledger itself is the MODE constant in the backend (lib/ledger.mo), changed only with a
 * deploy. The game connects to it by itself at start (the bank wallet of each deployment is fixed
 * in Game.BANKS). "Change ledger" is only for moving to another ledger after such a deploy.
 *
 * The faucet pool and the "Switching to real GOLDAO" steps are temporary: remove them together
 * with the test faucet when the game is on the real GOLDAO ledger.
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
  const { actor } = useAuth();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [connectErr, setConnectErr] = useState<string | null>(null);

  // A game that is not connected yet connects by itself: asking once starts the retries.
  useEffect(() => {
    if (!actor || !config || config.realLedger) return;
    void actor
      .gameAdminEnsureConnected()
      .then((r) => {
        setConnectErr("err" in r ? r.err : null);
        void queryClient.invalidateQueries({ queryKey: ["game"] });
      })
      .catch((e) => setConnectErr(errorMessage(e)));
  }, [actor, config, queryClient]);

  const changeLedger = async () => {
    if (!actor || working) return;
    setMsg(null);
    setWorking(true);
    try {
      const res = await actor.gameAdminChangeLedger();
      if (res.__kind__ === "err") throw new Error(res.err);
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      setMsg({
        ok: true,
        text: `Ledger changed. Bank is ${fmtGoldao(res.ok)} GOLDAO.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setWorking(false);
    }
  };

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
    : !real
      ? {
          text: "NOT CONNECTED",
          cls: "border-[color:var(--term-border)] text-[color:var(--term-ink-faint)]",
        }
      : test
        ? {
            text: TEST_TOKEN_LABEL,
            cls: "border-[color:var(--term-gold)] text-[color:var(--term-gold)]",
          }
        : {
            text: "PRODUCTION",
            cls: "border-[color:var(--term-green)] text-[color:var(--term-green)]",
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
            : !real
              ? `The game is connecting to ${test ? TEST_TOKEN_LABEL : "the real GOLDAO"} by itself. If it stays like this, the ledger is unreachable or this canister has no bank configured in the backend.`
              : test
                ? `The game runs on the ${TEST_TOKEN_LABEL} ledger. These tokens have no value and the test faucet is available.`
                : "The game runs on the real GOLDAO ledger. The test faucet is not available."}
        </span>

        {!real && connectErr && (
          <span className="font-mono text-xs text-destructive">
            Could not connect: {connectErr}
          </span>
        )}

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

        {checks.length > 0 && (test || !real) && (
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
          </div>
        )}

        {real && (
          <div className="flex flex-col gap-2">
            <span className={cn(eyebrow, inkFaint)}>Change ledger</span>
            <span className={cn("text-[11px]", inkFaint)}>
              Moves the game to the ledger set in the backend code. It checks
              the fee and the symbol, reads the bank balance and erases all game
              data. Only the bank wallet can do it, with the game paused.
            </span>
            {test && (
              <ol
                className={cn(
                  "list-decimal space-y-1 pl-5 font-mono text-[11px]",
                  inkMid,
                )}
              >
                <li>
                  With MODE still #test: pause new excavations, wait for the
                  tournament to close and pay or mark as paid every payout.
                </li>
                <li>
                  Withdraw everything (all) to the treasury. Owed, credits and
                  open excavations must be zero.
                </li>
                <li>
                  Deploy with MODE = #production and without the test faucet
                  files. Nothing changes in the game until step 4.
                </li>
                <li>
                  Press "Change ledger" here. The game stays paused: fund the
                  jackpot pool, check the bank balance and the ledger id, then
                  resume.
                </li>
              </ol>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={working || !actor}
                onClick={() => setAsking(true)}
              >
                {working ? <Spinner /> : null}
                Change ledger
              </Button>
              {msg && (
                <span
                  className={cn(
                    "font-mono text-xs",
                    msg.ok
                      ? "text-[color:var(--term-green)]"
                      : "text-destructive",
                  )}
                >
                  {msg.text}
                </span>
              )}
            </div>
          </div>
        )}

        {asking && (
          <ConfirmDialog
            title="Change the ledger?"
            detail="The game must be paused and empty. All game data is erased and the bank is read from the ledger set in the backend code."
            word="CHANGE LEDGER"
            busy={working}
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false);
              void changeLedger();
            }}
          />
        )}
      </div>
    </div>
  );
}
