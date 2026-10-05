import Types "../types/game";
import Game "game";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Int "mo:core/Int";

// Daily security log. Pure functions over the log map kept in the game state.
module {
  public type Log = Map.Map<Nat, [Types.SecurityEvent]>;

  let OVERFLOW = "log_full";

  // Days since the Unix epoch (UTC).
  public func dayOf(t : Int) : Nat {
    Int.abs(t / Game.DAY_NS);
  };

  // e8s as GOLDAO text with two decimals, rounded down: 1234.50
  public func fmt(e8s : Nat) : Text {
    let cents = e8s % Game.E8S / Game.CENT;
    Nat.toText(e8s / Game.E8S) # "." # (if (cents < 10) "0" else "") # Nat.toText(cents);
  };

  public func fmtInt(v : Int) : Text {
    if (v < 0) "-" # fmt(Int.abs(v)) else fmt(Int.abs(v));
  };

  func rank(l : Types.SecurityLevel) : Nat {
    switch (l) { case (#info) 0; case (#warning) 1; case (#critical) 2 };
  };

  func isAttention(l : Types.SecurityLevel) : Bool { rank(l) > 0 };

  func prune(log : Log, today : Nat) {
    for (d in log.keys().toArray().values()) {
      if (d + Game.SECURITY_LOG_DAYS < today) log.remove(d);
    };
  };

  func put(log : Log, now : Int, level : Types.SecurityLevel, code : Text, merge : Bool, title : Text, description : Text) {
    let day = dayOf(now);
    let list = switch (log.get(day)) {
      case (?l) l;
      case null {
        prune(log, day);
        [];
      };
    };
    var found : ?Nat = null;
    if (merge) {
      var i = 0;
      for (e in list.values()) {
        if (e.code == code) found := ?i;
        i += 1;
      };
    };
    switch (found) {
      case (?k) {
        let old = list[k];
        let upd : Types.SecurityEvent = {
          old with
          lastAt = now;
          count = old.count + 1;
          description;
          level = if (rank(level) > rank(old.level)) level else old.level;
        };
        log.add(day, Array.tabulate(list.size(), func(j : Nat) : Types.SecurityEvent { if (j == k) upd else list[j] }));
      };
      case null {
        if (code != OVERFLOW and list.size() >= Game.SECURITY_LOG_MAX_DAY) {
          put(log, now, #warning, OVERFLOW, true, "Log full for the day", "Too many different events today: the rest are counted here, not listed.");
        } else {
          log.add(day, Array.concat(list, [{ at = now; lastAt = now; level; code; title; description; count = 1 }]));
        };
      };
    };
  };

  // Repeated events of the same code on the same day become one entry.
  public func record(log : Log, now : Int, level : Types.SecurityLevel, code : Text, title : Text, description : Text) {
    put(log, now, level, code, true, title, description);
  };

  // Always a new entry (admin actions, where each one matters).
  public func append(log : Log, now : Int, level : Types.SecurityLevel, code : Text, title : Text, description : Text) {
    put(log, now, level, code, false, title, description);
  };

  // Days with entries, newest first.
  public func days(log : Log) : [Types.SecurityDay] {
    let rows = log.entries().toArray().map(
      func((d, list) : (Nat, [Types.SecurityEvent])) : Types.SecurityDay {
        var attention = 0;
        for (e in list.values()) { if (isAttention(e.level)) attention += 1 };
        { day = d; events = list.size(); attention };
      }
    );
    Array.sort(rows, func(a : Types.SecurityDay, b : Types.SecurityDay) : { #less; #equal; #greater } { Nat.compare(b.day, a.day) });
  };

  // Events of one day, newest first.
  public func eventsOf(log : Log, day : Nat) : [Types.SecurityEvent] {
    switch (log.get(day)) {
      case (?l) Array.sort(l, func(a : Types.SecurityEvent, b : Types.SecurityEvent) : { #less; #equal; #greater } { Int.compare(b.lastAt, a.lastAt) });
      case null [];
    };
  };
};
