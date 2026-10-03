import Map "mo:core/Map";
import List "mo:core/List";

// Replaces the weekly chip game state with the instant excavation game state.
module {
  public type OldUserRole = {
    #admin;
    #user;
    #guest;
  };

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

  public type OldChip = {
    id : Nat;
    owner : Principal;
    used : Nat;
    points : Nat;
    diamonds : Nat;
    finishedAt : Int;
  };

  public type OldExcavation = {
    chipId : Nat;
    picks : Nat;
    diamonds : Nat;
    busy : Bool;
  };

  public type OldWeekStats = {
    playTx : Nat;
    collapses : Nat;
    best : Nat;
    deepest : Nat;
  };

  public type OldPlayerWeekResult = {
    week : Nat;
    chips : Nat;
    tiers : [Nat];
    diamonds : Nat;
    paid : Nat;
    received : Nat;
    drawWon : Bool;
    best : Nat;
    deepest : Nat;
    collapses : Nat;
  };

  public type OldPayoutConcept = { #prize; #draw };

  public type OldPayout = {
    to : Principal;
    amount : Nat;
    concept : OldPayoutConcept;
    tiers : [Nat];
  };

  public type OldWeekSummary = {
    week : Nat;
    chips : Nat;
    players : Nat;
    pot : Nat;
    treasurePerChip : Nat;
    treasuryKeep : Nat;
    drawPrize : Nat;
    drawTickets : Nat;
    drawTicket : Nat;
    drawWinner : ?Principal;
    drawRandom : Nat;
    closedAt : Int;
  };

  public type OldWeekStatus = { #open; #closing; #closed };

  public type OldGameState = {
    var week : Nat;
    var status : OldWeekStatus;
    var nextChipId : Nat;
    var treasury : Nat;
    var burned : Nat;
    var drawCarry : Nat;
    balances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>;
    chips : Map.Map<Nat, OldChip>;
    open : Map.Map<Principal, OldExcavation>;
    stats : Map.Map<Principal, OldWeekStats>;
    history : Map.Map<Principal, List.List<OldPlayerWeekResult>>;
    weeks : List.List<OldWeekSummary>;
    var payouts : [OldPayout];
    var pendingResults : [(Principal, OldPlayerWeekResult)];
    var lastClose : ?OldWeekSummary;
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
        var tournament = 1;
        var endsAt = 0;
        var durationDays = 7;
        var bank = 0;
        var owed = 0;
        var pool = 0;
        var reserve = 0;
        var cycles = 0;
        var burned = old.gameState.burned;
        var realLedger = false;
        var bankAccount = null;
        var selfId = null;
        var bankAllowance = 0;
        var seq = 0;
        var movSeq = 0;
        var payingSince = 0;
        var nextPayoutId = 0;
        balances = old.gameState.balances;
        allowances = Map.empty<Principal, Nat>();
        faucet = Map.empty<Principal, (Nat, Nat)>();
        credits = Map.empty<Principal, Nat>();
        open = Map.empty<Principal, NewExcavation>();
        stats = Map.empty<Principal, NewTournamentStats>();
        history = Map.empty<Principal, List.List<NewPlayerTournamentResult>>();
        blocked = Map.empty<Principal, Nat>();
        tournaments = List.empty<NewTournamentSummary>();
        payouts = Map.empty<Nat, NewPayout>();
        var jackpots = [];
        var halted = false;
        var haltCode = 0;
        var haltedAt = 0;
        var resumedAt = 0;
        var breakerMax = 3;
        var breakerWindowNs = 1_800_000_000_000;
        var ledgerFails = 0;
      };
    };
  };
};
