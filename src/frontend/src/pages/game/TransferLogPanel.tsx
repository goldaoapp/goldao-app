import { type TransferEntry, TransferKind } from "@/backend";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { ReceiptText } from "lucide-react";
import { useState } from "react";
import {
  eyebrow,
  fmtDate,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
  panelHeader,
  shortPrincipal,
  txUrl,
} from "./game-utils";
import { usePlayerInfo, useTransferLog } from "./useGame";

const KIND_LABEL: Record<TransferKind, { text: string; warn: boolean }> = {
  [TransferKind.loaded]: { text: "Load credited", warn: false },
  [TransferKind.loadUnanswered]: { text: "Load, no answer", warn: true },
  [TransferKind.loadForgotten]: { text: "Load expired", warn: true },
  [TransferKind.withdrawn]: { text: "Withdrawal paid", warn: false },
  [TransferKind.withdrawUnanswered]: {
    text: "Withdrawal, no answer",
    warn: true,
  },
  [TransferKind.withdrawSettled]: {
    text: "Withdrawal settled by admin",
    warn: true,
  },
  [TransferKind.withdrawRefunded]: {
    text: "Withdrawal given back by admin",
    warn: true,
  },
};

function parsePrincipal(text: string): Principal | null {
  try {
    return Principal.fromText(text.trim());
  } catch {
    return null;
  }
}

function Line({
  e,
  onPlayer,
}: {
  e: TransferEntry;
  onPlayer: (p: Principal) => void;
}) {
  const kind = KIND_LABEL[e.kind] ?? { text: String(e.kind), warn: true };
  return (
    <tr className="border-t border-[color:var(--term-border)] align-top">
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2 font-mono text-[11px]",
          inkFaint,
        )}
      >
        {fmtDate(e.at)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-xs",
          kind.warn ? "text-[color:var(--term-warn)]" : ink,
        )}
      >
        {kind.text}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          title={e.player.toText()}
          onClick={() => onPlayer(e.player)}
          className={cn(
            "font-mono text-[11px] underline-offset-2 hover:underline",
            inkMid,
          )}
        >
          {shortPrincipal(e.player.toText())}
        </button>
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2 text-right font-mono text-xs",
          ink,
        )}
      >
        {fmtGoldao(e.amount)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
        {e.txId === undefined ? (
          <span className={inkFaint}>No transaction id</span>
        ) : (
          <a
            href={txUrl(e.txId)}
            target="_blank"
            rel="noreferrer"
            className={cn(gold, "underline-offset-2 hover:underline")}
          >
            #{e.txId.toString()}
          </a>
        )}
      </td>
    </tr>
  );
}

/**
 * Transfers between the players' wallets and the game, as the game recorded them. The admin
 * compares a line with the same transaction id in the ledger to know whether a load or a
 * withdrawal really happened and was booked.
 */
export function TransferLogPanel() {
  const [text, setText] = useState("");
  const [player, setPlayer] = useState<Principal | null>(null);
  const log = useTransferLog(player === null);
  const info = usePlayerInfo(player);

  const typed = text.trim() === "" ? null : parsePrincipal(text);
  const invalid = text.trim() !== "" && typed === null;
  const entries = player ? info.data?.entries : log.data;
  const failed = player ? info.isError : log.isError;

  const pick = (p: Principal) => {
    setText(p.toText());
    setPlayer(p);
  };

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={cn(eyebrow, gold, "flex items-center gap-2")}>
          <ReceiptText className="size-3.5" /> Transfer log
        </span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          Newest first · loads and withdrawals
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            placeholder="Player principal"
            spellCheck={false}
            className="w-full max-w-md rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={typed === null}
            onClick={() => setPlayer(typed)}
          >
            Look up
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={player === null && text === ""}
            onClick={() => {
              setText("");
              setPlayer(null);
            }}
          >
            Show all
          </Button>
          {invalid && (
            <span className="font-mono text-[11px] text-destructive">
              Not a valid principal.
            </span>
          )}
        </div>

        {player && info.data && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-[color:var(--term-border)] bg-[var(--term-alt)] p-3 sm:grid-cols-5">
            {[
              ["Balance", info.data.credit],
              ["Stake in play", info.data.stake],
              ["Held jackpot", info.data.held],
              ["Pending load", info.data.pendingLoad],
              ["Pending withdrawal", info.data.pendingWithdrawal],
            ].map(([label, value]) => (
              <div key={label as string} className="flex flex-col gap-0.5">
                <span
                  className={cn("font-mono text-[10px] uppercase", inkFaint)}
                >
                  {label as string}
                </span>
                <span className={cn("font-mono text-sm", ink)}>
                  {fmtGoldao(value as bigint)}
                </span>
              </div>
            ))}
          </div>
        )}

        {failed && (
          <p className="font-mono text-xs text-destructive">
            Could not read the log. Try again in a moment.
          </p>
        )}
        {entries && entries.length === 0 && (
          <p className={cn("font-mono text-xs", inkFaint)}>
            {player ? "No lines for this player." : "No lines yet."}
          </p>
        )}
        {entries && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className={cn("font-mono text-[10px] uppercase", inkFaint)}>
                  <th className="px-3 py-1 font-normal">Time</th>
                  <th className="px-3 py-1 font-normal">Event</th>
                  <th className="px-3 py-1 font-normal">Player</th>
                  <th className="px-3 py-1 text-right font-normal">Amount</th>
                  <th className="px-3 py-1 font-normal">Ledger transaction</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <Line key={e.id.toString()} e={e} onPlayer={pick} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
