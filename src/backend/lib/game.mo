import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat64 "mo:core/Nat64";
import Int "mo:core/Int";
import Principal "mo:core/Principal";

module {
  public let E8S : Nat = 100_000_000;
  public let FEE : Nat = 1_000_000_000;
  public let CELLS : Nat = 25;
  public let MINES : Nat = 5;
  public let SAFE : Nat = 2;
  public let MAX_PICKS : Nat = 10;
  public let POINTS : [Nat] = [0, 50, 100, 114, 131, 151, 176, 208, 248, 299, 367];

  public let STAKE_MIN : Nat = 10_000_000_000;
  public let STAKE_CAP : Nat = 100_000_000_000;
  public let STAKE_STEP : Nat = 10_000_000_000;
  public let MID_STEP : Nat = 1_000_000_000;
  public let MAX_STAKE_BPS : Nat = 50;
  public let PAYOUT_BPS : Nat = 9_250;
  public let POOL_BPS : Nat = 250;
  public let RESERVE_BPS : Nat = 250;
  public let CYCLES_BPS : Nat = 50;
  public let TOP10_BPS : Nat = 95;
  public let TOP10_WEIGHTS : [Nat] = [25, 18, 14, 11, 9, 7, 6, 4, 3, 3];
  public let TOP10_MIN_VOLUME : Nat = 100_000_000_000;
  public let POOL_SEED : Nat = 500_000_000_000;
  public let POOL_SEED_MAX : Nat = 2_000_000_000_000;
  public let RESERVE_CAP : Nat = 2_000_000_000_000;
  public let FUND_FLOOR : Nat = 2_000_000_000_000;
  public let FUND_TARGET : Nat = 20_000_000_000_000;
  public let DIAMOND1_BPS : Nat = 200;
  public let DIAMOND2_BPS : Nat = 2_000;
  public let DIAMOND3_PER_GOLDAO : Nat = 15_625;
  public let DIAMOND3_BASE : Nat = 100_000_000;
  public let DEFAULT_DURATION_DAYS : Nat = 7;
  public let MAX_DURATION_DAYS : Nat = 60;
  public let JACKPOT_LOG : Nat = 50;
  public let DAY_NS : Int = 86_400_000_000_000;
  public let BUSY_STALE_NS : Int = 600_000_000_000;
  public let PAY_BATCH : Nat = 20;
  public let FAUCET_CAP : Nat = 2_000_000_000_000;
  public let FAUCET_GLOBAL_CAP : Nat = 200_000_000_000_000;
  public let TEST_DEPOSITS : [Nat] = [10_000, 30_000, 100_000, 200_000];
  public let LOAD_MIN : Nat = 100;
  public let LOAD_MAX : Nat = 5_000;
  public let CREDIT_CAP : Nat = 2_000_000_000_000;
  public let MIN_PAYOUT : Nat = 5_000_000_000;
  public let MAX_APPROVE : Nat = 1_000_000_000_000_000;

  // Principals that are always admin. Paste Internet Identity principals here before deploying.
  public let BOOTSTRAP_ADMINS : [Text] = [
  "o4k5k-q4hdh-hmf4x-qnqbw-m53ao-c4u6t-6vyft-ejkie-iepjy-ziitc-3ae",
  "nxdvu-ipwv3-xgadl-ws3fw-ply6m-vf5st-nd5mq-4hv5c-nzvgc-o6swr-oae",
  ];

  public let TREASURY : Text = "mkbc4-kaq3u-voc2z-j7yut-xgc3h-2gcgd-hfuzl-ss6uo-4q5q7-egfp4-qqe";

  public func treasury() : Principal { Principal.fromText(TREASURY) };

  public let LEDGER_FAIL_MAX : Nat = 5;

  public func isBootstrapAdmin(p : Principal) : Bool {
    let t = Principal.toText(p);
    for (a in BOOTSTRAP_ADMINS.values()) {
      if (a == t) return true;
    };
    false;
  };

  public func sub(a : Nat, b : Nat) : Nat {
    let d : Int = a - b;
    if (d > 0) Int.abs(d) else 0;
  };

  public func pointsAt(k : Nat) : Nat {
    if (k < POINTS.size()) POINTS[k] else POINTS[MAX_PICKS];
  };

  public func collapsePoints(k : Nat) : Nat { (pointsAt(k) + 1) / 2 };

  public func top10Prize(bucket : Nat, rank : Nat, volume : Nat) : Nat {
    if (rank == 0 or rank > TOP10_WEIGHTS.size() or volume < TOP10_MIN_VOLUME) return 0;
    bucket * TOP10_WEIGHTS[rank - 1] / 100;
  };

  public func canSave(picks : Nat) : Bool { picks > SAFE };

  public func safePctX100(picks : Nat) : Nat {
    if (picks < SAFE) 10_000 else if (picks >= MAX_PICKS) 0 else sub(sub(CELLS, MINES), picks) * 10_000 / sub(CELLS, picks);
  };

  public func gross(stake : Nat, points : Nat) : Nat {
    stake * points * PAYOUT_BPS / 1_000_000;
  };

  public func fund(bank : Nat, owed : Nat, pool : Nat, reserve : Nat, cycles : Nat, top10 : Nat) : Int {
    let b : Int = bank;
    b - owed - pool - reserve - cycles - top10;
  };

  public func stakes(f : Int) : [Nat] {
    if (f < FUND_FLOOR) return [];
    let raw = Int.abs(f) * MAX_STAKE_BPS / 10_000;
    let max = Nat.min(STAKE_CAP, Nat.max(STAKE_MIN, raw / STAKE_STEP * STAKE_STEP));
    let mid = ((STAKE_MIN + max) / 2 + MID_STEP / 2) / MID_STEP * MID_STEP;
    [STAKE_MIN, mid, max];
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

  public func collapseHit(picks : Nat, r : Nat) : Bool {
    picks >= SAFE and (r % sub(CELLS, picks)) < MINES;
  };

  public func diamond1Hit(r : Nat) : Bool { r % 10_000 < DIAMOND1_BPS };
  public func diamond2Hit(r : Nat) : Bool { r % 10_000 < DIAMOND2_BPS };
  public func diamond3Hit(r : Nat, stake : Nat) : Bool {
    r % DIAMOND3_BASE < stake / E8S * DIAMOND3_PER_GOLDAO;
  };

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

  public func seedFrom(bytes : [Nat8]) : Nat64 {
    var s : Nat64 = 0;
    var i = 0;
    while (i < 4) {
      var w : Nat64 = 0;
      var j = 0;
      while (j < 8) {
        let idx = i * 8 + j;
        let b : Nat8 = if (idx < bytes.size()) bytes[idx] else 0;
        w := (w << 8) | Nat.toNat64(Nat8.toNat(b));
        j += 1;
      };
      s := s ^ w;
      i += 1;
    };
    s;
  };
};
