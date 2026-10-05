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

  public type Charge = { #ok; #allowance; #funds; #down };

  public type Excavation = {
    tournament : Nat;
    stake : Nat;
    picks : Nat;
    diamonds : Nat;
    jackpotWon : Nat;
    held : Nat;
    busy : Bool;
    token : Nat;
    busyAt : Int;
  };

  public type TournamentStats = {
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    jackpots : Nat;
    charged : Nat;
    collapses : Nat;
    bestPoints : Nat;
    deepest : Nat;
  };

  public type Payout = {
    id : Nat;
    tournament : Nat;
    to : Principal;
    amount : Nat;
    paid : Bool;
    stamp : Nat64;
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
    stats : TournamentStats;
    credit : Nat;
    payout : Nat;
  };

  public type TournamentSummary = {
    tournament : Nat;
    players : Nat;
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpots : Nat;
    jackpotPaid : Nat;
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
    var bankAllowance : Nat;
    var seq : Nat;
    var movSeq : Nat;
    var payingSince : Int;
    var nextPayoutId : Nat;
    balances : Map.Map<Principal, Nat>;
    allowances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>;
    credits : Map.Map<Principal, Nat>;
    open : Map.Map<Principal, Excavation>;
    stats : Map.Map<Principal, TournamentStats>;
    history : Map.Map<Principal, List.List<PlayerTournamentResult>>;
    blocked : Map.Map<Principal, Nat>;
    tournaments : List.List<TournamentSummary>;
    payouts : Map.Map<Nat, Payout>;
    var jackpots : [JackpotWin];
    var halted : Bool;
    var haltCode : Nat;
    var haltedAt : Int;
    var resumedAt : Int;
    var breakerMax : Nat;
    var breakerWindowNs : Int;
    var ledgerFails : Nat;
    var top10 : Nat;
    var lastTop10 : [TopPrize];
    best : Map.Map<Principal, Nat>;
    loaded : Set.Set<Principal>;
    securityLog : Map.Map<Nat, [SecurityEvent]>;
    var fundSamples : [Int];
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
    balance : Nat;
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
    stakes : [Nat];
    balance : Nat;
    allowance : Nat;
    credit : Nat;
    pendingPayout : Nat;
    pool : Nat;
    top10Pool : Nat;
    top10Rank : Nat;
    top10Prize : Nat;
    top10Entry : Nat;
    faucetRemaining : Nat;
    open : ?ExcavationView;
    stats : TournamentStats;
    bestReturn : Nat;
    history : [PlayerTournamentResult];
  };

  public type PlayerRow = {
    player : Principal;
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    bestPoints : Nat;
    deepest : Nat;
    rank : Nat;
    prize : Nat;
  };

  public type Ranking = {
    tournament : Nat;
    endsAt : Int;
    pool : Nat;
    top10Pool : Nat;
    lastTop10 : [TopPrize];
    staked : Nat;
    players : [PlayerRow];
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
    diamond2Bps : Nat;
    diamond3PerGoldao : Nat;
    faucetCapE8s : Nat;
    loadMin : Nat;
    loadMax : Nat;
    creditCapE8s : Nat;
    minPayoutE8s : Nat;
    top10Bps : Nat;
    top10Weights : [Nat];
    top10MinVolumeE8s : Nat;
    realLedger : Bool;
    ledgerId : Text;
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
    smallBalances : Nat;
    smallPlayers : Nat;
    heldJackpots : Nat;
    unpaidPayouts : Nat;
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
    bankAllowance : Nat;
    bankAccount : ?Principal;
    selfId : ?Principal;
    payouts : [Payout];
    lastClose : ?TournamentSummary;
  };
};
