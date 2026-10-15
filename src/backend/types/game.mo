import Map "mo:core/Map";
import List "mo:core/List";
import Set "mo:core/Set";

module {
  public type UserRole = { #admin; #user; #guest };
  public type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  public type StakeOption = { #min; #mid; #max };

  public type WithdrawKind = { #available; #all };

  // #ok carries the ledger transaction id. #down: the ledger refused or failed (nothing was
  // moved). #unknown: no answer, the transfer may have been executed.
  public type Charge = { #ok : Nat; #allowance; #funds; #down; #unknown };

  public type Excavation = {
    tournament : Nat;
    stake : Nat;
    picks : Nat;
    diamonds : Nat;
    jackpotWon : Nat;
    held : Nat;
    // Part of `held` that came from a mini jackpot (the rest is a full jackpot).
    heldMini : Nat;
    busy : Bool;
    token : Nat;
    busyAt : Int;
  };

  public type TournamentStats = {
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    // Jackpot prizes of both kinds (full and mini) are counted together in jackpotWon and jackpots.
    jackpotWon : Nat;
    jackpots : Nat;
    // Internal counters: how many of `jackpots` and how much of `jackpotWon` were mini jackpots.
    minis : Nat;
    miniWon : Nat;
    collapses : Nat;
    deepest : Nat;
  };

  // What a player keeps of a closed tournament: only what "Past tournaments" shows.
  public type PastStats = {
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    // Top 10 prize paid as credit when the tournament closed (0 when it paid nothing).
    top10Prize : Nat;
  };

  // Kept only because the saved state has it. The game no longer creates payouts.
  public type Payout = {
    id : Nat;
    tournament : Nat;
    to : Principal;
    amount : Nat;
    paid : Bool;
    stamp : Nat64;
    txId : ?Nat;
    paidAt : Int;
    uncertain : Bool;
  };

  // A credit load whose ledger call got no answer. The retry reuses the same stamp so the
  // ledger answers Duplicate if the first one went through.
  public type PendingLoad = { amount : Nat; stamp : Nat64 };

  // A withdrawal of the free credit that left the credit but is not settled yet. `amount` is the
  // whole credit taken (the player receives it minus the network fee). The retry reuses the same
  // stamp, so the ledger answers Duplicate if the first call went through.
  public type PendingWithdrawal = { amount : Nat; stamp : Nat64 };

  // What the admin sees of a pending withdrawal. `at`: time of the first attempt (ns). `expired`: the stamp is too old for the player
  // to retry, so only the admin can settle it.
  public type WithdrawalView = { player : Principal; amount : Nat; at : Nat; expired : Bool };

  // What happened to a transfer between a player's wallet and the game.
  // #loaded: the load was credited. #loadUnanswered: the ledger gave no answer, the player repeats it.
  // #loadForgotten: the unanswered load expired and was dropped. #withdrawn: the wallet was paid.
  // #withdrawUnanswered: the ledger gave no answer, the player repeats it. #withdrawSettled and
  // #withdrawRefunded: the admin closed an expired withdrawal as sent or as not sent.
  public type TransferKind = {
    #loaded;
    #loadUnanswered;
    #loadForgotten;
    #withdrawn;
    #withdrawUnanswered;
    #withdrawSettled;
    #withdrawRefunded;
  };

  // One line of the transfer log. `amount` is what the ledger transfer moves (the network fee is
  // not included). For #withdrawRefunded no transfer was made: it is the amount of the
  // withdrawal that was given back, without the fee. `txId` is the ledger transaction id, when
  // the ledger confirmed the transfer.
  public type TransferEntry = {
    id : Nat;
    at : Int;
    kind : TransferKind;
    player : Principal;
    amount : Nat;
    txId : ?Nat;
  };

  // What the admin sees of one player: the balances the game holds for them and their log lines.
  public type PlayerInfo = {
    credit : Nat;
    stake : Nat;
    held : Nat;
    pendingLoad : Nat;
    pendingWithdrawal : Nat;
    entries : [TransferEntry];
  };

  public type JackpotWin = {
    tournament : Nat;
    player : Principal;
    amount : Nat;
    stake : Nat;
    at : Int;
  };

  public type PlayerTournamentResult = {
    tournament : Nat;
    stats : PastStats;
    credit : Nat;
    payout : Nat;
  };

  public type TournamentSummary = {
    tournament : Nat;
    players : Nat;
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    // Full and mini jackpots together. minis and miniPaid are the mini part of both.
    jackpots : Nat;
    jackpotPaid : Nat;
    minis : Nat;
    miniPaid : Nat;
    payoutTotal : Nat;
    forfeited : Nat;
    closedAt : Int;
  };

  public type TopPrize = {
    tournament : Nat;
    rank : Nat;
    player : Principal;
    volume : Nat;
    prize : Nat;
  };

  public type GameState = {
    var tournament : Nat;
    var endsAt : Int;
    var durationDays : Nat;
    var bank : Nat;
    var owed : Nat;
    var pool : Nat;
    var reserve : Nat;
    var cycles : Nat;
    var burned : Nat;
    var realLedger : Bool;
    var bankAccount : ?Principal;
    var selfId : ?Principal;
    var seq : Nat;
    var movSeq : Nat;
    var payingSince : Int;
    var nextPayoutId : Nat;
    credits : Map.Map<Principal, Nat>;
    open : Map.Map<Principal, Excavation>;
    stats : Map.Map<Principal, TournamentStats>;
    history : Map.Map<Principal, List.List<PlayerTournamentResult>>;
    tournaments : List.List<TournamentSummary>;
    payouts : Map.Map<Nat, Payout>;
    var jackpots : [JackpotWin];
    var halted : Bool;
    var haltCode : Nat;
    var haltedAt : Int;
    var ledgerFails : Nat;
    var top10 : Nat;
    var lastTop10 : [TopPrize];
    best : Map.Map<Principal, Nat>;
    loaded : Set.Set<Principal>;
    securityLog : Map.Map<Nat, [SecurityEvent]>;
    var fundSamples : [Int];
    pendingLoads : Map.Map<Principal, PendingLoad>;
    var saturations : Nat;
    pendingWithdrawals : Map.Map<Principal, PendingWithdrawal>;
    var transferLog : [TransferEntry];
  };

  // Security log. #info: something happened (admin action, recovery). #warning: worth a look.
  // #critical: needs the admin's attention (the game may be halted).
  public type SecurityLevel = { #info; #warning; #critical };

  // Repeated events with the same code on the same UTC day are merged: count and lastAt grow,
  // description keeps the latest detail.
  public type SecurityEvent = {
    at : Int;
    lastAt : Int;
    level : SecurityLevel;
    code : Text;
    title : Text;
    description : Text;
    count : Nat;
  };

  public type SecurityDay = { day : Nat; events : Nat; attention : Nat };

  public type SecurityLogView = {
    days : [SecurityDay];
    day : Nat;
    events : [SecurityEvent];
  };

  public type SecurityView = {
    halted : Bool;
    haltCode : Nat;
    haltedAt : Int;
    ledgerFails : Nat;
    saturations : Nat;
    accountingOk : Bool;
  };

  public type ExcavationView = {
    stake : Nat;
    picks : Nat;
    diamonds : Nat;
    jackpotWon : Nat;
    held : Nat;
    runPoints : Nat;
    runGross : Nat;
    collapseGross : Nat;
    nextGross : Nat;
    safePctX100 : Nat;
    canSave : Bool;
  };

  public type EndKind = { #saved; #collapsed; #maxed };

  public type EndResult = {
    kind : EndKind;
    picks : Nat;
    points : Nat;
    stake : Nat;
    gross : Nat;
    won : Nat;
    lost : Nat;
    jackpotWon : Nat;
    credit : Nat;
  };

  public type DiamondResult = { stage : Nat; won : Nat };

  public type PickResult = {
    collapsed : Bool;
    picks : Nat;
    diamond : DiamondResult;
    excavation : ?ExcavationView;
    end : ?EndResult;
    credit : Nat;
    pool : Nat;
  };

  public type AutoStep = { pick : Nat; collapsed : Bool; diamond : DiamondResult };
  public type AutoResult = { steps : [AutoStep]; end : EndResult; pool : Nat };

  public type Dashboard = {
    tournament : Nat;
    endsAt : Int;
    paused : Bool;
    /** Why new excavations cannot start (0 when they can). */
    pauseCode : Nat;
    stakes : [Nat];
    credit : Nat;
    /** Credit taken by a withdrawal that is not settled yet (0 when there is none). */
    pendingWithdrawal : Nat;
    /** A load the ledger has not confirmed yet (0 when there is none). */
    pendingLoad : Nat;
    pool : Nat;
    top10Pool : Nat;
    top10Rank : Nat;
    top10Prize : Nat;
    top10Entry : Nat;
    open : ?ExcavationView;
    stats : TournamentStats;
    bestReturn : Nat;
    /** Returned plus jackpots plus the Top 10 prize it would pay now, minus staked. */
    net : Int;
    history : [PastResult];
  };

  // A closed tournament as the player sees it. net counts the jackpots and the Top 10 prize.
  public type PastResult = {
    tournament : Nat;
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    top10Prize : Nat;
    net : Int;
    credit : Nat;
    payout : Nat;
  };

  // Order of the ranking table. Every order is computed over all the players of the tournament.
  public type RankingSort = { #volume; #net; #bestPrize; #jackpot };

  public type PlayerRow = {
    player : Principal;
    /** Position in the order asked for (1 is first). */
    pos : Nat;
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    /** Returned plus jackpots plus the Top 10 prize at this rank, minus staked. Negative when behind. */
    net : Int;
    /** Biggest return of a single excavation (prize plus jackpot, stake included). */
    bestReturn : Nat;
    /** Top 10 rank, always by volume, and the prize it pays (0 when it pays nothing). */
    rank : Nat;
    prize : Nat;
  };

  // Totals of the tournament, the same whatever page of the ranking is open. Cheap: no per-player rows.
  public type GameSummary = {
    tournament : Nat;
    endsAt : Int;
    paused : Bool;
    pauseCode : Nat;
    stakes : [Nat];
    pool : Nat;
    top10Pool : Nat;
    staked : Nat;
    totalPlayers : Nat;
  };

  // One page of the ranking (Game.RANKING_PAGE rows) plus what only the Ranking tab shows.
  public type RankingPage = {
    sort : RankingSort;
    /** Page returned, zero-based. A page past the end comes back as the last one. */
    page : Nat;
    pageSize : Nat;
    totalPlayers : Nat;
    rows : [PlayerRow];
    /** The caller's own row in this order, whatever page it is on. Null without stats. */
    mine : ?PlayerRow;
    lastTop10 : [TopPrize];
    /** Most recent jackpots, newest first. */
    jackpots : [JackpotWin];
  };

  public type GameConfig = {
    feeE8s : Nat;
    cells : Nat;
    mines : Nat;
    safePicks : Nat;
    maxPicks : Nat;
    pointsTable : [Nat];
    payoutBps : Nat;
    stakeMinE8s : Nat;
    stakeCapE8s : Nat;
    diamond1Bps : Nat;
    // Second diamond: chance per whole GOLDAO staked, out of 100_000_000.
    diamond2PerGoldao : Nat;
    // Third diamond: 1 in diamond3Odds, once the second one hit.
    diamond3Odds : Nat;
    // Mini jackpot (exactly two diamonds): share of the pool, in basis points.
    miniBps : Nat;
    loadMin : Nat;
    loadMax : Nat;
    creditCapE8s : Nat;
    withdrawMinE8s : Nat;
    closeWindowNs : Nat;
    /** Account that players authorize to load (the game canister), empty until connected. */
    spender : Text;
    top10Bps : Nat;
    top10Weights : [Nat];
    top10MinVolumeE8s : Nat;
    realLedger : Bool;
    ledgerId : Text;
    poolSeedE8s : Nat;
    poolSeedMaxE8s : Nat;
  };

  public type AdminView = {
    tournament : Nat;
    endsAt : Int;
    durationDays : Nat;
    realLedger : Bool;
    bank : Nat;
    owed : Nat;
    toCollect : Nat;
    toCollectPlayers : Nat;
    /** Balances at or below the network fee: they cannot be sent and stay in the bank. */
    smallBalances : Nat;
    smallPlayers : Nat;
    heldJackpots : Nat;
    /** Loads the ledger has not confirmed yet. */
    pendingLoads : Nat;
    pendingWithdrawals : Nat;
    withdrawals : [WithdrawalView];
    pool : Nat;
    reserve : Nat;
    cycles : Nat;
    top10 : Nat;
    burned : Nat;
    fund : Int;
    withdrawable : Nat;
    stakes : [Nat];
    paused : Bool;
    staked : Nat;
    bankAccount : ?Principal;
    selfId : ?Principal;
    lastClose : ?TournamentSummary;
  };
};
