import Map "mo:core/Map";
import List "mo:core/List";
import Set "mo:core/Set";

// Adds the daily security log and the fund samples used by the fund-drop safeguard.
module {
  public type OldUserRole = { #admin; #user; #guest };

  public type OldAccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, OldUserRole>;
  };

  public type OldTreasurySnapshot = {
    date       : Text;
    icp_amount : Float;
    icp_usd    : Float;
    ogy_amount : Float;
    ogy_usd    : Float;
    wtn_amount : Float;
    wtn_usd    : Float;
    total_usd  : Float;
    timestamp  : Nat64;
  };

  public type OldExcavation = {
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

  public type OldTournamentStats = {
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

  public type OldPayout = {
    id : Nat;
    tournament : Nat;
    to : Principal;
    amount : Nat;
    paid : Bool;
    stamp : Nat64;
  };

  public type OldJackpotWin = {
    tournament : Nat;
    player : Principal;
    amount : Nat;
    stake : Nat;
    at : Int;
  };

  public type OldPlayerTournamentResult = {
    tournament : Nat;
    stats : OldTournamentStats;
    credit : Nat;
    payout : Nat;
  };

  public type OldTournamentSummary = {
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

  public type OldTopPrize = {
    tournament : Nat;
    rank : Nat;
    player : Principal;
    volume : Nat;
    prize : Nat;
  };

  public type OldGameState = {
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
    open : Map.Map<Principal, OldExcavation>;
    stats : Map.Map<Principal, OldTournamentStats>;
    history : Map.Map<Principal, List.List<OldPlayerTournamentResult>>;
    blocked : Map.Map<Principal, Nat>;
    tournaments : List.List<OldTournamentSummary>;
    payouts : Map.Map<Nat, OldPayout>;
    var jackpots : [OldJackpotWin];
    var halted : Bool;
    var haltCode : Nat;
    var haltedAt : Int;
    var resumedAt : Int;
    var breakerMax : Nat;
    var breakerWindowNs : Int;
    var ledgerFails : Nat;
    var top10 : Nat;
    var lastTop10 : [OldTopPrize];
    best : Map.Map<Principal, Nat>;
    loaded : Set.Set<Principal>;
  };

  public type NewUserRole = { #admin; #user; #guest };

  public type NewAccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, NewUserRole>;
  };

  public type NewTreasurySnapshot = {
    date       : Text;
    icp_amount : Float;
    icp_usd    : Float;
    ogy_amount : Float;
    ogy_usd    : Float;
    wtn_amount : Float;
    wtn_usd    : Float;
    total_usd  : Float;
    timestamp  : Nat64;
  };

  public type NewExcavation = {
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

  public type NewTournamentStats = {
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

  public type NewPayout = {
    id : Nat;
    tournament : Nat;
    to : Principal;
    amount : Nat;
    paid : Bool;
    stamp : Nat64;
  };

  public type NewJackpotWin = {
    tournament : Nat;
    player : Principal;
    amount : Nat;
    stake : Nat;
    at : Int;
  };

  public type NewPlayerTournamentResult = {
    tournament : Nat;
    stats : NewTournamentStats;
    credit : Nat;
    payout : Nat;
  };

  public type NewTournamentSummary = {
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

  public type NewTopPrize = {
    tournament : Nat;
    rank : Nat;
    player : Principal;
    volume : Nat;
    prize : Nat;
  };

  public type NewGameState = {
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
    open : Map.Map<Principal, NewExcavation>;
    stats : Map.Map<Principal, NewTournamentStats>;
    history : Map.Map<Principal, List.List<NewPlayerTournamentResult>>;
    blocked : Map.Map<Principal, Nat>;
    tournaments : List.List<NewTournamentSummary>;
    payouts : Map.Map<Nat, NewPayout>;
    var jackpots : [NewJackpotWin];
    var halted : Bool;
    var haltCode : Nat;
    var haltedAt : Int;
    var resumedAt : Int;
    var breakerMax : Nat;
    var breakerWindowNs : Int;
    var ledgerFails : Nat;
    var top10 : Nat;
    var lastTop10 : [NewTopPrize];
    best : Map.Map<Principal, Nat>;
    loaded : Set.Set<Principal>;
    securityLog : Map.Map<Nat, [NewSecurityEvent]>;
    var fundSamples : [Int];
  };

  public type NewSecurityLevel = { #info; #warning; #critical };

  public type NewSecurityEvent = {
    at : Int;
    lastAt : Int;
    level : NewSecurityLevel;
    code : Text;
    title : Text;
    description : Text;
    count : Nat;
  };

  public type OldActor = {
    accessControlState : OldAccessControlState;
    treasurySnapshots  : Map.Map<Text, OldTreasurySnapshot>;
    gameState          : OldGameState;
  };

  public type NewActor = {
    accessControlState : NewAccessControlState;
    treasurySnapshots  : Map.Map<Text, NewTreasurySnapshot>;
    gameState          : NewGameState;
  };

  public func migration(old : OldActor) : NewActor {
    {
      accessControlState = old.accessControlState;
      treasurySnapshots = old.treasurySnapshots;
      gameState = {
        var tournament = old.gameState.tournament;
        var endsAt = old.gameState.endsAt;
        var durationDays = old.gameState.durationDays;
        var bank = old.gameState.bank;
        var owed = old.gameState.owed;
        var pool = old.gameState.pool;
        var reserve = old.gameState.reserve;
        var cycles = old.gameState.cycles;
        var burned = old.gameState.burned;
        var realLedger = old.gameState.realLedger;
        var bankAccount = old.gameState.bankAccount;
        var selfId = old.gameState.selfId;
        var bankAllowance = old.gameState.bankAllowance;
        var seq = old.gameState.seq;
        var movSeq = old.gameState.movSeq;
        var payingSince = old.gameState.payingSince;
        var nextPayoutId = old.gameState.nextPayoutId;
        balances = old.gameState.balances;
        allowances = old.gameState.allowances;
        faucet = old.gameState.faucet;
        credits = old.gameState.credits;
        open = old.gameState.open;
        stats = old.gameState.stats;
        history = old.gameState.history;
        blocked = old.gameState.blocked;
        tournaments = old.gameState.tournaments;
        payouts = old.gameState.payouts;
        var jackpots = old.gameState.jackpots;
        var halted = old.gameState.halted;
        var haltCode = old.gameState.haltCode;
        var haltedAt = old.gameState.haltedAt;
        var resumedAt = old.gameState.resumedAt;
        var breakerMax = old.gameState.breakerMax;
        var breakerWindowNs = old.gameState.breakerWindowNs;
        var ledgerFails = old.gameState.ledgerFails;
        var top10 = old.gameState.top10;
        var lastTop10 = old.gameState.lastTop10;
        best = old.gameState.best;
        loaded = old.gameState.loaded;
        securityLog = Map.empty<Nat, [NewSecurityEvent]>();
        var fundSamples = [];
      };
    };
  };
};
