/**
 * Reward pipeline events — read-only view of the public canister logs.
 *
 * Each Gold DAO canister exposes its last ~100 log lines at
 * https://<canister>.raw.icp0.io/logs (NDJSON, one JSON object per entry).
 * Nothing is persisted: every load reads the current window and parses it.
 *
 * Why logs instead of Candid: sns_rewards' get_historic_payment_round(s)
 * exceeds the instruction limit, so the log is the only practical source for
 * "what happened in the last rounds".
 */

/* ── Canisters ──────────────────────────────────────────────────────────── */

export const LOG_SOURCES = {
  sns_rewards: "iyehc-lqaaa-aaaap-ab25a-cai",
  icp_neuron: "j4jiq-sqaaa-aaaap-ab23a-cai",
  buyback_burn: "atslz-hiaaa-aaaam-acq6q-cai",
  sns_neuron_controller: "54vkq-taaaa-aaaap-ahqra-cai",
} as const;

export type LogSource = keyof typeof LOG_SOURCES;

export const SOURCE_LABEL: Record<LogSource, string> = {
  sns_rewards: "Staker rewards",
  icp_neuron: "NNS neuron",
  buyback_burn: "Buyback",
  sns_neuron_controller: "OGY / WTN neurons",
};

/*
 * buyback_burn job ids (from governance config, confirmed against quotes in
 * the logs: job 2 quotes ~500 GOLDAO/ICP, job 3 quotes ~2,300 OGY/ICP).
 * Constrained jobs run by priority; when none passes, ICP is compounded.
 */
export const BUYBACK_JOBS: Record<number, BuybackMode> = {
  1: "gldt",
  2: "goldao",
  3: "ogy",
};

export const MIN_BUY_RATIO: Partial<Record<BuybackMode, number>> = {
  goldao: 500,
  ogy: 1000,
};

export type BuybackMode = "goldao" | "ogy" | "compound" | "gldt";

export const BUYBACK_LABEL: Record<BuybackMode, string> = {
  goldao: "Buy & burn GOLDAO",
  ogy: "Buy & stake OGY",
  compound: "Compound ICP into NNS neuron",
  gldt: "Buy GLDT",
};

export const SPAWN_LIMIT_ICP = 1000;
export const SPAWN_DISSOLVE_DAYS = 7;
const DAY_MS = 86_400_000;
const E8S = 1e8;

/* ── Raw log entry ──────────────────────────────────────────────────────── */

export interface RawLogEntry {
  timestamp: number; // ms
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

export function parseLogText(text: string): RawLogEntry[] {
  const out: RawLogEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const o = JSON.parse(trimmed) as {
        timestamp?: string | number;
        level?: string;
        fields?: Record<string, unknown>;
      };
      const fields = o.fields ?? {};
      const message =
        (typeof fields.message === "string" && fields.message) ||
        (typeof fields.print_string === "string" && fields.print_string) ||
        JSON.stringify(fields);
      out.push({
        timestamp: Number(o.timestamp ?? 0),
        level: o.level ?? "INFO",
        message,
        fields,
      });
    } catch {
      // skip malformed line
    }
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchLogs(source: LogSource): Promise<RawLogEntry[]> {
  const res = await fetch(`https://${LOG_SOURCES[source]}.raw.icp0.io/logs`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${source} logs: HTTP ${res.status}`);
  return parseLogText(await res.text());
}

/* ── Normalized events ──────────────────────────────────────────────────── */

export type Severity = "success" | "info" | "warning" | "error";

export type EventKind =
  | "round_paid"
  | "round_skipped"
  | "round_invalid"
  | "round_error"
  | "neuron_spawn"
  | "neuron_disburse"
  | "cycle_management"
  | "canister_upgrade"
  | "buyback"
  | "buyback_error"
  | "burn"
  | "ogy_claim"
  | "wtn_claim"
  | "controller_error"
  | "neuron_error";

export interface PipelineEvent {
  id: string;
  ts: number;
  source: LogSource;
  kind: EventKind;
  severity: Severity;
  title: string;
  detail?: string;
  token?: string;
  amount?: number; // whole tokens
  roundId?: number;
  mode?: BuybackMode;
}

export interface TokenRoundResult {
  token: string;
  status: "paid" | "partial" | "failed" | "skipped" | "invalid";
  amount?: number;
  neurons?: number;
  successful?: number;
  retries?: number;
  reason?: string;
}

export interface RoundSummary {
  roundId: number;
  ts: number;
  tokens: Record<string, TokenRoundResult>;
}

export interface BuybackRun {
  ts: number;
  mode: BuybackMode;
  icp: number; // ICP sent to the swap / stake
  quote?: number; // tokens per 1 ICP
}

export interface QuoteCheck {
  ts: number;
  mode: BuybackMode;
  quote: number;
  passed: boolean;
}

export interface ParsedPipeline {
  events: PipelineEvent[];
  rounds: RoundSummary[];
  buybackRuns: BuybackRun[];
  quoteChecks: QuoteCheck[];
  lastSync?: { ts: number; neurons: number };
  lastSpawn?: { ts: number; neuronId?: string };
  lastDisburse?: { ts: number; count: number };
  window: Partial<
    Record<LogSource, { from: number; to: number; lines: number }>
  >;
}

const n = (s: string) => Number(s.replace(/_/g, ""));

function invalidReason(msg: string): string {
  if (msg.includes("fees for all payments"))
    return "Reward pool too small to cover transfer fees (no new ICP arrived)";
  if (msg.includes("Maturity for all neurons has not changed"))
    return "No maturity change since the previous round";
  if (msg.includes("cost more than the balance"))
    return "Reward pool below a single transfer fee";
  return msg.replace(/^.*Can't create PaymentRound\.\s*/, "");
}

function upsertRound(
  rounds: Map<number, RoundSummary>,
  roundId: number,
  ts: number,
): RoundSummary {
  let r = rounds.get(roundId);
  if (!r) {
    r = { roundId, ts, tokens: {} };
    rounds.set(roundId, r);
  }
  r.ts = Math.min(r.ts, ts);
  return r;
}

/* ── sns_rewards ────────────────────────────────────────────────────────── */

function parseRewards(logs: RawLogEntry[], p: ParsedPipeline) {
  const rounds = new Map<number, RoundSummary>();
  let lastRoundId = 0;

  logs.forEach((e, i) => {
    const m = e.message;
    const id = `rw-${e.timestamp}-${i}`;

    const sync = m.match(/^Successfully scanned (\d+) neurons/);
    if (sync) {
      p.lastSync = { ts: e.timestamp, neurons: Number(sync[1]) };
      return;
    }

    const metrics = m.match(
      /round id : (\d+), round status : (\w+), token : (\w+), total : (\d+), successful : (\d+).*retries : (\d+), tokens_to_distribute : ([\d_]+)/,
    );
    if (metrics) {
      const [, rid, status, token, total, ok, retries, amt] = metrics;
      const roundId = Number(rid);
      lastRoundId = Math.max(lastRoundId, roundId);
      const amount = n(amt) / E8S;
      const st: TokenRoundResult["status"] =
        status === "CompletedFull"
          ? "paid"
          : status === "CompletedPartial"
            ? "partial"
            : "failed";
      upsertRound(rounds, roundId, e.timestamp).tokens[token] = {
        token,
        status: st,
        amount,
        neurons: Number(total),
        successful: Number(ok),
        retries: Number(retries),
      };
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_rewards",
        kind: st === "paid" ? "round_paid" : "round_error",
        severity: st === "paid" ? "success" : "error",
        title:
          st === "paid"
            ? `Round ${roundId}: ${fmt(amount)} ${token} paid to ${total} neurons`
            : `Round ${roundId}: ${token} payments ${st} (${ok}/${total})`,
        detail: Number(retries) > 0 ? `Needed ${retries} retries` : undefined,
        token,
        amount,
        roundId,
      });
      return;
    }

    const empty = m.match(/ROUND ID : (\d+) & TOKEN :(\w+) - has no rewards/);
    if (empty) {
      const roundId = Number(empty[1]);
      upsertRound(rounds, roundId, e.timestamp).tokens[empty[2]] = {
        token: empty[2],
        status: "skipped",
        reason: "Nothing in the reward pool",
      };
      return; // GOLDAO / WTN are empty every week — not worth a timeline row
    }

    const invalid = m.match(
      /ROUND ID : (\d+) & TOKEN :(\w+) - Invalid round : (.*)$/,
    );
    if (invalid) {
      const roundId = Number(invalid[1]);
      const token = invalid[2];
      const reason = invalidReason(invalid[3]);
      upsertRound(rounds, roundId, e.timestamp).tokens[token] = {
        token,
        status: "invalid",
        reason,
      };
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_rewards",
        kind: "round_invalid",
        severity: "warning",
        title: `Round ${roundId}: no ${token} distributed this week`,
        detail: `${reason}. Your ${token} share is not lost — unrewarded maturity carries over to the next round.`,
        token,
        roundId,
      });
      return;
    }

    if (m.includes("[GLDT_REWARDS] No rewards available")) {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_rewards",
        kind: "round_skipped",
        severity: "info",
        title: "Monthly GLDT round skipped — pool empty",
        token: "GLDT",
      });
      return;
    }

    if (
      e.level === "ERROR" ||
      /ERROR - transferring funds|Transfer to payment round failed|Failed to create new GLDT/.test(
        m,
      )
    ) {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_rewards",
        kind: "round_error",
        severity: "error",
        title: "Reward distribution error",
        detail: m,
      });
    }
  });

  p.rounds = [...rounds.values()].sort((a, b) => b.roundId - a.roundId);
}

/* ── icp_neuron ─────────────────────────────────────────────────────────── */

function parseIcpNeuron(logs: RawLogEntry[], p: ParsedPipeline) {
  // Group disbursements that happen in the same daily job run.
  let batch: { ts: number; count: number } | null = null;
  const flush = () => {
    if (!batch) return;
    p.lastDisburse = { ...batch };
    p.events.push({
      id: `in-disb-${batch.ts}`,
      ts: batch.ts,
      source: "icp_neuron",
      kind: "neuron_disburse",
      severity: "success",
      title: `${batch.count} spawned neuron${batch.count > 1 ? "s" : ""} disbursed — ICP split to stakers / buyback / GLDT / Good DAO`,
      detail:
        "33% of this ICP lands in the staker reward pool and is paid on the next Wednesday round.",
    });
    batch = null;
  };

  // Group spawns of the same daily run (the log repeats some lines).
  let spawnBatch: { ts: number; ids: Set<string> } | null = null;
  const flushSpawn = () => {
    if (!spawnBatch) return;
    const ids = [...spawnBatch.ids];
    p.lastSpawn = { ts: spawnBatch.ts, neuronId: ids[ids.length - 1] };
    p.events.push({
      id: `in-spawn-${spawnBatch.ts}`,
      ts: spawnBatch.ts,
      source: "icp_neuron",
      kind: "neuron_spawn",
      severity: "info",
      title:
        ids.length > 1
          ? `${ids.length} NNS neurons spawned their maturity (${SPAWN_LIMIT_ICP}+ ICP each)`
          : `NNS neuron spawned ${SPAWN_LIMIT_ICP}+ ICP of maturity`,
      detail: `${ids.length > 1 ? "Neurons" : "Neuron"} ${ids.join(", ")}. Each child neuron dissolves in ~${SPAWN_DISSOLVE_DAYS} days, then its ICP is disbursed and split.`,
    });
    spawnBatch = null;
  };

  logs.forEach((e, i) => {
    const m = e.message;
    const id = `in-${e.timestamp}-${i}`;

    if (m === "Disbursing neuron.") {
      if (batch && e.timestamp - batch.ts < 6 * 3_600_000) batch.count += 1;
      else {
        flush();
        batch = { ts: e.timestamp, count: 1 };
      }
      return;
    }

    const spawned = m.match(/^Successfully spawned neuron (\d+)/);
    if (spawned) {
      if (spawnBatch && e.timestamp - spawnBatch.ts < 6 * 3_600_000)
        spawnBatch.ids.add(spawned[1]);
      else {
        flushSpawn();
        spawnBatch = { ts: e.timestamp, ids: new Set([spawned[1]]) };
      }
      return;
    }

    if (/cycle.management/i.test(m) && !m.startsWith("No cycle management")) {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "icp_neuron",
        kind: "cycle_management",
        severity: "warning",
        title: "ICP diverted to cycle management",
        detail: `A whole disbursed neuron can be sent to keep canisters funded before the split. ${m}`,
      });
      return;
    }

    if (m === "Post-upgrade complete") {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "icp_neuron",
        kind: "canister_upgrade",
        severity: "info",
        title: `icp_neuron upgraded${e.fields.version ? ` to v${e.fields.version}` : ""}`,
      });
      return;
    }

    if (
      /^Error spawning|Error splitting|Error fetching neuron list|Skipping disbursement/.test(
        m,
      ) ||
      e.level === "ERROR"
    ) {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "icp_neuron",
        kind: "neuron_error",
        severity: "error",
        title: "NNS neuron job error",
        detail: m,
      });
    }
  });
  flush();
  flushSpawn();
}

/* ── buyback_burn ───────────────────────────────────────────────────────── */

function parseBuyback(logs: RawLogEntry[], p: ParsedPipeline) {
  const pending = new Map<number, BuybackRun>();
  let burnStart: number | null = null;
  let burnFailed = false;

  const closeBurn = () => {
    if (burnStart === null) return;
    p.events.push({
      id: `bb-burn-${burnStart}`,
      ts: burnStart,
      source: "buyback_burn",
      kind: "burn",
      severity: burnFailed ? "info" : "success",
      title: burnFailed
        ? "Daily GOLDAO burn: nothing to burn"
        : "Daily GOLDAO burn executed",
      detail: burnFailed
        ? "No GOLDAO had been bought since the last burn."
        : "Bought GOLDAO sent to the minting account (permanently destroyed).",
      mode: "goldao",
    });
    burnStart = null;
    burnFailed = false;
  };

  logs.forEach((e, i) => {
    const m = e.message;

    if (burnStart !== null && e.timestamp - burnStart > 10 * 60_000)
      closeBurn();

    const q = m.match(
      /^Constrained job (\d+) quote (passed|not satisfied) \(sell=(\d+), buy=(\d+)\)/,
    );
    if (q) {
      const job = Number(q[1]);
      const mode = BUYBACK_JOBS[job] ?? "goldao";
      const quote = Number(q[4]) / Number(q[3]);
      p.quoteChecks.push({
        ts: e.timestamp,
        mode,
        quote,
        passed: q[2] === "passed",
      });
      if (q[2] === "passed")
        pending.set(job, { ts: e.timestamp, mode, icp: 0, quote });
      return;
    }

    if (m.startsWith("Running unconstrained swap job")) {
      pending.set(1, { ts: e.timestamp, mode: "gldt", icp: 0 });
      return;
    }

    const amt = m.match(/^Amount to swap for job (\d+): (\d+)/);
    if (amt) {
      const job = Number(amt[1]);
      const run = pending.get(job) ?? {
        ts: e.timestamp,
        mode: BUYBACK_JOBS[job] ?? "gldt",
        icp: 0,
      };
      run.icp = Number(amt[2]) / E8S;
      pending.delete(job);
      p.buybackRuns.push(run);
      return;
    }

    if (m.startsWith("No constrained swap conditions met")) {
      pending.set(-1, { ts: e.timestamp, mode: "compound", icp: 0 });
      p.quoteChecks.push({
        ts: e.timestamp,
        mode: "compound",
        quote: 0,
        passed: true,
      });
      return;
    }

    const staked = m.match(/^stake_icp: NNS neuron (\d+) refreshed/);
    if (staked) {
      const run = pending.get(-1) ?? {
        ts: e.timestamp,
        mode: "compound" as const,
        icp: 0,
      };
      pending.delete(-1);
      p.buybackRuns.push(run);
      return;
    }

    if (m.startsWith("stake_icp:") && m.includes("too low")) {
      pending.delete(-1);
      return;
    }

    if (m === "Starting token burn process") {
      closeBurn();
      burnStart = e.timestamp;
      return;
    }
    if (burnStart !== null && m.includes("Calculated burn amount is zero")) {
      burnFailed = true;
      return;
    }

    // Benign: destination already emptied after an unconstrained swap.
    if (m.includes("Balance (0) is too low to cover fee")) return;

    if (
      e.level === "ERROR" ||
      /^Swap rejected by constraint|^Failed to (swap|deposit|withdraw|transfer)|^stake_icp: .*(error|failed)/i.test(
        m,
      )
    ) {
      p.events.push({
        id: `bb-${e.timestamp}-${i}`,
        ts: e.timestamp,
        source: "buyback_burn",
        kind: "buyback_error",
        severity: m.startsWith("Swap rejected") ? "warning" : "error",
        title: m.startsWith("Swap rejected")
          ? "Swap cancelled — price moved beyond slippage limit"
          : "Buyback error",
        detail: m,
      });
    }
  });
  closeBurn();

  // Timeline: one row per mode switch + a daily summary per mode.
  const constrained = p.buybackRuns.filter((r) => r.mode !== "gldt");
  let prevMode: BuybackMode | null = null;
  for (const r of constrained) {
    if (r.mode !== prevMode) {
      p.events.push({
        id: `bb-mode-${r.ts}`,
        ts: r.ts,
        source: "buyback_burn",
        kind: "buyback",
        severity: "info",
        title:
          prevMode === null
            ? `Buyback mode: ${BUYBACK_LABEL[r.mode]}`
            : `Buyback switched to: ${BUYBACK_LABEL[r.mode]}`,
        detail: modeReason(r, p.quoteChecks),
        mode: r.mode,
      });
      prevMode = r.mode;
    }
  }
  for (const [day, runs] of groupByDay(p.buybackRuns)) {
    const byMode = new Map<BuybackMode, { icp: number; count: number }>();
    for (const r of runs) {
      const agg = byMode.get(r.mode) ?? { icp: 0, count: 0 };
      agg.icp += r.icp;
      agg.count += 1;
      byMode.set(r.mode, agg);
    }
    const parts = [...byMode.entries()].map(
      ([mode, a]) => `${BUYBACK_LABEL[mode]}: ${fmt(a.icp)} ICP (${a.count}×)`,
    );
    p.events.push({
      id: `bb-day-${day}`,
      ts: runs[runs.length - 1].ts,
      source: "buyback_burn",
      kind: "buyback",
      severity: "success",
      title: `Buyback activity — ${fmt(runs.reduce((s, r) => s + r.icp, 0))} ICP used`,
      detail: parts.join(" · "),
    });
  }
}

function modeReason(run: BuybackRun, checks: QuoteCheck[]): string {
  if (run.mode === "compound")
    return "Neither GOLDAO (≥500/ICP) nor OGY (≥1,000/ICP) met its minimum price, so ICP is staked into the NNS neuron.";
  if (run.mode === "goldao")
    return `GOLDAO quote ${fmt(run.quote ?? 0)} per ICP met the ≥${MIN_BUY_RATIO.goldao} minimum.`;
  const lastGoldao = [...checks]
    .reverse()
    .find((c) => c.mode === "goldao" && c.ts <= run.ts);
  const why = lastGoldao
    ? `GOLDAO quote ${fmt(lastGoldao.quote)} per ICP was below the ${MIN_BUY_RATIO.goldao} minimum`
    : "GOLDAO minimum price not met";
  return `${why}; OGY quote ${fmt(run.quote ?? 0)} per ICP met the ≥${MIN_BUY_RATIO.ogy} minimum.`;
}

function groupByDay<T extends { ts: number }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const d = new Date(it.ts);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return map;
}

/* ── sns_neuron_controller ──────────────────────────────────────────────── */

function parseController(logs: RawLogEntry[], p: ParsedPipeline) {
  logs.forEach((e, i) => {
    const m = e.message;
    const id = `nc-${e.timestamp}-${i}`;
    if (m === "Successfully transferred rewards") {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_neuron_controller",
        kind: "ogy_claim",
        severity: "success",
        title: "OGY neuron rewards claimed and sent to the staker pool",
        detail: "Paid out to GOLDAO stakers in the Wednesday round.",
        token: "OGY",
      });
      return;
    }
    if (m === "Claimed rewards") {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_neuron_controller",
        kind: "wtn_claim",
        severity: "success",
        title: "WTN neuron rewards claimed",
        token: "WTN",
      });
      return;
    }
    if (e.level === "ERROR") {
      p.events.push({
        id,
        ts: e.timestamp,
        source: "sns_neuron_controller",
        kind: "controller_error",
        severity: "error",
        title: "OGY / WTN neuron controller error",
        detail: m,
      });
    }
  });
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export function buildPipeline(
  logs: Partial<Record<LogSource, RawLogEntry[]>>,
): ParsedPipeline {
  const p: ParsedPipeline = {
    events: [],
    rounds: [],
    buybackRuns: [],
    quoteChecks: [],
    window: {},
  };
  for (const [src, entries] of Object.entries(logs) as [
    LogSource,
    RawLogEntry[],
  ][]) {
    if (!entries?.length) continue;
    p.window[src] = {
      from: entries[0].timestamp,
      to: entries[entries.length - 1].timestamp,
      lines: entries.length,
    };
  }
  if (logs.sns_rewards) parseRewards(logs.sns_rewards, p);
  if (logs.icp_neuron) parseIcpNeuron(logs.icp_neuron, p);
  if (logs.buyback_burn) parseBuyback(logs.buyback_burn, p);
  if (logs.sns_neuron_controller)
    parseController(logs.sns_neuron_controller, p);
  p.events.sort((a, b) => b.ts - a.ts);
  return p;
}

export interface PipelineLoad {
  pipeline: ParsedPipeline;
  errors: Partial<Record<LogSource, string>>;
}

export async function loadPipeline(): Promise<PipelineLoad> {
  const sources = Object.keys(LOG_SOURCES) as LogSource[];
  const results = await Promise.allSettled(sources.map((s) => fetchLogs(s)));
  const logs: Partial<Record<LogSource, RawLogEntry[]>> = {};
  const errors: Partial<Record<LogSource, string>> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") logs[sources[i]] = r.value;
    else errors[sources[i]] = String(r.reason?.message ?? r.reason);
  });
  return { pipeline: buildPipeline(logs), errors };
}

/* ── Derived insights ───────────────────────────────────────────────────── */

/** Next Wednesday 14:00 UTC strictly after `now`. */
export function nextDistribution(now = Date.now()): number {
  const d = new Date(now);
  const target = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    14,
  );
  const day = d.getUTCDay();
  let add = (3 - day + 7) % 7;
  if (add === 0 && now >= target) add = 7;
  return target + add * DAY_MS;
}

/** First Wednesday of a month at 12:00 UTC, on or after `now`. */
export function nextGldtDistribution(now = Date.now()): number {
  const d = new Date(now);
  for (let k = 0; k < 3; k++) {
    const y = d.getUTCFullYear();
    const mth = d.getUTCMonth() + k;
    const first = new Date(Date.UTC(y, mth, 1, 12));
    const add = (3 - first.getUTCDay() + 7) % 7;
    const ts = first.getTime() + add * DAY_MS;
    if (ts > now) return ts;
  }
  return now;
}

export type IcpOutlook = "expected" | "not_expected" | "unknown";

export interface Outlook {
  nextRoundTs: number;
  nextGldtTs: number;
  gldtThisRound: boolean;
  icp: IcpOutlook;
  icpReason: string;
  expectedDisburseTs?: number;
}

/**
 * Will the next Wednesday round include ICP?
 * ICP only reaches the pool when a spawned child neuron is disbursed
 * (~7 days after the spawn). If a spawn happened after the last disbursal
 * and its disbursal date falls before the next round, ICP is expected.
 */
export function icpOutlook(p: ParsedPipeline, now = Date.now()): Outlook {
  const nextRoundTs = nextDistribution(now);
  const nextGldtTs = nextGldtDistribution(now);
  const gldtThisRound =
    Math.abs(nextGldtTs - (nextRoundTs - 2 * 3_600_000)) < DAY_MS;
  const lastRoundTs = p.rounds[0]?.ts ?? 0;

  const spawn = p.lastSpawn;
  const disb = p.lastDisburse;
  const pendingSpawn = spawn && (!disb || spawn.ts > disb.ts);

  if (disb && disb.ts > lastRoundTs && disb.ts < nextRoundTs) {
    return {
      nextRoundTs,
      nextGldtTs,
      gldtThisRound,
      icp: "expected",
      icpReason: `A spawned neuron was already disbursed on ${fmtDate(disb.ts)}; its ICP is waiting in the reward pool.`,
    };
  }
  if (pendingSpawn && spawn) {
    const eta = spawn.ts + SPAWN_DISSOLVE_DAYS * DAY_MS;
    return eta < nextRoundTs
      ? {
          nextRoundTs,
          nextGldtTs,
          gldtThisRound,
          icp: "expected",
          expectedDisburseTs: eta,
          icpReason: `The neuron spawned on ${fmtDate(spawn.ts)}; its ICP should be disbursed around ${fmtDate(eta)}, before the round.`,
        }
      : {
          nextRoundTs,
          nextGldtTs,
          gldtThisRound,
          icp: "not_expected",
          expectedDisburseTs: eta,
          icpReason: `The last spawn (${fmtDate(spawn.ts)}) disburses around ${fmtDate(eta)}, after the next round. Maturity keeps accruing and is paid later.`,
        };
  }
  return {
    nextRoundTs,
    nextGldtTs,
    gldtThisRound,
    icp: spawn || disb ? "not_expected" : "unknown",
    icpReason:
      spawn || disb
        ? `No spawn pending. The NNS neuron must reach ${SPAWN_LIMIT_ICP} ICP of maturity, then wait ~${SPAWN_DISSOLVE_DAYS} days.`
        : "Not enough log history to tell.",
  };
}

export interface Alert {
  severity: Severity;
  title: string;
  detail: string;
}

export function deriveAlerts(p: ParsedPipeline, now = Date.now()): Alert[] {
  const alerts: Alert[] = [];
  const last = p.rounds.find((r) =>
    Object.keys(r.tokens).some((t) => t !== "GLDT"),
  );
  if (last) {
    for (const t of Object.values(last.tokens)) {
      if (t.status === "invalid")
        alerts.push({
          severity: "warning",
          title: `Last round (#${last.roundId}) paid no ${t.token}`,
          detail: `${t.reason}. Unpaid maturity carries over, so the next ${t.token} round covers both weeks.`,
        });
      if (t.status === "partial" || t.status === "failed")
        alerts.push({
          severity: "error",
          title: `Round #${last.roundId}: ${t.token} payments ${t.status}`,
          detail: `${t.successful ?? 0} of ${t.neurons ?? 0} transfers succeeded. The canister retries up to 3 times.`,
        });
    }
  }
  const recent = (e: PipelineEvent) => now - e.ts < 14 * DAY_MS;
  for (const e of p.events.filter(recent)) {
    if (e.kind === "cycle_management")
      alerts.push({
        severity: "warning",
        title: e.title,
        detail: e.detail ?? "",
      });
    if (e.severity === "error" && e.kind !== "round_error")
      alerts.push({
        severity: "error",
        title: e.title,
        detail: e.detail ?? "",
      });
  }
  if (p.lastSync && now - p.lastSync.ts > 36 * 3_600_000)
    alerts.push({
      severity: "warning",
      title: "Neuron sync is late",
      detail: `sns_rewards last synced neurons ${fmtDate(p.lastSync.ts)} (normally daily at 09:00 UTC).`,
    });
  return alerts;
}

export function currentBuybackMode(p: ParsedPipeline): BuybackRun | undefined {
  return [...p.buybackRuns].reverse().find((r) => r.mode !== "gldt");
}

export function lastQuote(
  p: ParsedPipeline,
  mode: BuybackMode,
): QuoteCheck | undefined {
  return [...p.quoteChecks].reverse().find((c) => c.mode === mode);
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

export function fmt(v: number, max = 2): string {
  const digits = Math.abs(v) >= 1000 ? 0 : max;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtDate(ts: number, withTime = false): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
