import TreasuryTypes "../types/treasury";
import TreasuryLib "../lib/treasury";
import Game "../lib/game";
import Map "mo:core/Map";
import Time "mo:core/Time";

mixin (
  treasurySnapshots : Map.Map<Text, TreasuryTypes.TreasurySnapshot>,
) {
  /// Check if a snapshot for the given date exists (cheap query).
  public query func hasSnapshot(date : Text) : async Bool {
    TreasuryLib.has(treasurySnapshots, date);
  };

  /// Save a daily snapshot. Only the game admins can save. Write-once per day, only for today's
  /// date (UTC), validated in the lib.
  public shared ({ caller }) func saveTreasurySnapshot(
    snapshot : TreasuryTypes.TreasurySnapshot,
  ) : async Bool {
    if (not Game.isBootstrapAdmin(caller)) return false;
    TreasuryLib.save(treasurySnapshots, snapshot, Time.now());
  };

  /// Full history sorted by date ascending.
  public query func getTreasuryHistory() : async [TreasuryTypes.TreasurySnapshot] {
    TreasuryLib.getAll(treasurySnapshots);
  };
};
