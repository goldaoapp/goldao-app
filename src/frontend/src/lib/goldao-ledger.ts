/**
 * GOLDAO ledger (ICRC-1 SNS ledger) — direct Candid queries.
 *
 * Why on-chain instead of the icrc-api indexer: the indexer lags minutes
 * behind; a ledger query is real-time and, when nothing changed, returns an
 * empty vec + log_length (a few bytes).
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { IDL as IDLType } from "@dfinity/candid";
import { HttpAgent as SignedAgent } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";

export const GOLDAO_LEDGER = "tyyy3-4aaaa-aaaaq-aab7a-cai";
export const GOLDAO_ORIGINAL_SUPPLY = 1_000_000_000;
/** Default ledger fee (10 GOLDAO). No fee collector → every fee is burned. */
export const GOLDAO_FEE_E8S = 1_000_000_000n;

const ICRC_API = `https://icrc-api.internetcomputer.org/api/v2/ledgers/${GOLDAO_LEDGER}/transactions`;

/* ── IDL (only what we use) ─────────────────────────────────────────────── */

const ledgerIdlFactory = (({ IDL }: { IDL: typeof IDLType }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const Burn = IDL.Record({
    from: Account,
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
    amount: IDL.Nat,
    spender: IDL.Opt(Account),
  });
  const Mint = IDL.Record({
    to: Account,
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
    amount: IDL.Nat,
  });
  const Transfer = IDL.Record({
    to: Account,
    fee: IDL.Opt(IDL.Nat),
    from: Account,
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
    amount: IDL.Nat,
    spender: IDL.Opt(Account),
  });
  const Approve = IDL.Record({
    fee: IDL.Opt(IDL.Nat),
    from: Account,
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
    amount: IDL.Nat,
    expected_allowance: IDL.Opt(IDL.Nat),
    expires_at: IDL.Opt(IDL.Nat64),
    spender: Account,
  });
  const Transaction = IDL.Record({
    burn: IDL.Opt(Burn),
    kind: IDL.Text,
    mint: IDL.Opt(Mint),
    approve: IDL.Opt(Approve),
    timestamp: IDL.Nat64,
    transfer: IDL.Opt(Transfer),
  });
  const GetTransactionsRequest = IDL.Record({
    start: IDL.Nat,
    length: IDL.Nat,
  });
  const TransactionRange = IDL.Record({ transactions: IDL.Vec(Transaction) });
  const ArchivedRange = IDL.Record({
    callback: IDL.Func(
      [GetTransactionsRequest],
      [TransactionRange],
      ["query"],
    ),
    start: IDL.Nat,
    length: IDL.Nat,
  });
  const ApproveArgs = IDL.Record({
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    spender: Account,
    amount: IDL.Nat,
    expected_allowance: IDL.Opt(IDL.Nat),
    expires_at: IDL.Opt(IDL.Nat64),
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
  });
  const ApproveError = IDL.Variant({
    GenericError: IDL.Record({ message: IDL.Text, error_code: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    AllowanceChanged: IDL.Record({ current_allowance: IDL.Nat }),
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    TooOld: IDL.Null,
    Expired: IDL.Record({ ledger_time: IDL.Nat64 }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  });
  const TransferArg = IDL.Record({
    to: Account,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
    amount: IDL.Nat,
  });
  const TransferError = IDL.Variant({
    GenericError: IDL.Record({ message: IDL.Text, error_code: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    TooOld: IDL.Null,
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  });
  return IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    icrc1_transfer: IDL.Func(
      [TransferArg],
      [IDL.Variant({ Ok: IDL.Nat, Err: TransferError })],
      [],
    ),
    icrc2_allowance: IDL.Func(
      [IDL.Record({ account: Account, spender: Account })],
      [IDL.Record({ allowance: IDL.Nat, expires_at: IDL.Opt(IDL.Nat64) })],
      ["query"],
    ),
    icrc2_approve: IDL.Func(
      [ApproveArgs],
      [IDL.Variant({ Ok: IDL.Nat, Err: ApproveError })],
      [],
    ),
    icrc1_total_supply: IDL.Func([], [IDL.Nat], ["query"]),
    get_transactions: IDL.Func(
      [GetTransactionsRequest],
      [
        IDL.Record({
          first_index: IDL.Nat,
          log_length: IDL.Nat,
          transactions: IDL.Vec(Transaction),
          archived_transactions: IDL.Vec(ArchivedRange),
        }),
      ],
      ["query"],
    ),
  });
}) as unknown as Parameters<typeof Actor.createActor>[0];

/* ── Raw types ──────────────────────────────────────────────────────────── */

interface RawAmount {
  amount: bigint;
  fee?: [] | [bigint];
}

interface RawTx {
  kind: string;
  timestamp: bigint;
  burn: [] | [RawAmount];
  mint: [] | [RawAmount];
  transfer: [] | [RawAmount];
  approve: [] | [RawAmount];
}

interface RawGetTransactions {
  first_index: bigint;
  log_length: bigint;
  transactions: RawTx[];
  archived_transactions: unknown[];
}

interface Icrc1Account {
  owner: Principal;
  subaccount: [] | [Uint8Array];
}

interface LedgerActor {
  icrc1_balance_of: (a: Icrc1Account) => Promise<bigint>;
  icrc2_allowance: (a: {
    account: Icrc1Account;
    spender: Icrc1Account;
  }) => Promise<{ allowance: bigint }>;
  icrc2_approve: (a: {
    from_subaccount: [];
    spender: Icrc1Account;
    amount: bigint;
    expected_allowance: [];
    expires_at: [] | [bigint];
    fee: [];
    memo: [];
    created_at_time: [];
  }) => Promise<{ Ok: bigint } | { Err: Record<string, unknown> }>;
  icrc1_transfer: (a: {
    to: Icrc1Account;
    fee: [bigint];
    memo: [];
    from_subaccount: [];
    created_at_time: [];
    amount: bigint;
  }) => Promise<{ Ok: bigint } | { Err: Record<string, unknown> }>;
  icrc1_total_supply: () => Promise<bigint>;
  get_transactions: (req: {
    start: bigint;
    length: bigint;
  }) => Promise<RawGetTransactions>;
}

let actorPromise: Promise<LedgerActor> | null = null;

function getLedger(): Promise<LedgerActor> {
  if (!actorPromise) {
    actorPromise = HttpAgent.create({ host: "https://icp-api.io" }).then(
      (agent) =>
        Actor.createActor(ledgerIdlFactory, {
          agent,
          canisterId: GOLDAO_LEDGER,
        }) as unknown as LedgerActor,
    );
  }
  return actorPromise;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/** Effect of one ledger block on supply, in whole GOLDAO. */
export interface LedgerDelta {
  index: number;
  kind: string;
  /** GOLDAO removed from supply (burn amount, or the fee of a transfer/approve) */
  burned: number;
  /** GOLDAO added to supply (mints) */
  minted: number;
  /** ms since epoch */
  timestamp: number;
}

const e8s = (v: bigint) => Number(v) / 1e8;

function toDelta(tx: RawTx, index: number): LedgerDelta {
  const ts = Number(tx.timestamp / 1_000_000n);
  const base = { index, kind: tx.kind, timestamp: ts, burned: 0, minted: 0 };

  if (tx.burn[0]) return { ...base, burned: e8s(tx.burn[0].amount) };
  if (tx.mint[0]) return { ...base, minted: e8s(tx.mint[0].amount) };

  const withFee = tx.transfer[0] ?? tx.approve[0];
  if (withFee) {
    const fee = withFee.fee?.[0] ?? GOLDAO_FEE_E8S;
    return { ...base, burned: e8s(fee) };
  }
  return base;
}

/** Current total supply (whole GOLDAO). */
export async function fetchTotalSupply(): Promise<number | null> {
  try {
    const ledger = await getLedger();
    return e8s(await ledger.icrc1_total_supply());
  } catch {
    return null;
  }
}

/** Number of blocks in the ledger (next index to be written). */
export async function fetchLogLength(): Promise<number | null> {
  try {
    const ledger = await getLedger();
    const r = await ledger.get_transactions({ start: 0n, length: 0n });
    return Number(r.log_length);
  } catch {
    return null;
  }
}

export interface NewBlocksResult {
  logLength: number;
  deltas: LedgerDelta[];
  /** true if some blocks were already archived and could not be decoded here */
  gap: boolean;
}

/**
 * Blocks from `start` onward. When nothing is new the response is just the
 * log_length, so polling this every few seconds is cheap.
 */
export async function fetchBlocksFrom(
  start: number,
  max = 100,
): Promise<NewBlocksResult | null> {
  try {
    const ledger = await getLedger();
    const r = await ledger.get_transactions({
      start: BigInt(start),
      length: BigInt(max),
    });
    const logLength = Number(r.log_length);
    const first = Math.max(Number(r.first_index), start);
    const deltas = r.transactions.map((tx, i) => toDelta(tx, first + i));
    const gap = r.archived_transactions.length > 0 || first > start;
    return { logLength, deltas, gap };
  } catch {
    return null;
  }
}

export interface LastBurn {
  index: number;
  amount: number;
  timestamp: number;
}

/**
 * Latest burn block. Burns happen every few days, so this uses the indexer
 * filter (1 row) instead of scanning the ledger backwards. Startup only.
 */
export async function fetchLastBurn(): Promise<LastBurn | null> {
  try {
    const res = await fetch(
      `${ICRC_API}?limit=1&sort_by=-index&include_kind=burn`,
    );
    if (!res.ok) return null;
    const body: {
      data?: { index: number; amount: string; timestamp: string }[];
    } = await res.json();
    const tx = body.data?.[0];
    if (!tx) return null;
    return {
      index: Number(tx.index),
      amount: Number(tx.amount) / 1e8,
      timestamp: Math.floor(Number(tx.timestamp) / 1e6),
    };
  } catch {
    return null;
  }
}

/* ── Game wallet (real ledger mode) ─────────────────────────────────────── */

const acct = (p: string): Icrc1Account => ({
  owner: Principal.fromText(p),
  subaccount: [],
});

/** Wallet balance (e8s) of a principal. */
export async function fetchWalletBalance(owner: string): Promise<bigint> {
  const l = await getLedger();
  return l.icrc1_balance_of(acct(owner));
}

/** Amount (e8s) the spender may still take from the owner. */
export async function fetchAllowance(
  owner: string,
  spender: string,
): Promise<bigint> {
  const l = await getLedger();
  const r = await l.icrc2_allowance({
    account: acct(owner),
    spender: acct(spender),
  });
  return r.allowance;
}

async function signedLedger(identity: unknown): Promise<LedgerActor> {
  const agent = await SignedAgent.create({
    identity: identity as never,
    host: "https://icp-api.io",
  });
  return Actor.createActor(ledgerIdlFactory, {
    agent: agent as never,
    canisterId: GOLDAO_LEDGER,
  }) as unknown as LedgerActor;
}

/**
 * Signs an icrc2_approve with the caller's identity. It replaces any previous
 * authorization. With `expiresInMs` the ledger drops it by itself after that
 * time, whether or not it was used.
 */
export async function approveSpender(
  identity: unknown,
  spender: string,
  amount: bigint,
  expiresInMs?: number,
): Promise<void> {
  const l = await signedLedger(identity);
  const res = await l.icrc2_approve({
    from_subaccount: [],
    spender: acct(spender),
    amount,
    expected_allowance: [],
    expires_at:
      expiresInMs === undefined
        ? []
        : [BigInt(Date.now() + expiresInMs) * 1_000_000n],
    fee: [],
    memo: [],
    created_at_time: [],
  });
  if ("Err" in res) {
    throw new Error("The authorization was rejected by the ledger.");
  }
}

/** Sends GOLDAO from the caller's own wallet. The ledger fee is paid on top. */
export async function transferGoldao(
  identity: unknown,
  to: string,
  amount: bigint,
): Promise<void> {
  const l = await signedLedger(identity);
  const res = await l.icrc1_transfer({
    to: acct(to),
    fee: [GOLDAO_FEE_E8S],
    memo: [],
    from_subaccount: [],
    created_at_time: [],
    amount,
  });
  if ("Err" in res) {
    if ("InsufficientFunds" in res.Err) {
      throw new Error("Insufficient GOLDAO in your wallet.");
    }
    throw new Error("The ledger rejected the transfer.");
  }
}
