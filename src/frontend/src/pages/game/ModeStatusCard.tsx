import type { AdminView, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  approveSpender,
  fetchAllowance,
  fetchWalletBalance,
} from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
import { trustedSpender } from "@/lib/session";
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
import { usePageCanister } from "./usePageCanister";

/**
 * Which ledger the game runs on, and the test-only button that deletes all game data.
 *
 * The ledger itself is the MODE constant in the backend (lib/ledger.mo), changed only with a
 * deploy. The game connects to it by itself at start (the bank admin of each deployment is fixed
 * in Game.BANKS; the bank itself is the game canister's own account).
 *
 * The faucet pool, the "Switching to real GOLDAO" steps and the delete button are temporary:
 * remove them together with the test faucet when the game is on the real GOLDAO ledger.
 */
// Allowance the bank admin gives the faucet in one click: 1,000,000 test tokens.
const FAUCET_ALLOWANCE_E8S = 100_000_000_000_000n;

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
  const { identity } = useInternetIdentity();
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

  const resetGame = async () => {
    if (!actor || working) return;
    setMsg(null);
    setWorking(true);
    try {
      const res = await actor.gameAdminResetGame();
      if (res.__kind__ === "err") throw new Error(res.err);
      await queryClient.invalidateQueries({ queryKey: ["game"] });
      setMsg({
        ok: true,
        text: "All game data deleted. The game stays paused.",
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setWorking(false);
    }
  };

  // The game account is reported by the backend once the game is connected. It is used only if it
  // matches the canister this page talks to.
  const pageCanister = usePageCanister();
  const gameAccount = trustedSpender(view?.selfId?.toText(), pageCanister.data);

  // The faucet pays from the bank admin's own wallet through an allowance given to the game
  // canister, never from the game account (that is the bank). The pool is what it can still pay.
  const adminText = identity?.getPrincipal().toText() ?? "";
  const pool = useQuery({
    queryKey: ["game", "faucet-pool", adminText, gameAccount, config?.ledgerId],
    queryFn: async () => {
      const [balance, allowance] = await Promise.all([
        fetchWalletBalance(adminText, config?.ledgerId),
        fetchAllowance(adminText, gameAccount, config?.ledgerId),
      ]);
      return balance < allowance ? balance : allowance;
    },
    enabled: test && !!gameAccount && !!adminText,
    refetchInterval: 30_000,
    retry: false,
  });
  const [authorizing, setAuthorizing] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const setFaucetAllowance = async (amount: bigint) => {
    if (!identity || !gameAccount || authorizing) return;
    setFaucetMsg(null);
    setAuthorizing(true);
    try {
      await approveSpender(
        identity,
        gameAccount,
        amount,
        undefined,
        config?.ledgerId,
      );
      await pool.refetch();
    } catch (e) {
      setFaucetMsg(errorMessage(e));
    } finally {
      setAuthorizing(false);
    }
  };

  const checks = view
    ? [
        { ok: view.paused, text: "The game is paused" },
        { ok: view.owed === 0n, text: "Nothing is owed to players" },
        {
          ok: view.pendingWithdrawals === 0n,
          text: "There are no pending withdrawals",
        },
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

        {test && (
          <div className="flex flex-col gap-2">
            <span className={cn("text-[11px]", inkFaint)}>
              The faucet pays from the bank admin wallet. Sign in as the bank
              admin and authorize it to refill the pool; the wallet needs{" "}
              {TEST_TOKEN_LABEL} too. Revoke it before moving to the real
              GOLDAO.
              {!gameAccount &&
                " The backend has not reported the game account yet, so the faucet cannot be authorized."}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={authorizing || !identity || !gameAccount}
                onClick={() => void setFaucetAllowance(FAUCET_ALLOWANCE_E8S)}
              >
                {authorizing ? <Spinner /> : null}
                Authorize faucet
              </Button>
              <Button
                variant="outline"
                disabled={authorizing || !identity || !gameAccount}
                onClick={() => void setFaucetAllowance(0n)}
              >
                Revoke faucet
              </Button>
              {faucetMsg && (
                <span className="font-mono text-xs text-destructive">
                  {faucetMsg}
                </span>
              )}
            </div>
          </div>
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

        {test && real && (
          <div className="flex flex-col gap-2">
            <span className={cn(eyebrow, inkFaint)}>Delete all game data</span>
            <span className={cn("text-[11px]", inkFaint)}>
              Erases every player, balance, tournament and statistic and
              disconnects the game. Only the bank admin can do it, with the game
              paused and empty. Test deployments only.
            </span>
            <ol
              className={cn(
                "list-decimal space-y-1 pl-5 font-mono text-[11px]",
                inkMid,
              )}
            >
              <li>
                Start the evacuation, close the tournament and send every
                balance to its owner.
              </li>
              <li>
                Withdraw everything (all) to the treasury. Owed, credits and
                open excavations must be zero.
              </li>
              <li>Press "Delete all game data" here. The game stays paused.</li>
              <li>
                Deploy with MODE = #production and without the test faucet
                files.
              </li>
              <li>
                Open the admin panel: the game connects to the real ledger. Fund
                the jackpot pool, check the bank balance and the ledger id, then
                resume.
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={working || !actor}
                onClick={() => setAsking(true)}
              >
                {working ? <Spinner /> : null}
                Delete all game data
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
            title="Delete all game data?"
            detail="The game must be paused and empty. Every player, tournament and statistic is erased and the game is disconnected. This cannot be undone."
            word="DELETE GAME DATA"
            busy={working}
            onCancel={() => setAsking(false)}
            onConfirm={() => {
              setAsking(false);
              void resetGame();
            }}
          />
        )}
      </div>
    </div>
  );
}
