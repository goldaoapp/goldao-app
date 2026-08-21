import Types "../types/treasury";
import Map "mo:core/Map";

module {
  public type TreasurySnapshot = Types.TreasurySnapshot;

  /// Check if a snapshot for the given date already exists.
  public func has(snapshots : Map.Map<Text, TreasurySnapshot>, date : Text) : Bool {
    snapshots.get(date) != null;
  };

  /// Save a snapshot. Returns false if date already exists or data is invalid.
  public func save(
    snapshots : Map.Map<Text, TreasurySnapshot>,
    snapshot  : TreasurySnapshot,
  ) : Bool {
    // Validate
    if (snapshot.date.size() != 10) return false;
    if (snapshot.total_usd <= 0.0) return false;

    // Write-once per day
    if (snapshots.get(snapshot.date) != null) return false;

    snapshots.add(snapshot.date, snapshot);

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
