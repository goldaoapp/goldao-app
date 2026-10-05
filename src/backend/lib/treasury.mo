import Types "../types/treasury";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Nat64 "mo:core/Nat64";

module {
  public type TreasurySnapshot = Types.TreasurySnapshot;

  /// Check if a snapshot for the given date already exists.
  public func has(snapshots : Map.Map<Text, TreasurySnapshot>, date : Text) : Bool {
    snapshots.get(date) != null;
  };

  let DAY_NS : Int = 86_400_000_000_000;
  // Largest value accepted for any amount or USD figure.
  let MAX_VALUE : Float = 1.0e12;
  // A new total may be between 0.3x and 3x of the latest complete snapshot,
  // as long as that snapshot is not older than this many days.
  let BAND_DAYS : Int = 30;

  func pad2(n : Nat) : Text {
    if (n < 10) "0" # Nat.toText(n) else Nat.toText(n);
  };

  /// UTC date "YYYY-MM-DD" of a timestamp in nanoseconds (civil-from-days).
  public func dateOf(ns : Int) : Text {
    let days : Nat = Int.abs(ns / DAY_NS);
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    let y = yoe + era * 400 + (if (m <= 2) 1 else 0);
    Nat.toText(y) # "-" # pad2(m) # "-" # pad2(d);
  };

  // NaN fails both comparisons, so it is rejected too.
  func valid(v : Float) : Bool { v > 0.0 and v < MAX_VALUE };

  func complete(s : TreasurySnapshot) : Bool {
    valid(s.icp_usd) and valid(s.ogy_usd) and valid(s.wtn_usd) and valid(s.total_usd);
  };

  /// Save a snapshot. Anyone can call it (the page saves it from the visitor's browser), so the
  /// canister checks everything it can: the date must be today in UTC by the canister clock, the
  /// timestamp is set here, every figure must be a sane positive number, the total must equal the
  /// sum of the three legs and stay within a band of the latest complete snapshot.
  /// Returns false if the data is rejected or the date already exists.
  public func save(
    snapshots : Map.Map<Text, TreasurySnapshot>,
    snapshot  : TreasurySnapshot,
    now       : Int,
  ) : Bool {
    let today = dateOf(now);
    if (snapshot.date != today) return false;

    if (not (valid(snapshot.icp_amount) and valid(snapshot.ogy_amount) and valid(snapshot.wtn_amount))) return false;
    if (not complete(snapshot)) return false;

    let sum = snapshot.icp_usd + snapshot.ogy_usd + snapshot.wtn_usd;
    let diff = if (snapshot.total_usd > sum) snapshot.total_usd - sum else sum - snapshot.total_usd;
    if (not (diff <= 0.01 + sum * 0.0001)) return false;

    // Write-once per day
    if (snapshots.get(today) != null) return false;

    // Band against the latest complete snapshot, if it is recent
    var last : ?TreasurySnapshot = null;
    for ((_, v) in snapshots.entries()) {
      if (complete(v)) last := ?v;
    };
    switch (last) {
      case (?l) {
        if (l.date >= dateOf(now - BAND_DAYS * DAY_NS)) {
          let ratio = snapshot.total_usd / l.total_usd;
          if (not (ratio >= 0.3 and ratio <= 3.0)) return false;
        };
      };
      case null {};
    };

    let stored : TreasurySnapshot = { snapshot with timestamp = Nat64.fromNat(Int.abs(now / 1_000_000)) };
    snapshots.add(today, stored);

    // Prune oldest if over 365 — first entry is the smallest key (oldest date)
    if (snapshots.size() > 365) {
      switch (snapshots.entries().next()) {
        case (?(oldest, _)) { snapshots.remove(oldest) };
        case null {};
      };
    };

    true;
  };

  /// Return all snapshots as array. Map<Text, _> keys are ordered,
  /// and ISO date strings sort chronologically, so no explicit sort needed.
  public func getAll(snapshots : Map.Map<Text, TreasurySnapshot>) : [TreasurySnapshot] {
    snapshots.entries()
      .map(func ((_, v) : (Text, TreasurySnapshot)) : TreasurySnapshot { v })
      .toArray();
  };
};
