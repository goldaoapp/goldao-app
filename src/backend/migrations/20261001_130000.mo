import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Principal "mo:core/Principal";

// Renames the game state fields from Spanish to English.
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

  public type OldFicha = {
    id : Nat;
    owner : Principal;
    used : Nat;
    points : Nat;
    diamonds : Nat;
    finishedAt : Int;
  };

  public type OldExcavation = {
    fichaId : Nat;
    picks : Nat;
    diamonds : Nat;
    busy : Bool;
  };

  public type OldWeekStats = {
    jugarTx : Nat;
    derrumbes : Nat;
    best : Nat;
    deepest : Nat;
  };

  public type OldPlayerWeekResult = {
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

  public type OldPayoutConcept = { #premio; #sorteo };

  public type OldPayout = {
    to : Principal;
    amount : Nat;
    concept : OldPayoutConcept;
    tiers : [Nat];
  };

  public type OldWeekSummary = {
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

  public type OldWeekStatus = { #open; #closing; #closed };

  public type OldGameState = {
    var week : Nat;
    var status : OldWeekStatus;
    var nextFichaId : Nat;
    var treasury : Nat;
    var burned : Nat;
    var drawCarry : Nat;
    balances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>;
    fichas : Map.Map<Nat, OldFicha>;
    open : Map.Map<Principal, OldExcavation>;
    stats : Map.Map<Principal, OldWeekStats>;
    history : Map.Map<Principal, List.List<OldPlayerWeekResult>>;
    weeks : List.List<OldWeekSummary>;
    var payouts : [OldPayout];
    var pendingResults : [(Principal, OldPlayerWeekResult)];
    var lastClose : ?OldWeekSummary;
  };

  public type NewUserRole = {
    #admin;
    #user;
    #guest;
  };

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

  public type NewChip = {
    id : Nat;
    owner : Principal;
    used : Nat;
    points : Nat;
    diamonds : Nat;
    finishedAt : Int;
  };

  public type NewExcavation = {
    chipId : Nat;
    picks : Nat;
    diamonds : Nat;
    busy : Bool;
  };

  public type NewWeekStats = {
    playTx : Nat;
    collapses : Nat;
    best : Nat;
    deepest : Nat;
  };

  public type NewPlayerWeekResult = {
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

  public type NewPayoutConcept = { #prize; #draw };

  public type NewPayout = {
    to : Principal;
    amount : Nat;
    concept : NewPayoutConcept;
    tiers : [Nat];
  };

  public type NewWeekSummary = {
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

  public type NewWeekStatus = { #open; #closing; #closed };

  public type NewGameState = {
    var week : Nat;
    var status : NewWeekStatus;
    var nextChipId : Nat;
    var treasury : Nat;
    var burned : Nat;
    var drawCarry : Nat;
    balances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>;
    chips : Map.Map<Nat, NewChip>;
    open : Map.Map<Principal, NewExcavation>;
    stats : Map.Map<Principal, NewWeekStats>;
    history : Map.Map<Principal, List.List<NewPlayerWeekResult>>;
    weeks : List.List<NewWeekSummary>;
    var payouts : [NewPayout];
    var pendingResults : [(Principal, NewPlayerWeekResult)];
    var lastClose : ?NewWeekSummary;
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

  func result(r : OldPlayerWeekResult) : NewPlayerWeekResult {
    {
      week = r.week;
      chips = r.fichas;
      tiers = r.tiers;
      diamonds = r.diamonds;
      paid = r.paid;
      received = r.received;
      drawWon = r.drawWon;
      best = r.best;
      deepest = r.deepest;
      collapses = r.derrumbes;
    };
  };

  func summary(s : OldWeekSummary) : NewWeekSummary {
    {
      week = s.week;
      chips = s.fichas;
      players = s.players;
      pot = s.pot;
      treasurePerChip = s.tesoroPerFicha;
      treasuryKeep = s.treasuryKeep;
      drawPrize = s.drawPrize;
      drawTickets = s.drawTickets;
      drawTicket = s.drawTicket;
      drawWinner = s.drawWinner;
      drawRandom = s.drawRandom;
      closedAt = s.closedAt;
    };
  };

  public func migration(old : OldActor) : NewActor {
    let g = old.gameState;
    let chips = Map.empty<Nat, NewChip>();
    for ((k, f) in g.fichas.entries()) {
      chips.add(k, { id = f.id; owner = f.owner; used = f.used; points = f.points; diamonds = f.diamonds; finishedAt = f.finishedAt });
    };
    let open = Map.empty<Principal, NewExcavation>();
    for ((p, e) in g.open.entries()) {
      open.add(p, { chipId = e.fichaId; picks = e.picks; diamonds = e.diamonds; busy = false });
    };
    let stats = Map.empty<Principal, NewWeekStats>();
    for ((p, s) in g.stats.entries()) {
      stats.add(p, { playTx = s.jugarTx; collapses = s.derrumbes; best = s.best; deepest = s.deepest });
    };
    let history = Map.empty<Principal, List.List<NewPlayerWeekResult>>();
    for ((p, l) in g.history.entries()) {
      history.add(p, List.map<OldPlayerWeekResult, NewPlayerWeekResult>(l, result));
    };
    {
      accessControlState = old.accessControlState;
      treasurySnapshots = old.treasurySnapshots;
      gameState = {
        var week = g.week;
        var status = g.status;
        var nextChipId = g.nextFichaId;
        var treasury = g.treasury;
        var burned = g.burned;
        var drawCarry = g.drawCarry;
        balances = g.balances;
        faucet = g.faucet;
        chips;
        open;
        stats;
        history;
        weeks = List.map<OldWeekSummary, NewWeekSummary>(g.weeks, summary);
        var payouts = Array.map<OldPayout, NewPayout>(
          g.payouts,
          func(p : OldPayout) : NewPayout {
            {
              to = p.to;
              amount = p.amount;
              concept = switch (p.concept) { case (#premio) #prize; case (#sorteo) #draw };
              tiers = p.tiers;
            };
          }
        );
        var pendingResults = Array.map<(Principal, OldPlayerWeekResult), (Principal, NewPlayerWeekResult)>(
          g.pendingResults,
          func(pr : (Principal, OldPlayerWeekResult)) : (Principal, NewPlayerWeekResult) { (pr.0, result(pr.1)) },
        );
        var lastClose = switch (g.lastClose) { case (?s) ?summary(s); case null null };
      };
    };
  };
};
