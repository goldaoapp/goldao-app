import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat64 "mo:core/Nat64";
import Int "mo:core/Int";
import Principal "mo:core/Principal";

module {
  public let E8S : Nat = 100_000_000;
  public let CENT : Nat = 1_000_000;
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
  public let TOP10_BPS : Nat = 135;
  public let TOP10_WEIGHTS : [Nat] = [25, 18, 14, 11, 9, 7, 6, 4, 3, 3];
  public let TOP10_MIN_VOLUME : Nat = 100_000_000_000;
  public let POOL_SEED : Nat = 500_000_000_000;
  public let POOL_SEED_MAX : Nat = 2_000_000_000_000;
  public let RESERVE_CAP : Nat = 2_000_000_000_000;
  public let FUND_FLOOR : Nat = 9_000_000_000_000;
  public let FUND_TARGET : Nat = 22_000_000_000_000;
  public let DIAMOND1_BPS : Nat = 200;
  // Diamond chain, rolled on every safe pick. One diamond pays nothing, two diamonds pay the mini
  // jackpot (MINI_BPS of the pool) and three diamonds pay the whole pool.
  // The second diamond hits with DIAMOND2_PER_GOLDAO / DIAMOND2_BASE per whole GOLDAO staked and the
  // third with 1 in DIAMOND3_ODDS, so the full jackpot keeps its odds of 6.25e-7 per GOLDAO staked:
  // 0.02 * (18_750 / 100_000_000) / 6 = 0.02 * 0.2 * (15_625 / 100_000_000).
  // Exactly two diamonds are DIAMOND3_ODDS - 1 times more frequent than three.
  public let DIAMOND2_PER_GOLDAO : Nat = 18_750;
  public let DIAMOND2_BASE : Nat = 100_000_000;
  public let DIAMOND3_ODDS : Nat = 6;
  public let MINI_BPS : Nat = 2_000;
  public let DEFAULT_DURATION_DAYS : Nat = 7;
  public let MAX_DURATION_DAYS : Nat = 60;
  public let JACKPOT_LOG : Nat = 50;
  // Players per page of the ranking. Fixed here: the caller picks a page, never its size.
  public let RANKING_PAGE : Nat = 50;
  // Most recent jackpots sent along with the ranking (the log itself keeps JACKPOT_LOG).
  public let JACKPOT_SHOWN : Nat = 10;
  public let DAY_NS : Int = 86_400_000_000_000;
  public let BUSY_STALE_NS : Int = 600_000_000_000;
  public let STAMP_MAX_AGE_NS : Nat64 = 72_000_000_000_000;
  public let CLOSED_MSG : Text = "The tournament has just closed. Your balance was paid out or carried over to the new tournament: check your wallet and Accumulated prize, then try again.";
  public let ERR_PAY_FUNDS : Text = "The bank wallet does not cover the payout.";
  public let ERR_PAY_ALLOWANCE : Text = "The payout authorization is too low.";
  public let ERR_PAY_UNCERTAIN : Text = "This payout got no answer from the ledger and its timestamp expired. Look for it in the ledger before paying again.";
  public let NEED_CREDIT_MSG : Text = "Load balance first: your Accumulated prize must cover the stake.";
  public let STAKE_CHANGED_MSG : Text = "The stake amounts changed. Check the new amounts and try again.";
  public let EXC_CHANGED_MSG : Text = "Your excavation changed (another tab or device?). Reload the board and try again.";
  public let LOAD_REJECT_MAX : Nat = 20;
  public let LOAD_REJECT_WINDOW_NS : Int = 60_000_000_000;
  public let PAY_BATCH : Nat = 20;
  // Paid payouts are kept for this many tournaments: they are the payment record.
  public let PAYOUT_KEEP : Nat = 10;
  // The ledger fee is read once per this many ticks (one tick per minute).
  public let FEE_CHECK_TICKS : Nat = 60;
  public let LOAD_MIN : Nat = 1_000;
  public let LOAD_MAX : Nat = 50_000;
  public let CREDIT_CAP : Nat = 20_000_000_000_000;
  public let MIN_PAYOUT : Nat = 5_000_000_000;

  // Principals that are always admin. Paste Internet Identity principals here before deploying.
  public let BOOTSTRAP_ADMINS : [Text] = [
  "o4k5k-q4hdh-hmf4x-qnqbw-m53ao-c4u6t-6vyft-ejkie-iepjy-ziitc-3ae",
  "nxdvu-ipwv3-xgadl-ws3fw-ply6m-vf5st-nd5mq-4hv5c-nzvgc-o6swr-oae",
  ];

  // The bank wallet of each deployment, by game canister id. It is an admin principal that signs
  // the payments. The game connects to the ledger by itself only when its own canister id is in
  // this list; anywhere else it stays disconnected. Internet Identity gives a different principal
  // per login origin, so each deployment has its own bank.
  public let BANKS : [(Text, Text)] = [
    // Draft (test) backend canister.
    ("cohf5-6aaaa-aaaaa-qajya-cai", "nxdvu-ipwv3-xgadl-ws3fw-ply6m-vf5st-nd5mq-4hv5c-nzvgc-o6swr-oae"),
    // Production backend canister.
    ("epksw-wiaaa-aaaad-agwna-cai", "o4k5k-q4hdh-hmf4x-qnqbw-m53ao-c4u6t-6vyft-ejkie-iepjy-ziitc-3ae"),
  ];

  public func bankFor(game : Principal) : ?Principal {
    let t = Principal.toText(game);
    for ((id, bank) in BANKS.values()) {
      if (id == t) return ?Principal.fromText(bank);
    };
    null;
  };

  public let TREASURY : Text = "mkbc4-kaq3u-voc2z-j7yut-xgc3h-2gcgd-hfuzl-ss6uo-4q5q7-egfp4-qqe";

  public func treasury() : Principal { Principal.fromText(TREASURY) };

  public let LEDGER_FAIL_MAX : Nat = 5;

  // Why the game is halted (haltCode).
  public let HALT_LEDGER : Nat = 2;
  public let HALT_MANUAL : Nat = 3;
  public let HALT_BANK : Nat = 4;
  public let HALT_FUND : Nat = 5;
  public let HALT_FEE : Nat = 6;

  // Safeguards. The admin wallet pays a ledger fee for each authorization it signs, which the game
  // cannot see: the bank wallet may hold up to BANK_TOLERANCE less than the game expects, summed
  // over BANK_WINDOW_NS (about ten authorizations), before the game halts. The fund is sampled
  // every tick; it halts the game when it falls by FUND_DROP_PCT percent (and at least
  // FUND_DROP_MIN) within the samples kept.
  public let BANK_TOLERANCE : Nat = 10_000_000_000;
  public let BANK_WINDOW_NS : Int = 86_400_000_000_000;
  public let FUND_SAMPLES : Nat = 10;
  public let FUND_DROP_PCT : Nat = 30;
  public let FUND_DROP_MIN : Nat = 1_000_000_000_000;

  // Security log: one bucket per UTC day, kept for SECURITY_LOG_DAYS days, at most
  // SECURITY_LOG_MAX_DAY distinct entries per day (repeated events are merged into one).
  public let SECURITY_LOG_DAYS : Nat = 90;
  public let SECURITY_LOG_MAX_DAY : Nat = 100;

  public func haltReason(code : Nat) : Text {
    if (code == HALT_LEDGER) "ledger failures" else if (code == HALT_MANUAL) "paused by admin" else if (code == HALT_BANK) "unexplained bank withdrawal" else if (code == HALT_FUND) "fund drop" else if (code == HALT_FEE) "ledger fee changed" else "unknown";
  };

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

  // Top-10 prizes are rounded down to whole cents (0.01 GOLDAO) so every balance has at most 2 decimals.
  // The remainder stays in the bucket for the next tournament.
  public func top10Prize(bucket : Nat, rank : Nat, volume : Nat) : Nat {
    if (rank == 0 or rank > TOP10_WEIGHTS.size() or volume < TOP10_MIN_VOLUME) return 0;
    bucket * TOP10_WEIGHTS[rank - 1] / 100 / CENT * CENT;
  };

  // Net result of a player in a tournament: what came back (prizes, jackpots and the Top 10 prize)
  // minus what was staked.
  public func net(returned : Nat, jackpotWon : Nat, top10Prize : Nat, staked : Nat) : Int {
    (returned + jackpotWon + top10Prize).toInt() - staked.toInt();
  };

  // Page `page` (zero-based) of `total` rows, `size` per page. A page past the end is clamped to the
  // last one, so the call never traps and never returns an empty page for a non-empty list.
  // Returns (page used, first index, index after the last).
  public func pageBounds(total : Nat, page : Nat, size : Nat) : (Nat, Nat, Nat) {
    if (total == 0 or size == 0) return (0, 0, 0);
    let used = Nat.min(page, (total - 1) / size);
    let from = used * size;
    (used, from, Nat.min(from + size, total));
  };

  public func canSave(picks : Nat) : Bool { picks > SAFE };

  public func safePctX100(picks : Nat) : Nat {
    if (picks < SAFE) 10_000 else if (picks >= MAX_PICKS) 0 else sub(sub(CELLS, MINES), picks) * 10_000 / sub(CELLS, picks);
  };

  // Multiplier in hundredths (105 = 1.05x), always rounded down. This is the single source of truth:
  // the frontend shows exactly this value. Stakes are whole GOLDAO, so stake * multiplier is exact to 0.01.
  public func multX100(points : Nat) : Nat {
    points * PAYOUT_BPS / 10_000;
  };

  public func gross(stake : Nat, points : Nat) : Nat {
    stake * multX100(points) / 100;
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
  public func diamond2Hit(r : Nat, stake : Nat) : Bool {
    r % DIAMOND2_BASE < stake / E8S * DIAMOND2_PER_GOLDAO;
  };
  public func diamond3Hit(r : Nat) : Bool { r % DIAMOND3_ODDS == 0 };

  // The mini jackpot is rounded down to whole cents (0.01 GOLDAO), like the Top-10 prizes.
  public func miniPrize(pool : Nat) : Nat {
    pool * MINI_BPS / 10_000 / CENT * CENT;
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
