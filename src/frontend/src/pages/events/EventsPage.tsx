import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Flame,
  Info,
  RefreshCw,
  Sprout,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { type IcpNeuronTotals, fetchIcpNeuronTotals } from "@/lib/icp-neuron";
import {
  type Alert,
  BUYBACK_LABEL,
  LOG_SOURCES,
  type LogSource,
  MIN_BUY_RATIO,
  type ParsedPipeline,
  type PipelineEvent,
  type RoundSummary,
  SOURCE_LABEL,
  SPAWN_LIMIT_ICP,
  type Severity,
  type TokenRoundResult,
  currentBuybackMode,
  deriveAlerts,
  fmt,
  fmtDate,
  icpOutlook,
  lastQuote,
  loadPipeline,
} from "@/lib/reward-events";
import { cn } from "@/lib/utils";

type Filter = "all" | LogSource;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sns_rewards", label: SOURCE_LABEL.sns_rewards },
  { value: "icp_neuron", label: SOURCE_LABEL.icp_neuron },
  { value: "buyback_burn", label: SOURCE_LABEL.buyback_burn },
  { value: "sns_neuron_controller", label: SOURCE_LABEL.sns_neuron_controller },
];

const SEVERITY_STYLE: Record<Severity, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  info: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
};

function SeverityIcon({
  severity,
  className,
}: { severity: Severity; className?: string }) {
  const Icon =
    severity === "success"
      ? CheckCircle2
      : severity === "warning"
        ? AlertTriangle
        : severity === "error"
          ? XCircle
          : CircleDot;
  return (
    <Icon
      className={cn(
        "size-4 flex-shrink-0",
        SEVERITY_STYLE[severity],
        className,
      )}
      aria-hidden="true"
    />
  );
}

function countdown(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `in ${d}d ${h % 24}h` : `in ${h}h`;
}

export default function EventsPage() {
  const [pipeline, setPipeline] = useState<ParsedPipeline | null>(null);
  const [errors, setErrors] = useState<Partial<Record<LogSource, string>>>({});
  const [neuron, setNeuron] = useState<IcpNeuronTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [res, totals] = await Promise.all([
      loadPipeline(),
      fetchIcpNeuronTotals(),
    ]);
    setPipeline(res.pipeline);
    setErrors(res.errors);
    setNeuron(totals);
    setUpdatedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const alerts = useMemo(
    () => (pipeline ? deriveAlerts(pipeline) : []),
    [pipeline],
  );
  const outlook = useMemo(
    () => (pipeline ? icpOutlook(pipeline) : null),
    [pipeline],
  );
  const events = useMemo(
    () =>
      (pipeline?.events ?? []).filter(
        (e) => filter === "all" || e.source === filter,
      ),
    [pipeline, filter],
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Pipeline"
        tagIcon={Activity}
        title="Reward Events"
        description="What happened in the reward pipeline over the last weeks, read live from the public logs of the Gold DAO canisters."
      >
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              Updated{" "}
              {new Date(updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            data-ocid="events.refresh"
          >
            <RefreshCw
              className={cn("size-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
      </PageHeader>

      {Object.keys(errors).length > 0 && (
        <p className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not read logs from:{" "}
          {Object.keys(errors)
            .map((k) => SOURCE_LABEL[k as LogSource])
            .join(", ")}
          . The rest of the page uses what loaded.
        </p>
      )}

      {loading && !pipeline ? (
        <LoadingState />
      ) : pipeline && outlook ? (
        <div className="flex flex-col gap-8">
          {alerts.length > 0 && <AlertList alerts={alerts} />}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NextRoundCard outlook={outlook} />
            <NeuronCard pipeline={pipeline} neuron={neuron} />
            <BuybackCard pipeline={pipeline} />
            <LastRoundCard rounds={pipeline.rounds} />
          </div>

          <RoundsTable rounds={pipeline.rounds} />

          <Card className="border-border/80 shadow-subtle">
            <CardHeader className="gap-4">
              <CardTitle className="font-display text-lg">Timeline</CardTitle>
              <div
                className="flex flex-wrap gap-2"
                role="tablist"
                aria-label="Filter events"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-smooth",
                      filter === f.value
                        ? "border-primary/50 bg-primary/12 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <Timeline events={events} />
            </CardContent>
          </Card>

          <LogWindow pipeline={pipeline} />
        </div>
      ) : null}
    </section>
  );
}

/* ── Sections ───────────────────────────────────────────────────────────── */

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((k) => (
          <Skeleton key={k} className="h-40 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

function AlertList({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="flex flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.title}
          className={cn(
            "flex gap-3 rounded-lg border px-4 py-3",
            a.severity === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-amber-500/40 bg-amber-500/10",
          )}
        >
          <SeverityIcon severity={a.severity} className="mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">{a.title}</p>
            <p className="text-sm text-muted-foreground">{a.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Activity;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/80 shadow-subtle">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {label}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

function NextRoundCard({
  outlook,
}: { outlook: ReturnType<typeof icpOutlook> }) {
  const icpBadge =
    outlook.icp === "expected"
      ? {
          text: "ICP expected",
          cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        }
      : outlook.icp === "not_expected"
        ? {
            text: "ICP unlikely",
            cls: "border-amber-500/40 text-amber-600 dark:text-amber-400",
          }
        : { text: "ICP unknown", cls: "" };
  return (
    <SummaryCard icon={CalendarClock} label="Next round">
      <span className="font-display text-2xl font-bold">
        {fmtDate(outlook.nextRoundTs, true)}
      </span>
      <span className="text-sm text-muted-foreground">
        {countdown(outlook.nextRoundTs)} · Wednesdays 14:00 UTC
      </span>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className={icpBadge.cls}>
          {icpBadge.text}
        </Badge>
        <Badge variant="outline">OGY weekly</Badge>
        {outlook.gldtThisRound && (
          <Badge variant="outline" className="border-primary/40 text-primary">
            GLDT monthly
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{outlook.icpReason}</p>
    </SummaryCard>
  );
}

function NeuronCard({
  pipeline,
  neuron,
}: { pipeline: ParsedPipeline; neuron: IcpNeuronTotals | null }) {
  const pct = neuron
    ? Math.min(100, (neuron.maturity / SPAWN_LIMIT_ICP) * 100)
    : 0;
  return (
    <SummaryCard icon={Sprout} label="NNS neuron">
      {neuron ? (
        <>
          <span className="font-display text-2xl font-bold">
            {fmt(neuron.maturity)}{" "}
            <span className="text-base font-medium text-muted-foreground">
              / {SPAWN_LIMIT_ICP} ICP
            </span>
          </span>
          <Progress value={pct} aria-label="Maturity towards next spawn" />
          <span className="text-sm text-muted-foreground">
            Maturity until next spawn · {fmt(neuron.staked, 0)} ICP staked
            {neuron.count > 1 ? ` in ${neuron.count} neurons` : ""}
          </span>
        </>
      ) : (
        <span className="text-sm text-muted-foreground">
          Live maturity unavailable.
        </span>
      )}
      <p className="text-xs text-muted-foreground">
        Last spawn:{" "}
        {pipeline.lastSpawn
          ? fmtDate(pipeline.lastSpawn.ts)
          : "not in log window"}{" "}
        · Last disbursal:{" "}
        {pipeline.lastDisburse
          ? fmtDate(pipeline.lastDisburse.ts)
          : "not in log window"}
      </p>
    </SummaryCard>
  );
}

function BuybackCard({ pipeline }: { pipeline: ParsedPipeline }) {
  const mode = currentBuybackMode(pipeline);
  const goldao = lastQuote(pipeline, "goldao");
  const ogy = lastQuote(pipeline, "ogy");
  return (
    <SummaryCard icon={ArrowRightLeft} label="Buyback mode">
      <span className="font-display text-xl font-bold leading-tight">
        {mode ? BUYBACK_LABEL[mode.mode] : "No recent activity"}
      </span>
      {mode && (
        <span className="text-sm text-muted-foreground">
          Last run {fmtDate(mode.ts, true)}
        </span>
      )}
      <div className="flex flex-col gap-1 font-mono text-xs">
        {goldao && (
          <QuoteLine
            label="GOLDAO/ICP"
            quote={goldao.quote}
            min={MIN_BUY_RATIO.goldao ?? 0}
          />
        )}
        {ogy && (
          <QuoteLine
            label="OGY/ICP"
            quote={ogy.quote}
            min={MIN_BUY_RATIO.ogy ?? 0}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Priority: GOLDAO burn → OGY stake → compound ICP. The first whose
        minimum price is met runs.
      </p>
    </SummaryCard>
  );
}

function QuoteLine({
  label,
  quote,
  min,
}: { label: string; quote: number; min: number }) {
  const ok = quote >= min;
  return (
    <span className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          ok
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400"
        }
      >
        {fmt(quote, 1)} {ok ? "≥" : "<"} {min}
      </span>
    </span>
  );
}

function LastRoundCard({ rounds }: { rounds: RoundSummary[] }) {
  const last = rounds.find((r) =>
    Object.keys(r.tokens).some((t) => t !== "GLDT"),
  );
  const paid = last
    ? Object.values(last.tokens).filter((t) => t.status === "paid")
    : [];
  const neurons = paid[0]?.neurons;
  return (
    <SummaryCard
      icon={Flame}
      label={last ? `Last round · #${last.roundId}` : "Last round"}
    >
      {last ? (
        <>
          <span className="text-sm text-muted-foreground">
            {fmtDate(last.ts, true)}
          </span>
          <div className="flex flex-col gap-1">
            {(["ICP", "OGY"] as const).map((tk) => (
              <div
                key={tk}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-sm text-muted-foreground">{tk}</span>
                <TokenCell result={last.tokens[tk]} large />
              </div>
            ))}
          </div>
          {neurons && (
            <span className="text-xs text-muted-foreground">
              {fmt(neurons, 0)} eligible neurons paid
            </span>
          )}
        </>
      ) : (
        <span className="text-sm text-muted-foreground">
          No round in the log window.
        </span>
      )}
    </SummaryCard>
  );
}

function TokenCell({
  result,
  large,
}: { result?: TokenRoundResult; large?: boolean }) {
  if (!result) return <span className="text-muted-foreground">—</span>;
  if (result.status === "paid" || result.status === "partial")
    return (
      <span
        className={cn(
          "font-mono",
          large ? "font-display text-lg font-semibold" : "text-sm",
        )}
      >
        {fmt(result.amount ?? 0)}
        {result.status === "partial" && (
          <span className="ml-1 text-destructive">(partial)</span>
        )}
      </span>
    );
  return (
    <Badge
      variant="outline"
      title={result.reason}
      className={
        result.status === "invalid"
          ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
          : result.status === "failed"
            ? "border-destructive/40 text-destructive"
            : "text-muted-foreground"
      }
    >
      {result.status === "invalid"
        ? "Skipped"
        : result.status === "failed"
          ? "Failed"
          : "Empty"}
    </Badge>
  );
}

function RoundsTable({ rounds }: { rounds: RoundSummary[] }) {
  if (rounds.length === 0) return null;
  const tokens = ["ICP", "OGY", "GLDT"];
  return (
    <Card className="border-border/80 shadow-subtle">
      <CardHeader>
        <CardTitle className="font-display text-lg">
          Distribution rounds
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Total paid to all eligible GOLDAO neurons per round. Your share is
          proportional to your maturity gained since the last paid round.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Round</th>
              <th className="py-2 pr-4 font-medium">Date</th>
              {tokens.map((t) => (
                <th key={t} className="py-2 pr-4 text-right font-medium">
                  {t}
                </th>
              ))}
              <th className="py-2 text-right font-medium">Neurons</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const neurons = Object.values(r.tokens).find(
                (t) => t.neurons,
              )?.neurons;
              return (
                <tr
                  key={r.roundId}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="py-2.5 pr-4 font-mono">#{r.roundId}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {fmtDate(r.ts)}
                  </td>
                  {tokens.map((t) => (
                    <td key={t} className="py-2.5 pr-4 text-right">
                      <TokenCell result={r.tokens[t]} />
                    </td>
                  ))}
                  <td className="py-2.5 text-right font-mono text-muted-foreground">
                    {neurons ? fmt(neurons, 0) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 flex-shrink-0" aria-hidden="true" />
          "Skipped" means no new ICP reached the pool that week. Unpaid maturity
          is not lost: it is included in the next paid round.
        </p>
      </CardContent>
    </Card>
  );
}

function Timeline({ events }: { events: PipelineEvent[] }) {
  if (events.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No events in the log window.
      </p>
    );
  const groups: { day: string; items: PipelineEvent[] }[] = [];
  for (const e of events) {
    const day = new Date(e.ts).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }
  return (
    <ol className="flex flex-col gap-6">
      {groups.map((g) => (
        <li key={g.day} className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {g.day}
          </span>
          <ul className="flex flex-col border-l border-border">
            {g.items.map((e) => (
              <li key={e.id} className="relative flex gap-3 py-2 pl-4">
                <SeverityIcon severity={e.severity} className="mt-0.5" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {e.title}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-muted-foreground"
                    >
                      {SOURCE_LABEL[e.source]}
                    </Badge>
                  </div>
                  {e.detail && (
                    <p className="break-words text-sm text-muted-foreground">
                      {e.detail}
                    </p>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(e.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function LogWindow({ pipeline }: { pipeline: ParsedPipeline }) {
  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <span>
        Each canister keeps only its last ~100 log lines, so the visible history
        differs per source:
      </span>
      <ul className="flex flex-wrap gap-x-6 gap-y-1">
        {(Object.keys(LOG_SOURCES) as LogSource[]).map((src) => {
          const w = pipeline.window[src];
          return (
            <li key={src}>
              <a
                href={`https://${LOG_SOURCES[src]}.raw.icp0.io/logs`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                {SOURCE_LABEL[src]}
              </a>
              : {w ? `${fmtDate(w.from)} → ${fmtDate(w.to)}` : "unavailable"}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
