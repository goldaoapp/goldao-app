import Map "mo:core/Map";
import List "mo:core/List";

module {
  // Mismo shape que AccessControl.AccessControlState, para chequear admin sin depender del paquete.
  public type UserRole = { #admin; #user; #guest };
  public type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  // 0 Tesoro · 1 Lingote · 2 Pepita · 3 Polvo de oro · 4 Roca
  public type TierIndex = Nat;

  public type Ficha = {
    id : Nat;
    owner : Principal;
    used : Nat; // excavaciones terminadas (0..10)
    points : Nat;
    diamonds : Nat;
    finishedAt : Int; // 0 = sin terminar
  };

  public type Excavation = {
    fichaId : Nat;
    picks : Nat; // picos seguros hechos
    diamonds : Nat;
    busy : Bool; // hay un pico esperando raw_rand
  };

  public type WeekStats = {
    jugarTx : Nat; // veces que apretó Jugar (fees a devolver)
    derrumbes : Nat;
    best : Nat; // mejor excavación (puntos)
    deepest : Nat; // pico más profundo alcanzado
  };

  public type PlayerWeekResult = {
    week : Nat;
    fichas : Nat;
    tiers : [Nat]; // cantidad de fichas por premio, índice TierIndex
    diamonds : Nat;
    paid : Nat; // e8s pagados (fichas + fees)
    received : Nat; // e8s cobrados (premios + sorteo)
    drawWon : Bool;
    best : Nat;
    deepest : Nat;
    derrumbes : Nat;
  };

  public type PayoutConcept = { #premio; #sorteo };

  public type Payout = {
    to : Principal;
    amount : Nat; // neto acreditado (e8s), el fee ya descontado
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
    drawTicket : Nat; // 0 = no hubo sorteo (se acumula)
    drawWinner : ?Principal;
    drawRandom : Nat; // valor de raw_rand usado, para verificar
    closedAt : Int;
  };

  public type WeekStatus = { #open; #closing; #closed };

  public type GameState = {
    var week : Nat;
    var status : WeekStatus;
    var nextFichaId : Nat;
    var treasury : Nat; // saldo ficticio de la tesorería (e8s)
    var burned : Nat; // fees quemados (e8s)
    var drawCarry : Nat; // sorteo acumulado de semanas sin diamantes
    balances : Map.Map<Principal, Nat>;
    faucet : Map.Map<Principal, (Nat, Nat)>; // (semana, e8s pedidos)
    fichas : Map.Map<Nat, Ficha>;
    open : Map.Map<Principal, Excavation>;
    stats : Map.Map<Principal, WeekStats>;
    history : Map.Map<Principal, List.List<PlayerWeekResult>>;
    weeks : List.List<WeekSummary>;
    var payouts : [Payout];
    var pendingResults : [(Principal, PlayerWeekResult)];
    var lastClose : ?WeekSummary;
  };

  // Vistas para el front (sin campos var)

  public type ExcavationView = {
    fichaId : Nat;
    picks : Nat;
    diamonds : Nat;
    runPoints : Nat;
    ifCollapse : Nat;
    nextPoints : Nat;
    safePctX100 : Nat; // chance de que el próximo pico sea seguro, x100
    canSave : Bool;
  };

  public type PickResult = {
    collapsed : Bool;
    diamond : Bool;
    picks : Nat;
    ended : Bool;
    pointsSaved : Nat; // puntos sumados a la ficha si terminó
    excavation : ?ExcavationView;
  };

  public type FichaView = {
    id : Nat;
    used : Nat;
    points : Nat;
    avgX100 : Nat;
    diamonds : Nat;
    tier : TierIndex; // provisorio
    gapToNextX100 : ?Nat; // puntos promedio que faltan para el premio siguiente
  };

  public type Dashboard = {
    week : Nat;
    status : WeekStatus;
    balance : Nat;
    faucetRemaining : Nat;
    fichas : [FichaView];
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
    fichas : Nat;
    tiers : [Nat];
    diamonds : Nat;
    paid : Nat;
    estimatedReceive : Nat;
    playing : Bool;
  };

  public type Ranking = {
    week : Nat;
    status : WeekStatus;
    fichas : Nat;
    pot : Nat;
    tesoroPerFicha : Nat;
    drawPrize : Nat;
    treasuryKeep : Nat;
    totalDiamonds : Nat;
    cutsX100 : [?Nat]; // promedio mínimo actual para Tesoro, Lingote, Pepita, Polvo
    players : [PlayerRow];
  };

  public type GameConfig = {
    fichaE8s : Nat;
    feeE8s : Nat;
    excavationsPerFicha : Nat;
    cells : Nat;
    mines : Nat;
    safePicks : Nat;
    diamondBps : Nat;
    tierCutsPct : [Nat];
    tierMultBps : [Nat]; // Tesoro = 0, se calcula al cierre
    treasuryBps : Nat;
    drawBps : Nat;
    minFichas : Nat;
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
