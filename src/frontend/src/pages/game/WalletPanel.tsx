import type { Dashboard, GameConfig } from "@/backend";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { transferGoldao } from "@/lib/goldao-ledger";
import { useInternetIdentity } from "@/lib/internet-identity";
import { cn } from "@/lib/utils";
import { Principal } from "@icp-sdk/core/principal";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Droplets, ShieldCheck, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { CopyField } from "./CopyField";
import { Spinner } from "./Spinner";
import { eyebrow, fmtGoldao, gold, ink, inkFaint, panel } from "./game-utils";
import { errorMessage, useGameAction } from "./useGame";
import { useWallet } from "./useWallet";

const FAUCET_PRESETS = [1_000, 5_000, 10_000, 20_000];
const LOAD_PRESETS = [200, 500, 1_000, 2_000, 5_000];
const E8S = 100_000_000n;

/** "12.5" -> e8s. Null when the text is not a positive amount. */
function parseGoldao(text: string): bigint | null {
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

interface Props {
  dashboard: Dashboard | undefined;
  config: GameConfig | undefined;
}

export function WalletPanel({ dashboard, config }: Props) {
  const { actor, principalId } = useAuth();
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const { run, pending } = useGameAction();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { balance, allowance, real, ensureAllowance } = useWallet(
    dashboard,
    config,
  );
  const [amount, setAmount] = useState(500);
  const [loading, setLoading] = useState(false);
  const fee = config?.feeE8s ?? 1_000_000_000n;
  const credit = dashboard?.credit ?? 0n;
  const need = BigInt(amount) * E8S + fee;
  // Real mode: if the game is not authorized yet (first load, or the authorization expired),
  // the wallet also pays the fee of that authorization.
  const needsAuthFee = real && allowance < need;
  const room =
    config && config.creditCapE8s > credit ? config.creditCapE8s - credit : 0n;
  const roomGoldao = Number(room / E8S);
  const loadMin = config ? Number(config.loadMin) : 0;
  // Most that can be loaded now: the per-load maximum or what is left under the Accumulated prize limit.
  const maxLoad = config ? Math.min(Number(config.loadMax), roomGoldao) : 0;
  const canLoad = !config || maxLoad >= loadMin;
  // Only amounts that fit; "Max" covers the rest (for example 50 left under the limit).
  const presets = LOAD_PRESETS.filter(
    (a) => !config || (a >= loadMin && a <= maxLoad),
  );
  const showMax = !!config && canLoad && !presets.includes(maxLoad);
  const loadBlock = !dashboard
    ? "Loading"
    : dashboard.paused
      ? "Bets are paused."
      : !canLoad
        ? `Accumulated prize is full (limit ${fmtGoldao(config?.creditCapE8s ?? 0n)} GOLDAO). You can load again after you use some of it.`
        : amount < loadMin || amount > maxLoad
          ? `Choose between ${loadMin.toLocaleString("en-US")} and ${maxLoad.toLocaleString("en-US")} GOLDAO.`
          : balance < need
            ? "Not enough GOLDAO in your wallet."
            : null;

  // If the chosen amount no longer fits (the Accumulated prize grew), move it to the biggest one that does.
  useEffect(() => {
    if (!config || !canLoad || amount <= maxLoad) return;
    const fit = [...presets].reverse().find((a) => a <= maxLoad);
    setAmount(fit ?? maxLoad);
  }, [config, canLoad, amount, maxLoad, presets]);

  // A green confirmation goes away by itself; errors stay until the next action.
  useEffect(() => {
    if (!msg?.ok) return;
    const t = window.setTimeout(() => setMsg(null), 6000);
    return () => window.clearTimeout(t);
  }, [msg]);

  const [dest, setDest] = useState("");
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [askSend, setAskSend] = useState(false);

  const destPrincipal = (() => {
    try {
      const p = Principal.fromText(dest.trim());
      return p.isAnonymous() || p.toText() === principalId ? null : p;
    } catch {
      return null;
    }
  })();
  const sendAmount = parseGoldao(sendText.trim());
  const sendBlock = !destPrincipal
    ? "Enter a valid destination address."
    : !sendAmount
      ? "Enter an amount."
      : sendAmount + fee > balance
        ? "Not enough GOLDAO in your wallet (the fee is paid on top)."
        : null;

  const sendFromWallet = async () => {
    if (!identity || !destPrincipal || !sendAmount || sending) return;
    setMsg(null);
    setSending(true);
    try {
      await transferGoldao(identity, destPrincipal.toText(), sendAmount);
      await queryClient.invalidateQueries({ queryKey: ["game", "wallet"] });
      setSendText("");
      setMsg({
        ok: true,
        text: `Sent ${formatE8s(sendAmount)} GOLDAO to ${destPrincipal.toText().slice(0, 5)}…`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  const loadCredit = async () => {
    if (!actor || loading || loadBlock) return;
    setMsg(null);
    setLoading(true);
    try {
      await ensureAllowance(need);
      const total = await run(
        "load",
        () => actor.gameLoadCredit(BigInt(amount)),
        "live",
      );
      setMsg({
        ok: true,
        text: `Accumulated prize is now ${fmtGoldao(total)} GOLDAO.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setLoading(false);
    }
  };
  const faucetLeft = dashboard ? Number(dashboard.faucetRemaining) / 1e8 : 0;

  const act = async (
    name: string,
    call: () => Promise<
      { __kind__: "ok"; ok: bigint } | { __kind__: "err"; err: string }
    >,
    text: string,
  ) => {
    setMsg(null);
    try {
      await run(name, call);
      setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <div className={cn(panel, "grid gap-0 overflow-hidden md:grid-cols-3")}>
      <div className="flex flex-col gap-2 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Wallet className="size-3.5" /> Wallet
        </span>
        <motion.span
          key={String(balance)}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(balance) : <Spinner />}
          <span className={cn("ml-2 font-mono text-xs", gold)}>GOLDAO</span>
        </motion.span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {real ? "GOLDAO ledger" : "Test tokens"}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-b border-[color:var(--term-border-faint)] p-5 md:border-b-0 md:border-r">
        <span className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}>
          <Coins className="size-3.5" /> Load balance
        </span>
        <span
          className={cn(
            "font-display text-2xl font-semibold tabular-nums",
            ink,
          )}
        >
          {dashboard ? fmtGoldao(dashboard.credit) : <Spinner />}
          <span className={cn("ml-2 font-mono text-xs", gold)}>GOLDAO</span>
        </span>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {dashboard && dashboard.pendingPayout > 0n
            ? `Pending payout from last tournament: ${fmtGoldao(dashboard.pendingPayout)}`
            : "Accumulated prize. Backs your stakes. Paid when the tournament closes"}
        </span>
        {config && (
          <span className={cn("font-mono text-[11px]", inkFaint)}>
            Limit {fmtGoldao(config.creditCapE8s)} GOLDAO.{" "}
            {canLoad
              ? `You can load up to ${maxLoad.toLocaleString("en-US")} more now.`
              : "It is full, so loading is off until you use some of it."}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          {presets.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === amount ? "default" : "outline"}
              disabled={loading || !!pending}
              onClick={() => setAmount(a)}
              className="font-mono text-xs"
            >
              {a.toLocaleString("en-US")}
            </Button>
          ))}
          {showMax && (
            <Button
              size="sm"
              variant={amount === maxLoad ? "default" : "outline"}
              disabled={loading || !!pending}
              onClick={() => setAmount(maxLoad)}
              className="font-mono text-xs"
            >
              Max {maxLoad.toLocaleString("en-US")}
            </Button>
          )}
        </div>
        <Button
          size="sm"
          disabled={loading || !!pending || !!loadBlock}
          onClick={() => void loadCredit()}
          className="w-fit gradient-primary text-primary-foreground"
        >
          {loading ? <Spinner /> : null}
          Load {amount.toLocaleString("en-US")} GOLDAO
        </Button>
        <span className={cn("font-mono text-[11px]", inkFaint)}>
          {loadBlock && dashboard
            ? loadBlock
            : needsAuthFee
              ? `Your wallet pays ${amount.toLocaleString("en-US")} + ${fmtGoldao(fee)} network fee, plus ${fmtGoldao(fee)} the first time to authorize the game.`
              : `Your wallet pays ${amount.toLocaleString("en-US")} + ${fmtGoldao(fee)} network fee.`}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        {real ? (
          <>
            <span
              className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}
            >
              <ShieldCheck className="size-3.5" /> Wallet play
            </span>
            <span className={cn("text-xs", inkFaint)}>
              The game authorizes itself the first time you load balance. Your
              wallet is only charged when you load.
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(eyebrow, inkFaint, "flex items-center gap-1.5")}
            >
              <Droplets className="size-3.5" /> Test faucet
            </span>
            <span className={cn("text-xs", inkFaint)}>
              {config
                ? `Up to ${fmtGoldao(config.faucetCapE8s)} test GOLDAO per tournament. `
                : ""}
              {faucetLeft >= FAUCET_PRESETS[0]
                ? `${faucetLeft.toLocaleString("en-US")} left.`
                : "You have used them for this tournament. They come back with the next one."}
            </span>
            <div className="flex flex-wrap gap-2">
              {FAUCET_PRESETS.map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant="outline"
                  disabled={!!pending || a > faucetLeft}
                  onClick={() =>
                    void act(
                      "faucet",
                      () => actor!.gameRequestTestTokens(BigInt(a)),
                      `${a.toLocaleString("en-US")} test GOLDAO added.`,
                    )
                  }
                  className="font-mono text-xs"
                >
                  +{a.toLocaleString("en-US")}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      {real && principalId && (
        <div className="flex flex-col gap-5 border-t border-[color:var(--term-border-faint)] p-5 md:col-span-3">
          <CopyField
            label="Your wallet address: send GOLDAO here from any wallet to deposit"
            value={principalId}
          />
          <div className="flex flex-col gap-2">
            <span className={cn(eyebrow, inkFaint)}>Withdraw from wallet</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                placeholder="Destination address"
                disabled={sending}
                className="w-80 max-w-full rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
              />
              <input
                value={sendText}
                onChange={(e) =>
                  setSendText(e.target.value.replace(/[^\d.]/g, ""))
                }
                placeholder="Amount"
                inputMode="decimal"
                disabled={sending}
                className="w-32 rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={sending || balance <= fee}
                onClick={() => setSendText(formatE8s(balance - fee))}
              >
                Max
              </Button>
              <Button
                size="sm"
                disabled={sending || !!sendBlock}
                onClick={() => setAskSend(true)}
                className="gradient-primary text-primary-foreground"
              >
                {sending ? <Spinner /> : null}
                Withdraw
              </Button>
            </div>
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              {dest || sendText
                ? (sendBlock ??
                  `Network fee ${fmtGoldao(fee)} GOLDAO, paid on top.`)
                : `Sends GOLDAO from your wallet to any address. Network fee ${fmtGoldao(fee)} GOLDAO, paid on top. Accumulated prize is not affected.`}
            </span>
          </div>
        </div>
      )}

      {askSend && destPrincipal && sendAmount && (
        <ConfirmDialog
          title={`Send ${formatE8s(sendAmount)} GOLDAO?`}
          detail={`To ${destPrincipal.toText()}. The network fee is paid on top. This cannot be undone.`}
          busy={sending}
          onCancel={() => setAskSend(false)}
          onConfirm={() => {
            setAskSend(false);
            void sendFromWallet();
          }}
        />
      )}

      {msg && (
        <p
          className={cn(
            "border-t border-[color:var(--term-border-faint)] px-5 py-2 font-mono text-xs md:col-span-3",
            msg.ok ? "text-[color:var(--term-green)]" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
