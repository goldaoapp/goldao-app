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
import { CopyField } from "./CopyField";
import { Spinner } from "./Spinner";
import { eyebrow, fmtGoldao, gold, inkFaint, inkMid } from "./game-utils";
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

interface Token {
  ledgerId: string;
  label: string;
}

/**
 * The player's address and the balance of each token it holds, with a send form that works the
 * same for every token. The token the game uses right now is marked. The list comes from the
 * game's ledger id: with the real GOLDAO there is a single token and this shows just that one.
 */
export function WalletTokens({ config }: { config: GameConfig | undefined }) {
  const { principalId } = useAuth();
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();

  const active = config?.ledgerId ?? GOLDAO_LEDGER;
  const tokens: Token[] = [{ ledgerId: GOLDAO_LEDGER, label: "GOLDAO" }];
  if (active !== GOLDAO_LEDGER) {
    tokens.push({ ledgerId: active, label: TEST_TOKEN_LABEL });
  }

  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    tokens.find((t) => t.ledgerId === picked) ??
    tokens.find((t) => t.ledgerId === active) ??
    tokens[0];

  const balances = useQuery({
    queryKey: [
      "game",
      "wallet",
      "tokens",
      principalId,
      tokens.map((t) => t.ledgerId),
    ],
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

  const fee = config?.feeE8s ?? 1_000_000_000n;
  const selectedBalance = balances.data?.[selected.ledgerId] ?? 0n;

  const [dest, setDest] = useState("");
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const destPrincipal = (() => {
    try {
      const p = Principal.fromText(dest.trim());
      return p.isAnonymous() || p.toText() === principalId ? null : p;
    } catch {
      return null;
    }
  })();
  const amount = parseAmount(sendText.trim());
  const block = !destPrincipal
    ? "Enter a valid destination address."
    : !amount
      ? "Enter an amount."
      : amount + fee > selectedBalance
        ? `Not enough ${selected.label} in your wallet (the fee is paid on top).`
        : null;

  const send = async () => {
    if (!identity || !destPrincipal || !amount || sending) return;
    setMsg(null);
    setSending(true);
    try {
      await transferGoldao(
        identity,
        destPrincipal.toText(),
        amount,
        selected.ledgerId,
      );
      await queryClient.invalidateQueries({ queryKey: ["game", "wallet"] });
      setSendText("");
      setMsg({
        ok: true,
        text: `Sent ${formatE8s(amount)} ${selected.label} to ${destPrincipal.toText().slice(0, 5)}…`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  if (!principalId) return null;

  return (
    <div className="flex flex-col gap-5 border-t border-[color:var(--term-border-faint)] p-5 md:col-span-3">
      <CopyField
        label="Your wallet address: send tokens here from any wallet to deposit"
        value={principalId}
      />

      <div className="flex flex-col gap-2">
        <span className={cn(eyebrow, inkFaint)}>Your tokens</span>
        <ul className="flex flex-col gap-1.5">
          {tokens.map((t) => {
            const b = balances.data?.[t.ledgerId];
            const used = t.ledgerId === active;
            return (
              <li
                key={t.ledgerId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs"
              >
                <span className={cn("w-28 font-semibold", gold)}>
                  {t.label}
                </span>
                <span className="w-40 tabular-nums">
                  {balances.isLoading ? (
                    <Spinner />
                  ) : b == null ? (
                    "unavailable"
                  ) : (
                    fmtGoldao(b)
                  )}
                </span>
                {used ? (
                  <span className="rounded-md border border-[color:var(--term-green)] px-2 py-0.5 text-[11px] text-[color:var(--term-green)]">
                    Used by the game
                  </span>
                ) : (
                  <span className={cn("text-[11px]", inkFaint)}>
                    Not used by the game
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <span className={cn(eyebrow, inkFaint)}>Send from wallet</span>
        <div className="flex flex-wrap items-center gap-2">
          {tokens.length > 1 && (
            <select
              value={selected.ledgerId}
              onChange={(e) => setPicked(e.target.value)}
              disabled={sending}
              className="rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
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
            placeholder="Destination address"
            disabled={sending}
            className="w-80 max-w-full rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
          />
          <input
            value={sendText}
            onChange={(e) => setSendText(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Amount"
            inputMode="decimal"
            disabled={sending}
            className="w-32 rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={sending || selectedBalance <= fee}
            onClick={() => setSendText(formatE8s(selectedBalance - fee))}
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
          {dest || sendText
            ? (block ??
              `Network fee ${fmtGoldao(fee)} ${selected.label}, paid on top.`)
            : `Sends ${selected.label} from your wallet to any address. Network fee ${fmtGoldao(fee)} ${selected.label}, paid on top. Accumulated prize is not affected.`}
        </span>
        {msg && (
          <span
            className={cn(
              "font-mono text-xs",
              msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
            )}
          >
            {msg.text}
          </span>
        )}
      </div>

      <span className={cn("text-[11px]", inkMid)}>
        The game only uses the token marked "Used by the game". The other one
        stays in your wallet and is never touched.
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
