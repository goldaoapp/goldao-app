import Types "../types/game";
import Map "mo:core/Map";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Order "mo:core/Order";
import Nat64 "mo:core/Nat64";
import Int "mo:core/Int";
import Principal "mo:core/Principal";

module {
  public type Chip = Types.Chip;

  // Fixed rules (amounts in e8s)
  public let E8S : Nat = 100_000_000;
  public let FEE : Nat = 1_000_000_000; // 10 GOLDAO
  public let CHIP_PRICE : Nat = 100_000_000_000; // 1,000 GOLDAO
  public let EXCAVATIONS_PER_CHIP : Nat = 10;
  public let CELLS : Nat = 25;
  public let MINES : Nat = 5;
  public let SAFE : Nat = 2;
  public let MAX_PICKS : Nat = 20; // CELLS - MINES
  public let DIAMOND_BPS : Nat = 200; // 2% per safe pick
  public let TREASURY_BPS : Nat = 100; // 1%
  public let DRAW_BPS : Nat = 240; // 2.4%
  public let MIN_CHIPS : Nat = 20;
  public let FAUCET_CAP : Nat = 1_000_000_000_000; // 10,000 GOLDAO
  // Total test GOLDAO the faucet gives per week across all players (limits cycle abuse with many principals).
  public let FAUCET_GLOBAL_CAP : Nat = 200_000_000_000_000; // 2,000,000 GOLDAO
  public let MAX_CHIPS_PER_BUY : Nat = 10;
  public let AUTO_SAVE_AT : Nat = 3;

  // Principals that are always admin. Paste Internet Identity principals here before deploying.
  public let BOOTSTRAP_ADMINS : [Text] = [
    "o4k5k-q4hdh-hmf4x-qnqbw-m53ao-c4u6t-6vyft-ejkie-iepjy-ziitc-3ae",
    "nxdvu-ipwv3-xgadl-ws3fw-ply6m-vf5st-nd5mq-4hv5c-nzvgc-o6swr-oae",
  ];

  public func isBootstrapAdmin(p : Principal) : Bool {
    let t = Principal.toText(p);
    for (a in BOOTSTRAP_ADMINS.values()) {
      if (a == t) return true;
    };
    false;
  };

  // % per tier: Treasure, Ingot, Nugget, Gold dust, Rock
  public let CUTS_PCT : [Nat] = [5, 15, 25, 35, 20];
  let CUM_PCT : [Nat] = [5, 20, 45, 80, 100];
  // Multiplier per chip in bps (Treasure gets whatever is left)
  public let MULT_BPS : [Nat] = [0, 12_500, 11_500, 10_000, 0];
  public let TREASURE : Nat = 0;
  public let ROCK : Nat = 4;

  // Points when saving after k safe picks (k = 2 are the free ones).
  // Built so that any strategy is worth 100 on average with 5 mines
  // and a collapse keeping 50%.
  public let POINTS : [Nat] = [
    0, 50, 100, 114, 131, 151, 176, 208, 248, 299, 367,
    459, 587, 770, 1045, 1480, 2220, 3608, 6614, 14882, 52087,
  ];

  // Saturating subtraction: returns 0 instead of trapping when b > a.
  public func sub(a : Nat, b : Nat) : Nat {
    let d : Int = a - b;
    if (d > 0) Int.abs(d) else 0;
  };

  public func pointsAt(k : Nat) : Nat { POINTS[k] };

  // Collapse after k safe picks: keeps half (rounded up)
  public func collapsePoints(k : Nat) : Nat { (POINTS[k] + 1) / 2 };

  public func canSave(picks : Nat) : Bool { picks > SAFE };

  // Chance (x100) that the next pick is safe
  public func safePctX100(picks : Nat) : Nat {
    if (picks < SAFE) 10_000 else if (picks >= MAX_PICKS) 0 else sub(sub(CELLS, MINES), picks) * 10_000 / sub(CELLS, picks);
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

  // Resolves a pick with raw_rand bytes: collapse (only from the 3rd pick) and diamond
  public func decidePick(picks : Nat, bytes : [Nat8]) : { collapsed : Bool; diamond : Bool } {
    let r1 = bytesToNat(bytes, 0, 4);
    let r2 = bytesToNat(bytes, 4, 4);
    let collapsed = picks >= SAFE and (r1 % sub(CELLS, picks)) < MINES;
    let diamond = not collapsed and (r2 % 10_000) < DIAMOND_BPS;
    { collapsed; diamond };
  };

  // Deterministic PRNG (splitmix64) seeded with raw_rand, used to auto-play
  // unused excavations at close. No player decisions are involved.
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

  // One automatic excavation saving at `stopAt` picks. Returns (points, diamonds).
  public func autoExcavation(rng : Prng, stopAt : Nat) : (Nat, Nat) {
    var picks = 0;
    var diamonds = 0;
    loop {
      if (picks >= SAFE and rng.below(sub(CELLS, picks)) < MINES) return (collapsePoints(picks), diamonds);
      picks += 1;
      if (rng.below(10_000) < DIAMOND_BPS) diamonds += 1;
      if (picks == stopAt or picks == MAX_PICKS) return (pointsAt(picks), diamonds);
    };
  };

  public func avgX100(f : Chip) : Nat {
    if (f.used == 0) 0 else f.points * 100 / f.used;
  };

  // Ranking order: average desc, then who finished first, then id
  public func compareChip(a : Chip, b : Chip) : Order.Order {
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

  // Tier for a position (0 = first) among k chips
  public func tierAt(pos : Nat, k : Nat) : Nat {
    var t = 0;
    while (t < 4 and (2 * pos + 1) * 50 >= CUM_PCT[t] * k) { t += 1 };
    t;
  };

  public type PlayerAgg = {
    chips : Nat;
    tiers : [Nat];
    gross : Nat; // chip prizes, without fees
    anyPaid : Bool;
    diamonds : Nat;
    points : Nat;
    used : Nat;
    playing : Bool;
  };

  public type Settlement = {
    ranked : [(Chip, Nat, Nat)]; // chip, tier, gross
    pot : Nat;
    treasurePerChip : Nat;
    treasuryKeep : Nat;
    drawPrize : Nat;
    totalDiamonds : Nat;
    cutsX100 : [?Nat];
    players : [(Principal, PlayerAgg)];
  };

  // Ranks every chip of the week and computes what each player would receive.
  // playTx: how many times each player bought chips (to refund fees).
  public func settle(
    chips : Map.Map<Nat, Chip>,
    playTx : Principal -> Nat,
    drawCarry : Nat,
  ) : Settlement {
    let sorted = Array.sort(chips.values().toArray(), compareChip);
    let k = sorted.size();
    let pot = k * CHIP_PRICE;
    let tiers = Array.tabulate<Nat>(k, func i = tierAt(i, k));

    // Current minimum average per tier (to show cutoffs)
    let cuts = VarArray.repeat<?Nat>(null, 4);
    for (i in sorted.keys()) {
      let t = tiers[i];
      if (t < 4 and sorted[i].used > 0) {
        let a = avgX100(sorted[i]);
        cuts[t] := switch (cuts[t]) { case null ?a; case (?c) ?Nat.min(c, a) };
      };
    };

    // Per-player aggregate
    let agg = Map.empty<Principal, PlayerAgg>();
    for (i in sorted.keys()) {
      let f = sorted[i];
      let t = tiers[i];
      let prev : PlayerAgg = switch (agg.get(f.owner)) {
        case (?p) p;
        case null {
          { chips = 0; tiers = [0, 0, 0, 0, 0]; gross = 0; anyPaid = false; diamonds = 0; points = 0; used = 0; playing = false };
        };
      };
      agg.add(
        f.owner,
        {
          chips = prev.chips + 1;
          tiers = Array.tabulate<Nat>(5, func j = if (j == t) prev.tiers[j] + 1 else prev.tiers[j]);
          gross = prev.gross;
          anyPaid = prev.anyPaid or t != ROCK;
          diamonds = prev.diamonds + f.diamonds;
          points = prev.points + f.points;
          used = prev.used + f.used;
          playing = prev.playing or f.used < EXCAVATIONS_PER_CHIP;
        },
      );
    };

    var reimb = 0;
    var totalDiamonds = 0;
    for ((p, a) in agg.entries()) {
      if (a.anyPaid) reimb += FEE * playTx(p) + FEE;
      totalDiamonds += a.diamonds;
    };

    let treasuryKeep = pot * TREASURY_BPS / 10_000;
    let drawPrize = pot * DRAW_BPS / 10_000 + drawCarry;
    let budgetBase = sub(sub(pot, treasuryKeep), pot * DRAW_BPS / 10_000);
    let budget = sub(budgetBase, reimb);

    var spent = 0;
    var ng = 0;
    for (t in tiers.values()) {
      if (t == TREASURE) ng += 1 else spent += CHIP_PRICE * MULT_BPS[t] / 10_000;
    };
    let treasurePerChip = if (ng > 0) sub(budget, spent) / ng else 0;

    let ranked = Array.tabulate<(Chip, Nat, Nat)>(
      k,
      func i {
        let t = tiers[i];
        let g = if (t == TREASURE) treasurePerChip else CHIP_PRICE * MULT_BPS[t] / 10_000;
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
      treasurePerChip;
      treasuryKeep;
      drawPrize;
      totalDiamonds;
      cutsX100 = VarArray.toArray(cuts);
      players = agg.entries().toArray();
    };
  };

  // Amount credited to a player: chip prizes + refunded buy fees.
  // (The payout fee is burned: gross + fee*playTx + fee - fee)
  public func netFor(a : PlayerAgg, playTx : Nat) : Nat {
    if (a.anyPaid) a.gross + FEE * playTx else 0;
  };

  public func paidFor(a : PlayerAgg, playTx : Nat) : Nat {
    a.chips * CHIP_PRICE + FEE * playTx;
  };
};
