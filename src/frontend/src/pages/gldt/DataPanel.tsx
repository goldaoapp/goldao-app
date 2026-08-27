import { Button } from "@/components/ui/button";
import {
  GLDT_LEDGER_ID,
  GLDT_USDT_POOL_ID,
  type GldtData,
} from "@/lib/gldt-data";
import { Check, Copy, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "./types";

interface Props {
  data: GldtData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onInsert: (text: string) => void;
}

interface Row {
  label: string;
  value: string;
  /** text used for copy / insert; defaults to value */
  insert?: string;
}

export function DataPanel({
  data,
  isLoading,
  isFetching,
  onRefresh,
  onInsert,
}: Props) {
  const d = data;

  const market: Row[] = [
    {
      label: "Price · aggregate",
      value: fmtUsd(d?.priceUsdGecko ?? null, 4),
    },
    {
      label: "Price · ckUSDT pool",
      value: fmtUsd(d?.priceUsdOnchain ?? null, 4),
    },
    {
      label: "Price (ICP)",
      value: d?.priceIcp != null ? `${fmtNum(d.priceIcp, 4)} ICP` : "—",
    },
    {
      label: "Market cap",
      value: fmtUsdCompact(d?.marketCapUsd ?? null),
      insert: fmtUsd(d?.marketCapUsd ?? null, 0),
    },
    { label: "FDV", value: fmtUsdCompact(d?.fdvUsd ?? null) },
    {
      label: "TVL · all pools",
      value: fmtUsdCompact(d?.tvlTotalUsd ?? null),
      insert: fmtUsd(d?.tvlTotalUsd ?? null, 0),
    },
    {
      label: "Volume 24h · all pools",
      value: fmtUsd(d?.volume24hUsd ?? null, 2),
    },
  ];

  const supply: Row[] = [
    {
      label: "Total supply",
      value: d?.totalSupply != null ? `${fmtNum(d.totalSupply, 0)} GLDT` : "—",
      insert: fmtNum(d?.totalSupply ?? null, 0),
    },
    {
      label: "Gold backing",
      value:
        d?.goldGramsBacked != null ? `${fmtNum(d.goldGramsBacked, 2)} g` : "—",
    },
    {
      label: "Gold backing (oz)",
      value: d?.goldOzBacked != null ? `${fmtNum(d.goldOzBacked, 2)} oz` : "—",
    },
    {
      label: "Backing value",
      value: fmtUsdCompact(d?.backingValueUsd ?? null),
    },
    {
      label: "Transfer fee",
      value: d?.transferFee != null ? `${fmtNum(d.transferFee, 3)} GLDT` : "—",
    },
  ];

  const gold: Row[] = [
    { label: "Gold spot (oz)", value: fmtUsd(d?.goldSpotOzUsd ?? null, 2) },
    {
      label: "Implied gold (oz)",
      value: fmtUsd(d?.impliedGoldOzUsd ?? null, 2),
    },
    {
      label: "Intrinsic / GLDT",
      value: fmtUsd(d?.intrinsicPerGldtUsd ?? null, 4),
    },
    { label: "Premium vs gold", value: fmtPct(d?.premiumPct ?? null, 2) },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-subtle">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            GLDT live data
          </span>
          {d && (
            <span className="text-[11px] text-muted-foreground">
              Updated {new Date(d.fetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh"
        >
          <RefreshCw
            className={isFetching ? "size-4 animate-spin" : "size-4"}
          />
        </Button>
      </div>

      {isLoading && !d ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading token data…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Group
            title="Market · GeckoTerminal"
            rows={market}
            onInsert={onInsert}
          />
          <Group
            title="Supply & backing · on-chain"
            rows={supply}
            onInsert={onInsert}
          />
          <Group title="Gold" rows={gold} onInsert={onInsert} />
        </div>
      )}

      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Sources: GLDT ledger ({GLDT_LEDGER_ID.slice(0, 5)}…) on-chain. Price /
        TVL / volume aggregated across all pools via GeckoTerminal; second price
        from the on-chain ICPSwap quote on the deepest pool (
        {GLDT_USDT_POOL_ID.slice(0, 5)}…, GLDT/ckUSDT). ICP via Coinbase; gold
        spot via gold-api.com. 1 GLDT = 0.01 g gold.
      </p>
    </div>
  );
}

function Group({
  title,
  rows,
  onInsert,
}: {
  title: string;
  rows: Row[];
  onInsert: (text: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary/80">
        {title}
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {rows.map((r) => (
          <StatRow key={r.label} row={r} onInsert={onInsert} />
        ))}
      </div>
    </div>
  );
}

function StatRow({
  row,
  onInsert,
}: {
  row: Row;
  onInsert: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = row.insert ?? row.value;
  const disabled = row.value === "—";

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="group flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{row.label}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-sm">{row.value}</span>
        <button
          type="button"
          onClick={copy}
          disabled={disabled}
          aria-label="Copy"
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 disabled:opacity-0"
        >
          {copied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onInsert(text)}
          disabled={disabled}
          aria-label="Insert as text"
          title="Insert into image"
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 disabled:opacity-0"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
