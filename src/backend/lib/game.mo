import Types "../types/game";
import Map "mo:core/Map";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Order "mo:core/Order";
import Nat64 "mo:core/Nat64";

module {
  public type Ficha = Types.Ficha;

  // Reglas fijas (montos en e8s)
  public let E8S : Nat = 100_000_000;
  public let FEE : Nat = 1_000_000_000; // 10 GOLDAO
  public let FICHA : Nat = 100_000_000_000; // 1.000 GOLDAO
  public let EXC : Nat = 10;
  public let CELLS : Nat = 25;
  public let MINES : Nat = 5;
  public let SAFE : Nat = 2;
  public let MAX_PICKS : Nat = 20; // CELLS - MINES
  public let DIAMOND_BPS : Nat = 200; // 2% por pico seguro
  public let TREASURY_BPS : Nat = 100; // 1%
  public let DRAW_BPS : Nat = 240; // 2,4%
  public let MIN_FICHAS : Nat = 20;
  public let FAUCET_CAP : Nat = 1_000_000_000_000; // 10.000 GOLDAO
  public let MAX_FICHAS_PER_BUY : Nat = 10;
  public let AUTO_SAVE_AT : Nat = 3;

  // % por premio: Tesoro, Lingote, Pepita, Polvo de oro, Roca
  public let CUTS_PCT : [Nat] = [5, 15, 25, 35, 20];
  let CUM_PCT : [Nat] = [5, 20, 45, 80, 100];
  // Multiplicador por ficha en bps (Tesoro se calcula con lo que queda)
  public let MULT_BPS : [Nat] = [0, 12_500, 11_500, 10_000, 0];
  public let TESORO : Nat = 0;
  public let ROCA : Nat = 4;

  // Puntos al guardar después de k picos seguros (k = 2 son los gratis).
  // Calculada para que cualquier estrategia valga 100 en promedio con 5 derrumbes
  // y el derrumbe conservando el 50%.
  public let POINTS : [Nat] = [
    0, 50, 100, 114, 131, 151, 176, 208, 248, 299, 367,
    459, 587, 770, 1045, 1480, 2220, 3608, 6614, 14882, 52087,
  ];

  public func pointsAt(k : Nat) : Nat { POINTS[k] };

  // Derrumbe después de k picos seguros: conserva la mitad (redondeo hacia arriba)
  public func collapsePoints(k : Nat) : Nat { (POINTS[k] + 1) / 2 };

  public func canSave(picks : Nat) : Bool { picks > SAFE };

  // Chance (x100) de que el próximo pico sea seguro
  public func safePctX100(picks : Nat) : Nat {
    if (picks < SAFE) 10_000 else if (picks >= MAX_PICKS) 0 else (CELLS - MINES - picks) * 10_000 / (CELLS - picks);
  };

  public func bytesToNat(bytes : [Nat8], from : Nat, len : Nat) : Nat {
    var n = 0;
    var i = from;
    while (i < from + len and i < bytes.size()) {
      n := n * 256 + Nat8.toNat(bytes[i]);
      i += 1;
    };
    n;
  };

  // Decide un pico con 32 bytes de raw_rand: derrumbe (solo desde el 3.º) y diamante
  public func decidePick(picks : Nat, bytes : [Nat8]) : { collapsed : Bool; diamond : Bool } {
    let r1 = bytesToNat(bytes, 0, 4);
    let r2 = bytesToNat(bytes, 4, 4);
    let collapsed = picks >= SAFE and (r1 % (CELLS - picks)) < MINES;
    let diamond = not collapsed and (r2 % 10_000) < DIAMOND_BPS;
    { collapsed; diamond };
  };

  // PRNG determinístico (splitmix64) sembrado con raw_rand, para jugar
  // las excavaciones sin usar al cierre. No hay decisiones del jugador en juego.
  public class Prng(seed : Nat64) {
    var s : Nat64 = seed;
    public func next() : Nat64 {
      s +%= 0x9E3779B97F4A7C15;
      var z = s;
      z := (z ^ (z >> 30)) *% 0xBF58476D1CE4E5B9;
      z := (z ^ (z >> 27)) *% 0x94D049BB133111EB;
      z ^ (z >> 31);
    };
    public func below(n : Nat) : Nat { Nat64.toNat(next()) % n };
  };

  // Una excavación automática guardando en `stopAt` picos. Devuelve (puntos, diamantes).
  public func autoExcavation(rng : Prng, stopAt : Nat) : (Nat, Nat) {
    var picks = 0;
    var diamonds = 0;
    loop {
      if (picks >= SAFE and rng.below(CELLS - picks) < MINES) return (collapsePoints(picks), diamonds);
      picks += 1;
      if (rng.below(10_000) < DIAMOND_BPS) diamonds += 1;
      if (picks == stopAt or picks == MAX_PICKS) return (pointsAt(picks), diamonds);
    };
  };

  public func avgX100(f : Ficha) : Nat {
    if (f.used == 0) 0 else f.points * 100 / f.used;
  };

  // Orden del ranking: promedio desc, después quien terminó antes, después id
  public func compareFicha(a : Ficha, b : Ficha) : Order.Order {
    let ua = Nat.max(a.used, 1);
    let ub = Nat.max(b.used, 1);
    let left = a.points * ub;
    let right = b.points * ua;
    if (left > right) return #less;
    if (left < right) return #greater;
    let fa : Int = if (a.finishedAt == 0) 9_223_372_036_854_775_807 else a.finishedAt;
    let fb : Int = if (b.finishedAt == 0) 9_223_372_036_854_775_807 else b.finishedAt;
    if (fa < fb) return #less;
    if (fa > fb) return #greater;
    Nat.compare(a.id, b.id);
  };

  // Premio por posición (0 = primera) sobre K fichas
  public func tierAt(pos : Nat, k : Nat) : Nat {
    var t = 0;
    while (t < 4 and (2 * pos + 1) * 50 >= CUM_PCT[t] * k) { t += 1 };
    t;
  };

  public type PlayerAgg = {
    fichas : Nat;
    tiers : [Nat];
    gross : Nat; // premio de fichas, sin fees
    anyPaid : Bool;
    diamonds : Nat;
    points : Nat;
    used : Nat;
    playing : Bool;
  };

  public type Settlement = {
    ranked : [(Ficha, Nat, Nat)]; // ficha, premio, bruto
    pot : Nat;
    tesoroPerFicha : Nat;
    treasuryKeep : Nat;
    drawPrize : Nat;
    totalDiamonds : Nat;
    cutsX100 : [?Nat];
    players : [(Principal, PlayerAgg)];
  };

  // Clasifica todas las fichas de la semana y calcula lo que cobraría cada jugador.
  // jugarTx: cuántas veces apretó Jugar cada jugador (para devolver fees).
  public func settle(
    fichas : Map.Map<Nat, Ficha>,
    jugarTx : Principal -> Nat,
    drawCarry : Nat,
  ) : Settlement {
    let sorted = Array.sort(fichas.values().toArray(), compareFicha);
    let k = sorted.size();
    let pot = k * FICHA;
    let tiers = Array.tabulate<Nat>(k, func i = tierAt(i, k));

    // Mínimo promedio actual por premio (para mostrar cortes)
    let cuts = VarArray.repeat<?Nat>(null, 4);
    for (i in sorted.keys()) {
      let t = tiers[i];
      if (t < 4 and sorted[i].used > 0) {
        let a = avgX100(sorted[i]);
        cuts[t] := switch (cuts[t]) { case null ?a; case (?c) ?Nat.min(c, a) };
      };
    };

    // Agregado por jugador
    let agg = Map.empty<Principal, PlayerAgg>();
    for (i in sorted.keys()) {
      let f = sorted[i];
      let t = tiers[i];
      let prev : PlayerAgg = switch (agg.get(f.owner)) {
        case (?p) p;
        case null {
          { fichas = 0; tiers = [0, 0, 0, 0, 0]; gross = 0; anyPaid = false; diamonds = 0; points = 0; used = 0; playing = false };
        };
      };
      agg.add(
        f.owner,
        {
          fichas = prev.fichas + 1;
          tiers = Array.tabulate<Nat>(5, func j = if (j == t) prev.tiers[j] + 1 else prev.tiers[j]);
          gross = prev.gross;
          anyPaid = prev.anyPaid or t != ROCA;
          diamonds = prev.diamonds + f.diamonds;
          points = prev.points + f.points;
          used = prev.used + f.used;
          playing = prev.playing or f.used < EXC;
        },
      );
    };

    var reimb = 0;
    var totalDiamonds = 0;
    for ((p, a) in agg.entries()) {
      if (a.anyPaid) reimb += FEE * jugarTx(p) + FEE;
      totalDiamonds += a.diamonds;
    };

    let treasuryKeep = pot * TREASURY_BPS / 10_000;
    let drawPrize = pot * DRAW_BPS / 10_000 + drawCarry;
    let budgetBase = pot - treasuryKeep - pot * DRAW_BPS / 10_000;
    let budget = if (budgetBase > reimb) budgetBase - reimb else 0;

    var spent = 0;
    var ng = 0;
    for (t in tiers.values()) {
      if (t == TESORO) ng += 1 else spent += FICHA * MULT_BPS[t] / 10_000;
    };
    let tesoroPerFicha = if (ng > 0 and budget > spent) (budget - spent) / ng else 0;

    let ranked = Array.tabulate<(Ficha, Nat, Nat)>(
      k,
      func i {
        let t = tiers[i];
        let g = if (t == TESORO) tesoroPerFicha else FICHA * MULT_BPS[t] / 10_000;
        (sorted[i], t, g);
      },
    );

    for ((f, _, g) in ranked.values()) {
      switch (agg.get(f.owner)) {
        case (?a) agg.add(f.owner, { a with gross = a.gross + g });
        case null {};
      };
    };

    {
      ranked;
      pot;
      tesoroPerFicha;
      treasuryKeep;
      drawPrize;
      totalDiamonds;
      cutsX100 = VarArray.toArray(cuts);
      players = agg.entries().toArray();
    };
  };

  // Lo que se le acredita a un jugador: premio de fichas + fees de Jugar devueltos.
  // (El fee del pago se quema: bruto + fee*jugarTx + fee - fee)
  public func netFor(a : PlayerAgg, jugarTx : Nat) : Nat {
    if (a.anyPaid) a.gross + FEE * jugarTx else 0;
  };

  public func paidFor(a : PlayerAgg, jugarTx : Nat) : Nat {
    a.fichas * FICHA + FEE * jugarTx;
  };
};
