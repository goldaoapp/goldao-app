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
    top10: bigint;
    smallBalances: bigint;
    toCollect: bigint;
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
    smallPlayers: bigint;
    bankAllowance: bigint;
    burned: bigint;
    heldJackpots: bigint;
    toCollectPlayers: bigint;
    realLedger: boolean;
    payouts: Array<Payout>;
    paused: boolean;
    unpaidPayouts: bigint;
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
    top10Pool: bigint;
    top10Rank: bigint;
    stakes: Array<bigint>;
    top10Prize: bigint;
    balance: bigint;
    open?: ExcavationView;
    pool: bigint;
    tournament: bigint;
    history: Array<PlayerTournamentResult>;
    credit: bigint;
    stats: TournamentStats;
    bestReturn: bigint;
    allowance: bigint;
    top10Entry: bigint;
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
export interface FaucetConfig {
    presets: Array<bigint>;
    usedE8s: bigint;
    enabled: boolean;
    capE8s: bigint;
}
export interface GameConfig {
    mines: bigint;
    loadMax: bigint;
    loadMin: bigint;
    top10Bps: bigint;
    ledgerId: string;
    top10Weights: Array<bigint>;
    diamond2PerGoldao: bigint;
    stakeCapE8s: bigint;
    feeE8s: bigint;
    diamond1Bps: bigint;
    cells: bigint;
    pointsTable: Array<bigint>;
    miniBps: bigint;
    creditCapE8s: bigint;
    maxPicks: bigint;
    diamond3Odds: bigint;
    top10MinVolumeE8s: bigint;
    poolSeedMaxE8s: bigint;
    poolSeedE8s: bigint;
    payoutBps: bigint;
    safePicks: bigint;
    minPayoutE8s: bigint;
    stakeMinE8s: bigint;
    realLedger: boolean;
}
export interface GameSummary {
    top10Pool: bigint;
    staked: bigint;
    totalPlayers: bigint;
    pool: bigint;
    tournament: bigint;
    paused: boolean;
    endsAt: bigint;
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
    txId?: bigint;
    tournament: bigint;
    uncertain: boolean;
    stamp: bigint;
    amount: bigint;
    paidAt: bigint;
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
    net: bigint;
    pos: bigint;
    staked: bigint;
    jackpotWon: bigint;
    player: Principal;
    excavations: bigint;
    rank: bigint;
    bestReturn: bigint;
    prize: bigint;
    returned: bigint;
}
export interface PlayerTournamentResult {
    tournament: bigint;
    credit: bigint;
    stats: TournamentStats;
    payout: bigint;
}
export interface RankingPage {
    totalPlayers: bigint;
    mine?: PlayerRow;
    page: bigint;
    rows: Array<PlayerRow>;
    sort: RankingSort;
    pageSize: bigint;
    lastTop10: Array<TopPrize>;
    jackpots: Array<JackpotWin>;
}
export type Result = {
    __kind__: "ok";
    ok: bigint;
} | {
    __kind__: "err";
    err: string;
};
export type Result_1 = {
    __kind__: "ok";
    ok: EndResult;
} | {
    __kind__: "err";
    err: string;
};
export type Result_10 = {
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
export type Result_11 = {
    __kind__: "ok";
    ok: boolean;
} | {
    __kind__: "err";
    err: string;
};
export type Result_12 = {
    __kind__: "ok";
    ok: Array<[Principal, UserRole]>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_13 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export type Result_2 = {
    __kind__: "ok";
    ok: PickResult;
} | {
    __kind__: "err";
    err: string;
};
export type Result_3 = {
    __kind__: "ok";
    ok: AutoResult;
} | {
    __kind__: "err";
    err: string;
};
export type Result_4 = {
    __kind__: "ok";
    ok: AdminView;
} | {
    __kind__: "err";
    err: string;
};
export type Result_5 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: string;
};
export type Result_6 = {
    __kind__: "ok";
    ok: SecurityLogView;
} | {
    __kind__: "err";
    err: string;
};
export type Result_7 = {
    __kind__: "ok";
    ok: SecurityView;
} | {
    __kind__: "err";
    err: string;
};
export type Result_8 = {
    __kind__: "ok";
    ok: Array<Payout>;
} | {
    __kind__: "err";
    err: string;
};
export type Result_9 = {
    __kind__: "ok";
    ok: bigint | null;
} | {
    __kind__: "err";
    err: string;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface SecurityDay {
    day: bigint;
    events: bigint;
    attention: bigint;
}
export interface SecurityEvent {
    at: bigint;
    title: string;
    code: string;
    count: bigint;
    lastAt: bigint;
    description: string;
    level: SecurityLevel;
}
export interface SecurityLogView {
    day: bigint;
    days: Array<SecurityDay>;
    events: Array<SecurityEvent>;
}
export interface SecurityView {
    haltCode: bigint;
    ledgerFails: bigint;
    haltedAt: bigint;
    accountingOk: boolean;
    halted: boolean;
    saturations: bigint;
}
export interface TopPrize {
    player: Principal;
    rank: bigint;
    tournament: bigint;
    volume: bigint;
    prize: bigint;
}
export interface TournamentStats {
    staked: bigint;
    minis: bigint;
    jackpotWon: bigint;
    deepest: bigint;
    excavations: bigint;
    collapses: bigint;
    miniWon: bigint;
    bestPoints: bigint;
    charged: bigint;
    returned: bigint;
    jackpots: bigint;
}
export interface TournamentSummary {
    staked: bigint;
    minis: bigint;
    miniPaid: bigint;
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
export enum RankingSort {
    net = "net",
    jackpot = "jackpot",
    volume = "volume",
    bestPrize = "bestPrize"
}
export enum SecurityLevel {
    warning = "warning",
    info = "info",
    critical = "critical"
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
export enum WithdrawKind {
    all = "all",
    available = "available"
}
export interface backendInterface {
    adminListRoles(): Promise<Result_12>;
    adminSyncBootstrap(): Promise<boolean>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    execute(qJson: string): Promise<Result__1>;
    gameAdminAckAccounting(): Promise<Result_5>;
    gameAdminChangeLedger(): Promise<Result>;
    gameAdminCheckPay(): Promise<Result_5>;
    gameAdminCheckWithdraw(kind: WithdrawKind): Promise<Result_5>;
    gameAdminCloseAll(): Promise<Result_5>;
    gameAdminCloseTournament(): Promise<Result_5>;
    gameAdminEnsureConnected(): Promise<Result_11>;
    gameAdminHalt(): Promise<Result_5>;
    gameAdminLedgerAllowance(who: Principal, spender: Principal): Promise<Result>;
    gameAdminLedgerBalance(who: Principal): Promise<Result>;
    gameAdminMarkPaid(id: bigint, txId: bigint): Promise<Result_5>;
    gameAdminPay(max: bigint): Promise<Result_10>;
    gameAdminPayOne(id: bigint, renew: boolean): Promise<Result_9>;
    gameAdminPayouts(tournament: bigint): Promise<Result_8>;
    gameAdminRefreshBank(): Promise<Result>;
    gameAdminReleaseBusy(player: Principal): Promise<Result_5>;
    gameAdminResume(): Promise<Result_5>;
    gameAdminSecurity(): Promise<Result_7>;
    gameAdminSecurityLog(day: bigint): Promise<Result_6>;
    gameAdminSeedPool(goldao: bigint): Promise<Result>;
    gameAdminSetDuration(days: bigint): Promise<Result_5>;
    gameAdminView(): Promise<Result_4>;
    gameAdminWithdraw(kind: WithdrawKind): Promise<Result>;
    gameAuto(stake: StakeOption, stopAt: bigint, expectedStake: bigint): Promise<Result_3>;
    gameBurned(): Promise<bigint>;
    gameConfig(): Promise<GameConfig>;
    gameLoadCredit(goldao: bigint): Promise<Result>;
    gameMyDashboard(): Promise<Dashboard>;
    gamePick(stake: StakeOption | null, expectedStake: bigint, expectedPicks: bigint): Promise<Result_2>;
    gameRankingPage(sort: RankingSort, page: bigint): Promise<RankingPage>;
    gameSave(): Promise<Result_1>;
    gameSummary(): Promise<GameSummary>;
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
     * / Save a daily snapshot. Write-once per day, only for today's date (UTC), validated in the lib.
     */
    saveTreasurySnapshot(snapshot: TreasurySnapshot): Promise<boolean>;
    schema(): Promise<string>;
    testFaucetClaim(goldao: bigint): Promise<Result>;
    testFaucetConfig(): Promise<FaucetConfig>;
    whoAmI(): Promise<string>;
}
