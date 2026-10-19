import Types "../types/game";
import Game "../lib/game";
import Ledger "../lib/ledger";
import Ranking "../lib/ranking";
import SecLog "../lib/security-log";
import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Nat64 "mo:core/Nat64";
import Iter "mo:core/Iter";
import Int "mo:core/Int";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Prim "mo:⛔";

mixin (
  gameState : Types.GameState,
  accessControlState : Types.AccessControlState,
) {

  // Players with a credit load in flight (start time): one at a time. A lock older than
  // BUSY_STALE_NS is ignored, so a lost continuation can never block a player for good.
  transient let gLoading = Map.empty<Principal, Int>();
  // Rejected loads (no funds, no allowance) per account in the current window. Every load that
  // reaches the ledger bumps movSeq, so an account that keeps failing is cut off before it
  // reaches the ledger again. Each account has its own counter: one account never blocks others.
  transient let gRejects = Map.empty<Principal, (Int, Nat)>();
  // Players with a withdrawal call in flight (start time) and the start of their last attempt.
  transient let gWithdrawing = Map.empty<Principal, Int>();
  transient let gWithdrawLast = Map.empty<Principal, Int>();
  // Real-ledger transfers started and not yet answered. A bank reading taken while one is in
  // flight is not comparable with the game's own books, so it is neither audited nor adopted.
  transient var gInFlight : Nat = 0;
  // A transfer ended without an answer: it may or may not have been executed. The next clean
  // bank reading is adopted without raising an alarm.
  transient var gUncertain : Bool = false;
  transient var gWatching : Bool = false;
  // GOLDAO found missing from the bank (adopted silently, within the tolerance) in the current window.
  transient var gShort : Nat = 0;
  transient var gShortSince : Int = 0;

  // Security log
  func gLog(level : Types.SecurityLevel, code : Text, title : Text, description : Text) {
    SecLog.record(gameState.securityLog, Time.now(), level, code, title, description);
  };

  // Admin actions: each one is listed on its own.
  func gLogAction(code : Text, title : Text, description : Text) {
    SecLog.append(gameState.securityLog, Time.now(), #info, code, title, description);
  };

  // Transfer log: one line per transfer between a player's wallet and the game. It keeps the newest
  // TRANSFER_LOG_MAX lines. Only definite outcomes and unanswered calls are written, never rejected
  // attempts, so nobody can fill it with noise.
  func gRecordTransfer(kind : Types.TransferKind, player : Principal, amount : Nat, txId : ?Nat) {
    let log = gameState.transferLog;
    let id = if (log.size() == 0) 1 else log[Nat.sub(log.size(), 1)].id + 1;
    let all = Array.concat(log, [{ id; at = Time.now(); kind; player; amount; txId }]);
    gameState.transferLog := if (all.size() > Game.TRANSFER_LOG_MAX) Array.sliceToArray(all, Nat.sub(all.size(), Game.TRANSFER_LOG_MAX), all.size()) else all;
  };

  // Keeps only the newest `n` entries of a list.
  func keepLast<T>(l : List.List<T>, n : Nat) {
    let size = l.size();
    if (size > n) {
      let tail = l.sliceToArray(Nat.sub(size, n), size);
      l.clear();
      for (x in tail.values()) l.add(x);
    };
  };

  func gSub(a : Nat, b : Nat) : Nat {
    if (b > a) {
      gameState.saturations += 1;
      gLog(#warning, "accounting", "Accounting check tripped", "A balance would have gone below zero. Payments and withdrawals stay blocked until the alert is cleared.");
      return 0;
    };
    a - b;
  };

  func gLoadBusy(p : Principal) : Bool {
    switch (gLoading.get(p)) {
      case (?t) Time.now() - t < Game.BUSY_STALE_NS;
      case null false;
    };
  };

  // A pending load is dropped when its timestamp is too old for the ledger to recognize a retry.
  // If the first attempt had been executed, the player was charged without credit: logged for review.
  func gLoadForget(p : Principal, pl : Types.PendingLoad) {
    gameState.pendingLoads.remove(p);
    gRecordTransfer(#loadForgotten, p, pl.amount, null);
    gLog(#warning, "load_expired", "Unconfirmed load expired", "A load of " # Nat.toText(pl.amount / Game.E8S) # " GOLDAO from " # Principal.toText(p) # " never got an answer and its timestamp expired. Check the ledger: the player may have been charged without credit.");
  };

  func gLoadThrottled(p : Principal) : Bool {
    if (not gameState.realLedger) return false;
    switch (gRejects.get(p)) {
      case (?(since, count)) Time.now() - since < Game.LOAD_REJECT_WINDOW_NS and count >= Game.LOAD_REJECT_MAX;
      case null false;
    };
  };

  func gLoadRejected(p : Principal) {
    let now = Time.now();
    let (since, count) = switch (gRejects.get(p)) {
      case (?(s, c)) if (now - s < Game.LOAD_REJECT_WINDOW_NS) (s, c) else (now, 0);
      case null {
        if (gRejects.size() >= Game.LOAD_REJECT_TRACK_MAX) {
          for ((q, (s, _)) in gRejects.entries().toArray().values()) {
            if (now - s >= Game.LOAD_REJECT_WINDOW_NS) gRejects.remove(q);
          };
        };
        (now, 0);
      };
    };
    if (count == 0 and gRejects.size() >= Game.LOAD_REJECT_TRACK_MAX) return;
    gRejects.add(p, (since, count + 1));
    if (count + 1 == Game.LOAD_REJECT_MAX) {
      gLog(#warning, "load_throttle", "Load throttle active", "Loads from " # Principal.toText(p) # " are being rejected: " # Nat.toText(Game.LOAD_REJECT_MAX) # " rejected loads in the last minute.");
    };
  };

  // Credit taken by withdrawals that are not settled yet. It is still owed to the player until
  // the ledger confirms the transfer (or it goes back to the credit).
  func gPendingWithdrawalsTotal() : Nat {
    var t = 0;
    for ((_, pw) in gameState.pendingWithdrawals.entries()) { t += pw.amount };
    t;
  };

  func gPendingWithdrawal(p : Principal) : Nat {
    switch (gameState.pendingWithdrawals.get(p)) { case (?pw) pw.amount; case null 0 };
  };

  func gAccountingOk() : Bool {
    var credits = 0;
    for ((_, c) in gameState.credits.entries()) { credits += c };
    var held = 0;
    var inPlay = 0;
    for ((_, e) in gameState.open.entries()) {
      held += e.held;
      inPlay += e.stake;
    };
    gameState.owed == credits + held + inPlay + gPendingWithdrawalsTotal();
  };

  // The game admin comes only from BOOTSTRAP_ADMINS. Roles from the access-control
  // extension are ignored here, so nobody can become game admin by logging in first.
  func gIsAdmin(p : Principal) : Bool {
    Game.isBootstrapAdmin(p);
  };

  func gIsBank(p : Principal) : Bool {
    switch (gameState.bankAccount) { case (?b) b == p; case null false };
  };

  func gRequireUser(caller : Principal) : ?Text {
    if (Principal.isAnonymous(caller)) return ?"Sign in with Internet Identity.";
    if (gIsAdmin(caller) or gIsBank(caller)) return ?"Admin accounts cannot play.";
    null;
  };

  func gCredit(p : Principal) : Nat {
    switch (gameState.credits.get(p)) { case (?b) b; case null 0 };
  };

  func gEmptyStats() : Types.TournamentStats {
    { excavations = 0; staked = 0; returned = 0; jackpotWon = 0; jackpots = 0; minis = 0; miniWon = 0; collapses = 0; deepest = 0 };
  };

  func gStats(p : Principal) : Types.TournamentStats {
    switch (gameState.stats.get(p)) { case (?s) s; case null gEmptyStats() };
  };

  func gFund() : Int {
    Game.fund(gameState.bank, gameState.owed, gameState.pool, gameState.reserve, gameState.cycles, gameState.top10);
  };

  // Top-10 ranking by volume staked in the current tournament. Ties are settled by Ranking.better.
  func gTopList() : [(Principal, Ranking.Key)] {
    let n = Game.TOP10_WEIGHTS.size();
    var top : [(Principal, Ranking.Key)] = [];
    for ((p, s) in gameState.stats.entries()) {
      if (s.staked > 0) {
        let cand = (p, Ranking.keyOf(s));
        if (top.size() < n or Ranking.better(cand, top[top.size() - 1])) {
          let next = Array.sort(
            Array.concat(top, [cand]),
            func(a : (Principal, Ranking.Key), b : (Principal, Ranking.Key)) : { #less; #equal; #greater } {
              if (Ranking.better(a, b)) #less else if (Ranking.better(b, a)) #greater else #equal;
            },
          );
          top := if (next.size() > n) Array.sliceToArray(next, 0, n) else next;
        };
      };
    };
    top;
  };

  func gRankOf(p : Principal) : Nat {
    let mine = gStats(p);
    if (mine.staked == 0) return 0;
    let me = (p, Ranking.keyOf(mine));
    var rank = 1;
    for ((q, s) in gameState.stats.entries()) {
      // A smaller volume can never rank above: skip it before building the key.
      if (q != p and s.staked >= mine.staked and Ranking.better((q, Ranking.keyOf(s)), me)) rank += 1;
    };
    rank;
  };

  func gTopEntry() : Nat {
    let top = gTopList();
    let n = Game.TOP10_WEIGHTS.size();
    if (top.size() < n) Game.TOP10_MIN_VOLUME else Nat.max(Game.TOP10_MIN_VOLUME, top[n - 1].1.staked);
  };

  func gStakes() : [Nat] { Game.stakes(gFund()) };

  func gWithdrawable() : Nat {
    let f = gFund();
    let extra : Int = f - Game.FUND_TARGET;
    gameState.cycles + (if (extra > 0) Int.abs(extra) else 0);
  };

  // The bank is the account of the game canister itself: it receives the loads and sends the
  // payouts and withdrawals. A game connected to any other account does not move money.
  func gBankReady() : Bool {
    switch (gameState.bankAccount, gameState.selfId) {
      case (?b, ?s) b == s;
      case _ false;
    };
  };

  // Why new excavations cannot start (0 when they can), as the players see it. The cause of a
  // safety halt stays in the admin view.
  func gPauseCode() : Nat {
    if (gameState.halted) {
      if (gameState.haltCode == Game.HALT_EVAC) return Game.PAUSE_EVAC;
      return if (gameState.haltCode == Game.HALT_MANUAL) Game.PAUSE_ADMIN else Game.PAUSE_SAFETY;
    };
    // The time is over: open excavations are being finished before the tournament closes.
    if (gClosing()) return Game.PAUSE_CLOSING;
    // A tournament that is not started has no end time yet (see gameAdminStartTournament).
    if (gameState.endsAt == 0) return Game.PAUSE_WAITING;
    if (gameState.realLedger and not gBankReady()) return Game.PAUSE_BANK;
    if (gStakes().size() == 0) return Game.PAUSE_STAKES;
    0;
  };

  func gPaused() : Bool { gPauseCode() != 0 };

  // A pause set by the admin only stops new excavations: the open ones can still be finished.
  // Any other halt is a safety stop that also freezes the picks.
  func gHardHalt() : Bool {
    gameState.halted and gameState.haltCode != Game.HALT_MANUAL;
  };

  // Halts new bets and records why. The event is logged even if the game was already halted.
  // A safety halt takes over from a pause by the admin, never the other way around.
  func gHalt(code : Nat, level : Types.SecurityLevel, title : Text, description : Text) {
    gLog(level, "halt_" # Nat.toText(code), title, description);
    if (gameState.halted and (gameState.haltCode != Game.HALT_MANUAL or code == Game.HALT_MANUAL)) return;
    gameState.halted := true;
    gameState.haltedAt := Time.now();
    gameState.haltCode := code;
    if (code != Game.HALT_MANUAL) gSaveReady();
  };

  func gLedgerOk() { gameState.ledgerFails := 0 };

  func gLedgerFail() {
    gameState.ledgerFails += 1;
    if (gameState.ledgerFails >= Game.LEDGER_FAIL_MAX) {
      gHalt(Game.HALT_LEDGER, #critical, "Ledger failures", Nat.toText(gameState.ledgerFails) # " ledger errors in a row. Bets are paused.");
    };
  };

  func gNextToken() : Nat {
    gameState.seq += 1;
    gameState.seq;
  };

  func gFresh(e : Types.Excavation) : Bool {
    e.busy and Time.now() - e.busyAt < Game.BUSY_STALE_NS;
  };

  func gAnyBusy() : Bool {
    for ((_, e) in gameState.open.entries()) {
      if (gFresh(e)) return true;
    };
    false;
  };

  func gRandomBytes() : async [Nat8] {
    (await Random.blob()).values().toArray();
  };

  func gView(e : Types.Excavation) : Types.ExcavationView {
    {
      stake = e.stake;
      picks = e.picks;
      diamonds = e.diamonds;
      jackpotWon = e.jackpotWon;
      held = e.held;
      runPoints = Game.pointsAt(e.picks);
      runGross = Game.gross(e.stake, Game.pointsAt(e.picks));
      collapseGross = if (e.picks >= Game.SAFE) Game.gross(e.stake, Game.collapsePoints(e.picks)) else 0;
      nextGross = if (e.picks < Game.MAX_PICKS) Game.gross(e.stake, Game.pointsAt(e.picks + 1)) else 0;
      safePctX100 = Game.safePctX100(e.picks);
      canSave = Game.canSave(e.picks);
    };
  };

  // Safeguard 1: the bank must hold what the game's own books say. Every movement the
  // game makes (loads, payouts, admin withdrawals) updates the books, so a lower balance means
  // GOLDAO left the bank some other way. Only a clean reading is compared (see gInFlight).
  func gAuditBank(read : Nat) {
    let expected = gameState.bank;
    if (gUncertain) {
      gUncertain := false;
      if (read != expected) {
        gLog(#info, "bank_resync", "Bank balance resynced", "After a ledger call without an answer, the bank was re-read: game " # SecLog.fmt(expected) # ", ledger " # SecLog.fmt(read) # " GOLDAO.");
      };
      return;
    };
    if (read >= expected) return;
    let now = Time.now();
    if (now - gShortSince >= Game.BANK_WINDOW_NS) {
      gShortSince := now;
      gShort := 0;
    };
    gShort += expected - read;
    if (gShort > Game.BANK_TOLERANCE) {
      gHalt(
        Game.HALT_BANK,
        #critical,
        "Unexplained bank withdrawal",
        "The bank holds " # SecLog.fmt(read) # " GOLDAO but the game expected " # SecLog.fmt(expected) # " (" # SecLog.fmt(gShort) # " missing today). Bets are paused. If you did not move it, check the ledger.",
      );
      gShort := 0;
    };
  };

  // Reads the bank balance from the ledger. The reading is adopted (and audited) only when no
  // transfer was in flight or started meanwhile; otherwise it is retried, and after three tries
  // the result is #busy. #down means the ledger gave no answer. `countFails` is false for the
  // background check, so an unreachable ledger never halts the game by itself.
  func lBankReading(countFails : Bool) : async Game.BankReading {
    await lBankReadingTries(countFails, 3);
  };

  func lBankReadingTries(countFails : Bool, maxTries : Nat) : async Game.BankReading {
    if (not gameState.realLedger) return #adopted;
    let acct = switch (gameState.bankAccount) { case (?a) a; case null return #down };
    var tries = 0;
    while (tries < maxTries) {
      let before = gameState.movSeq;
      let idle = gInFlight == 0;
      let bal = try { ?(await Ledger.ledger().icrc1_balance_of(Ledger.account(acct))) } catch (_) { null };
      switch (bal) {
        case (?b) {
          gLedgerOk();
          if (idle and gInFlight == 0 and gameState.movSeq == before) {
            gAuditBank(b);
            gameState.bank := b;
            return #adopted;
          };
        };
        case null {
          if (countFails) gLedgerFail();
          return #down;
        };
      };
      tries += 1;
    };
    #busy;
  };

  // Readings that must come out clean (the tournament review, admin withdrawals and evacuation
  // sends) hold this lock: new loads are refused while it is held, so loads that were already in
  // flight finish and the reading can be compared with the books.
  transient var gReadLocks : Nat = 0;

  func gCleanReading(countFails : Bool) : async Game.BankReading {
    gReadLocks += 1;
    try { await lBankReadingTries(countFails, Game.LOCKED_READING_TRIES) } finally { gReadLocks := Nat.sub(gReadLocks, 1) };
  };

  func lBankRefreshWith(countFails : Bool) : async Bool { (await lBankReading(countFails)) == #adopted };

  func lBankRefresh() : async Bool { await lBankRefreshWith(true) };

  // Safeguard 2: the fund cannot fall faster than the bets allow. It is sampled every tick; if it
  // is FUND_DROP_PCT percent (and at least FUND_DROP_MIN) below the highest sample kept, the game
  // halts. Moves made on purpose by the admin reset the samples (gFundReset).
  func gFundReset() {
    gameState.fundSamples := [gFund()];
  };

  func gWatchFund() {
    let f = gFund();
    // Under an admin pause open excavations can still move the fund, so it keeps being watched.
    if (gHardHalt()) {
      gFundReset();
      return;
    };
    var peak = f;
    for (v in gameState.fundSamples.values()) { if (v > peak) peak := v };
    if (peak > 0) {
      let drop = Int.abs(peak - f);
      let limit = Nat.max(Int.abs(peak) * Game.FUND_DROP_PCT / 100, Game.FUND_DROP_MIN);
      if (drop >= limit) {
        gHalt(
          Game.HALT_FUND,
          #critical,
          "Bank fund dropped abruptly",
          "The fund fell from " # SecLog.fmtInt(peak) # " to " # SecLog.fmtInt(f) # " GOLDAO within about " # Nat.toText(Game.FUND_SAMPLES) # " minutes. Bets are paused.",
        );
        gFundReset();
        return;
      };
    };
    let all = Array.concat(gameState.fundSamples, [f]);
    gameState.fundSamples := if (all.size() > Game.FUND_SAMPLES) Array.sliceToArray(all, Nat.sub(all.size(), Game.FUND_SAMPLES), all.size()) else all;
  };

  func gWatchBank() : async () {
    if (gWatching or not gameState.realLedger) return;
    gWatching := true;
    try { ignore await lBankRefreshWith(false) } finally { gWatching := false };
  };

  // The only place that sends GOLDAO out of or into the bank through the ledger. Null means
  // the call ended without an answer (the transfer may have been executed).
  func lTransfer(from : Principal, to : Principal, amount : Nat, stamp : Nat64) : async ?Ledger.TransferFromResult {
    gInFlight += 1;
    let res = try {
      ?(await Ledger.ledger().icrc2_transfer_from({
        spender_subaccount = null;
        from = Ledger.account(from);
        to = Ledger.account(to);
        amount;
        fee = ?Game.FEE;
        memo = null;
        created_at_time = ?stamp;
      }));
    } catch (_) { null };
    if (gInFlight > 0) gInFlight -= 1;
    if (res == null) gUncertain := true;
    res;
  };

  // Sends GOLDAO out of the bank (the game account) with a plain ledger transfer: no authorization
  // is involved. Null means the call ended without an answer (the transfer may have been executed).
  func lSend(to : Principal, amount : Nat, stamp : Nat64) : async ?Ledger.TransferResult {
    gInFlight += 1;
    let res = try {
      ?(await Ledger.ledger().icrc1_transfer({
        from_subaccount = null;
        to = Ledger.account(to);
        amount;
        fee = ?Game.FEE;
        memo = null;
        created_at_time = ?stamp;
      }));
    } catch (_) { null };
    if (gInFlight > 0) gInFlight -= 1;
    if (res == null) gUncertain := true;
    res;
  };

  // Pulls the amount from the player's wallet into the bank. The caller grants
  // the credit only after this returns #ok, i.e. after the ledger confirmed it.
  // The first successful load of a player also counts the 10 GOLDAO fee the
  // player burned when authorizing the game account.
  func gMarkLoaded(p : Principal) {
    if (gameState.loaded.contains(p)) return;
    gameState.loaded.add(p);
    gameState.burned += Game.FEE;
  };

  // `stamp` is the ledger timestamp of this load. A retry after a call without an answer reuses
  // it, so the ledger answers Duplicate instead of charging the player twice.
  func lLoad(p : Principal, amount : Nat, stamp : Nat64) : async Types.Charge {
    gameState.movSeq += 1;
    let need = amount + Game.FEE;
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #down };
    if (not gBankReady()) return #down;
    let answer = await lTransfer(p, bankAcct, amount, stamp);
    gameState.movSeq += 1;
    switch (answer) {
      case null {
        gLedgerFail();
        #unknown;
      };
      case (?(#Ok txId)) {
        gLedgerOk();
        gameState.bank += amount;
        gameState.burned += Game.FEE;
        gMarkLoaded(p);
        #ok txId;
      };
      case (?(#Err(#Duplicate d))) {
        // The first attempt did reach the ledger. The next clean bank reading is adopted.
        gLedgerOk();
        gUncertain := true;
        gameState.bank += amount;
        gameState.burned += Game.FEE;
        gMarkLoaded(p);
        #ok(d.duplicate_of);
      };
      case (?(#Err(#InsufficientAllowance _))) #allowance;
      case (?(#Err(#InsufficientFunds _))) #funds;
      case (?(#Err(#TooOld))) {
        // The stamp is outside the ledger window: this call did nothing, but an earlier attempt
        // with the same stamp is unknown. Ask for a fresh stamp (see gameLoadCredit).
        #unknown;
      };
      case (?(#Err _)) {
        gLedgerFail();
        #down;
      };
    };
  };

  // Excavation bookkeeping

  func gReleaseHeld(e : Types.Excavation) {
    if (e.held > 0) {
      gameState.pool += e.held;
      gameState.owed := gSub(gameState.owed, e.held);
    };
  };

  // The stake of an excavation is taken from the credit when it starts and stays inside `owed`
  // while it is in play. Giving it back only moves it from the excavation to the credit.
  func gRefundStake(p : Principal, e : Types.Excavation) {
    if (e.stake > 0) gameState.credits.add(p, gCredit(p) + e.stake);
  };

  func gDrop(p : Principal, token : Nat) {
    switch (gameState.open.get(p)) {
      case (?e) {
        if (e.token == token) {
          gReleaseHeld(e);
          gRefundStake(p, e);
          gameState.open.remove(p);
        };
      };
      case null {};
    };
  };

  func gUnbusy(p : Principal, token : Nat) {
    switch (gameState.open.get(p)) {
      case (?e) {
        if (e.token == token) {
          if (e.picks == 0) gDrop(p, token) else gameState.open.add(p, { e with busy = false; token = 0 });
        };
      };
      case null {};
    };
  };

  func gSame(p : Principal, token : Nat) : ?Types.Excavation {
    switch (gameState.open.get(p)) {
      case (?e) if (e.token == token and e.busy) ?e else null;
      case null null;
    };
  };

  func gAward(p : Principal, e : Types.Excavation) : (Types.DiamondResult, Types.Excavation) {
    let won = gameState.pool;
    if (won == 0) return ({ stage = 2; won = 0 }, e);
    let seed = Nat.min(Game.POOL_SEED, gameState.reserve);
    gameState.reserve := gSub(gameState.reserve, seed);
    gameState.pool := seed;
    gameState.owed += won;
    // The pool restarts at POOL_SEED at least. What the reserve cannot cover comes from the
    // bank fund, never taking the fund below its floor.
    let missing = Game.sub(Game.POOL_SEED, seed);
    if (missing > 0) {
      let f = gFund();
      let room : Nat = if (f > Game.FUND_FLOOR) Int.abs(f - Game.FUND_FLOOR) else 0;
      gameState.pool += Nat.min(missing, room);
    };
    ({ stage = 3; won }, { e with held = e.held + won; jackpotWon = e.jackpotWon + won });
  };

  // Mini jackpot: exactly two diamonds on a safe pick pay MINI_BPS of the pool. It is held and
  // released exactly like the full jackpot, but it never touches the reserve or the bank fund and
  // does not reseed the pool: the pool only shrinks by the prize and keeps growing from the stakes.
  // gAward is deliberately left as it was, so the full jackpot and its reseed do not change.
  func gAwardMini(p : Principal, e : Types.Excavation) : (Types.DiamondResult, Types.Excavation) {
    let won = Game.miniPrize(gameState.pool);
    if (won == 0) return ({ stage = 2; won = 0 }, e);
    gameState.pool := gSub(gameState.pool, won);
    gameState.owed += won;
    ({ stage = 2; won }, { e with held = e.held + won; heldMini = e.heldMini + won; jackpotWon = e.jackpotWon + won });
  };

  func gFlush(p : Principal, e : Types.Excavation) : Types.Excavation {
    if (e.held == 0) return e;
    gameState.credits.add(p, gCredit(p) + e.held);
    // Full and mini jackpots are counted together in jackpots and jackpotWon (that is what the
    // players see); minis and miniWon keep the mini part apart for internal use.
    let mini = Nat.min(e.heldMini, e.held);
    let full = Nat.sub(e.held, mini);
    let s = gStats(p);
    gameState.stats.add(
      p,
      {
        s with
        jackpots = s.jackpots + (if (full > 0) 1 else 0) + (if (mini > 0) 1 else 0);
        jackpotWon = s.jackpotWon + e.held;
        minis = s.minis + (if (mini > 0) 1 else 0);
        miniWon = s.miniWon + mini;
      },
    );
    let entry : Types.JackpotWin = { tournament = gameState.tournament; player = p; amount = e.held; stake = e.stake; at = Time.now() };
    let all = Array.concat(gameState.jackpots, [entry]);
    gameState.jackpots := if (all.size() > Game.JACKPOT_LOG) Array.sliceToArray(all, Nat.sub(all.size(), Game.JACKPOT_LOG), all.size()) else all;
    { e with held = 0; heldMini = 0 };
  };

  func gSettle(p : Principal, e : Types.Excavation, points : Nat, kind : Types.EndKind) : Types.EndResult {
    let stake = e.stake;
    let g = Game.gross(stake, points);
    gameState.pool += stake * Game.POOL_BPS / 10_000;
    gameState.reserve += stake * Game.RESERVE_BPS / 10_000;
    if (gameState.reserve > Game.RESERVE_CAP) {
      gameState.pool += gameState.reserve - Game.RESERVE_CAP;
      gameState.reserve := Game.RESERVE_CAP;
    };
    gameState.cycles += stake * Game.CYCLES_BPS / 10_000;
    gameState.top10 += stake * Game.TOP10_BPS / 10_000;

    // The stake was taken from the credit when the excavation started: the stake leaves the
    // amount in play and what the excavation pays is added to the credit.
    gameState.owed := gSub(gameState.owed, stake);
    gameState.credits.add(p, gCredit(p) + g);
    gameState.owed += g;
    let won = Game.sub(g, stake);
    let lost = Game.sub(stake, g);

    let s = gStats(p);
    gameState.stats.add(
      p,
      {
        excavations = s.excavations + 1;
        staked = s.staked + stake;
        returned = s.returned + g;
        jackpotWon = s.jackpotWon;
        jackpots = s.jackpots;
        minis = s.minis;
        miniWon = s.miniWon;
        collapses = s.collapses + (if (kind == #collapsed) 1 else 0);
        deepest = Nat.max(s.deepest, e.picks);
      },
    );
    let playReturn = g + e.jackpotWon;
    let prevBest = switch (gameState.best.get(p)) { case (?v) v; case null 0 };
    if (playReturn > prevBest) gameState.best.add(p, playReturn);
    gameState.open.remove(p);
    {
      kind;
      picks = e.picks;
      points;
      stake;
      gross = g;
      won;
      lost;
      jackpotWon = e.jackpotWon;
      credit = gCredit(p);
    };
  };

  // Ends an excavation on the game's own initiative. One that got past the free picks is saved
  // like the player pressing Save. One that did not never pays a jackpot found on the free picks:
  // it goes back to the pool, otherwise two risk-free picks per account would be a free jackpot
  // roll. The stake goes back to the credit, except when `forfeit` is set (the normal close, after
  // the players had the closing window): then it is lost like a collapse.
  func gEndOpen(p : Principal, e : Types.Excavation, forfeit : Bool) {
    if (Game.canSave(e.picks) and e.stake > 0) {
      let f = gFlush(p, e);
      ignore gSettle(p, f, Game.pointsAt(f.picks), #saved);
      return;
    };
    gReleaseHeld(e);
    if (forfeit and e.stake > 0 and not e.busy) {
      ignore gSettle(p, { e with held = 0; heldMini = 0; jackpotWon = 0 }, 0, #collapsed);
    } else {
      gRefundStake(p, e);
      gameState.open.remove(p);
    };
  };

  // During a safety halt the excavations that can be saved are saved, so nobody has to wait for
  // the pause to end. A pick still in flight is picked up by the next tick.
  func gSaveReady() {
    var n = 0;
    for ((p, e) in gameState.open.entries().toArray().values()) {
      if (not gFresh(e) and e.stake > 0 and Game.canSave(e.picks)) {
        gEndOpen(p, e, false);
        n += 1;
      };
    };
    if (n > 0) gLog(#info, "auto_save", "Open excavations saved", Nat.toText(n) # " open excavation(s) were saved because the game was halted.");
  };

  // Tournament lifecycle

  // Closing pays nothing out: every balance stays in the game until its owner withdraws it. The
  // Top-10 prize is added to the winners' balances. `forfeit` is set only by the automatic close,
  // which comes after the closing window.
  func gCloseTournament(forfeit : Bool) {
    let t = gameState.tournament;
    for ((p, e) in gameState.open.entries().toArray().values()) gEndOpen(p, e, forfeit);

    // The Top-10 prize goes to the biggest volumes as credit, like any other balance.
    let bucket = gameState.top10;
    var topPaid = 0;
    let topWinners = List.empty<Types.TopPrize>();
    var rank = 1;
    for ((p, key) in gTopList().values()) {
      let volume = key.staked;
      let prize = Game.top10Prize(bucket, rank, volume);
      if (prize > 0) {
        gameState.credits.add(p, gCredit(p) + prize);
        gameState.owed += prize;
        topPaid += prize;
        topWinners.add({ tournament = t; rank; player = p; volume; prize });
      };
      rank += 1;
    };
    gameState.top10 := gSub(gameState.top10, topPaid);
    let topPrizes = Map.empty<Principal, Nat>();
    for (w in topWinners.values()) topPrizes.add(w.player, w.prize);
    gameState.lastTop10 := topWinners.toArray();

    var excavations = 0;
    var staked = 0;
    var returned = 0;
    var jackpots = 0;
    var jackpotPaid = 0;
    var minis = 0;
    var miniPaid = 0;
    for ((p, s) in gameState.stats.entries().toArray().values()) {
      excavations += s.excavations;
      staked += s.staked;
      returned += s.returned;
      jackpots += s.jackpots;
      jackpotPaid += s.jackpotWon;
      minis += s.minis;
      miniPaid += s.miniWon;
      let credit = gCredit(p);
      let top10Prize = switch (topPrizes.get(p)) { case (?v) v; case null 0 };
      let past : Types.PastStats = { excavations = s.excavations; staked = s.staked; returned = s.returned; jackpotWon = s.jackpotWon; top10Prize };
      let result : Types.PlayerTournamentResult = { tournament = t; stats = past; credit; payout = 0 };
      let l = switch (gameState.history.get(p)) {
        case (?l) l;
        case null {
          let l = List.empty<Types.PlayerTournamentResult>();
          gameState.history.add(p, l);
          l;
        };
      };
      l.add(result);
      keepLast(l, Game.HISTORY_KEEP);
    };
    gameState.tournaments.add({
      tournament = t;
      players = gameState.stats.size();
      excavations;
      staked;
      returned;
      jackpots;
      jackpotPaid;
      minis;
      miniPaid;
      payoutTotal = 0;
      forfeited = 0;
      closedAt = Time.now();
    });
    keepLast(gameState.tournaments, Game.TOURNAMENTS_KEEP);

    // Empty balances are dropped; the others stay for the next tournament.
    for ((p, c) in gameState.credits.entries().toArray().values()) {
      if (c == 0) gameState.credits.remove(p);
    };
    gameState.stats.clear();
    gameState.best.clear();
    // The recent jackpots list belongs to the tournament that just closed. Every excavation was
    // flushed at the top of this function, so nothing is added to the log after this point.
    gameState.jackpots := [];
    gameState.tournament := t + 1;
    // The next tournament waits for the admin to start it.
    gameState.endsAt := 0;
  };

  // The time is up and nothing is in flight. Open excavations get the closing window to be
  // finished; when none is open the tournament can close at once.
  func gCloseDue() : Bool {
    if (gameState.endsAt == 0 or Time.now() < gameState.endsAt or gAnyBusy()) return false;
    gameState.open.size() == 0 or gWindowOver();
  };

  // The tournament whose books were reviewed just before closing. Only the timer reviews, so no
  // call of a player can close a tournament that was not reviewed.
  transient var gReviewedFor : Nat = 0;

  // When the next tournament starts by itself after the second review (null: it waits for the admin).
  transient var gStartAt : ?Int = null;

  transient var gReviewing : Bool = false;

  transient var gReviewFails : Nat = 0;

  // Closes the tournament when it is due and was reviewed. True if it closed now. The next one
  // starts after the second review (see gAutoStart).
  func gCloseIfDue() : Bool {
    if (not gCloseDue() or gReviewedFor != gameState.tournament) return false;
    // Nobody could pick during a safety halt, so the stakes are not lost then.
    gCloseTournament(not gHardHalt());
    gStartAt := if (gEvacuating()) null else ?(Time.now() + Game.REVIEW_WAIT_NS);
    true;
  };

  func gMaybeClose() {
    ignore gCloseIfDue();
  };

  // Review of the books: the accounting must hold, and the bank must hold what the books say
  // when read from the ledger. A failed check halts the game and says why. A ledger that cannot be
  // read just now is not a failure: the review is repeated on the next tick.
  func gReview(moment : Text) : async Bool {
    if (gReviewing) return false;
    gReviewing := true;
    try {
      let fail = func(what : Text) : Bool {
        gHalt(Game.HALT_REVIEW, #critical, "Tournament review failed", "The review " # moment # " failed: " # what # ". Bets are paused.");
        false;
      };
      if (gameState.saturations > 0 or not gAccountingOk()) return fail("the accounting does not add up");
      let haltedBefore = gameState.halted;
      switch (await gCleanReading(false)) {
        case (#adopted) {};
        case (_) {
          gReviewFails += 1;
          if (gReviewFails == 5) {
            gLog(#warning, "review_wait", "Tournament review waiting", "The review " # moment # " could not read the ledger yet. It is repeated every minute.");
          };
          return false;
        };
      };
      // The reading itself may have halted the game (money missing from the bank).
      if (gameState.halted and not haltedBefore) return false;
      if (gameState.saturations > 0 or not gAccountingOk()) return fail("the accounting does not add up");
      if (gFund() < 0) return fail("the bank does not cover what the game owes");
      gReviewFails := 0;
      true;
    } finally { gReviewing := false };
  };

  // First review, then the close. Runs from the timer only.
  func gAutoClose() : async () {
    if (not gCloseDue()) return;
    let t = gameState.tournament;
    if (gReviewedFor != t and (await gReview("before the Top-10 prize"))) gReviewedFor := t;
    ignore gCloseIfDue();
  };

  // Second review, then the next tournament starts. If the game is paused it waits; if the review
  // fails the game halts and the admin starts the tournament by hand once it is solved.
  func gAutoStart() : async () {
    let at = switch (gStartAt) { case (?a) a; case null return };
    if (gameState.endsAt != 0) { gStartAt := null; return };
    if (Time.now() < at or gameState.halted) return;
    if (not (await gReview("after the Top-10 prize"))) return;
    if (gameState.endsAt != 0 or gameState.halted) return;
    gStartAt := null;
    gReviewedFor := 0;
    gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
    gLogAction("start", "Tournament started", "Tournament " # Nat.toText(gameState.tournament) # " started after the review of the previous one.");
  };

  // Automatic close: every minute the tournament is checked. A mixin cannot declare a timer
  // directly, so it is armed from the first update call after each deploy (players and the
  // admin call one right away). The manual close of the admin panel keeps working.
  transient var gTimerOn : Bool = false;

  transient var gTicks : Nat = 0;

  // The game assumes a fixed ledger fee. If the ledger changes it, transfers would start failing
  // in odd ways, so the game halts and says why. An unreachable ledger is not a reason to halt.
  func gCheckFee() : async () {
    if (not gameState.realLedger) return;
    let fee = try { ?(await Ledger.ledger().icrc1_fee()) } catch (_) { null };
    switch (fee) {
      case (?f) {
        if (f != Game.FEE) {
          gHalt(Game.HALT_FEE, #critical, "Ledger fee changed", "The ledger now charges " # SecLog.fmt(f) # " GOLDAO per transfer but the game uses " # SecLog.fmt(Game.FEE) # ". Bets are paused until the game is updated.");
        };
      };
      case null {};
    };
  };

  func gExpireLoads() {
    let now = Nat.toNat64(Int.abs(Time.now()));
    for ((p, pl) in gameState.pendingLoads.entries().toArray().values()) {
      if (now >= pl.stamp + Game.STAMP_MAX_AGE_NS) gLoadForget(p, pl);
    };
  };

  func gTick() : async () {
    gTicks += 1;
    if (not gameState.realLedger and not gameState.halted) await gAutoConnect();
    if (gHardHalt()) gSaveReady();
    // Cheap watchers first: if the close below traps, they have already run.
    gWatchFund();
    gExpireLoads();
    gSweepWithdrawals();
    await gWatchBank();
    await gAutoClose();
    await gAutoStart();
    if (Nat.sub(gTicks, 1) % Game.FEE_CHECK_TICKS == 0) await gCheckFee();
  };

  func gArmTimer<system>() {
    if (gTimerOn) return;
    gTimerOn := true;
    ignore Prim.setTimer<system>(60_000_000_000, true, gTick);
  };

  func gClosing() : Bool {
    gameState.endsAt != 0 and Time.now() >= gameState.endsAt;
  };

  // The closing window is over: not even an open excavation can pick any more.
  func gWindowOver() : Bool {
    gameState.endsAt != 0 and Time.now() >= gameState.endsAt + Game.CLOSE_WINDOW_NS;
  };

  func gOpen(p : Principal, option : ?Types.StakeOption) : Result.Result<(Types.Excavation, Nat), Text> {
    let idx = switch (option) {
      case (?#min) 0;
      case (?#mid) 1;
      case (?#max) 2;
      case null return #err("Choose a stake.");
    };
    if (gPaused()) return #err("Bets are paused. Try again later.");
    let placeholder : Types.Excavation = {
      tournament = gameState.tournament;
      stake = 0;
      picks = 0;
      diamonds = 0;
      jackpotWon = 0;
      held = 0;
      heldMini = 0;
      busy = true;
      token = gNextToken();
      busyAt = Time.now();
    };
    gameState.open.add(p, placeholder);
    #ok((placeholder, idx));
  };

  func gStart(p : Principal, token : Nat, idx : Nat, expectedStake : Nat) : async Result.Result<Types.Excavation, Text> {
    // Cheap checks first: a player without credit, or with an outdated stake, never reaches the
    // ledger (every ledger call costs the game cycles).
    if (gCredit(p) < expectedStake) {
      gDrop(p, token);
      return #err(Game.NEED_CREDIT_MSG);
    };
    let known = gStakes();
    if (known.size() == 3 and known[idx] != expectedStake) {
      gDrop(p, token);
      return #err(Game.STAKE_CHANGED_MSG);
    };
    // Other transfers in flight only make the reading not comparable (#busy): the bank in the
    // books is used then, and the background check audits it. Only a ledger that gives no answer
    // stops the start.
    if ((await lBankReading(true)) == #down) {
      gDrop(p, token);
      return #err("The ledger is unavailable. Try again later.");
    };
    let options = gStakes();
    if (options.size() != 3 or gameState.halted) {
      gDrop(p, token);
      return #err("Bets are paused. Try again later.");
    };
    // The amounts depend on the fund, which the refresh above may have changed: the player must
    // get the stake that was on screen, never another one.
    if (options[idx] != expectedStake) {
      gDrop(p, token);
      return #err(Game.STAKE_CHANGED_MSG);
    };
    let started : Types.Excavation = switch (gSame(p, token)) {
      case (?e) ({ e with stake = options[idx]; tournament = gameState.tournament });
      case null return #err("Your excavation changed. Try again.");
    };
    // Check and charge in the same step, with nothing awaited in between: the stake leaves the
    // credit as soon as the first pick starts.
    if (gCredit(p) < started.stake) {
      gDrop(p, token);
      return #err(Game.NEED_CREDIT_MSG);
    };
    gameState.credits.add(p, Nat.sub(gCredit(p), started.stake));
    gameState.open.add(p, started);
    #ok(started);
  };

  // If the start call itself fails (for example a full message queue), the busy mark of the
  // placeholder is released at once instead of blocking the player until it goes stale.
  func gStartSafe(p : Principal, token : Nat, idx : Nat, expectedStake : Nat) : async Result.Result<Types.Excavation, Text> {
    try { await gStart(p, token, idx, expectedStake) } catch (_) {
      gDrop(p, token);
      #err("Try again.");
    };
  };

  // Test wallet

  public query func gameBurned() : async Nat { gameState.burned };

  public query func gameConfig() : async Types.GameConfig {
    {
      feeE8s = Game.FEE;
      cells = Game.CELLS;
      mines = Game.MINES;
      safePicks = Game.SAFE;
      maxPicks = Game.MAX_PICKS;
      pointsTable = Game.POINTS;
      payoutBps = Game.PAYOUT_BPS;
      stakeMinE8s = Game.STAKE_MIN;
      stakeCapE8s = Game.STAKE_CAP;
      diamond1Bps = Game.DIAMOND1_BPS;
      diamond2PerGoldao = Game.DIAMOND2_PER_GOLDAO;
      diamond3Odds = Game.DIAMOND3_ODDS;
      miniBps = Game.MINI_BPS;
      loadMin = Game.LOAD_MIN;
      loadMax = Game.LOAD_MAX;
      creditCapE8s = Game.CREDIT_CAP;
      withdrawMinE8s = Game.WITHDRAW_MIN;
      closeWindowNs = Game.CLOSE_WINDOW_NS;
      spender = switch (gameState.selfId) { case (?s) Principal.toText(s); case null "" };
      top10Bps = Game.TOP10_BPS;
      top10Weights = Game.TOP10_WEIGHTS;
      top10MinVolumeE8s = Game.TOP10_MIN_VOLUME;
      realLedger = gameState.realLedger;
      ledgerId = Ledger.ledgerId();
      poolSeedE8s = Game.POOL_SEED;
      poolSeedMaxE8s = Game.POOL_SEED_MAX;
    };
  };

  // Credit: the player loads the Accumulated prize from the wallet. It backs every stake.

  public shared ({ caller }) func gameLoadCredit(goldao : Nat) : async Result.Result<Nat, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gCloseIfDue()) return #err(Game.CLOSED_MSG);
    if (gameState.realLedger and not gBankReady()) return #err(Game.BANK_NOT_READY_MSG);
    if (gReadLocks > 0) return #err(Game.BANK_CHECK_MSG);
    // A new load needs the game running. Repeating one that was already sent is allowed while
    // paused: it is the same transfer, and waiting could let its timestamp expire.
    let pending = gameState.pendingLoads.get(caller);
    if (pending == null) {
      if (gClosing()) return #err(Game.CLOSING_MSG);
      if (gPaused()) return #err("Loads are paused while the game is paused. Try again later.");
    };
    if (goldao < Game.LOAD_MIN or goldao > Game.LOAD_MAX) {
      return #err("Choose between " # Nat.toText(Game.LOAD_MIN) # " and " # Nat.toText(Game.LOAD_MAX) # " GOLDAO.");
    };
    let amount = goldao * Game.E8S;
    if (gLoadBusy(caller)) return #err("A load is already in progress.");
    if (pending == null and gLoadThrottled(caller)) return #err("Too many rejected loads right now. Try again in a minute.");
    // A load that got no answer from the ledger is retried with the same amount and timestamp.
    // The ledger recognizes it and never charges twice. Older than the ledger window: forgotten.
    var stamp = Nat.toNat64(Int.abs(Time.now()));
    var repeat = false;
    switch (pending) {
      case (?pl) {
        if (pl.amount != amount) {
          return #err("Your previous load of " # Nat.toText(pl.amount / Game.E8S) # " GOLDAO is still being confirmed. Load that same amount again.");
        };
        if (stamp < pl.stamp + Game.STAMP_MAX_AGE_NS) {
          stamp := pl.stamp;
          repeat := true;
        } else {
          // Too old to repeat: it counts as a new load, which needs the game running.
          gLoadForget(caller, pl);
          if (gClosing()) return #err(Game.CLOSING_MSG);
          if (gPaused()) return #err("Loads are paused while the game is paused. Try again later.");
        };
      };
      case null {};
    };
    // The cap is checked for a new load only; a repeat of a pending load is always allowed.
    if (not repeat and gCredit(caller) + gPendingWithdrawal(caller) + amount > Game.CREDIT_CAP) {
      return #err("Accumulated prize cannot go above " # Nat.toText(Game.CREDIT_CAP / Game.E8S) # " GOLDAO.");
    };
    gameState.pendingLoads.add(caller, { amount; stamp });
    gLoading.add(caller, Time.now());
    let res = try { await lLoad(caller, amount, stamp) } finally { gLoading.remove(caller) };
    let need = amount + Game.FEE;
    // A load is credited once: only the call that still finds this exact load pending may credit it.
    let current = switch (gameState.pendingLoads.get(caller)) { case (?cur) cur.stamp == stamp and cur.amount == amount; case null false };
    if (not current) return #err("This load was already confirmed. Check your balance.");
    // A definite answer closes the load. A repeat that fails without a definite answer keeps it pending.
    let definite = switch (res) {
      case (#ok _) true;
      case (#allowance) true;
      case (#funds) true;
      case (#down) pending == null;
      case (#unknown) false;
    };
    if (definite) gameState.pendingLoads.remove(caller);
    switch (res) {
      case (#ok txId) {
        gameState.credits.add(caller, gCredit(caller) + amount);
        gameState.owed += amount;
        gRecordTransfer(#loaded, caller, amount, ?txId);
        #ok(gCredit(caller));
      };
      case (#allowance) {
        gLoadRejected(caller);
        #err("Authorize the game to charge up to " # Nat.toText(need / Game.E8S) # " GOLDAO.");
      };
      case (#funds) {
        gLoadRejected(caller);
        #err("Insufficient balance: you need " # Nat.toText(need / Game.E8S) # " GOLDAO (amount plus the network fee).");
      };
      case (#down) #err("The ledger is unavailable. Try again later.");
      case (#unknown) {
        if (not repeat) gRecordTransfer(#loadUnanswered, caller, amount, null);
        gLog(#warning, "load_no_answer", "Load without an answer", "A credit load of " # Nat.toText(amount / Game.E8S) # " GOLDAO from " # Principal.toText(caller) # " got no answer from the ledger. It is retried with the same timestamp, so it cannot be charged twice.");
        #err("The ledger did not answer. Load " # Nat.toText(amount / Game.E8S) # " GOLDAO again: you will not be charged twice.");
      };
    };
  };

  // Withdrawal: the player takes the whole free credit (not the stake of an open excavation or a
  // held jackpot) back to their own wallet. The network fee comes out of the amount, so the
  // wallet receives the credit minus the fee. Only the caller's own principal is ever paid.
  //
  // Order of events: the credit is taken first and kept as a pending withdrawal (still owed), the
  // ledger is called, and only a confirmed transfer settles it. A refusal of the first call puts
  // the credit back. A call without an answer leaves it pending: the same call is repeated with
  // the same stamp, so the ledger never pays twice. A repeated call never gives the credit back,
  // because the first call may have been executed. When the stamp is too old to repeat, the admin
  // settles it.

  func gWithdrawBusy(p : Principal) : Bool {
    switch (gWithdrawing.get(p)) {
      case (?t) Time.now() - t < Game.BUSY_STALE_NS;
      case null false;
    };
  };

  // Settles or refunds only the withdrawal the answer belongs to (same stamp and amount), so a
  // late answer of an older call can never touch a newer withdrawal.
  func gIsPendingWithdrawal(p : Principal, amount : Nat, stamp : Nat64) : Bool {
    switch (gameState.pendingWithdrawals.get(p)) {
      case (?pw) pw.stamp == stamp and pw.amount == amount;
      case null false;
    };
  };

  // The ledger confirmed the transfer: the credit leaves the books. The bank is reduced only when
  // this is the first confirmation (#Ok). After a lost answer the next bank reading is adopted
  // instead, so the transfer is never subtracted twice.
  func gSettleWithdrawal(p : Principal, amount : Nat, stamp : Nat64, reduceBank : Bool, kind : Types.TransferKind, txId : ?Nat) {
    if (not gIsPendingWithdrawal(p, amount, stamp)) return;
    gameState.pendingWithdrawals.remove(p);
    gRecordTransfer(kind, p, Game.sub(amount, Game.FEE), txId);
    gameState.owed := gSub(gameState.owed, amount);
    if (reduceBank) gameState.bank := gSub(gameState.bank, amount);
    gameState.burned += Game.FEE;
  };

  // The ledger did not send it: the credit goes back to the player.
  func gRefundWithdrawal(p : Principal, amount : Nat, stamp : Nat64) {
    if (not gIsPendingWithdrawal(p, amount, stamp)) return;
    gameState.pendingWithdrawals.remove(p);
    gameState.credits.add(p, gCredit(p) + amount);
  };

  func gWithdrawalViews() : [Types.WithdrawalView] {
    let now = Nat.toNat64(Int.abs(Time.now()));
    gameState.pendingWithdrawals.entries().map(
      func((p, pw) : (Principal, Types.PendingWithdrawal)) : Types.WithdrawalView {
        { player = p; amount = pw.amount; at = Nat64.toNat(pw.stamp); expired = now >= pw.stamp + Game.STAMP_MAX_AGE_NS };
      }
    ).toArray();
  };

  // Forgets the bookkeeping of players that are no longer blocked.
  func gSweepWithdrawals() {
    let now = Time.now();
    for ((p, until) in gWithdrawLast.entries().toArray().values()) {
      if (now >= until) gWithdrawLast.remove(p);
    };
    for ((p, t) in gWithdrawing.entries().toArray().values()) {
      if (now - t >= Game.BUSY_STALE_NS) gWithdrawing.remove(p);
    };
  };

  // `expected` is the amount the player saw: the free credit, or the pending withdrawal when
  // there is one. If it is not what the backend has, nothing moves.
  public shared ({ caller }) func gameWithdrawCredit(expected : Nat) : async Result.Result<Nat, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gCloseIfDue()) return #err(Game.CLOSED_MSG);
    if (not gameState.realLedger) return #err("The ledger is not connected.");
    if (gameState.saturations > 0 or not gAccountingOk()) return #err("Withdrawals are blocked while the accounting is checked.");
    if (not gBankReady()) return #err(Game.BANK_NOT_READY_MSG);
    // A pause by the admin and the closing window do not stop a withdrawal. A safety stop and the
    // evacuation do, and so does a load that is still being confirmed. The few seconds of the
    // tournament review wait too: a transfer in flight would spoil its bank reading. Repeating a
    // withdrawal that was already sent is allowed outside the review: it is the same transfer, and
    // waiting could let its stamp expire.
    if (gReviewing) return #err(Game.REVIEW_MSG);
    if (gameState.pendingWithdrawals.get(caller) == null) {
      if (gameState.halted and gameState.haltCode == Game.HALT_EVAC) return #err(Game.WITHDRAW_EVAC_MSG);
      if (gHardHalt()) return #err(Game.WITHDRAW_SAFETY_MSG);
      if (gameState.pendingLoads.get(caller) != null) return #err(Game.WITHDRAW_LOAD_MSG);
    };
    await gWithdrawRun(caller, expected, false);
  };

  // Sends the free credit (or repeats the pending withdrawal) of `p` to p's own wallet. `admin` is
  // set by the evacuation: it skips the player's waiting times and the minimum.
  func gWithdrawRun(p : Principal, expected : Nat, admin : Bool) : async Result.Result<Nat, Text> {
    let pending = gameState.pendingWithdrawals.get(p);
    if (gWithdrawBusy(p)) return #err("A withdrawal is already in progress.");
    let now = Time.now();
    if (not admin) {
      switch (gWithdrawLast.get(p)) {
        case (?until) { if (now < until) return #err("Wait a few minutes before trying again.") };
        case null {};
      };
    };
    let stampNow = Nat.toNat64(Int.abs(now));
    var amount = 0;
    var stamp = stampNow;
    switch (pending) {
      case (?pw) {
        if (stampNow >= pw.stamp + Game.STAMP_MAX_AGE_NS) return #err(Game.WITHDRAW_EXPIRED_MSG);
        if (expected != pw.amount) return #err(Game.WITHDRAW_CHANGED_MSG);
        amount := pw.amount;
        stamp := pw.stamp;
      };
      case null {
        let credit = gCredit(p);
        // The evacuation sends everything that is more than the fee.
        if (not admin and credit < Game.WITHDRAW_MIN) {
          return #err("The minimum withdrawal is " # Nat.toText(Game.WITHDRAW_MIN / Game.E8S) # " GOLDAO.");
        };
        if (credit <= Game.FEE) return #err("Nothing to send.");
        if (expected != credit) return #err(Game.WITHDRAW_CHANGED_MSG);
        // The credit leaves in the same step the pending withdrawal is recorded.
        gameState.credits.remove(p);
        gameState.pendingWithdrawals.add(p, { amount = credit; stamp });
        amount := credit;
      };
    };
    let isRetry = pending != null;
    if (not admin) gWithdrawLast.add(p, now + Game.WITHDRAW_COOLDOWN_NS);
    gWithdrawing.add(p, now);
    let sent = Nat.sub(amount, Game.FEE);
    gameState.movSeq += 1;
    let answer = try { await lSend(p, sent, stamp) } finally {
      // Only the call that took the lock gives it back.
      switch (gWithdrawing.get(p)) {
        case (?t) { if (t == now) gWithdrawing.remove(p) };
        case null {};
      };
    };
    gameState.movSeq += 1;
    // After a refusal the player waits longer before reaching the ledger again.
    let slowDown = func() { if (not admin) gWithdrawLast.add(p, Time.now() + Game.WITHDRAW_PENALTY_NS) };
    // A refusal of the first call means nothing was sent. A refusal of a repeated call proves
    // nothing about the first one, so the withdrawal stays pending.
    let refused = func(msg : Text) : Result.Result<Nat, Text> {
      slowDown();
      if (isRetry) return #err("The ledger could not confirm the withdrawal yet. Try again in a few minutes: you will not be paid twice.");
      gRefundWithdrawal(p, amount, stamp);
      #err(msg);
    };
    switch (answer) {
      case null {
        gLedgerFail();
        if (not isRetry) gRecordTransfer(#withdrawUnanswered, p, sent, null);
        gLog(#warning, "withdraw_player_no_answer", "Withdrawal without an answer", "A withdrawal of " # SecLog.fmt(amount) # " GOLDAO by " # Principal.toText(p) # " got no answer from the ledger. The player can repeat it: the ledger will not pay twice.");
        #err("The ledger did not answer. Press Withdraw again: you will not be paid twice.");
      };
      case (?(#Ok txId)) {
        gLedgerOk();
        gSettleWithdrawal(p, amount, stamp, true, #withdrawn, ?txId);
        #ok(sent);
      };
      case (?(#Err(#Duplicate d))) {
        // The first attempt did reach the ledger. The next clean bank reading is adopted.
        gLedgerOk();
        gUncertain := true;
        gSettleWithdrawal(p, amount, stamp, false, #withdrawn, ?d.duplicate_of);
        #ok(sent);
      };
      case (?(#Err(#TooOld))) {
        // The stamp is outside the ledger window: this call did nothing, but an earlier attempt
        // with the same stamp is unknown. Only the admin can settle it now.
        slowDown();
        gLog(#warning, "withdraw_player_expired", "Withdrawal needs the admin", "A withdrawal of " # SecLog.fmt(amount) # " GOLDAO by " # Principal.toText(p) # " cannot be repeated any more. Check the player's wallet and settle it.");
        #err(Game.WITHDRAW_EXPIRED_MSG);
      };
      case (?(#Err(#InsufficientFunds _))) {
        if (not isRetry) {
          gLog(#warning, "withdraw_bank_short", "Bank cannot cover a withdrawal", "The ledger refused a withdrawal of " # SecLog.fmt(amount) # " GOLDAO by " # Principal.toText(p) # " for lack of funds in the bank. The credit was given back.");
        };
        refused("The bank cannot cover this withdrawal right now. Your balance was kept.");
      };
      case (?(#Err(#TemporarilyUnavailable))) refused("The ledger is busy. Your balance was kept: try again in a moment.");
      case (?(#Err _)) refused("The ledger rejected the withdrawal. Your balance was kept.");
    };
  };

  // Settles a withdrawal whose stamp expired without an answer. `sent`: the admin checked the
  // player's wallet and the transfer arrived; otherwise the credit goes back to the player.
  public shared ({ caller }) func gameAdminResolveWithdrawal(player : Principal, sent : Bool) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let pw = switch (gameState.pendingWithdrawals.get(player)) {
      case (?pw) pw;
      case null return #err("That player has no pending withdrawal.");
    };
    if (gWithdrawBusy(player)) return #err("A withdrawal call is still in progress for that player.");
    if (Nat.toNat64(Int.abs(Time.now())) < pw.stamp + Game.STAMP_MAX_AGE_NS) {
      return #err("The player can still repeat it. Settle it after its timestamp expires.");
    };
    if (gBusyNow()) return #err("A money movement is in progress.");
    if (sent) {
      // The bank reading taken right after adopts the real balance: nothing is subtracted here.
      gSettleWithdrawal(player, pw.amount, pw.stamp, false, #withdrawSettled, null);
      gUncertain := true;
      gameState.movSeq += 1;
      gLogAction("withdraw_settled", "Withdrawal settled as sent", "The withdrawal of " # SecLog.fmt(pw.amount) # " GOLDAO by " # Principal.toText(player) # " was recorded as sent by the admin.");
      ignore await lBankRefresh();
    } else {
      gRefundWithdrawal(player, pw.amount, pw.stamp);
      gRecordTransfer(#withdrawRefunded, player, Game.sub(pw.amount, Game.FEE), null);
      gLogAction("withdraw_refunded", "Withdrawal given back", "The withdrawal of " # SecLog.fmt(pw.amount) # " GOLDAO by " # Principal.toText(player) # " was recorded as not sent and the credit was given back.");
    };
    #ok(());
  };

  // Play

  public shared ({ caller }) func gamePick(stake : ?Types.StakeOption, expectedStake : Nat, expectedPicks : Nat) : async Result.Result<Types.PickResult, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gCloseIfDue()) return #err(Game.CLOSED_MSG);
    if (gHardHalt()) return #err("Bets are paused. Try again later.");

    var ex : Types.Excavation = switch (gameState.open.get(caller)) {
      case (?e) {
        if (e.busy and gFresh(e)) return #err("Wait for the previous pick to finish.");
        if (e.stake == 0 or e.picks >= Game.MAX_PICKS) {
          gDrop(caller, e.token);
          return #err("Try again.");
        };
        // What the player sees must be what the backend has: another tab or device may have moved on.
        if (e.picks != expectedPicks or e.stake != expectedStake) return #err(Game.EXC_CHANGED_MSG);
        if (gWindowOver()) return #err("The tournament is closing. Try again in a few seconds.");
        let token = gNextToken();
        let busy = { e with busy = true; token; busyAt = Time.now() };
        gameState.open.add(caller, busy);
        busy;
      };
      case null {
        if (expectedPicks != 0) return #err(Game.EXC_CHANGED_MSG);
        if (gClosing()) return #err(Game.CLOSING_MSG);
        switch (gOpen(caller, stake)) {
          case (#err m) return #err(m);
          case (#ok(placeholder, idx)) {
            switch (await gStartSafe(caller, placeholder.token, idx, expectedStake)) {
              case (#ok e) e;
              case (#err m) return #err(m);
            };
          };
        };
      };
    };
    let token = ex.token;

    let bytes = try { await gRandomBytes() } catch (_) {
      gUnbusy(caller, token);
      return #err("Could not get randomness. Try again.");
    };
    ex := switch (gSame(caller, token)) {
      case (?e) e;
      case null return #err("Your excavation changed. Try again.");
    };

    let r1 = Game.bytesToNat(bytes, 0, 4);
    let r2 = Game.bytesToNat(bytes, 4, 4);
    // r3 and r4 use 8 bytes each so the modulo bias stays negligible (r3 is taken modulo 1e8).
    let r3 = Game.bytesToNat(bytes, 8, 8);
    let r4 = Game.bytesToNat(bytes, 16, 8);

    if (Game.collapseHit(ex.picks, r1)) {
      let points = Game.collapsePoints(ex.picks);
      let f = gFlush(caller, ex);
      let end = gSettle(caller, f, points, #collapsed);
      gMaybeClose();
      return #ok({
        collapsed = true;
        picks = ex.picks;
        diamond = { stage = 0; won = 0 };
        excavation = null;
        end = ?end;
        credit = gCredit(caller);
        pool = gameState.pool;
      });
    };

    var next : Types.Excavation = { ex with picks = ex.picks + 1; busy = false; token = 0 };
    var diamond : Types.DiamondResult = { stage = 0; won = 0 };
    if (Game.diamond1Hit(r2)) {
      next := { next with diamonds = next.diamonds + 1 };
      diamond := { stage = 1; won = 0 };
      if (Game.diamond2Hit(r3, ex.stake)) {
        diamond := { stage = 2; won = 0 };
        // Three diamonds pay the whole pool, exactly two pay the mini jackpot.
        let (d, n) = if (Game.diamond3Hit(r4)) gAward(caller, next) else gAwardMini(caller, next);
        diamond := d;
        next := n;
      };
    };

    if (next.picks >= Game.MAX_PICKS) {
      let f = gFlush(caller, next);
      let end = gSettle(caller, f, Game.pointsAt(next.picks), #maxed);
      gMaybeClose();
      return #ok({
        collapsed = false;
        picks = next.picks;
        diamond;
        excavation = null;
        end = ?end;
        credit = gCredit(caller);
        pool = gameState.pool;
      });
    };
    if (Game.canSave(next.picks)) next := gFlush(caller, next);
    gameState.open.add(caller, next);
    #ok({
      collapsed = false;
      picks = next.picks;
      diamond;
      excavation = ?gView(next);
      end = null;
      credit = gCredit(caller);
      pool = gameState.pool;
    });
  };

  public shared ({ caller }) func gameSave(expectedPicks : Nat) : async Result.Result<Types.EndResult, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    let ex = switch (gameState.open.get(caller)) {
      case (?e) e;
      case null return #err("There is no open excavation.");
    };
    if (ex.busy and gFresh(ex)) return #err("Wait for the pick to finish.");
    // What the player sees must be what the backend has: another tab or device may have moved on.
    if (ex.picks != expectedPicks) return #err(Game.EXC_CHANGED_MSG);
    if (ex.stake == 0 or not Game.canSave(ex.picks)) return #err("The first two picks are free: you can save from the third one.");
    let points = Game.pointsAt(ex.picks);
    let f = gFlush(caller, ex);
    let end = gSettle(caller, f, points, #saved);
    gMaybeClose();
    #ok(end);
  };

  public shared ({ caller }) func gameAuto(stake : Types.StakeOption, stopAt : Nat, expectedStake : Nat) : async Result.Result<Types.AutoResult, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gCloseIfDue()) return #err(Game.CLOSED_MSG);
    if (gameState.halted) return #err("Bets are paused. Try again later.");
    if (stopAt <= Game.SAFE or stopAt > Game.MAX_PICKS) return #err("Choose a pick between 3 and 10.");
    if (gClosing()) return #err(Game.CLOSING_MSG);
    switch (gameState.open.get(caller)) {
      case (?e) {
        if (e.busy and gFresh(e)) return #err("Wait for the previous pick to finish.");
        return #err("Finish your open excavation first.");
      };
      case null {};
    };
    var ex : Types.Excavation = switch (gOpen(caller, ?stake)) {
      case (#err m) return #err(m);
      case (#ok(placeholder, idx)) {
        switch (await gStartSafe(caller, placeholder.token, idx, expectedStake)) {
          case (#ok e) e;
          case (#err m) return #err(m);
        };
      };
    };
    let token = ex.token;

    let bytes = try { await gRandomBytes() } catch (_) {
      gUnbusy(caller, token);
      return #err("Could not get randomness. Try again.");
    };
    ex := switch (gSame(caller, token)) {
      case (?e) e;
      case null return #err("Your excavation changed. Try again.");
    };

    let rng = Game.Prng(Game.seedFrom(bytes));
    let plan = List.empty<(Nat, Bool, Nat)>();
    var picks = 0;
    var points = 0;
    var kind : Types.EndKind = #saved;
    var running = true;
    while (running) {
      let hit = Game.collapseHit(picks, rng.below(Game.sub(Game.CELLS, picks)));
      if (hit) {
        plan.add((picks, true, 0));
        points := Game.collapsePoints(picks);
        kind := #collapsed;
        running := false;
      } else {
        picks += 1;
        var stage = 0;
        if (Game.diamond1Hit(rng.below(10_000))) {
          stage := 1;
          if (Game.diamond2Hit(rng.below(Game.DIAMOND2_BASE), ex.stake)) {
            stage := 2;
            if (Game.diamond3Hit(rng.below(Game.DIAMOND3_ODDS))) stage := 3;
          };
        };
        plan.add((picks, false, stage));
        if (picks >= stopAt or picks >= Game.MAX_PICKS) {
          points := Game.pointsAt(picks);
          kind := if (picks >= Game.MAX_PICKS) #maxed else #saved;
          running := false;
        };
      };
    };

    let steps = List.empty<Types.AutoStep>();
    var cur : Types.Excavation = ex;
    for ((pick, collapsed, stage) in plan.values()) {
      if (collapsed) {
        steps.add({ pick = pick + 1; collapsed = true; diamond = { stage = 0; won = 0 } });
      } else {
        var d : Types.DiamondResult = { stage = Nat.min(stage, 2); won = 0 };
        if (stage >= 1) cur := { cur with diamonds = cur.diamonds + 1 };
        // Stage 3 pays the whole pool, stage 2 (exactly two diamonds) the mini jackpot.
        if (stage >= 2) {
          let (r, n) = if (stage == 3) gAward(caller, cur) else gAwardMini(caller, cur);
          d := r;
          cur := n;
        };
        steps.add({ pick; collapsed = false; diamond = d });
      };
    };
    cur := { cur with picks };
    let f = gFlush(caller, cur);
    let end = gSettle(caller, f, points, kind);
    gMaybeClose();
    #ok({ steps = steps.toArray(); end; pool = gameState.pool });
  };

  // Views

  public shared query ({ caller }) func gameMyDashboard() : async Types.Dashboard {
    let open = switch (gameState.open.get(caller)) {
      case (?e) if (e.stake > 0 and e.picks > 0) ?gView(e) else null;
      case null null;
    };
    let stakes = gStakes();
    let stats = gStats(caller);
    let top10Rank = gRankOf(caller);
    let top10Prize = Game.top10Prize(gameState.top10, top10Rank, stats.staked);
    {
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      paused = gPaused();
      pauseCode = gPauseCode();
      stakes;
      credit = gCredit(caller);
      pendingWithdrawal = gPendingWithdrawal(caller);
      pendingLoad = switch (gameState.pendingLoads.get(caller)) { case (?pl) pl.amount; case null 0 };
      pool = gameState.pool;
      top10Pool = gameState.top10;
      top10Rank;
      top10Prize;
      top10Entry = gTopEntry();
      open;
      stats;
      bestReturn = switch (gameState.best.get(caller)) { case (?v) v; case null 0 };
      net = Game.net(stats.returned, stats.jackpotWon, top10Prize, stats.staked);
      history = switch (gameState.history.get(caller)) {
        case (?l) l.sliceToArray(Nat.sub(l.size(), Nat.min(l.size(), Game.HISTORY_KEEP)), l.size()).map(
          func(r : Types.PlayerTournamentResult) : Types.PastResult {
            {
              tournament = r.tournament;
              excavations = r.stats.excavations;
              staked = r.stats.staked;
              returned = r.stats.returned;
              jackpotWon = r.stats.jackpotWon;
              top10Prize = r.stats.top10Prize;
              net = Game.net(r.stats.returned, r.stats.jackpotWon, r.stats.top10Prize, r.stats.staked);
              credit = r.credit;
              payout = r.payout;
            };
          }
        );
        case null [];
      };
    };
  };

  // Totals of the tournament, for every viewer of the game. No per-player rows are built or sent.
  public query func gameSummary() : async Types.GameSummary {
    var staked = 0;
    for ((_, s) in gameState.stats.entries()) staked += s.staked;
    {
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      paused = gPaused();
      pauseCode = gPauseCode();
      stakes = gStakes();
      pool = gameState.pool;
      top10Pool = gameState.top10;
      staked;
      totalPlayers = gameState.stats.size();
      lastJackpotAt = if (gameState.jackpots.size() == 0) 0 else gameState.jackpots[Nat.sub(gameState.jackpots.size(), 1)].at;
    };
  };

  // One row per player with stats this tournament, in no particular order. pos, rank and prize are
  // filled in by Ranking.byVolume.
  func gPlayerRows() : [(Types.PlayerRow, Ranking.Key)] {
    let rows = List.empty<(Types.PlayerRow, Ranking.Key)>();
    for ((p, s) in gameState.stats.entries()) {
      rows.add(({
        player = p;
        pos = 0;
        excavations = s.excavations;
        staked = s.staked;
        returned = s.returned;
        jackpotWon = s.jackpotWon;
        net = 0;
        bestReturn = switch (gameState.best.get(p)) { case (?v) v; case null 0 };
        rank = 0;
        prize = 0;
      }, Ranking.keyOf(s)));
    };
    rows.toArray();
  };

  // One page of the ranking. The size is fixed (Game.RANKING_PAGE) and the order is computed here over
  // all the players, so the client only draws what it receives. A page past the end is clamped.
  public shared query ({ caller }) func gameRankingPage(sort : Types.RankingSort, page : Nat) : async Types.RankingPage {
    let ordered = Ranking.order(Ranking.byVolume(gPlayerRows(), gameState.top10), sort);
    let (used, from, to) = Game.pageBounds(ordered.size(), page, Game.RANKING_PAGE);
    let log = gameState.jackpots;
    let shown = Nat.min(log.size(), Game.JACKPOT_SHOWN);
    {
      sort;
      page = used;
      pageSize = Game.RANKING_PAGE;
      totalPlayers = ordered.size();
      rows = ordered.sliceToArray(from, to);
      mine = ordered.find(func(r : Types.PlayerRow) : Bool { r.player == caller });
      lastTop10 = gameState.lastTop10;
      jackpots = Array.tabulate(shown, func(i : Nat) : Types.JackpotWin { log[log.size() - 1 - i] });
    };
  };

  public query func gameTournaments() : async [Types.TournamentSummary] {
    gameState.tournaments.toArray();
  };

  // Access

  public shared query ({ caller }) func whoAmI() : async Text {
    Principal.toText(caller);
  };

  public shared ({ caller }) func adminSyncBootstrap() : async Bool {
    gArmTimer<system>();
    if (Principal.isAnonymous(caller) or not Game.isBootstrapAdmin(caller)) return false;
    accessControlState.userRoles.add(caller, #admin);
    accessControlState.adminAssigned := true;
    true;
  };

  public shared query ({ caller }) func adminListRoles() : async Result.Result<[(Principal, Types.UserRole)], Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    #ok(accessControlState.userRoles.entries().toArray());
  };

  // Admin

  public shared query ({ caller }) func gameAdminView() : async Result.Result<Types.AdminView, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    var staked = 0;
    for ((_, s) in gameState.stats.entries()) staked += s.staked;
    var toCollect = 0;
    var toCollectPlayers = 0;
    var small = 0;
    var smallPlayers = 0;
    for ((_, c) in gameState.credits.entries()) {
      if (c > 0) {
        toCollect += c;
        toCollectPlayers += 1;
        if (c <= Game.FEE) {
          small += c;
          smallPlayers += 1;
        };
      };
    };
    var inPlay = 0;
    for ((_, e) in gameState.open.entries()) { inPlay += e.held };
    let stakes = gStakes();
    let tn = gameState.tournaments.size();
    #ok({
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      durationDays = gameState.durationDays;
      realLedger = gameState.realLedger;
      bank = gameState.bank;
      owed = gameState.owed;
      toCollect;
      toCollectPlayers;
      smallBalances = small;
      smallPlayers;
      heldJackpots = inPlay;
      pendingLoads = gameState.pendingLoads.size();
      pendingWithdrawals = gPendingWithdrawalsTotal();
      withdrawals = gWithdrawalViews();
      pool = gameState.pool;
      reserve = gameState.reserve;
      cycles = gameState.cycles;
      top10 = gameState.top10;
      burned = gameState.burned;
      fund = gFund();
      withdrawable = gWithdrawable();
      stakes;
      paused = gPaused();
      pauseCode = gPauseCode();
      openExcavations = gameState.open.size();
      closeEndsAt = if (gameState.endsAt == 0) 0 else gameState.endsAt + Game.CLOSE_WINDOW_NS;
      staked;
      bankAccount = gameState.bankAccount;
      selfId = gameState.selfId;
      lastClose = if (tn == 0) null else gameState.tournaments.get(Nat.sub(tn, 1));
    });
  };

  // Newest lines first, at most TRANSFER_LOG_SHOWN. With a player: only that player's lines.
  func gTransferNewest(who : ?Principal) : [Types.TransferEntry] {
    let out = List.empty<Types.TransferEntry>();
    var i = gameState.transferLog.size();
    while (i > 0 and out.size() < Game.TRANSFER_LOG_SHOWN) {
      i := Nat.sub(i, 1);
      let e = gameState.transferLog[i];
      let keep = switch (who) { case (?p) e.player == p; case null true };
      if (keep) out.add(e);
    };
    out.toArray();
  };

  public shared query ({ caller }) func gameAdminTransferLog() : async Result.Result<[Types.TransferEntry], Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    #ok(gTransferNewest(null));
  };

  public shared query ({ caller }) func gameAdminPlayerInfo(player : Principal) : async Result.Result<Types.PlayerInfo, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let (stake, held) = switch (gameState.open.get(player)) { case (?e) (e.stake, e.held); case null (0, 0) };
    #ok({
      credit = gCredit(player);
      stake;
      held;
      pendingLoad = switch (gameState.pendingLoads.get(player)) { case (?pl) pl.amount; case null 0 };
      pendingWithdrawal = switch (gameState.pendingWithdrawals.get(player)) { case (?pw) pw.amount; case null 0 };
      entries = gTransferNewest(?player);
    });
  };

  public shared ({ caller }) func gameAdminCloseTournament() : async Result.Result<(), Text> {
    gArmTimer<system>();
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.endsAt == 0) return #err("The tournament has not started.");
    if (gAnyBusy()) return #err("Excavations in progress. Try again in a few seconds.");
    // The same two checks the review makes before an automatic close.
    if (gameState.saturations > 0 or not gAccountingOk()) return #err("The accounting check fails. Fix it before closing.");
    if (gFund() < 0) return #err("The bank does not cover what the game owes.");
    let t = gameState.tournament;
    gCloseTournament(false);
    gLogAction("close_now", "Tournament closed by admin", "Tournament " # Nat.toText(t) # " was closed from the admin panel.");
    #ok(());
  };

  // Ends every open excavation without closing the tournament, with the same rules as the close.
  public shared ({ caller }) func gameAdminCloseOpen() : async Result.Result<Nat, Text> {
    gArmTimer<system>();
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gameState.halted) return #err("Pause new excavations first.");
    if (gAnyBusy()) return #err("Excavations in progress. Try again in a few seconds.");
    let n = gameState.open.size();
    for ((p, e) in gameState.open.entries().toArray().values()) gEndOpen(p, e, false);
    gLogAction("close_open", "Open excavations closed", Nat.toText(n) # " open excavation(s) were ended from the admin panel.");
    #ok(n);
  };

  // Starts the waiting tournament: its clock runs from now.
  public shared ({ caller }) func gameAdminStartTournament() : async Result.Result<(), Text> {
    gArmTimer<system>();
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.endsAt != 0) return #err("The tournament is already running.");
    if (gEvacuating()) return #err("The evacuation is active.");
    gStartAt := null;
    gReviewedFor := 0;
    gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
    gLogAction("start", "Tournament started", "Tournament " # Nat.toText(gameState.tournament) # " started from the admin panel.");
    #ok(());
  };

  public shared ({ caller }) func gameAdminSetDuration(days : Nat) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (days == 0 or days > Game.MAX_DURATION_DAYS) return #err("Duration must be between 1 and 60 days.");
    gameState.durationDays := days;
    gLogAction("duration", "Duration changed", "The tournament duration was set to " # Nat.toText(days) # " day(s).");
    #ok(());
  };

  public shared ({ caller }) func gameAdminSeedPool(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let target = goldao * Game.E8S;
    if (target < Game.POOL_SEED or target > Game.POOL_SEED_MAX) return #err("Choose a pool between 5,000 and 20,000 GOLDAO.");
    if (gameState.pool >= target) return #err("The jackpot pool is already at or above that amount.");
    let amount = Nat.sub(target, gameState.pool);
    let after : Int = gFund() - amount;
    if (after < Game.FUND_FLOOR) return #err("The bank fund would fall below its floor.");
    gameState.pool += amount;
    gFundReset();
    gLogAction("seed_pool", "Jackpot pool topped up", "The pool was raised to " # SecLog.fmt(gameState.pool) # " GOLDAO from the bank fund.");
    #ok(gameState.pool);
  };

  // True while the admin moves money out of the bank (a withdrawal or an evacuation run).
  func gBusyNow() : Bool {
    gameState.payingSince != 0 and Time.now() - gameState.payingSince < Game.BUSY_STALE_NS;
  };

  func gWithdrawBlocked(kind : Types.WithdrawKind) : ?Text {
    if (gameState.saturations > 0 or not gAccountingOk()) return ?"Accounting check failed. Withdrawals are blocked.";
    switch (kind) {
      case (#all) {
        if (not gEvacuating()) return ?"Start the evacuation first.";
        if (gameState.owed != 0 or gameState.open.size() != 0 or gameState.credits.size() != 0 or gameState.pendingLoads.size() != 0 or gameState.pendingWithdrawals.size() != 0) {
          return ?"Send every player's balance first, and wait for open excavations and loads to end.";
        };
      };
      case (#available) {};
    };
    null;
  };

  // #unanswered: the ledger gave no answer, so the transfer may have been executed.
  func lWithdraw(amount : Nat) : async { #sent : ?Nat; #unanswered; #err : Text } {
    if (not gBankReady()) return #err(Game.BANK_NOT_READY_MSG);
    gameState.movSeq += 1;
    let answer = await lSend(Game.treasury(), amount, Nat.toNat64(Int.abs(Time.now())));
    gameState.movSeq += 1;
    switch (answer) {
      case null {
        gLog(#warning, "withdraw_no_answer", "Withdrawal without an answer", "A withdrawal of " # SecLog.fmt(amount) # " GOLDAO got no answer from the ledger. It may have been sent: check the treasury before trying again.");
        #unanswered;
      };
      case (?(#Ok idx)) {
        gameState.bank := gSub(gameState.bank, amount + Game.FEE);
        gameState.burned += Game.FEE;
        #sent(?idx);
      };
      case (?(#Err(#InsufficientFunds _))) #err("The bank does not cover the withdrawal.");
      case (?(#Err _)) #err("The ledger rejected the withdrawal.");
    };
  };

  public shared ({ caller }) func gameAdminWithdraw(kind : Types.WithdrawKind) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    // The bank is the game's own account, so no signature of the bank admin is needed to move it.
    // Only the bank admin of this deployment may start a withdrawal.
    if (not gIsBankAdmin(caller)) return #err("Only the bank admin can withdraw.");
    let now = Time.now();
    if (gameState.payingSince != 0 and now - gameState.payingSince < Game.BUSY_STALE_NS) {
      return #err("A money movement is in progress.");
    };
    switch (gWithdrawBlocked(kind)) { case (?m) return #err(m); case null {} };
    gameState.payingSince := now;
    switch (await gCleanReading(true)) {
      case (#adopted) {};
      case (#busy) {
        gameState.payingSince := 0;
        return #err(Game.BUSY_BANK_MSG);
      };
      case (#down) {
        gameState.payingSince := 0;
        return #err("The ledger is unavailable.");
      };
    };
    switch (gWithdrawBlocked(kind)) {
      case (?m) {
        gameState.payingSince := 0;
        return #err(m);
      };
      case null {};
    };
    let spendable = Game.sub(gameState.bank, Game.FEE);
    let amount = switch (kind) {
      case (#all) spendable;
      case (#available) Nat.min(gWithdrawable(), spendable);
    };
    if (amount == 0) {
      gameState.payingSince := 0;
      return #err("Nothing to withdraw.");
    };
    let res = await lWithdraw(amount);
    gameState.payingSince := 0;
    // A lost answer is booked as sent: if it was not, the amount stays in the bank as excess, which
    // is the safe side. Booking it only on success would let a retry send the same part twice.
    let (txId, unanswered) : (?Nat, Bool) = switch (res) {
      case (#err m) return #err(m);
      case (#sent t) (t, false);
      case (#unanswered) (null, true);
    };
    switch (kind) {
      case (#all) {
        gameState.pool := 0;
        gameState.reserve := 0;
        gameState.cycles := 0;
        gameState.top10 := 0;
      };
      case (#available) {
        gameState.cycles := Game.sub(gameState.cycles, amount);
      };
    };
    ignore await lBankRefresh();
    gFundReset();
    if (unanswered) return #err("The ledger did not answer. The withdrawal may have been sent: check the treasury before trying again.");
    gLogAction("withdraw", "Admin withdrawal", "Withdrew " # SecLog.fmt(amount) # " GOLDAO to the treasury (" # (switch (kind) { case (#all) "everything"; case (#available) "available excess" }) # ")" # (switch (txId) { case (?t) ", ledger transaction " # Nat.toText(t); case null "" }) # ".");
    #ok(amount);
  };

  // Evacuation: the way to empty the bank (before an update, say). The game is paused completely,
  // every balance is sent to its own owner, and only then can the rest go to the treasury.

  func gEvacuating() : Bool {
    gameState.halted and gameState.haltCode == Game.HALT_EVAC;
  };

  func gEvacTodo() : Nat {
    var n = gameState.pendingWithdrawals.size();
    for ((_, c) in gameState.credits.entries()) { if (c > Game.FEE) n += 1 };
    n;
  };

  public shared ({ caller }) func gameAdminEvacStart() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gIsBankAdmin(caller)) return #err("Only the bank admin can start the evacuation.");
    if (gEvacuating()) return #ok(());
    // The mark replaces any other pause. The excavations that can be saved are saved now.
    gameState.halted := true;
    gameState.haltedAt := Time.now();
    gameState.haltCode := Game.HALT_EVAC;
    gStartAt := null;
    gLogAction("evac_start", "Evacuation started", "The game was closed to players: loads, excavations and withdrawals are stopped until the balances are sent.");
    gSaveReady();
    #ok(());
  };

  // Sends the balances of up to EVAC_BATCH players to their own wallets, the same way a player's
  // withdrawal does (a withdrawal that got no answer is repeated with its stamp). Balances at or
  // below the fee cannot be sent: they are written off and stay in the bank. Repeat until none is left.
  public shared ({ caller }) func gameAdminEvacSend() : async Result.Result<{ sent : Nat; failed : Nat; remaining : Nat }, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gIsBankAdmin(caller)) return #err("Only the bank admin can send the balances.");
    if (not gEvacuating()) return #err("Start the evacuation first.");
    if (not gameState.realLedger) return #err("The ledger is not connected.");
    if (gameState.endsAt != 0) return #err("Close the tournament first.");
    if (gameState.open.size() != 0) return #err("Wait for open excavations to end first.");
    if (gameState.saturations > 0 or not gAccountingOk()) return #err("Accounting check failed. Sending is blocked.");
    if (not gBankReady()) return #err(Game.BANK_NOT_READY_MSG);
    let now = Time.now();
    if (gBusyNow()) return #err("A money movement is in progress.");
    gameState.payingSince := now;
    var sent = 0;
    var failed = 0;
    try {
      switch (await gCleanReading(true)) {
        case (#adopted) {};
        case (#busy) return #err(Game.BUSY_BANK_MSG);
        case (#down) return #err("The ledger is unavailable.");
      };
      var small = 0;
      for ((p, c) in gameState.credits.entries().toArray().values()) {
        if (c <= Game.FEE) {
          gameState.credits.remove(p);
          gameState.owed := gSub(gameState.owed, c);
          small += c;
        };
      };
      if (small > 0) gLogAction("evac_small", "Small balances written off", SecLog.fmt(small) # " GOLDAO in balances at or below the network fee stay in the bank.");
      let todo = List.empty<(Principal, Nat)>();
      // A withdrawal whose stamp expired is settled by hand, and one in progress is left alone.
      let nowStamp = Nat.toNat64(Int.abs(Time.now()));
      for ((p, pw) in gameState.pendingWithdrawals.entries().toArray().values()) {
        if (todo.size() < Game.EVAC_BATCH and nowStamp < pw.stamp + Game.STAMP_MAX_AGE_NS and not gWithdrawBusy(p)) todo.add((p, pw.amount));
      };
      for ((p, c) in gameState.credits.entries().toArray().values()) {
        if (todo.size() < Game.EVAC_BATCH and c > Game.FEE and gameState.pendingWithdrawals.get(p) == null) todo.add((p, c));
      };
      for ((p, amount) in todo.values()) {
        switch (await gWithdrawRun(p, amount, true)) {
          case (#ok _) sent += 1;
          case (#err _) failed += 1;
        };
      };
    } finally {
      gameState.payingSince := 0;
    };
    ignore await lBankRefreshWith(true);
    gFundReset();
    gLogAction("evac_send", "Balances sent", Nat.toText(sent) # " balance(s) sent to their owners, " # Nat.toText(failed) # " not sent yet.");
    #ok({ sent; failed; remaining = gEvacTodo() });
  };

  public shared ({ caller }) func gameAdminRefreshBank() : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    switch (await lBankReading(true)) {
      case (#adopted) {};
      case (#busy) return #err(Game.BUSY_BANK_MSG);
      case (#down) return #err("The ledger is unavailable.");
    };
    #ok(gameState.bank);
  };

  public shared ({ caller }) func gameAdminReleaseBusy(player : Principal) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    switch (gameState.open.get(player)) {
      case (?e) {
        if (gFresh(e)) return #err("The pick is still in progress.");
        if (e.picks == 0) gDrop(player, e.token) else gameState.open.add(player, { e with busy = false; token = 0 });
        gLogAction("release_busy", "Excavation released", "A stuck excavation of " # Principal.toText(player) # " was released from the admin panel.");
        #ok(());
      };
      case null #err("No open excavation.");
    };
  };

  public shared query ({ caller }) func gameAdminSecurity() : async Result.Result<Types.SecurityView, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    #ok({
      halted = gameState.halted;
      haltCode = gameState.haltCode;
      haltedAt = gameState.haltedAt;
      ledgerFails = gameState.ledgerFails;
      saturations = gameState.saturations;
      accountingOk = gAccountingOk();
    });
  };

  // One UTC day of the security log, plus the list of days that have entries.
  public shared query ({ caller }) func gameAdminSecurityLog(day : Nat) : async Result.Result<Types.SecurityLogView, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    #ok({ days = SecLog.days(gameState.securityLog); day; events = SecLog.eventsOf(gameState.securityLog, day) });
  };

  public shared ({ caller }) func gameAdminAckAccounting() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gAccountingOk()) return #err("The accounting check still fails.");
    gameState.saturations := 0;
    #ok(());
  };

  public shared ({ caller }) func gameAdminHalt() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    gHalt(Game.HALT_MANUAL, #info, "Halted by admin", "New excavations were halted from the admin panel.");
    #ok(());
  };

  public shared ({ caller }) func gameAdminResume() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.saturations > 0 or not gAccountingOk()) return #err("The accounting check still fails. Fix it and acknowledge it before resuming.");
    // Only the bank admin ends an evacuation.
    if (gEvacuating()) {
      if (not gIsBankAdmin(caller)) return #err("Only the bank admin can cancel the evacuation.");
      gStartAt := null;
    };
    if (gameState.halted) {
      gLogAction("resume", "Resumed by admin", "Play resumed. It had been halted: " # Game.haltReason(gameState.haltCode) # ".");
    };
    gameState.halted := false;
    gameState.haltCode := 0;
    gFundReset();
    gameState.ledgerFails := 0;
    #ok(());
  };

  public shared ({ caller }) func gameAdminLedgerBalance(who : Principal) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    try { #ok(await Ledger.ledger().icrc1_balance_of(Ledger.account(who))) } catch (_) { #err("The ledger is unavailable.") };
  };

  func gIdle() : Bool {
    gameState.owed == 0 and gameState.open.size() == 0 and gameState.credits.size() == 0
    and gameState.pendingLoads.size() == 0 and gameState.pendingWithdrawals.size() == 0;
  };

  // Erases all game data: pools, statistics, history, tournaments, security events, transfer log
  // and every internal counter, so the game starts as if it were new. Only called on an empty
  // game. The pause and the connection are not touched here: the caller decides them.
  func gWipe() {
    gameState.securityLog.clear();
    gameState.saturations := 0;
    gameState.seq := 0;
    gameState.movSeq := 0;
    gameState.nextPayoutId := 0;
    gameState.payingSince := 0;
    gameState.durationDays := Game.DEFAULT_DURATION_DAYS;
    gRejects.clear();
    gWithdrawLast.clear();
    gShort := 0;
    gShortSince := 0;
    gUncertain := false;
    gReviewFails := 0;
    gameState.pool := 0;
    gameState.reserve := 0;
    gameState.cycles := 0;
    gameState.top10 := 0;
    gameState.lastTop10 := [];
    gameState.burned := 0;
    gameState.loaded.clear();
    gameState.stats.clear();
    gameState.best.clear();
    gameState.history.clear();
    gameState.tournaments.clear();
    gameState.payouts.clear();
    gameState.pendingLoads.clear();
    gameState.pendingWithdrawals.clear();
    gameState.jackpots := [];
    gameState.transferLog := [];
    gameState.tournament := 1;
    gameState.endsAt := 0;
    gReviewedFor := 0;
    gStartAt := null;
    gameState.ledgerFails := 0;
  };

  // Connects the game to the ledger of this deployment (lib/ledger.mo): checks the fee and, in
  // production, the symbol, reads the balance of the game account (the bank) and erases all game
  // data. Used by the connection at start.
  func gConnect(selfId : Principal) : async Result.Result<Nat, Text> {
    if (not gIdle()) return #err("The game must be empty: close the tournament and withdraw everything first.");
    let balance = try {
      let fee = await Ledger.ledger().icrc1_fee();
      if (fee != Game.FEE) return #err("The ledger fee differs from the game fee.");
      if (Ledger.MODE == #production and (await Ledger.ledger().icrc1_symbol()) != Ledger.PRODUCTION_SYMBOL) {
        return #err("The ledger symbol is not the real GOLDAO one.");
      };
      await Ledger.ledger().icrc1_balance_of(Ledger.account(selfId));
    } catch (_) { return #err("The ledger is unavailable.") };
    if (not gIdle()) return #err("The game changed. Try again.");
    gameState.bankAccount := ?selfId;
    gameState.selfId := ?selfId;
    gWipe();
    gameState.bank := balance;
    gameState.realLedger := true;
    gFundReset();
    gLogAction("real_ledger", "Ledger set", "The game now uses the ledger " # Ledger.ledgerId() # ". Bank balance: " # SecLog.fmt(balance) # " GOLDAO.");
    #ok(balance);
  };

  func gIsBankAdmin(p : Principal) : Bool {
    switch (gameState.selfId) {
      case (?me) { Game.bankFor(me) == ?p };
      case null false;
    };
  };

  // Connection at start: only a game that was never connected. It runs on every tick of the game
  // timer until it works.
  func gTryConnect() : async Result.Result<Nat, Text> {
    if (gameState.realLedger) return #err("Already connected.");
    if (gAutoBusy) return #err("A connection attempt is already running.");
    let me = Prim.getSelfPrincipal<system>();
    switch (Game.bankFor(me)) {
      case (?_) {
        gAutoBusy := true;
        try { await gConnect(me) } finally { gAutoBusy := false };
      };
      case null #err("This canister has no bank configured: " # Principal.toText(me));
    };
  };

  func gAutoConnect() : async () { ignore await gTryConnect() };

  transient var gAutoBusy = false;

  // The admin panel calls this when the game is not connected yet: it starts the game timer (which
  // keeps retrying the connection) and tries the connection right away. The error is the reason
  // why it could not connect.
  public shared ({ caller }) func gameAdminEnsureConnected() : async Result.Result<Bool, Text> {
    gArmTimer<system>();
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #ok(true);
    switch (await gTryConnect()) {
      case (#ok _) #ok(true);
      case (#err e) #err(e);
    };
  };

  // Test deployments only. Erases all game data and disconnects the game, which stays paused.
  // The bank admin runs it after the evacuation, before deploying the production code: the
  // admin panel then connects to the new ledger and the game is resumed by hand.
  public shared ({ caller }) func gameAdminResetGame() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (Ledger.MODE != #test) return #err("Not available on the real ledger.");
    if (not gIsBankAdmin(caller)) return #err("Only the bank admin can delete the game data.");
    if (not gameState.halted) return #err("Pause new excavations first.");
    if (gAnyBusy()) return #err("Excavations in progress. Try again in a few seconds.");
    if (gameState.payingSince != 0 and Time.now() - gameState.payingSince < Game.BUSY_STALE_NS) {
      return #err("A money movement is in progress.");
    };
    if (not gIdle()) return #err("The game must be empty: run the evacuation and send every balance first.");
    gWipe();
    gameState.bank := 0;
    gameState.realLedger := false;
    gFundReset();
    #ok(());
  };
};
