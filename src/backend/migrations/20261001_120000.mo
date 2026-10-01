import Map "mo:core/Map";
import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  public type UserRole = {
    #admin;
    #user;
    #guest;
  };

  public type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  public type TreasurySnapshot = {
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

  public type Ficha = {
    id : Nat;
    owner : Principal;
    used : Nat;
    points : Nat;
    diamonds : Nat;
    finishedAt : Int;
  };

  public type Excavation = {
    fichaId : Nat;
    picks : Nat;
    diamonds : Nat;
    busy : Bool;
  };

  public type WeekStats = {
    jugarTx : Nat;
    derrumbes : Nat;
    best : Nat;
    deepest : Nat;
  };

  public type PlayerWeekResult = {
    week : Nat;
    fichas : Nat;
    tiers : [Nat];
    diamonds : Nat;
    paid : Nat;
    received : Nat;
    drawWon : Bool;
    best : Nat;
    deepest : Nat;
    derrumbes : Nat;
  };

  public type PayoutConcept = { #premio; #sorteo };

  public type Payout = {
    to : Principal;
    amount : Nat;
    concept : PayoutConcept;
    tiers : [Nat];
  };

  public type WeekSummary = {
    week : Nat;
    fichas : Nat;
    players : Nat;
    pot : Nat;
    tesoroPerFicha : Nat;
    treasuryKeep : Nat;
    drawPrize : Nat;
    drawTickets : Nat;
    drawTicket : Nat;
    drawWinner : ?Principal;
    drawRandom : Nat;
    closedAt : Int;
  };

  public type WeekStatus = { #open; #closing; #closed };

  public type GameState = {
    var week : Nat;
    var status : WeekStatus;
    var nextFichaId : Nat;
    var treasury : Nat;
    var burned : Nat;
    var drawCarry : Nat;
    balances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>;
    fichas : Map.Map<Nat, Ficha>;
    open : Map.Map<Principal, Excavation>;
    stats : Map.Map<Principal, WeekStats>;
    history : Map.Map<Principal, List.List<PlayerWeekResult>>;
    weeks : List.List<WeekSummary>;
    var payouts : [Payout];
    var pendingResults : [(Principal, PlayerWeekResult)];
    var lastClose : ?WeekSummary;
  };

  public type OldActor = {
    accessControlState : AccessControlState;
    treasurySnapshots  : Map.Map<Text, TreasurySnapshot>;
  };

  public type NewActor = {
    accessControlState : AccessControlState;
    treasurySnapshots  : Map.Map<Text, TreasurySnapshot>;
    gameState          : GameState;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      accessControlState = _old.accessControlState;
      treasurySnapshots  = _old.treasurySnapshots;
      gameState = {
        var week = 1;
        var status = #open;
        var nextFichaId = 0;
        var treasury = 0;
        var burned = 0;
        var drawCarry = 0;
        balances = Map.empty();
        faucet = Map.empty();
        fichas = Map.empty();
        open = Map.empty();
        stats = Map.empty();
        history = Map.empty();
        weeks = List.empty();
        var payouts = [];
        var pendingResults = [];
        var lastClose = null;
      };
    };
  };
};
