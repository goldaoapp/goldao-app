import TreasuryTypes "../types/treasury";
import TreasuryLib "../lib/treasury";
import Map "mo:core/Map";

mixin (
  treasurySnapshots : Map.Map<Text, TreasuryTypes.TreasurySnapshot>,
) {
  /// Check if a snapshot for the given date exists (cheap query).
  public query func hasSnapshot(date : Text) : async Bool {
    TreasuryLib.has(treasurySnapshots, date);
  };

  /// Save a daily snapshot. Write-once per day — rejects if date exists.
  public func saveTreasurySnapshot(
    snapshot : TreasuryTypes.TreasurySnapshot,
  ) : async Bool {
    TreasuryLib.save(treasurySnapshots, snapshot);
  };

  /// Full history sorted by date ascending.
  public query func getTreasuryHistory() : async [TreasuryTypes.TreasurySnapshot] {
    TreasuryLib.getAll(treasurySnapshots);
  };
};
