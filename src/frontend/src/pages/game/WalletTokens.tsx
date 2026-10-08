import type { GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  GOLDAO_LEDGER,
  fetchWalletBalance,
  transferGoldao,
} from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { Spinner } from "./Spinner";
import { fmtGoldao, inkFaint } from "./game-utils";
import { TEST_TOKEN_LABEL } from "./ledger-mode";
import { errorMessage } from "./useGame";

const E8S = 100_000_000n;

/** "12.5" -> e8s. Null when the text is not a positive amount. */
function parseAmount(text: string): bigint | null {
  if (!/^\d+(\.\d{1,8})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const v = BigInt(whole) * E8S + BigInt(frac.padEnd(8, "0"));
  return v > 0n ? v : null;
}

function formatE8s(v: bigint): string {
  const whole = v / E8S;
  const frac = (v % E8S).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export interface Token {
  ledgerId: string;
  label: string;
}

/**
 * The tokens the wallet shows and their balances. The list comes from the game's ledger id: with
 * the real GOLDAO there is a single token; while testing there are two, and the second one is the
 * one the game uses.
 */
export function useTokenBalances(config: GameConfig | undefined) {
  const { principalId } = useAuth();
  const active = config?.ledgerId ?? GOLDAO_LEDGER;
  const tokens: Token[] = [{ ledgerId: GOLDAO_LEDGER, label: "GOLDAO" }];
  if (active !== GOLDAO_LEDGER) {
    tokens.push({ ledgerId: active, label: TEST_TOKEN_LABEL });
  }
  const ids = tokens.map((t) => t.ledgerId);

  const query = useQuery({
    queryKey: ["game", "wallet", "tokens", principalId, ids],
    queryFn: async () => {
      const out: Record<string, bigint | null> = {};
      await Promise.all(
        tokens.map(async (t) => {
          try {
            out[t.ledgerId] = await fetchWalletBalance(
              principalId as string,
              t.ledgerId,
            );
          } catch {
            out[t.ledgerId] = null;
          }
        }),
      );
      return out;
    },
    enabled: !!principalId,
    refetchInterval: 15_000,
  });

  return {
    tokens,
    active: tokens.find((t) => t.ledgerId === active) ?? tokens[0],
    balances: query.data,
  };
}

/**
 * Send from the player's wallet. The same for every token. It signs with the player's own
 * identity straight to the ledger: the game backend is not involved.
 */
export function SendForm({
  config,
  tokens,
  active,
  balances,
  onResult,
}: {
  config: GameConfig | undefined;
  tokens: Token[];
  active: Token;
  balances: Record<string, bigint | null> | undefined;
  onResult: (m: { ok: boolean; text: string }) => void;
}) {
  const { principalId } = useAuth();
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();

  const [picked, setPicked] = useState<string | null>(null);
  const selected = tokens.find((t) => t.ledgerId === picked) ?? active;
  const balance = balances?.[selected.ledgerId] ?? 0n;
  const fee = config?.feeE8s ?? 1_000_000_000n;

  const [dest, setDest] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ask, setAsk] = useState(false);

  const destPrincipal = (() => {
    try {
      const p = Principal.fromText(dest.trim());
      return p.isAnonymous() || p.toText() === principalId ? null : p;
    } catch {
      return null;
    }
  })();
  const amount = parseAmount(text.trim());
  const block = !destPrincipal
    ? "Enter a valid destination address."
    : !amount
      ? "Enter an amount."
      : amount + fee > balance
        ? "Not enough balance (the fee is paid on top)."
        : null;

  const send = async () => {
    if (!identity || !destPrincipal || !amount || sending) return;
    setSending(true);
    try {
      await transferGoldao(
        identity,
        destPrincipal.toText(),
        amount,
        selected.ledgerId,
      );
      await queryClient.invalidateQueries({ queryKey: ["game", "wallet"] });
      setText("");
      setDest("");
      onResult({
        ok: true,
        text: `Sent ${formatE8s(amount)} ${selected.label} to ${destPrincipal.toText().slice(0, 5)}…`,
      });
    } catch (e) {
      onResult({ ok: false, text: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const field =
    "rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {tokens.length > 1 && (
          <select
            value={selected.ledgerId}
            onChange={(e) => setPicked(e.target.value)}
            disabled={sending}
            className={field}
          >
            {tokens.map((t) => (
              <option key={t.ledgerId} value={t.ledgerId}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        <input
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="To (address)"
          disabled={sending}
          className={cn(field, "w-80 max-w-full")}
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="Amount"
          inputMode="decimal"
          disabled={sending}
          className={cn(field, "w-28")}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={sending || balance <= fee}
          onClick={() => setText(formatE8s(balance - fee))}
        >
          Max
        </Button>
        <Button
          size="sm"
          disabled={sending || !!block}
          onClick={() => setAsk(true)}
          className="gradient-primary text-primary-foreground"
        >
          {sending ? <Spinner /> : null}
          Send
        </Button>
      </div>
      <span className={cn("font-mono text-[11px]", inkFaint)}>
        {dest || text
          ? (block ?? `Fee ${fmtGoldao(fee)} ${selected.label}, paid on top.`)
          : `Fee ${fmtGoldao(fee)} ${selected.label}, paid on top.`}
      </span>

      {ask && destPrincipal && amount && (
        <ConfirmDialog
          title={`Send ${formatE8s(amount)} ${selected.label}?`}
          detail={`To ${destPrincipal.toText()}. The network fee is paid on top. This cannot be undone.`}
          busy={sending}
          onCancel={() => setAsk(false)}
          onConfirm={() => {
            setAsk(false);
            void send();
          }}
        />
      )}
    </div>
  );
}
