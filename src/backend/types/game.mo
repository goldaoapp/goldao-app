import Map "mo:core/Map";
import List "mo:core/List";

module {
  // Same shape as AccessControl.AccessControlState, used to check admin without depending on the package.
  public type UserRole = { #admin; #user; #guest };
  public type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  // 0 Treasure, 1 Ingot, 2 Nugget, 3 Gold dust, 4 Rock
  public type TierIndex = Nat;

  public type Chip = {
    id : Nat;
    owner : Principal;
    used : Nat; // finished excavations (0..10)
    points : Nat;
    diamonds : Nat;
    finishedAt : Int; // 0 = not finished
  };

  public type Excavation = {
    chipId : Nat;
    picks : Nat; // safe picks done
    diamonds : Nat;
    busy : Bool; // a pick is waiting for raw_rand
  };

  public type WeekStats = {
    playTx : Nat; // times the player bought chips (fees to refund)
    collapses : Nat;
    best : Nat; // best excavation (points)
    deepest : Nat; // deepest pick reached
  };

  public type PlayerWeekResult = {
    week : Nat;
    chips : Nat;
    tiers : [Nat]; // chips per tier, indexed by TierIndex
    diamonds : Nat;
    paid : Nat; // e8s paid (chips + fees)
    received : Nat; // e8s received (prizes + draw)
    drawWon : Bool;
    best : Nat;
    deepest : Nat;
    collapses : Nat;
  };

  public type PayoutConcept = { #prize; #draw };

  public type Payout = {
    to : Principal;
    amount : Nat; // net credited (e8s), fee already deducted
    concept : PayoutConcept;
    tiers : [Nat];
  };

  public type WeekSummary = {
    week : Nat;
    chips : Nat;
    players : Nat;
    pot : Nat;
    treasurePerChip : Nat;
    treasuryKeep : Nat;
    drawPrize : Nat;
    drawTickets : Nat;
    drawTicket : Nat; // 0 = no draw (prize carries over)
    drawWinner : ?Principal;
    drawRandom : Nat; // raw_rand value used, for verification
    closedAt : Int;
  };

  public type WeekStatus = { #open; #closing; #closed };

  public type GameState = {
    var week : Nat;
    var status : WeekStatus;
    var nextChipId : Nat;
    var treasury : Nat; // simulated treasury balance (e8s)
    var burned : Nat; // burned fees (e8s)
    var drawCarry : Nat; // draw prize carried over from weeks without diamonds
    balances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>; // (week, e8s requested)
    chips : Map.Map<Nat, Chip>;
    open : Map.Map<Principal, Excavation>;
    stats : Map.Map<Principal, WeekStats>;
    history : Map.Map<Principal, List.List<PlayerWeekResult>>;
    weeks : List.List<WeekSummary>;
    var payouts : [Payout];
    var pendingResults : [(Principal, PlayerWeekResult)];
    var lastClose : ?WeekSummary;
  };

  // Views for the frontend (no var fields)

  public type ExcavationView = {
    chipId : Nat;
    picks : Nat;
    diamonds : Nat;
    runPoints : Nat;
    ifCollapse : Nat;
    nextPoints : Nat;
    safePctX100 : Nat; // chance that the next pick is safe, x100
    canSave : Bool;
  };

  public type PickResult = {
    collapsed : Bool;
    diamond : Bool;
    picks : Nat;
    ended : Bool;
    pointsSaved : Nat; // points added to the chip if the excavation ended
    excavation : ?ExcavationView;
  };

  public type ChipView = {
    id : Nat;
    used : Nat;
    points : Nat;
    avgX100 : Nat;
    diamonds : Nat;
    tier : TierIndex; // provisional
    gapToNextX100 : ?Nat; // average points missing to reach the next tier
  };

  public type Dashboard = {
    week : Nat;
    status : WeekStatus;
    balance : Nat;
    faucetRemaining : Nat;
    chips : [ChipView];
    excavationsLeft : Nat;
    open : ?ExcavationView;
    tiers : [Nat];
    diamonds : Nat;
    totalDiamonds : Nat;
    stats : WeekStats;
    paid : Nat;
    estimatedReceive : Nat;
    history : [PlayerWeekResult];
  };

  public type PlayerRow = {
    player : Principal;
    avgX100 : Nat;
    chips : Nat;
    tiers : [Nat];
    diamonds : Nat;
    paid : Nat;
    estimatedReceive : Nat;
    playing : Bool;
  };

  public type Ranking = {
    week : Nat;
    status : WeekStatus;
    chips : Nat;
    pot : Nat;
    treasurePerChip : Nat;
    drawPrize : Nat;
    treasuryKeep : Nat;
    totalDiamonds : Nat;
    cutsX100 : [?Nat]; // current minimum average for Treasure, Ingot, Nugget, Gold dust
    players : [PlayerRow];
  };

  public type GameConfig = {
    chipPriceE8s : Nat;
    feeE8s : Nat;
    excavationsPerChip : Nat;
    cells : Nat;
    mines : Nat;
    safePicks : Nat;
    diamondBps : Nat;
    tierCutsPct : [Nat];
    tierMultBps : [Nat]; // Treasure = 0, computed at close
    treasuryBps : Nat;
    drawBps : Nat;
    minChips : Nat;
    faucetCapE8s : Nat;
    pointsTable : [Nat];
    week : Nat;
    status : WeekStatus;
  };

  public type AdminView = {
    week : Nat;
    status : WeekStatus;
    treasury : Nat;
    burned : Nat;
    drawCarry : Nat;
    payouts : [Payout];
    lastClose : ?WeekSummary;
  };
};
