import Map "mo:core/Map";
import List "mo:core/List";
import Set "mo:core/Set";
import Nat "mo:core/Nat";

// The stake of an excavation is now taken from the credit when it starts. An excavation that is
// already open when this version is installed still has its stake inside the credit, so the stake
// is moved out of the credit here and the amount in play is set to what was actually taken.
// Excavations with no stake yet (just being opened) are left alone.
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
    heldMini : Nat;
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
    minis : Nat;
    miniWon : Nat;
    collapses : Nat;
    deepest : Nat;
  };

  public type OldPastStats = {
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    top10Prize : Nat;
  };

  public type OldPayout = {
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

  public type OldPendingLoad = { amount : Nat; stamp : Nat64 };

  public type OldJackpotWin = {
    tournament : Nat;
    player : Principal;
    amount : Nat;
    stake : Nat;
    at : Int;
  };

  public type OldPlayerTournamentResult = {
    tournament : Nat;
    stats : OldPastStats;
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
    minis : Nat;
    miniPaid : Nat;
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
    var seq : Nat;
    var movSeq : Nat;
    var payingSince : Int;
    var nextPayoutId : Nat;
    credits : Map.Map<Principal, Nat>;
    open : Map.Map<Principal, OldExcavation>;
    stats : Map.Map<Principal, OldTournamentStats>;
    history : Map.Map<Principal, List.List<OldPlayerTournamentResult>>;
    tournaments : List.List<OldTournamentSummary>;
    payouts : Map.Map<Nat, OldPayout>;
    var jackpots : [OldJackpotWin];
    var halted : Bool;
    var haltCode : Nat;
    var haltedAt : Int;
    var ledgerFails : Nat;
    var top10 : Nat;
    var lastTop10 : [OldTopPrize];
    best : Map.Map<Principal, Nat>;
    loaded : Set.Set<Principal>;
    securityLog : Map.Map<Nat, [OldSecurityEvent]>;
    var fundSamples : [Int];
    pendingLoads : Map.Map<Principal, OldPendingLoad>;
    var saturations : Nat;
  };

  public type OldSecurityLevel = { #info; #warning; #critical };

  public type OldSecurityEvent = {
    at : Int;
    lastAt : Int;
    level : OldSecurityLevel;
    code : Text;
    title : Text;
    description : Text;
    count : Nat;
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
    heldMini : Nat;
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
    minis : Nat;
    miniWon : Nat;
    collapses : Nat;
    deepest : Nat;
  };

  public type NewPastStats = {
    excavations : Nat;
    staked : Nat;
    returned : Nat;
    jackpotWon : Nat;
    top10Prize : Nat;
  };

  public type NewPayout = {
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

  public type NewPendingLoad = { amount : Nat; stamp : Nat64 };

  public type NewJackpotWin = {
    tournament : Nat;
    player : Principal;
    amount : Nat;
    stake : Nat;
    at : Int;
  };

  public type NewPlayerTournamentResult = {
    tournament : Nat;
    stats : NewPastStats;
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
    minis : Nat;
    miniPaid : Nat;
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
    var seq : Nat;
    var movSeq : Nat;
    var payingSince : Int;
    var nextPayoutId : Nat;
    credits : Map.Map<Principal, Nat>;
    open : Map.Map<Principal, NewExcavation>;
    stats : Map.Map<Principal, NewTournamentStats>;
    history : Map.Map<Principal, List.List<NewPlayerTournamentResult>>;
    tournaments : List.List<NewTournamentSummary>;
    payouts : Map.Map<Nat, NewPayout>;
    var jackpots : [NewJackpotWin];
    var halted : Bool;
    var haltCode : Nat;
    var haltedAt : Int;
    var ledgerFails : Nat;
    var top10 : Nat;
    var lastTop10 : [NewTopPrize];
    best : Map.Map<Principal, Nat>;
    loaded : Set.Set<Principal>;
    securityLog : Map.Map<Nat, [NewSecurityEvent]>;
    var fundSamples : [Int];
    pendingLoads : Map.Map<Principal, NewPendingLoad>;
    var saturations : Nat;
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
    let g = old.gameState;
    for ((p, e) in g.open.entries().toArray().values()) {
      if (e.stake > 0) {
        let credit = switch (g.credits.get(p)) { case (?c) c; case null 0 };
        let taken = Nat.min(credit, e.stake);
        g.credits.add(p, Nat.sub(credit, taken));
        g.open.add(p, { e with stake = taken });
      };
    };
    {
      accessControlState = old.accessControlState;
      treasurySnapshots = old.treasurySnapshots;
      gameState = {
        var tournament = g.tournament;
        var endsAt = g.endsAt;
        var durationDays = g.durationDays;
        var bank = g.bank;
        var owed = g.owed;
        var pool = g.pool;
        var reserve = g.reserve;
        var cycles = g.cycles;
        var burned = g.burned;
        var realLedger = g.realLedger;
        var bankAccount = g.bankAccount;
        var selfId = g.selfId;
        var seq = g.seq;
        var movSeq = g.movSeq;
        var payingSince = g.payingSince;
        var nextPayoutId = g.nextPayoutId;
        credits = g.credits;
        open = g.open;
        stats = g.stats;
        history = g.history;
        tournaments = g.tournaments;
        payouts = g.payouts;
        var jackpots = g.jackpots;
        var halted = g.halted;
        var haltCode = g.haltCode;
        var haltedAt = g.haltedAt;
        var ledgerFails = g.ledgerFails;
        var top10 = g.top10;
        var lastTop10 = g.lastTop10;
        best = g.best;
        loaded = g.loaded;
        securityLog = g.securityLog;
        var fundSamples = g.fundSamples;
        pendingLoads = g.pendingLoads;
        var saturations = g.saturations;
      };
    };
  };
};
