import Types "../types/game";
import Game "../lib/game";
import Ledger "../lib/ledger";
import SecLog "../lib/security-log";
import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
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
  // Rejected loads (no funds, no allowance) in the current window. Every load that reaches the
  // ledger bumps movSeq, which can make the bank refresh fail, so a flood of loads from accounts
  // that never paid is cut off before it reaches the ledger. Players who already loaded once
  // are never throttled.
  transient var gRejectedSince : Int = 0;
  transient var gRejected : Nat = 0;
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
    gLog(#warning, "load_expired", "Unconfirmed load expired", "A load of " # Nat.toText(pl.amount / Game.E8S) # " GOLDAO from " # Principal.toText(p) # " never got an answer and its timestamp expired. Check the ledger: the player may have been charged without credit.");
  };

  func gLoadThrottled(p : Principal) : Bool {
    if (not gameState.realLedger or gameState.loaded.contains(p)) return false;
    let on = Time.now() - gRejectedSince < Game.LOAD_REJECT_WINDOW_NS and gRejected >= Game.LOAD_REJECT_MAX;
    if (on) gLog(#warning, "load_throttle", "Load throttle active", "Loads from accounts that never paid are being rejected (" # Nat.toText(gRejected) # " rejected in the last minute).");
    on;
  };

  func gLoadRejected() {
    let now = Time.now();
    if (now - gRejectedSince >= Game.LOAD_REJECT_WINDOW_NS) {
      gRejectedSince := now;
      gRejected := 0;
    };
    gRejected += 1;
  };

  func gUnpaidTotal() : Nat {
    var t = 0;
    for ((_, po) in gameState.payouts.entries()) {
      if (not po.paid) t += po.amount + Game.FEE;
    };
    t;
  };

  // True while any payout of a closed tournament is still unpaid. Derived from the payouts
  // themselves (nothing extra to store), so it survives upgrades.
  func gAnyUnpaid() : Bool {
    for ((_, po) in gameState.payouts.entries()) {
      if (not po.paid) return true;
    };
    false;
  };

  func gAccountingOk() : Bool {
    var credits = 0;
    for ((_, c) in gameState.credits.entries()) { credits += c };
    var held = 0;
    for ((_, e) in gameState.open.entries()) { held += e.held };
    gameState.owed == credits + held + gUnpaidTotal();
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

  func gBalance(p : Principal) : Nat {
    switch (gameState.balances.get(p)) { case (?b) b; case null 0 };
  };

  func gAllowance(p : Principal) : Nat {
    switch (gameState.allowances.get(p)) { case (?b) b; case null 0 };
  };

  func gCredit(p : Principal) : Nat {
    switch (gameState.credits.get(p)) { case (?b) b; case null 0 };
  };

  func gEmptyStats() : Types.TournamentStats {
    { excavations = 0; staked = 0; returned = 0; jackpotWon = 0; jackpots = 0; charged = 0; collapses = 0; bestPoints = 0; deepest = 0 };
  };

  func gStats(p : Principal) : Types.TournamentStats {
    switch (gameState.stats.get(p)) { case (?s) s; case null gEmptyStats() };
  };

  func gFund() : Int {
    Game.fund(gameState.bank, gameState.owed, gameState.pool, gameState.reserve, gameState.cycles, gameState.top10);
  };

  // Top-10 ranking by volume staked in the current tournament. Ties go to the lower principal.
  func gBetter(a : (Principal, Nat), b : (Principal, Nat)) : Bool {
    a.1 > b.1 or (a.1 == b.1 and Principal.compare(a.0, b.0) == #less);
  };

  func gTopList() : [(Principal, Nat)] {
    let n = Game.TOP10_WEIGHTS.size();
    var top : [(Principal, Nat)] = [];
    for ((p, s) in gameState.stats.entries()) {
      if (s.staked > 0) {
        let cand = (p, s.staked);
        if (top.size() < n or gBetter(cand, top[top.size() - 1])) {
          let next = Array.sort(
            Array.concat(top, [cand]),
            func(a : (Principal, Nat), b : (Principal, Nat)) : { #less; #equal; #greater } {
              if (gBetter(a, b)) #less else if (gBetter(b, a)) #greater else #equal;
            },
          );
          top := if (next.size() > n) Array.sliceToArray(next, 0, n) else next;
        };
      };
    };
    top;
  };

  func gRankOf(p : Principal) : Nat {
    let mine = gStats(p).staked;
    if (mine == 0) return 0;
    var rank = 1;
    for ((q, s) in gameState.stats.entries()) {
      if (q != p and gBetter((q, s.staked), (p, mine))) rank += 1;
    };
    rank;
  };

  func gTopEntry() : Nat {
    let top = gTopList();
    let n = Game.TOP10_WEIGHTS.size();
    if (top.size() < n) Game.TOP10_MIN_VOLUME else Nat.max(Game.TOP10_MIN_VOLUME, top[n - 1].1);
  };

  func gStakes() : [Nat] { Game.stakes(gFund()) };

  func gWithdrawable() : Nat {
    let f = gFund();
    let extra : Int = f - Game.FUND_TARGET;
    gameState.cycles + (if (extra > 0) Int.abs(extra) else 0);
  };

  func gFaucetUsed(p : Principal) : Nat {
    switch (gameState.faucet.get(p)) {
      case (?(t, used)) if (t == gameState.tournament) used else 0;
      case null 0;
    };
  };

  func gFaucetTotal() : Nat {
    var total = 0;
    for ((_, (t, used)) in gameState.faucet.entries()) {
      if (t == gameState.tournament) total += used;
    };
    total;
  };

  func gPaused() : Bool {
    // A new tournament does not start while the previous one still has unpaid payouts.
    gameState.halted or gStakes().size() == 0 or gAnyUnpaid();
  };

  // Halts new bets and records why. The event is logged even if the game was already halted.
  func gHalt(code : Nat, level : Types.SecurityLevel, title : Text, description : Text) {
    gLog(level, "halt_" # Nat.toText(code), title, description);
    if (gameState.halted) return;
    gameState.halted := true;
    gameState.haltCode := code;
    gameState.haltedAt := Time.now();
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

  // Safeguard 1: the bank wallet must hold what the game's own books say. Every movement the
  // game makes (loads, payouts, admin withdrawals) updates the books, so a lower balance means
  // GOLDAO left the wallet some other way. Only a clean reading is compared (see gInFlight).
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
        "The bank wallet holds " # SecLog.fmt(read) # " GOLDAO but the game expected " # SecLog.fmt(expected) # " (" # SecLog.fmt(gShort) # " missing today). Bets are paused. If you did not move it, check the wallet.",
      );
      gShort := 0;
    };
  };

  // Reads the bank balance from the ledger. The reading is adopted (and audited) only when no
  // transfer was in flight or started meanwhile; otherwise it is retried. `countFails` is false for
  // the background check, so an unreachable ledger never halts the game by itself.
  func lBankRefreshWith(countFails : Bool) : async Bool {
    if (not gameState.realLedger) return true;
    let acct = switch (gameState.bankAccount) { case (?a) a; case null return false };
    var tries = 0;
    while (tries < 3) {
      let before = gameState.movSeq;
      let idle = gInFlight == 0;
      let bal = try { ?(await Ledger.ledger().icrc1_balance_of(Ledger.account(acct))) } catch (_) { null };
      switch (bal) {
        case (?b) {
          gLedgerOk();
          if (idle and gInFlight == 0 and gameState.movSeq == before) {
            gAuditBank(b);
            gameState.bank := b;
            return true;
          };
        };
        case null {
          if (countFails) gLedgerFail();
          return false;
        };
      };
      tries += 1;
    };
    false;
  };

  func lBankRefresh() : async Bool { await lBankRefreshWith(true) };

  // Safeguard 2: the fund cannot fall faster than the bets allow. It is sampled every tick; if it
  // is FUND_DROP_PCT percent (and at least FUND_DROP_MIN) below the highest sample kept, the game
  // halts. Moves made on purpose by the admin reset the samples (gFundReset).
  func gFundReset() {
    gameState.fundSamples := [gFund()];
  };

  func gWatchFund() {
    let f = gFund();
    if (gameState.halted) {
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
    gameState.fundSamples := if (all.size() > Game.FUND_SAMPLES) Array.sliceToArray(all, all.size() - Game.FUND_SAMPLES, all.size()) else all;
  };

  func gWatchBank() : async () {
    if (gWatching or not gameState.realLedger) return;
    gWatching := true;
    ignore await lBankRefreshWith(false);
    gWatching := false;
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

  // Pulls the amount from the player's wallet into the bank. The caller grants
  // the credit only after this returns #ok, i.e. after the ledger confirmed it.
  // The first successful load of a player also counts the 10 GOLDAO fee the
  // player burned when authorizing the game account (simulated mode already
  // counts that fee when the test authorization is made).
  func gMarkLoaded(p : Principal) {
    if (gameState.loaded.contains(p)) return;
    gameState.loaded.add(p);
    if (gameState.realLedger) gameState.burned += Game.FEE;
  };

  // `stamp` is the ledger timestamp of this load. A retry after a call without an answer reuses
  // it, so the ledger answers Duplicate instead of charging the player twice.
  func lLoad(p : Principal, amount : Nat, stamp : Nat64) : async Types.Charge {
    gameState.movSeq += 1;
    let need = amount + Game.FEE;
    if (not gameState.realLedger) {
      if (gAllowance(p) < need) return #allowance;
      if (gBalance(p) < need) return #funds;
      gameState.balances.add(p, gSub(gBalance(p), need));
      gameState.allowances.add(p, gSub(gAllowance(p), need));
      gameState.bank += amount;
      gameState.burned += Game.FEE;
      gMarkLoaded(p);
      gameState.movSeq += 1;
      return #ok;
    };
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #down };
    let answer = await lTransfer(p, bankAcct, amount, stamp);
    gameState.movSeq += 1;
    switch (answer) {
      case null {
        gLedgerFail();
        #unknown;
      };
      case (?(#Ok _)) {
        gLedgerOk();
        gameState.bank += amount;
        gameState.burned += Game.FEE;
        gMarkLoaded(p);
        #ok;
      };
      case (?(#Err(#Duplicate _))) {
        // The first attempt did reach the ledger. The next clean bank reading is adopted.
        gLedgerOk();
        gUncertain := true;
        gameState.bank += amount;
        gameState.burned += Game.FEE;
        gMarkLoaded(p);
        #ok;
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

  // Marks a payout as paid and removes it from what the game owes. The tx id is the ledger block
  // of the transfer (null in simulated mode). True if it was marked now.
  func gMarkPaid(id : Nat, txId : ?Nat) : Bool {
    switch (gameState.payouts.get(id)) {
      case (?po) {
        if (po.paid) return false;
        gameState.payouts.add(id, { po with paid = true; txId; paidAt = Time.now(); uncertain = false });
        gameState.owed := gSub(gameState.owed, po.amount + Game.FEE);
        true;
      };
      case null false;
    };
  };

  // Pays one payout. Its ledger timestamp is assigned at the first attempt and saved BEFORE the
  // call, together with the `uncertain` flag: if the call ends without an answer (or the canister
  // traps afterwards) the payout may have been sent, and it stays uncertain. A retry inside the
  // ledger window reuses the timestamp and the ledger answers Duplicate with the original block,
  // so it can never be paid twice. When the timestamp has expired, an uncertain payout is NOT
  // renewed on its own: the admin must check the ledger and either mark it paid or renew it.
  func lPay(id : Nat, renew : Bool) : async Result.Result<?Nat, Text> {
    let po = switch (gameState.payouts.get(id)) { case (?po) po; case null return #err("Payout not found.") };
    if (po.paid) return #err("Already paid.");
    gameState.movSeq += 1;
    let need = po.amount + Game.FEE;
    if (not gameState.realLedger) {
      if (gameState.bank < need) return #err(Game.ERR_PAY_FUNDS);
      if (gameState.bankAllowance < need) return #err(Game.ERR_PAY_ALLOWANCE);
      gameState.bank := gSub(gameState.bank, need);
      gameState.bankAllowance := gSub(gameState.bankAllowance, need);
      gameState.balances.add(po.to, gBalance(po.to) + po.amount);
      gameState.burned += Game.FEE;
      gameState.movSeq += 1;
      return #ok(null);
    };
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #err("Ledger mode is not configured.") };
    let now = Nat.toNat64(Int.abs(Time.now()));
    var stamp : Nat64 = po.stamp;
    if (stamp == 0 or now >= stamp + Game.STAMP_MAX_AGE_NS) {
      if (po.uncertain and not renew) return #err(Game.ERR_PAY_UNCERTAIN);
      stamp := now;
    };
    let wasUncertain = po.uncertain;
    gameState.payouts.add(id, { po with stamp; uncertain = true });
    let answer = await lTransfer(bankAcct, po.to, po.amount, stamp);
    gameState.movSeq += 1;
    // Anything that is not a definite refusal leaves the payout uncertain.
    let refuse = func(msg : Text) : Result.Result<?Nat, Text> {
      switch (gameState.payouts.get(id)) {
        case (?cur) gameState.payouts.add(id, { cur with uncertain = wasUncertain });
        case null {};
      };
      #err(msg);
    };
    switch (answer) {
      case null {
        gLog(#warning, "payout_no_answer", "Payout without an answer", "A payout of " # SecLog.fmt(po.amount) # " GOLDAO to " # Principal.toText(po.to) # " got no answer from the ledger. It may have been sent. Pay it again to confirm: the ledger will not pay twice.");
        #err("The ledger did not answer. The payout may have been sent: pay it again to confirm (it cannot be paid twice).");
      };
      case (?(#Ok idx)) {
        gameState.bank := gSub(gameState.bank, need);
        gameState.burned += Game.FEE;
        #ok(?idx);
      };
      case (?(#Err(#Duplicate d))) {
        // The first attempt did reach the ledger and its books were not updated. The next clean
        // bank reading is adopted instead of subtracting the payout twice.
        gUncertain := true;
        gameState.burned += Game.FEE;
        #ok(?d.duplicate_of);
      };
      case (?(#Err(#TooOld))) {
        if (wasUncertain) {
          #err(Game.ERR_PAY_UNCERTAIN);
        } else {
          switch (gameState.payouts.get(id)) {
            case (?cur) gameState.payouts.add(id, { cur with stamp = (0 : Nat64); uncertain = false });
            case null {};
          };
          #err("Payout timestamp expired. Pay it again.");
        };
      };
      case (?(#Err(#InsufficientFunds _))) refuse(Game.ERR_PAY_FUNDS);
      case (?(#Err(#InsufficientAllowance _))) refuse(Game.ERR_PAY_ALLOWANCE);
      case (?(#Err _)) refuse("The ledger rejected the payout.");
    };
  };

  // Excavation bookkeeping

  func gReleaseHeld(e : Types.Excavation) {
    if (e.held > 0) {
      gameState.pool += e.held;
      gameState.owed := gSub(gameState.owed, e.held);
    };
  };

  func gDrop(p : Principal, token : Nat) {
    switch (gameState.open.get(p)) {
      case (?e) {
        if (e.token == token) {
          gReleaseHeld(e);
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

  func gFlush(p : Principal, e : Types.Excavation) : Types.Excavation {
    if (e.held == 0) return e;
    gameState.credits.add(p, gCredit(p) + e.held);
    let s = gStats(p);
    gameState.stats.add(p, { s with jackpots = s.jackpots + 1; jackpotWon = s.jackpotWon + e.held });
    let entry : Types.JackpotWin = { tournament = gameState.tournament; player = p; amount = e.held; stake = e.stake; at = Time.now() };
    let all = Array.concat(gameState.jackpots, [entry]);
    gameState.jackpots := if (all.size() > Game.JACKPOT_LOG) Array.sliceToArray(all, all.size() - Game.JACKPOT_LOG, all.size()) else all;
    { e with held = 0 };
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

    var won = 0;
    var lost = 0;
    if (g >= stake) {
      won := g - stake;
      gameState.credits.add(p, gCredit(p) + won);
      gameState.owed += won;
    } else {
      lost := stake - g;
      let c = gCredit(p);
      let fromCredit = Nat.min(c, lost);
      gameState.credits.add(p, c - fromCredit);
      gameState.owed := gSub(gameState.owed, fromCredit);
    };

    let s = gStats(p);
    gameState.stats.add(
      p,
      {
        excavations = s.excavations + 1;
        staked = s.staked + stake;
        returned = s.returned + g;
        jackpotWon = s.jackpotWon;
        jackpots = s.jackpots;
        charged = s.charged;
        collapses = s.collapses + (if (kind == #collapsed) 1 else 0);
        bestPoints = if (kind == #collapsed) s.bestPoints else Nat.max(s.bestPoints, points);
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
      balance = gBalance(p);
    };
  };

  // Tournament lifecycle

  func gCloseTournament(payAll : Bool) {
    let t = gameState.tournament;
    for ((p, e) in gameState.open.entries().toArray().values()) {
      if (Game.canSave(e.picks) and e.stake > 0) {
        let f = gFlush(p, e);
        ignore gSettle(p, f, Game.pointsAt(f.picks), #saved);
      } else {
        // An excavation that never got past the free picks costs the player nothing, so it must
        // not pay anything either: a jackpot found on the first two picks goes back to the pool.
        // Otherwise two risk-free picks per account and tournament would be a free jackpot roll.
        gReleaseHeld(e);
        gameState.open.remove(p);
      };
    };

    // The Top-10 prize goes to the biggest volumes as credit, so it is paid like any other balance.
    let bucket = gameState.top10;
    var topPaid = 0;
    let topWinners = List.empty<Types.TopPrize>();
    var rank = 1;
    for ((p, volume) in gTopList().values()) {
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
    gameState.lastTop10 := topWinners.toArray();

    // Small balances stay in the Accumulated prize for the next tournament. A full close
    // (payAll) pays everything above the fee and forfeits the rest.
    let pays = func(c : Nat) : Bool { c >= Game.MIN_PAYOUT or (payAll and c > Game.FEE) };
    var payoutTotal = 0;
    var forfeited = 0;
    let settled = List.empty<(Principal, Nat)>();
    for ((p, c) in gameState.credits.entries().toArray().values()) {
      if (c == 0) {
        settled.add((p, 0));
      } else if (pays(c)) {
        let id = gameState.nextPayoutId;
        gameState.nextPayoutId += 1;
        gameState.payouts.add(id, { id; tournament = t; to = p; amount = c - Game.FEE; paid = false; stamp = (0 : Nat64); txId = null; paidAt = 0; uncertain = false });
        payoutTotal += c - Game.FEE;
        settled.add((p, 0));
      } else if (payAll) {
        forfeited += c;
        settled.add((p, c));
      };
    };

    var excavations = 0;
    var staked = 0;
    var returned = 0;
    var jackpots = 0;
    var jackpotPaid = 0;
    for ((p, s) in gameState.stats.entries().toArray().values()) {
      excavations += s.excavations;
      staked += s.staked;
      returned += s.returned;
      jackpots += s.jackpots;
      jackpotPaid += s.jackpotWon;
      let credit = gCredit(p);
      let result : Types.PlayerTournamentResult = { tournament = t; stats = s; credit; payout = if (pays(credit)) credit - Game.FEE else 0 };
      let l = switch (gameState.history.get(p)) {
        case (?l) l;
        case null {
          let l = List.empty<Types.PlayerTournamentResult>();
          gameState.history.add(p, l);
          l;
        };
      };
      l.add(result);
    };
    gameState.tournaments.add({
      tournament = t;
      players = gameState.stats.size();
      excavations;
      staked;
      returned;
      jackpots;
      jackpotPaid;
      payoutTotal;
      forfeited;
      closedAt = Time.now();
    });

    for ((id, po) in gameState.payouts.entries().toArray().values()) {
      if (po.paid and po.tournament + Game.PAYOUT_KEEP < t) gameState.payouts.remove(id);
    };
    for ((p, lost) in settled.values()) {
      gameState.credits.remove(p);
      if (lost > 0) gameState.owed := gSub(gameState.owed, lost);
    };
    gameState.stats.clear();
    gameState.best.clear();
    gameState.tournament := t + 1;
    gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
  };

  // Closes the tournament when its time is up and nothing is in flight. True if it closed now.
  func gCloseIfDue() : Bool {
    if (gameState.endsAt == 0) {
      gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
      return false;
    };
    // While payouts are pending the new tournament's clock does not run: its full duration
    // starts from the moment the last payout is paid or marked paid.
    if (gAnyUnpaid()) {
      gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
      return false;
    };
    if (Time.now() >= gameState.endsAt and not gAnyBusy()) {
      gCloseTournament(false);
      return true;
    };
    false;
  };

  func gMaybeClose() {
    ignore gCloseIfDue();
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
    gMaybeClose();
    gWatchFund();
    gExpireLoads();
    if ((gTicks - 1) % Game.FEE_CHECK_TICKS == 0) await gCheckFee();
    await gWatchBank();
  };

  func gArmTimer<system>() {
    if (gTimerOn) return;
    gTimerOn := true;
    ignore Prim.setTimer<system>(60_000_000_000, true, gTick);
  };

  func gClosing() : Bool {
    gameState.endsAt != 0 and Time.now() >= gameState.endsAt;
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
    let fresh = await lBankRefresh();
    if (not fresh) {
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
    gameState.open.add(p, started);
    if (gCredit(p) < started.stake) {
      gDrop(p, token);
      return #err(Game.NEED_CREDIT_MSG);
    };
    #ok(started);
  };

  // Test wallet and faucet

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
      diamond2Bps = Game.DIAMOND2_BPS;
      diamond3PerGoldao = Game.DIAMOND3_PER_GOLDAO;
      faucetCapE8s = Game.FAUCET_CAP;
      loadMin = Game.LOAD_MIN;
      loadMax = Game.LOAD_MAX;
      creditCapE8s = Game.CREDIT_CAP;
      minPayoutE8s = Game.MIN_PAYOUT;
      top10Bps = Game.TOP10_BPS;
      top10Weights = Game.TOP10_WEIGHTS;
      top10MinVolumeE8s = Game.TOP10_MIN_VOLUME;
      realLedger = gameState.realLedger;
      ledgerId = Ledger.GOLDAO_LEDGER;
      poolSeedE8s = Game.POOL_SEED;
      poolSeedMaxE8s = Game.POOL_SEED_MAX;
    };
  };

  public shared ({ caller }) func gameRequestTestTokens(goldao : Nat) : async Result.Result<Nat, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gameState.realLedger) return #err("The faucet is disabled.");
    if (goldao == 0 or goldao > Game.FAUCET_CAP / Game.E8S) return #err("Enter an amount.");
    let amount = goldao * Game.E8S;
    let used = gFaucetUsed(caller);
    if (used + amount > Game.FAUCET_CAP) {
      let left = Game.sub(Game.FAUCET_CAP, used) / Game.E8S;
      return #err("Cap of " # Nat.toText(Game.FAUCET_CAP / Game.E8S) # " test GOLDAO per tournament reached. Remaining: " # Nat.toText(left) # ".");
    };
    if (gFaucetTotal() + amount > Game.FAUCET_GLOBAL_CAP) {
      return #err("The faucet is empty for this tournament.");
    };
    gameState.faucet.add(caller, (gameState.tournament, used + amount));
    let b = gBalance(caller) + amount;
    gameState.balances.add(caller, b);
    #ok(b);
  };

  public shared ({ caller }) func gameTestApprove(goldao : Nat) : async Result.Result<Nat, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gameState.realLedger) return #err("Authorize from your wallet.");
    let amount = goldao * Game.E8S;
    if (goldao > Game.MAX_APPROVE / Game.E8S) return #err("Amount too large.");
    let b = gBalance(caller);
    if (b < Game.FEE) return #err("You need " # Nat.toText(Game.FEE / Game.E8S) # " GOLDAO to pay the authorization fee.");
    gameState.balances.add(caller, b - Game.FEE);
    gameState.burned += Game.FEE;
    gameState.allowances.add(caller, amount);
    #ok(amount);
  };

  // Credit: the player loads the Accumulated prize from the wallet. It backs every stake.

  public shared ({ caller }) func gameLoadCredit(goldao : Nat) : async Result.Result<Nat, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gCloseIfDue()) return #err(Game.CLOSED_MSG);
    if (gameState.halted) return #err("Bets are paused. Try again later.");
    if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
    if (goldao < Game.LOAD_MIN or goldao > Game.LOAD_MAX) {
      return #err("Choose between " # Nat.toText(Game.LOAD_MIN) # " and " # Nat.toText(Game.LOAD_MAX) # " GOLDAO.");
    };
    let amount = goldao * Game.E8S;
    if (gCredit(caller) + amount > Game.CREDIT_CAP) {
      return #err("Accumulated prize cannot go above " # Nat.toText(Game.CREDIT_CAP / Game.E8S) # " GOLDAO.");
    };
    if (gLoadBusy(caller)) return #err("A load is already in progress.");
    let pending = gameState.pendingLoads.get(caller);
    if (pending == null and gLoadThrottled(caller)) return #err("Too many rejected loads right now. Try again in a minute.");
    // A load that got no answer from the ledger is retried with the same amount and timestamp.
    // The ledger recognizes it and never charges twice. Older than the ledger window: forgotten.
    var stamp = Nat.toNat64(Int.abs(Time.now()));
    switch (pending) {
      case (?pl) {
        if (pl.amount != amount) {
          return #err("Your previous load of " # Nat.toText(pl.amount / Game.E8S) # " GOLDAO is still being confirmed. Load that same amount again.");
        };
        if (stamp < pl.stamp + Game.STAMP_MAX_AGE_NS) stamp := pl.stamp else gLoadForget(caller, pl);
      };
      case null {};
    };
    if (gameState.realLedger) gameState.pendingLoads.add(caller, { amount; stamp });
    gLoading.add(caller, Time.now());
    let res = try { await lLoad(caller, amount, stamp) } finally { gLoading.remove(caller) };
    let need = amount + Game.FEE;
    if (res != #unknown) gameState.pendingLoads.remove(caller);
    switch (res) {
      case (#ok) {
        gameState.credits.add(caller, gCredit(caller) + amount);
        gameState.owed += amount;
        #ok(gCredit(caller));
      };
      case (#allowance) {
        gLoadRejected();
        #err("Authorize the game to charge up to " # Nat.toText(need / Game.E8S) # " GOLDAO.");
      };
      case (#funds) {
        gLoadRejected();
        #err("Insufficient balance: you need " # Nat.toText(need / Game.E8S) # " GOLDAO (amount plus the network fee).");
      };
      case (#down) #err("The ledger is unavailable. Try again later.");
      case (#unknown) {
        gLog(#warning, "load_no_answer", "Load without an answer", "A credit load of " # Nat.toText(amount / Game.E8S) # " GOLDAO from " # Principal.toText(caller) # " got no answer from the ledger. It is retried with the same timestamp, so it cannot be charged twice.");
        #err("The ledger did not answer. Load " # Nat.toText(amount / Game.E8S) # " GOLDAO again: you will not be charged twice.");
      };
    };
  };

  // Play

  public shared ({ caller }) func gamePick(stake : ?Types.StakeOption, expectedStake : Nat, expectedPicks : Nat) : async Result.Result<Types.PickResult, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gCloseIfDue()) return #err(Game.CLOSED_MSG);
    if (gameState.halted) return #err("Bets are paused. Try again later.");

    var ex : Types.Excavation = switch (gameState.open.get(caller)) {
      case (?e) {
        if (e.busy and gFresh(e)) return #err("Wait for the previous pick to finish.");
        if (e.stake == 0 or e.picks >= Game.MAX_PICKS) {
          gDrop(caller, e.token);
          return #err("Try again.");
        };
        // What the player sees must be what the backend has: another tab or device may have moved on.
        if (e.picks != expectedPicks or e.stake != expectedStake) return #err(Game.EXC_CHANGED_MSG);
        if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
        let token = gNextToken();
        let busy = { e with busy = true; token; busyAt = Time.now() };
        gameState.open.add(caller, busy);
        busy;
      };
      case null {
        if (expectedPicks != 0) return #err(Game.EXC_CHANGED_MSG);
        if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
        switch (gOpen(caller, stake)) {
          case (#err m) return #err(m);
          case (#ok(placeholder, idx)) {
            switch (await gStart(caller, placeholder.token, idx, expectedStake)) {
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
    let r3 = Game.bytesToNat(bytes, 8, 4);
    let r4 = Game.bytesToNat(bytes, 12, 8);

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
      if (Game.diamond2Hit(r3)) {
        diamond := { stage = 2; won = 0 };
        if (Game.diamond3Hit(r4, ex.stake)) {
          let (d, n) = gAward(caller, next);
          diamond := d;
          next := n;
        };
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
    gMaybeClose();
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

  public shared ({ caller }) func gameSave() : async Result.Result<Types.EndResult, Text> {
    gArmTimer<system>();
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    let ex = switch (gameState.open.get(caller)) {
      case (?e) e;
      case null return #err("There is no open excavation.");
    };
    if (ex.busy and gFresh(ex)) return #err("Wait for the pick to finish.");
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
    if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
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
        switch (await gStart(caller, placeholder.token, idx, expectedStake)) {
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
          if (Game.diamond2Hit(rng.below(10_000))) {
            stage := 2;
            if (Game.diamond3Hit(rng.below(Game.DIAMOND3_BASE), ex.stake)) stage := 3;
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
        if (stage == 3) {
          let (r, n) = gAward(caller, cur);
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
    var pending = 0;
    for ((_, po) in gameState.payouts.entries()) {
      if (po.to == caller and not po.paid) pending += po.amount;
    };
    let open = switch (gameState.open.get(caller)) {
      case (?e) if (e.stake > 0 and e.picks > 0) ?gView(e) else null;
      case null null;
    };
    let stakes = gStakes();
    {
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      paused = gPaused();
      stakes;
      balance = gBalance(caller);
      allowance = gAllowance(caller);
      credit = gCredit(caller);
      pendingPayout = pending;
      pool = gameState.pool;
      top10Pool = gameState.top10;
      top10Rank = gRankOf(caller);
      top10Prize = Game.top10Prize(gameState.top10, gRankOf(caller), gStats(caller).staked);
      top10Entry = gTopEntry();
      faucetRemaining = Game.sub(Game.FAUCET_CAP, gFaucetUsed(caller));
      open;
      stats = gStats(caller);
      bestReturn = switch (gameState.best.get(caller)) { case (?v) v; case null 0 };
      history = switch (gameState.history.get(caller)) { case (?l) l.toArray(); case null [] };
    };
  };

  public query func gameRanking() : async Types.Ranking {
    var staked = 0;
    let rows = List.empty<Types.PlayerRow>();
    for ((p, s) in gameState.stats.entries()) {
      staked += s.staked;
      rows.add({ player = p; excavations = s.excavations; staked = s.staked; returned = s.returned; jackpotWon = s.jackpotWon; bestPoints = s.bestPoints; bestReturn = switch (gameState.best.get(p)) { case (?v) v; case null 0 }; deepest = s.deepest; rank = 0; prize = 0 });
    };
    let sorted = Array.sort(
      rows.toArray(),
      func(a : Types.PlayerRow, b : Types.PlayerRow) : { #less; #equal; #greater } {
        if (gBetter((a.player, a.staked), (b.player, b.staked))) #less else #greater;
      },
    );
    let ranked = Array.tabulate<Types.PlayerRow>(
      sorted.size(),
      func(i : Nat) : Types.PlayerRow {
        let r = sorted[i];
        { r with rank = i + 1; prize = Game.top10Prize(gameState.top10, i + 1, r.staked) };
      },
    );
    {
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      pool = gameState.pool;
      top10Pool = gameState.top10;
      lastTop10 = gameState.lastTop10;
      staked;
      totalPlayers = ranked.size();
      players = if (ranked.size() > 200) Array.sliceToArray(ranked, 0, 200) else ranked;
      jackpots = gameState.jackpots;
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
        if (c < Game.MIN_PAYOUT) {
          small += c;
          smallPlayers += 1;
        };
      };
    };
    var inPlay = 0;
    for ((_, e) in gameState.open.entries()) { inPlay += e.held };
    let stakes = gStakes();
    let all = gameState.payouts.values().toArray();
    // Every unpaid payout is always listed (the admin panel decides what to pay from this list);
    // only the paid history is limited to the latest 200.
    let shownPayouts = do {
      let kept = List.empty<Types.Payout>();
      var paidKept = 0;
      var i = all.size();
      while (i > 0) {
        i -= 1;
        let po = all[i];
        if (not po.paid) kept.add(po) else if (paidKept < 200) {
          kept.add(po);
          paidKept += 1;
        };
      };
      kept.reverseInPlace();
      kept.toArray();
    };
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
      unpaidPayouts = gUnpaidTotal();
      pool = gameState.pool;
      reserve = gameState.reserve;
      cycles = gameState.cycles;
      top10 = gameState.top10;
      burned = gameState.burned;
      fund = gFund();
      withdrawable = gWithdrawable();
      stakes;
      paused = gPaused();
      staked;
      bankAllowance = gameState.bankAllowance;
      bankAccount = gameState.bankAccount;
      selfId = gameState.selfId;
      payouts = shownPayouts;
      lastClose = if (tn == 0) null else gameState.tournaments.get(tn - 1);
    });
  };

  public shared ({ caller }) func gameAdminCloseTournament() : async Result.Result<(), Text> {
    gArmTimer<system>();
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gAnyUnpaid()) return #err("Pay or resolve the pending payouts of the previous tournament first.");
    if (gAnyBusy()) return #err("Excavations in progress. Try again in a few seconds.");
    gCloseTournament(false);
    #ok(());
  };

  public shared ({ caller }) func gameAdminCloseAll() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gameState.halted) return #err("Pause new excavations first.");
    if (gAnyBusy()) return #err("Excavations in progress. Try again in a few seconds.");
    gCloseTournament(true);
    #ok(());
  };

  public shared ({ caller }) func gameAdminSetDuration(days : Nat) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (days == 0 or days > Game.MAX_DURATION_DAYS) return #err("Duration must be between 1 and 60 days.");
    gameState.durationDays := days;
    #ok(());
  };

  public shared ({ caller }) func gameAdminSeedPool(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let target = goldao * Game.E8S;
    if (target < Game.POOL_SEED or target > Game.POOL_SEED_MAX) return #err("Choose a pool between 5,000 and 20,000 GOLDAO.");
    if (gameState.pool >= target) return #err("The jackpot pool is already at or above that amount.");
    let amount = target - gameState.pool;
    let after : Int = gFund() - amount;
    if (after < Game.FUND_FLOOR) return #err("The bank fund would fall below its floor.");
    gameState.pool += amount;
    gFundReset();
    gLogAction("seed_pool", "Jackpot pool topped up", "The pool was raised to " # SecLog.fmt(gameState.pool) # " GOLDAO from the bank fund.");
    #ok(gameState.pool);
  };

  public shared ({ caller }) func gameAdminTestDeposit(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #err("Not available with the real ledger.");
    if (Array.indexOf<Nat>(Game.TEST_DEPOSITS, Nat.equal, goldao) == null) return #err("Choose one of the listed amounts.");
    gameState.bank += goldao * Game.E8S;
    #ok(gameState.bank);
  };

  // Common start of every payment action. Returns an error text, or null when payments may go
  // ahead; in that case the caller must clear payingSince when it is done. `needed` is the amount
  // (with fees) that the bank authorization must cover in simulated mode.
  func gPayBegin(needed : Nat) : async ?Text {
    let now = Time.now();
    if (gameState.payingSince != 0 and now - gameState.payingSince < Game.BUSY_STALE_NS) {
      return ?"A payment run is in progress.";
    };
    if (gameState.saturations > 0 or not gAccountingOk()) return ?"Accounting check failed. Payments are blocked.";
    gameState.payingSince := now;
    if (gameState.realLedger and not (await lBankRefresh())) {
      gameState.payingSince := 0;
      return ?"The ledger is unavailable.";
    };
    if (gameState.saturations > 0 or not gAccountingOk() or gUnpaidTotal() > gameState.bank) {
      gameState.payingSince := 0;
      return ?"Accounting check failed. Payments are blocked.";
    };
    if (not gameState.realLedger and gameState.bankAllowance < needed) {
      let total = gUnpaidTotal();
      if (gameState.bank < total + Game.FEE) {
        gameState.payingSince := 0;
        return ?"The bank wallet does not cover the pending payouts.";
      };
      gameState.bank := gSub(gameState.bank, Game.FEE);
      gameState.burned += Game.FEE;
      gameState.bankAllowance := total;
    };
    null;
  };

  // Ends a payment action: in real mode the bank is read again so the books match the ledger.
  func gPayEnd() : async () {
    if (gameState.realLedger) { ignore await lBankRefresh() };
    gameState.payingSince := 0;
  };

  func gPayLogLine(id : Nat, to : Principal, amount : Nat, txId : ?Nat) {
    gLogAction(
      "payout_sent",
      "Payout sent",
      "Payout #" # Nat.toText(id) # ": " # SecLog.fmt(amount) # " GOLDAO to " # Principal.toText(to) # (switch (txId) { case (?t) ", ledger transaction " # Nat.toText(t); case null ", simulated" }) # ".",
    );
  };

  // Free checks for the admin panel: the same refusals the action itself would give, answered
  // before the wallet signs an authorization (which costs a network fee even if the action is
  // then refused). Read-only; the action still validates everything on its own.
  func gBusyNow() : Bool {
    gameState.payingSince != 0 and Time.now() - gameState.payingSince < Game.BUSY_STALE_NS;
  };

  public shared query ({ caller }) func gameAdminCheckPay() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gBusyNow()) return #err("A payment run is in progress.");
    if (gameState.saturations > 0 or not gAccountingOk()) return #err("Accounting check failed. Payments are blocked.");
    if (gUnpaidTotal() == 0) return #err("There are no pending payouts.");
    #ok(());
  };

  public shared query ({ caller }) func gameAdminCheckWithdraw(kind : Types.WithdrawKind) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gBusyNow()) return #err("A money movement is in progress.");
    switch (gWithdrawBlocked(kind)) { case (?m) return #err(m); case null {} };
    let spendable = Game.sub(gameState.bank, Game.FEE);
    let amount = switch (kind) {
      case (#all) spendable;
      case (#available) Nat.min(gWithdrawable(), spendable);
    };
    if (amount == 0) return #err("Nothing to withdraw.");
    #ok(());
  };

  // Pays pending payouts, smallest first, at most `max` of them (and never more than PAY_BATCH).
  public shared ({ caller }) func gameAdminPay(max : Nat) : async Result.Result<{ paid : Nat; failed : Nat; remaining : Nat }, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    switch (await gPayBegin(gUnpaidTotal())) { case (?m) return #err(m); case null {} };
    let pending = Array.sort(
      gameState.payouts.values().filter(func(po : Types.Payout) : Bool { not po.paid }).toArray(),
      func(a : Types.Payout, b : Types.Payout) : { #less; #equal; #greater } {
        switch (Nat.compare(a.amount, b.amount)) {
          case (#equal) Nat.compare(a.id, b.id);
          case (o) o;
        };
      },
    );
    let limit = if (max == 0) Game.PAY_BATCH else Nat.min(max, Game.PAY_BATCH);
    var paid = 0;
    var failed = 0;
    var firstError : ?Text = null;
    var handled = 0;
    // Smaller payouts go first. When one does not fit the funds or the authorization, every
    // bigger one would fail too, so the run ends there and they stay pending.
    var stop = false;
    for (po in pending.values()) {
      if (not stop and handled < limit) {
        handled += 1;
        switch (await lPay(po.id, false)) {
          case (#ok txId) {
            if (gMarkPaid(po.id, txId)) {
              paid += 1;
              gPayLogLine(po.id, po.to, po.amount, txId);
            };
          };
          case (#err m) {
            failed += 1;
            if (firstError == null) firstError := ?m;
            if (m == Game.ERR_PAY_FUNDS or m == Game.ERR_PAY_ALLOWANCE) stop := true;
          };
        };
      };
    };
    await gPayEnd();
    var remaining = 0;
    for ((_, po) in gameState.payouts.entries()) { if (not po.paid) remaining += 1 };
    if (paid == 0 and failed > 0) {
      return #err(switch (firstError) { case (?m) m; case null "Payment failed." });
    };
    #ok({ paid; failed; remaining });
  };

  // Pays one payout. `renew` is only for an uncertain payout whose timestamp expired and that the
  // admin has checked in the ledger: it was NOT sent, so it gets a new timestamp.
  public shared ({ caller }) func gameAdminPayOne(id : Nat, renew : Bool) : async Result.Result<?Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let po = switch (gameState.payouts.get(id)) { case (?po) po; case null return #err("Payout not found.") };
    if (po.paid) return #err("Already paid.");
    switch (await gPayBegin(po.amount + Game.FEE)) { case (?m) return #err(m); case null {} };
    let res = await lPay(id, renew);
    let out : Result.Result<?Nat, Text> = switch (res) {
      case (#ok txId) {
        if (gMarkPaid(id, txId)) gPayLogLine(id, po.to, po.amount, txId);
        #ok(txId);
      };
      case (#err m) #err(m);
    };
    await gPayEnd();
    out;
  };

  // The admin sent an uncertain payout by other means, or found it in the ledger: it is recorded
  // as paid with its transaction id. Only for payouts that are flagged uncertain.
  public shared ({ caller }) func gameAdminMarkPaid(id : Nat, txId : Nat) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gameState.realLedger) return #err("Only with the real ledger.");
    let po = switch (gameState.payouts.get(id)) { case (?po) po; case null return #err("Payout not found.") };
    if (po.paid) return #err("Already paid.");
    if (not po.uncertain) return #err("Only a payout without a confirmed answer can be marked as paid.");
    let now = Time.now();
    if (gameState.payingSince != 0 and now - gameState.payingSince < Game.BUSY_STALE_NS) {
      return #err("A payment run is in progress.");
    };
    if (gMarkPaid(id, ?txId)) {
      gUncertain := true;
      gameState.movSeq += 1;
      gPayLogLine(id, po.to, po.amount, ?txId);
      gLogAction("payout_marked", "Payout marked as paid", "Payout #" # Nat.toText(id) # " was recorded as paid by the admin with ledger transaction " # Nat.toText(txId) # ".");
    };
    ignore await lBankRefresh();
    #ok(());
  };

  // Every payout of one tournament, for the payment log.
  public shared query ({ caller }) func gameAdminPayouts(tournament : Nat) : async Result.Result<[Types.Payout], Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    #ok(gameState.payouts.values().filter(func(po : Types.Payout) : Bool { po.tournament == tournament }).toArray());
  };

  func gWithdrawBlocked(kind : Types.WithdrawKind) : ?Text {
    if (gameState.saturations > 0 or not gAccountingOk()) return ?"Accounting check failed. Withdrawals are blocked.";
    switch (kind) {
      case (#all) {
        if (not gameState.halted) return ?"Pause new excavations first.";
        if (gameState.owed != 0 or gameState.open.size() != 0 or gameState.credits.size() != 0 or gUnpaidTotal() != 0) {
          return ?"Pay all debts and wait for open excavations to end first.";
        };
      };
      case (#available) {};
    };
    null;
  };

  func lWithdraw(amount : Nat) : async Result.Result<?Nat, Text> {
    gameState.movSeq += 1;
    if (not gameState.realLedger) {
      let need = amount + Game.FEE;
      if (gameState.bank < need) return #err("Above the available amount.");
      gameState.bank := gSub(gameState.bank, need);
      gameState.burned += Game.FEE;
      gameState.movSeq += 1;
      return #ok(null);
    };
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #err("Ledger mode is not configured.") };
    let answer = await lTransfer(bankAcct, Game.treasury(), amount, Nat.toNat64(Int.abs(Time.now())));
    gameState.movSeq += 1;
    switch (answer) {
      case null {
        gLog(#warning, "withdraw_no_answer", "Withdrawal without an answer", "A withdrawal of " # SecLog.fmt(amount) # " GOLDAO got no answer from the ledger. It may have been sent: refresh the bank and check the treasury before trying again.");
        #err("The ledger did not answer. Refresh the bank and check the treasury before trying again.");
      };
      case (?(#Ok idx)) {
        gameState.bank := gSub(gameState.bank, amount + Game.FEE);
        gameState.burned += Game.FEE;
        #ok(?idx);
      };
      case (?(#Err(#InsufficientAllowance _))) #err("The withdrawal authorization is too low.");
      case (?(#Err(#InsufficientFunds _))) #err("The bank wallet does not cover the withdrawal.");
      case (?(#Err _)) #err("The ledger rejected the withdrawal.");
    };
  };

  public shared ({ caller }) func gameAdminWithdraw(kind : Types.WithdrawKind) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let now = Time.now();
    if (gameState.payingSince != 0 and now - gameState.payingSince < Game.BUSY_STALE_NS) {
      return #err("A money movement is in progress.");
    };
    switch (gWithdrawBlocked(kind)) { case (?m) return #err(m); case null {} };
    gameState.payingSince := now;
    if (gameState.realLedger and not (await lBankRefresh())) {
      gameState.payingSince := 0;
      return #err("The ledger is unavailable.");
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
    let txId : ?Nat = switch (res) {
      case (#err m) return #err(m);
      case (#ok t) t;
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
    if (gameState.realLedger) { ignore await lBankRefresh() };
    gFundReset();
    gLogAction("withdraw", "Admin withdrawal", "Withdrew " # SecLog.fmt(amount) # " GOLDAO to the treasury (" # (switch (kind) { case (#all) "everything"; case (#available) "available excess" }) # ")" # (switch (txId) { case (?t) ", ledger transaction " # Nat.toText(t); case null "" }) # ".");
    #ok(amount);
  };

  public shared ({ caller }) func gameAdminRefreshBank() : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not (await lBankRefresh())) return #err("The ledger is unavailable.");
    #ok(gameState.bank);
  };

  public shared ({ caller }) func gameAdminReleaseBusy(player : Principal) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    switch (gameState.open.get(player)) {
      case (?e) {
        if (gFresh(e)) return #err("The pick is still in progress.");
        if (e.picks == 0) gDrop(player, e.token) else gameState.open.add(player, { e with busy = false; token = 0 });
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
    if (gameState.halted) {
      gLogAction("resume", "Resumed by admin", "Play resumed. It had been halted: " # Game.haltReason(gameState.haltCode) # ".");
    };
    gameState.halted := false;
    gameState.haltCode := 0;
    gFundReset();
    gameState.resumedAt := Time.now();
    gameState.ledgerFails := 0;
    #ok(());
  };

  public shared ({ caller }) func gameAdminLedgerBalance(who : Principal) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    try { #ok(await Ledger.ledger().icrc1_balance_of(Ledger.account(who))) } catch (_) { #err("The ledger is unavailable.") };
  };

  public shared ({ caller }) func gameAdminLedgerAllowance(who : Principal, spender : Principal) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    try {
      let a = await Ledger.ledger().icrc2_allowance({ account = Ledger.account(who); spender = Ledger.account(spender) });
      #ok(a.allowance);
    } catch (_) { #err("The ledger is unavailable.") };
  };

  public shared ({ caller }) func gameAdminSetRealLedger(selfId : Principal) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #err("Already using the real ledger.");
    if (Principal.isAnonymous(selfId)) return #err("Invalid principal.");
    let idle = func() : Bool {
      gameState.owed == 0 and gameState.open.size() == 0 and gameState.credits.size() == 0
      and gameState.pendingLoads.size() == 0
      and gameState.payouts.values().filter(func(po : Types.Payout) : Bool { not po.paid }).toArray().size() == 0;
    };
    if (not idle()) return #err("The game must be empty: close the tournament and pay everything first.");
    let bankAccount = caller;
    let balance = try {
      let fee = await Ledger.ledger().icrc1_fee();
      if (fee != Game.FEE) return #err("The ledger fee differs from the game fee.");
      await Ledger.ledger().icrc1_balance_of(Ledger.account(bankAccount));
    } catch (_) { return #err("The ledger is unavailable.") };
    if (not idle()) return #err("The game changed. Try again.");
    gameState.bankAccount := ?bankAccount;
    gameState.selfId := ?selfId;
    gameState.pool := 0;
    gameState.reserve := 0;
    gameState.cycles := 0;
    gameState.top10 := 0;
    gameState.lastTop10 := [];
    gameState.burned := 0;
    gameState.loaded.clear();
    // Fresh start: all test statistics, history and tournaments are erased.
    gameState.stats.clear();
    gameState.best.clear();
    gameState.history.clear();
    gameState.blocked.clear();
    gameState.tournaments.clear();
    gameState.payouts.clear();
    gameState.pendingLoads.clear();
    gameState.jackpots := [];
    gameState.tournament := 1;
    gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
    Map.clear(gameState.balances);
    Map.clear(gameState.allowances);
    Map.clear(gameState.faucet);
    gameState.bank := balance;
    gameState.bankAllowance := 0;
    gameState.realLedger := true;
    gFundReset();
    gLogAction("real_ledger", "Real ledger enabled", "The game now uses real GOLDAO. Bank balance: " # SecLog.fmt(balance) # " GOLDAO.");
    #ok(balance);
  };
};
