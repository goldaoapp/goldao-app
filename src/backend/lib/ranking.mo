import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Types "../types/game";
import Game "game";

// Ordering of the ranking table. Pure functions: the mixin only reads the state and hands the rows over.
module {
  // True when `a` ranks above `b` by volume. Equal volumes go to the lower principal, so the order is total.
  public func better(a : (Principal, Nat), b : (Principal, Nat)) : Bool {
    a.1 > b.1 or (a.1 == b.1 and Principal.compare(a.0, b.0) == #less);
  };

  // Players in Top 10 order (volume). Fills in pos, rank, the Top 10 prize paid at that rank and the net
  // result, which counts that prize.
  public func byVolume(rows : [Types.PlayerRow], top10 : Nat) : [Types.PlayerRow] {
    let sorted = rows.sort(
      func(a : Types.PlayerRow, b : Types.PlayerRow) : { #less; #equal; #greater } {
        if (better((a.player, a.staked), (b.player, b.staked))) #less else #greater;
      },
    );
    Array.tabulate(
      sorted.size(),
      func(i : Nat) : Types.PlayerRow {
        let r = sorted[i];
        let prize = Game.top10Prize(top10, i + 1, r.staked);
        { r with pos = i + 1; rank = i + 1; prize; net = Game.net(r.returned, r.jackpotWon, prize, r.staked) };
      },
    );
  };

  public func sortKey(sort : Types.RankingSort, r : Types.PlayerRow) : Int {
    switch (sort) {
      case (#volume) r.staked;
      case (#net) r.net;
      case (#bestPrize) r.bestReturn;
      case (#jackpot) r.jackpotWon;
    };
  };

  // Every player in the order asked for, highest value first. `ranked` must come from byVolume.
  // Ties keep the volume order, so the order is total and a player never repeats or goes missing
  // between two pages.
  public func order(ranked : [Types.PlayerRow], sort : Types.RankingSort) : [Types.PlayerRow] {
    switch (sort) {
      case (#volume) ranked;
      case _ {
        let sorted = ranked.sort(
          func(a : Types.PlayerRow, b : Types.PlayerRow) : { #less; #equal; #greater } {
            let ka = sortKey(sort, a);
            let kb = sortKey(sort, b);
            if (ka > kb) #less else if (ka < kb) #greater else Nat.compare(a.rank, b.rank);
          },
        );
        Array.tabulate(sorted.size(), func(i : Nat) : Types.PlayerRow { { sorted[i] with pos = i + 1 } });
      };
    };
  };
};
