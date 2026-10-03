import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface AdminView {
    durationDays: bigint;
    staked: bigint;
    stakes: Array<bigint>;
    bankAccount?: Principal;
    bank: bigint;
    fund: bigint;
    owed: bigint;
    pool: bigint;
    tournament: bigint;
    reserve: bigint;
    selfId?: Principal;
    cycles: bigint;
    lastClose?: TournamentSummary;
    withdrawable: bigint;
    bankAllowance: bigint;
    burned: bigint;
    realLedger: boolean;
    payouts: Array<Payout>;
    paused: boolean;
    endsAt: bigint;
}
export interface AutoResult {
    end: EndResult;
    pool: bigint;
    steps: Array<AutoStep>;
}
export interface AutoStep {
    collapsed: boolean;
    pick: bigint;
    diamond: DiamondResult;
}
export interface Cell {
    value: Value;
    name: string;
}
export interface Dashboard {
    stakes: Array<bigint>;
    balance: bigint;
    blocked: boolean;
    open?: ExcavationView;
    pool: bigint;
    tournament: bigint;
    history: Array<PlayerTournamentResult>;
    credit: bigint;
    stats: TournamentStats;
    allowance: bigint;
    faucetRemaining: bigint;
    pendingPayout: bigint;
    paused: boolean;
    endsAt: bigint;
}
export interface DiamondResult {
    won: bigint;
    stage: bigint;
}
export interface EndResult {
    won: bigint;
    jackpotWon: bigint;
    balance: bigint;
    kind: EndKind;
    lost: bigint;
    credit: bigint;
    stake: bigint;
    gross: bigint;
    picks: bigint;
    charged: bigint;
    points: bigint;
}
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface ExcavationView {
    jackpotWon: bigint;
    runPoints: bigint;
    collapseGross: bigint;
    diamonds: bigint;
    nextGross: bigint;
    held: bigint;
    canSave: boolean;
    stake: bigint;
    runGross: bigint;
    picks: bigint;
    safePctX100: bigint;
}
export type GResult = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export type GResult_1 = {
    __kind__: "ok";
    ok: EndResult;
} | {
    __kind__: "err";
    err: string;
};
export type GResult_2 = {
    __kind__: "ok";
    ok: PickResult;
} | {
    __kind__: "err";
    err: string;
};
export type GResult_3 = {
    __kind__: "ok";
    ok: AutoResult;
} | {
    __kind__: "err";
    err: string;
};
export type GResult_4 = {
    __kind__: "ok";
    ok: AdminView;
} | {
    __kind__: "err";
    err: string;
};
export type GResult_5 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type GResult_6 = {
    __kind__: "ok";
    ok: {
        paid: bigint;
        remaining: bigint;
        failed: bigint;
    };
} | {
    __kind__: "err";
    err: string;
};
export type GResult_7 = {
    __kind__: "ok";
    ok: Array<[Principal, UserRole]>;
} | {
    __kind__: "err";
    err: string;
};
export interface GameConfig {
    mines: bigint;
    ledgerId: string;
    stakeCapE8s: bigint;
    feeE8s: bigint;
    diamond1Bps: bigint;
    diamond2Bps: bigint;
    cells: bigint;
    pointsTable: Array<bigint>;
    maxPicks: bigint;
    payoutBps: bigint;
    safePicks: bigint;
    stakeMinE8s: bigint;
    faucetCapE8s: bigint;
    realLedger: boolean;
    diamond3PerGoldao: bigint;
}
export interface JackpotWin {
    at: bigint;
    player: Principal;
    tournament: bigint;
    stake: bigint;
    amount: bigint;
}
export interface Payout {
    id: bigint;
    to: Principal;
    paid: boolean;
    tournament: bigint;
    stamp: bigint;
    amount: bigint;
}
export interface PickResult {
    end?: EndResult;
    collapsed: boolean;
    pool: bigint;
    diamond: DiamondResult;
    credit: bigint;
    picks: bigint;
    excavation?: ExcavationView;
}
export interface PlayerRow {
    staked: bigint;
    jackpotWon: bigint;
    deepest: bigint;
    player: Principal;
    excavations: bigint;
    bestPoints: bigint;
    returned: bigint;
}
export interface PlayerTournamentResult {
    tournament: bigint;
    credit: bigint;
    stats: TournamentStats;
    payout: bigint;
}
export interface Ranking {
    staked: bigint;
    pool: bigint;
    tournament: bigint;
    players: Array<PlayerRow>;
    jackpots: Array<JackpotWin>;
    endsAt: bigint;
}
export type Result_7 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface TournamentStats {
    staked: bigint;
    jackpotWon: bigint;
    deepest: bigint;
    excavations: bigint;
    collapses: bigint;
    bestPoints: bigint;
    charged: bigint;
    returned: bigint;
    jackpots: bigint;
}
export interface TournamentSummary {
    staked: bigint;
    excavations: bigint;
    jackpotPaid: bigint;
    tournament: bigint;
    closedAt: bigint;
    players: bigint;
    forfeited: bigint;
    payoutTotal: bigint;
    returned: bigint;
    jackpots: bigint;
}
export interface TreasurySnapshot {
    ogy_usd: number;
    date: string;
    wtn_usd: number;
    icp_usd: number;
    total_usd: number;
    ogy_amount: number;
    timestamp: bigint;
    icp_amount: number;
    wtn_amount: number;
}
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export enum EndKind {
    maxed = "maxed",
    collapsed = "collapsed",
    saved = "saved"
}
export enum StakeOption {
    max = "max",
    mid = "mid",
    min = "min"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    adminListRoles(): Promise<GResult_7>;
    adminSyncBootstrap(): Promise<boolean>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    execute(qJson: string): Promise<Result__1>;
    gameAdminCloseTournament(): Promise<GResult_5>;
    gameAdminLedgerAllowance(who: Principal, spender: Principal): Promise<GResult>;
    gameAdminLedgerBalance(who: Principal): Promise<GResult>;
    gameAdminPay(): Promise<GResult_6>;
    gameAdminRecordWithdrawal(goldao: bigint): Promise<GResult>;
    gameAdminRefreshBank(): Promise<GResult>;
    gameAdminReleaseBusy(player: Principal): Promise<GResult_5>;
    gameAdminSeedPool(goldao: bigint): Promise<GResult>;
    gameAdminSetDuration(days: bigint): Promise<GResult_5>;
    gameAdminSetRealLedger(selfId: Principal): Promise<GResult>;
    gameAdminTestApprove(goldao: bigint): Promise<GResult>;
    gameAdminTestDeposit(goldao: bigint): Promise<GResult>;
    gameAdminUnblock(player: Principal): Promise<GResult_5>;
    gameAdminView(): Promise<GResult_4>;
    gameAdminWithdraw(goldao: bigint): Promise<GResult>;
    gameAuto(stake: StakeOption, stopAt: bigint): Promise<GResult_3>;
    gameConfig(): Promise<GameConfig>;
    gameMyDashboard(): Promise<Dashboard>;
    gamePick(stake: StakeOption | null): Promise<GResult_2>;
    gameRanking(): Promise<Ranking>;
    gameRequestTestTokens(goldao: bigint): Promise<GResult>;
    gameSave(): Promise<GResult_1>;
    gameTestApprove(goldao: bigint): Promise<GResult>;
    gameTournaments(): Promise<Array<TournamentSummary>>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Full history sorted by date ascending.
     */
    getTreasuryHistory(): Promise<Array<TreasurySnapshot>>;
    /**
     * / Check if a snapshot for the given date exists (cheap query).
     */
    hasSnapshot(date: string): Promise<boolean>;
    isCallerAdmin(): Promise<boolean>;
    /**
     * / Save a daily snapshot. Write-once per day — rejects if date exists.
     */
    saveTreasurySnapshot(snapshot: TreasurySnapshot): Promise<boolean>;
    schema(): Promise<string>;
    whoAmI(): Promise<string>;
}
