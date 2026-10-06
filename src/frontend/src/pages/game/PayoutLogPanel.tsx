import type { AdminView, Payout } from "@/backend";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import {
  eyebrow,
  fmtDate,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  panel,
  panelHeader,
  plainGoldao,
  txUrl,
} from "./game-utils";
import { usePayouts } from "./useGame";

const NEXT_CHOICES = [1, 5, 10, 20];
const inputCls =
  "w-44 max-w-full rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs";

interface Props {
  view: AdminView;
  working: boolean;
  onPayOne: (p: Payout, renew: boolean) => void;
  onPayNext: (n: number) => void;
  onMarkPaid: (p: Payout, txId: bigint) => void;
}

function statusOf(p: Payout): { text: string; cls: string } {
  if (p.paid) return { text: "paid", cls: ink };
  if (p.uncertain) return { text: "unconfirmed", cls: "text-destructive" };
  return { text: "pending", cls: inkFaint };
}

/** Text for a spreadsheet: one line per payout, tab separated. */
function logText(tournament: number, rows: Payout[]): string {
  const head = [
    "tournament",
    "principal",
    "amount_goldao",
    "status",
    "tx_id",
    "url",
  ].join("\t");
  const lines = rows.map((p) =>
    [
      String(tournament),
      p.to.toText(),
      plainGoldao(p.amount),
      statusOf(p).text,
      p.txId !== undefined ? String(p.txId) : "",
      p.txId !== undefined ? txUrl(p.txId) : "",
    ].join("\t"),
  );
  return [head, ...lines].join("\n");
}

export function PayoutLogPanel({
  view,
  working,
  onPayOne,
  onPayNext,
  onMarkPaid,
}: Props) {
  // Tournaments that appear in the payouts the view carries, newest first.
  const tournaments = useMemo(() => {
    const set = new Set<number>();
    for (const p of view.payouts) set.add(Number(p.tournament));
    return [...set].sort((a, b) => b - a);
  }, [view.payouts]);
  const firstPending = useMemo(() => {
    const open = view.payouts
      .filter((p) => !p.paid)
      .map((p) => Number(p.tournament));
    return open.length > 0 ? Math.max(...open) : null;
  }, [view.payouts]);

  const [picked, setPicked] = useState<number | null>(null);
  const [next, setNext] = useState(String(NEXT_CHOICES[1]));
  const [copied, setCopied] = useState<string | null>(null);
  const [markFor, setMarkFor] = useState<bigint | null>(null);
  const [txInput, setTxInput] = useState("");

  const tournament = picked ?? firstPending ?? tournaments[0] ?? null;
  const { data, isLoading, isError } = usePayouts(tournament);
  const rows = useMemo(
    () => [...(data ?? [])].sort((a, b) => Number(a.id - b.id)),
    [data],
  );

  if (tournaments.length === 0 || tournament === null) return null;

  const paid = rows.filter((p) => p.paid);
  const pending = rows.filter((p) => !p.paid);
  const total = rows.reduce((s, p) => s + p.amount, 0n);
  const globalPending = view.payouts.filter((p) => !p.paid).length;
  const txOk = /^\d+$/.test(txInput.trim());

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className={panel}>
      <div className={panelHeader}>
        <span className={cn(eyebrow, gold)}>Payments</span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {paid.length} paid · {pending.length} pending · {fmtGoldao(total)}{" "}
          GOLDAO
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <label className={cn("font-mono text-[11px]", inkFaint)}>
          Tournament{" "}
          <select
            value={tournament}
            onChange={(e) => {
              setPicked(Number(e.target.value));
              setMarkFor(null);
            }}
            className="ml-1 rounded-md border border-[color:var(--term-border)] bg-[var(--term-card)] px-2 py-1 font-mono text-xs"
          >
            {tournaments.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={rows.length === 0}
          className="gap-1.5"
          onClick={() => void copy("all", logText(tournament, rows))}
        >
          {copied === "all" ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied === "all" ? "Copied" : "Copy all payments"}
        </Button>
        <span className="ml-auto flex items-center gap-2">
          <select
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="rounded-md border border-[color:var(--term-border)] bg-[var(--term-card)] px-2 py-1 font-mono text-xs"
            aria-label="How many payouts"
          >
            {NEXT_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={working || globalPending === 0}
            onClick={() => onPayNext(Number(next))}
          >
            Pay next {next}
          </Button>
        </span>
      </div>
      <p className={cn("px-5 pb-3 font-mono text-[11px]", inkFaint)}>
        "Pay next" sends the smallest pending payouts first, across all
        tournaments. Each payment shows its ledger transaction as soon as the
        ledger confirms it.
      </p>

      <div className="max-h-[480px] overflow-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className={cn("text-left", inkFaint)}>
              <th className="px-5 py-2 font-medium">Principal</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Transaction</th>
              <th className="px-3 py-2 font-medium">Paid</th>
              <th className="px-5 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const st = statusOf(p);
              return (
                <tr
                  key={String(p.id)}
                  className="border-t border-[color:var(--term-border-faint)] align-top"
                >
                  <td className={cn("break-all px-5 py-2.5", ink)}>
                    {p.to.toText()}
                    {p.uncertain && !p.paid && (
                      <div className="mt-2 flex flex-col gap-2 text-[11px] text-destructive">
                        <span>
                          The ledger did not answer. It may have been sent: look
                          for this principal in the ledger before choosing.
                        </span>
                        {markFor === p.id ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <input
                              value={txInput}
                              onChange={(e) => setTxInput(e.target.value)}
                              placeholder="Transaction id"
                              inputMode="numeric"
                              className={inputCls}
                            />
                            <Button
                              size="sm"
                              disabled={working || !txOk}
                              onClick={() => {
                                onMarkPaid(p, BigInt(txInput.trim()));
                                setMarkFor(null);
                                setTxInput("");
                              }}
                            >
                              Mark paid
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMarkFor(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={working}
                              onClick={() => onPayOne(p, false)}
                            >
                              Check again
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={working}
                              onClick={() => {
                                setMarkFor(p.id);
                                setTxInput("");
                              }}
                            >
                              It was sent
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={working}
                              onClick={() => onPayOne(p, true)}
                            >
                              It was not sent
                            </Button>
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn("px-3 py-2.5 text-right tabular-nums", ink)}
                  >
                    {fmtGoldao(p.amount)}
                  </td>
                  <td className={cn("px-3 py-2.5", st.cls)}>{st.text}</td>
                  <td className="px-3 py-2.5">
                    {p.txId !== undefined ? (
                      <a
                        href={txUrl(p.txId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1 underline",
                          ink,
                        )}
                      >
                        {String(p.txId)}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className={inkFaint}>-</span>
                    )}
                  </td>
                  <td className={cn("px-3 py-2.5", inkFaint)}>
                    {p.paid && p.paidAt > 0n ? fmtDate(p.paidAt) : "-"}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {!p.paid && !p.uncertain && (
                      <Button
                        size="sm"
                        disabled={working}
                        onClick={() => onPayOne(p, false)}
                      >
                        Pay
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className={cn("px-5 py-6 text-center", inkFaint)}
                >
                  {isLoading
                    ? "Loading..."
                    : isError
                      ? "The payments could not be loaded."
                      : "No payments in this tournament."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
