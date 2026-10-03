import Types "../types/game";
import Game "../lib/game";
import Ledger "../lib/ledger";
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

mixin (
  gameState : Types.GameState,
  accessControlState : Types.AccessControlState,
) {

  transient var gSat : Nat = 0;

  func gSub(a : Nat, b : Nat) : Nat {
    if (b > a) {
      gSat += 1;
      return 0;
    };
    a - b;
  };

  func gUnpaidTotal() : Nat {
    var t = 0;
    for ((_, po) in gameState.payouts.entries()) {
      if (not po.paid) t += po.amount + Game.FEE;
    };
    t;
  };

  func gAccountingOk() : Bool {
    var credits = 0;
    for ((_, c) in gameState.credits.entries()) { credits += c };
    var held = 0;
    for ((_, e) in gameState.open.entries()) { held += e.held };
    gameState.owed == credits + held + gUnpaidTotal();
  };

  func gIsAdmin(p : Principal) : Bool {
    if (Game.isBootstrapAdmin(p)) return true;
    switch (accessControlState.userRoles.get(p)) {
      case (?#admin) true;
      case _ false;
    };
  };

  func gRequireUser(caller : Principal) : ?Text {
    if (Principal.isAnonymous(caller)) ?"Sign in with Internet Identity." else null;
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
    Game.fund(gameState.bank, gameState.owed, gameState.pool, gameState.reserve, gameState.cycles);
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

  func gBlocked(p : Principal) : Bool {
    switch (gameState.blocked.get(p)) { case (?_) true; case null false };
  };

  func gPaused() : Bool {
    gameState.halted or gStakes().size() == 0;
  };

  func gHalt(code : Nat) {
    if (gameState.halted) return;
    gameState.halted := true;
    gameState.haltCode := code;
    gameState.haltedAt := Time.now();
  };

  func gFlagsSince(from : Int) : Nat {
    var n = 0;
    for ((_, at) in gameState.blocked.entries()) {
      if (Nat.toInt(at) >= from and Nat.toInt(at) >= gameState.resumedAt) n += 1;
    };
    n;
  };

  func gBreakerCheck() {
    let now = Time.now();
    if (gFlagsSince(now - gameState.breakerWindowNs) >= gameState.breakerMax) gHalt(1);
    if (gFlagsSince(now - Game.DAY_NS) >= gameState.breakerMax * 4) gHalt(1);
  };

  func gLedgerOk() { gameState.ledgerFails := 0 };

  func gLedgerFail() {
    gameState.ledgerFails += 1;
    if (gameState.ledgerFails >= Game.LEDGER_FAIL_MAX) gHalt(2);
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

  func gDue(p : Principal, stake : Nat, points : Nat) : Nat {
    let g = Game.gross(stake, points);
    if (g >= stake) 0 else Game.sub(Game.sub(stake, g), gCredit(p));
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

  func lBankRefresh() : async Bool {
    if (not gameState.realLedger) return true;
    let acct = switch (gameState.bankAccount) { case (?a) a; case null return false };
    var tries = 0;
    while (tries < 3) {
      let before = gameState.movSeq;
      let bal = try { ?(await Ledger.ledger().icrc1_balance_of(Ledger.account(acct))) } catch (_) { null };
      switch (bal) {
        case (?b) {
          gLedgerOk();
          if (gameState.movSeq == before) {
            gameState.bank := b;
            return true;
          };
        };
        case null {
          gLedgerFail();
          return false;
        };
      };
      tries += 1;
    };
    false;
  };

  func lPlayerCheck(p : Principal, need : Nat) : async Types.Check {
    if (not gameState.realLedger) {
      let a = gAllowance(p);
      if (a < need) return #allowance(a);
      let b = gBalance(p);
      if (b < need) return #balance(b);
      return #ok;
    };
    let spender = switch (gameState.selfId) { case (?s) s; case null return #down };
    try {
      let al = await Ledger.ledger().icrc2_allowance({ account = Ledger.account(p); spender = Ledger.account(spender) });
      if (al.allowance < need) return #allowance(al.allowance);
      let b = await Ledger.ledger().icrc1_balance_of(Ledger.account(p));
      gLedgerOk();
      if (b < need) return #balance(b);
      #ok;
    } catch (_) {
      gLedgerFail();
      #down;
    };
  };

  func lCharge(p : Principal, amount : Nat) : async Types.Charge {
    if (amount == 0) return #ok;
    gameState.movSeq += 1;
    if (not gameState.realLedger) {
      let need = amount + Game.FEE;
      if (gAllowance(p) < need or gBalance(p) < need) return #funds;
      gameState.balances.add(p, gSub(gBalance(p), need));
      gameState.allowances.add(p, gSub(gAllowance(p), need));
      gameState.bank += amount;
      gameState.burned += Game.FEE;
      gameState.movSeq += 1;
      return #ok;
    };
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #down };
    let stamp = Nat.toNat64(Int.abs(Time.now()));
    try {
      let res = await Ledger.ledger().icrc2_transfer_from({
        spender_subaccount = null;
        from = Ledger.account(p);
        to = Ledger.account(bankAcct);
        amount;
        fee = ?Game.FEE;
        memo = null;
        created_at_time = ?stamp;
      });
      gameState.movSeq += 1;
      switch (res) {
        case (#Ok _) {
          gLedgerOk();
          gameState.bank += amount;
          #ok;
        };
        case (#Err(#InsufficientFunds _)) #funds;
        case (#Err(#InsufficientAllowance _)) #funds;
        case (#Err _) {
          gLedgerFail();
          #down;
        };
      };
    } catch (_) {
      gameState.movSeq += 1;
      gLedgerFail();
      #down;
    };
  };

  func lPay(to : Principal, amount : Nat, id : Nat, stamp : Nat64) : async Result.Result<(), Text> {
    gameState.movSeq += 1;
    let need = amount + Game.FEE;
    if (not gameState.realLedger) {
      if (gameState.bank < need) return #err("The bank wallet does not cover the payout.");
      if (gameState.bankAllowance < need) return #err("The payout authorization is too low.");
      gameState.bank := gSub(gameState.bank, need);
      gameState.bankAllowance := gSub(gameState.bankAllowance, need);
      gameState.balances.add(to, gBalance(to) + amount);
      gameState.burned += Game.FEE;
      gameState.movSeq += 1;
      return #ok;
    };
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #err("Ledger mode is not configured.") };
    try {
      let res = await Ledger.ledger().icrc2_transfer_from({
        spender_subaccount = null;
        from = Ledger.account(bankAcct);
        to = Ledger.account(to);
        amount;
        fee = ?Game.FEE;
        memo = null;
        created_at_time = ?stamp;
      });
      gameState.movSeq += 1;
      switch (res) {
        case (#Ok _) {
          gameState.bank := gSub(gameState.bank, need);
          #ok;
        };
        case (#Err(#Duplicate _)) {
          gameState.bank := gSub(gameState.bank, need);
          #ok;
        };
        case (#Err(#TooOld)) {
          switch (gameState.payouts.get(id)) {
            case (?po) gameState.payouts.add(id, { po with stamp = Nat.toNat64(Int.abs(Time.now())) });
            case null {};
          };
          #err("Payout timestamp expired. Run the payment again.");
        };
        case (#Err(#InsufficientFunds _)) #err("The bank wallet does not cover the payout.");
        case (#Err(#InsufficientAllowance _)) #err("The payout authorization is too low.");
        case (#Err _) #err("The ledger rejected the payout.");
      };
    } catch (_) {
      gameState.movSeq += 1;
      #err("The ledger is unavailable.");
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

  func gRecoverCharge(p : Principal, amount : Nat) {
    gameState.credits.add(p, gCredit(p) + amount);
    gameState.owed += amount;
  };

  func gAward(p : Principal, e : Types.Excavation) : (Types.DiamondResult, Types.Excavation) {
    let won = gameState.pool;
    if (won == 0) return ({ stage = 2; won = 0 }, e);
    let seed = Nat.min(Game.POOL_SEED, gameState.reserve);
    gameState.reserve := gSub(gameState.reserve, seed);
    gameState.pool := seed;
    gameState.owed += won;
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

  func gSettle(p : Principal, e : Types.Excavation, points : Nat, kind : Types.EndKind, charged : Nat) : Types.EndResult {
    let stake = e.stake;
    let g = Game.gross(stake, points);
    gameState.pool += stake * Game.POOL_BPS / 10_000;
    gameState.reserve += stake * Game.RESERVE_BPS / 10_000;
    if (gameState.reserve > Game.RESERVE_CAP) {
      gameState.pool += gameState.reserve - Game.RESERVE_CAP;
      gameState.reserve := Game.RESERVE_CAP;
    };
    gameState.cycles += stake * Game.CYCLES_BPS / 10_000;

    var won = 0;
    var lost = 0;
    var taken = 0;
    if (g >= stake) {
      won := g - stake;
      gameState.credits.add(p, gCredit(p) + won);
      gameState.owed += won;
      if (charged > 0) gRecoverCharge(p, charged);
    } else {
      lost := stake - g;
      let c = gCredit(p);
      let fromCredit = Nat.min(c, lost);
      gameState.credits.add(p, c - fromCredit);
      gameState.owed := gSub(gameState.owed, fromCredit);
      let need = lost - fromCredit;
      taken := Nat.min(charged, need);
      if (charged > need) gRecoverCharge(p, charged - need);
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
        charged = s.charged + taken;
        collapses = s.collapses + (if (kind == #collapsed) 1 else 0);
        bestPoints = if (kind == #collapsed) s.bestPoints else Nat.max(s.bestPoints, points);
        deepest = Nat.max(s.deepest, e.picks);
      },
    );
    gameState.open.remove(p);
    {
      kind;
      picks = e.picks;
      points;
      stake;
      gross = g;
      won;
      lost;
      charged = taken;
      jackpotWon = e.jackpotWon;
      credit = gCredit(p);
      balance = gBalance(p);
    };
  };

  func gNote(p : Principal) {
    gameState.blocked.add(p, Int.abs(Time.now()));
    gBreakerCheck();
  };

  // Tournament lifecycle

  func gCloseTournament() {
    let t = gameState.tournament;
    for ((p, e) in gameState.open.entries().toArray().values()) {
      if (Game.canSave(e.picks) and e.stake > 0 and gDue(p, e.stake, Game.pointsAt(e.picks)) == 0) {
        let f = gFlush(p, e);
        ignore gSettle(p, f, Game.pointsAt(f.picks), #saved, 0);
      } else {
        gReleaseHeld(e);
        gameState.open.remove(p);
      };
    };

    var payoutTotal = 0;
    var forfeited = 0;
    for ((p, c) in gameState.credits.entries().toArray().values()) {
      if (c > Game.FEE) {
        let id = gameState.nextPayoutId;
        gameState.nextPayoutId += 1;
        gameState.payouts.add(id, { id; tournament = t; to = p; amount = c - Game.FEE; paid = false; stamp = Nat.toNat64(Int.abs(Time.now())) });
        payoutTotal += c - Game.FEE;
      } else {
        gameState.owed := gSub(gameState.owed, c);
        forfeited += c;
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
      let result : Types.PlayerTournamentResult = { tournament = t; stats = s; credit; payout = if (credit > Game.FEE) credit - Game.FEE else 0 };
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
      if (po.paid and po.tournament + 1 < t) gameState.payouts.remove(id);
    };
    gameState.credits.clear();
    gameState.stats.clear();
    gameState.tournament := t + 1;
    gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
  };

  func gMaybeClose() {
    if (gameState.endsAt == 0) {
      gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
      return;
    };
    if (Time.now() >= gameState.endsAt and not gAnyBusy()) gCloseTournament();
  };

  func gClosing() : Bool {
    gameState.endsAt != 0 and Time.now() >= gameState.endsAt;
  };

  func gOpen(p : Principal, option : ?Types.StakeOption) : Result.Result<(Types.Excavation, Nat), Text> {
    if (gBlocked(p)) return #err("Your account is under review. Contact the admins.");
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

  func gStart(p : Principal, token : Nat, idx : Nat) : async Result.Result<Types.Excavation, Text> {
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
    let started : Types.Excavation = switch (gSame(p, token)) {
      case (?e) ({ e with stake = options[idx]; tournament = gameState.tournament });
      case null return #err("Your excavation changed. Try again.");
    };
    gameState.open.add(p, started);
    let credit = gCredit(p);
    if (credit < started.stake) {
      let need = Game.sub(started.stake, credit) + Game.FEE;
      let chk = await lPlayerCheck(p, need);
      if (chk != #ok) {
        gDrop(p, token);
        return #err(gCheckMessage(chk, need));
      };
      switch (gSame(p, token)) {
        case (?e) return #ok(e);
        case null return #err("Your excavation changed. Try again.");
      };
    };
    #ok(started);
  };

  func gCheckMessage(c : Types.Check, need : Nat) : Text {
    switch (c) {
      case (#allowance _) "Authorize the game to charge up to " # Nat.toText(need / Game.E8S) # " GOLDAO.";
      case (#balance _) "Insufficient balance: you need " # Nat.toText(need / Game.E8S) # " GOLDAO.";
      case (#down) "The ledger is unavailable. Try again later.";
      case (#ok) "";
    };
  };

  // Test wallet and faucet

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
      realLedger = gameState.realLedger;
      ledgerId = Ledger.GOLDAO_LEDGER;
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

  // Play

  public shared ({ caller }) func gamePick(stake : ?Types.StakeOption) : async Result.Result<Types.PickResult, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    gMaybeClose();
    if (gameState.halted) return #err("Bets are paused. Try again later.");

    var ex : Types.Excavation = switch (gameState.open.get(caller)) {
      case (?e) {
        if (e.busy and gFresh(e)) return #err("Wait for the previous pick to finish.");
        if (e.stake == 0 or e.picks >= Game.MAX_PICKS) {
          gDrop(caller, e.token);
          return #err("Try again.");
        };
        if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
        let token = gNextToken();
        let busy = { e with busy = true; token; busyAt = Time.now() };
        gameState.open.add(caller, busy);
        busy;
      };
      case null {
        if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
        switch (gOpen(caller, stake)) {
          case (#err m) return #err(m);
          case (#ok(placeholder, idx)) {
            switch (await gStart(caller, placeholder.token, idx)) {
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

    let credit = gCredit(caller);
    if (credit < ex.stake) {
      let need = Game.sub(ex.stake, credit) + Game.FEE;
      let chk = await lPlayerCheck(caller, need);
      ex := switch (gSame(caller, token)) {
        case (?e) e;
        case null return #err("Your excavation changed. Try again.");
      };
      if (chk != #ok) {
        gDrop(caller, token);
        return #err(gCheckMessage(chk, need));
      };
    };

    let r1 = Game.bytesToNat(bytes, 0, 4);
    let r2 = Game.bytesToNat(bytes, 4, 4);
    let r3 = Game.bytesToNat(bytes, 8, 4);
    let r4 = Game.bytesToNat(bytes, 12, 8);

    if (Game.collapseHit(ex.picks, r1)) {
      let points = Game.collapsePoints(ex.picks);
      let due = gDue(caller, ex.stake, points);
      var charged = 0;
      if (due > 0) {
        let res = await lCharge(caller, due);
        ex := switch (gSame(caller, token)) {
          case (?e) e;
          case null {
            if (res == #ok) gRecoverCharge(caller, due);
            return #err("Your excavation changed. Try again.");
          };
        };
        switch (res) {
          case (#ok) { charged := due };
          case (#funds) {
            gNote(caller);
            gDrop(caller, token);
            return #err("Excavation cancelled: the funds were not available.");
          };
          case (#down) {
            gDrop(caller, token);
            return #err("Excavation cancelled: the ledger is unavailable.");
          };
        };
      };
      let f = gFlush(caller, ex);
      let end = gSettle(caller, f, points, #collapsed, charged);
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
      let end = gSettle(caller, f, Game.pointsAt(next.picks), #maxed, 0);
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
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    let ex = switch (gameState.open.get(caller)) {
      case (?e) e;
      case null return #err("There is no open excavation.");
    };
    if (ex.busy and gFresh(ex)) return #err("Wait for the pick to finish.");
    if (ex.stake == 0 or not Game.canSave(ex.picks)) return #err("The first two picks are free: you can save from the third one.");
    let points = Game.pointsAt(ex.picks);
    if (gDue(caller, ex.stake, points) > 0) return #err("Keep digging.");
    let f = gFlush(caller, ex);
    let end = gSettle(caller, f, points, #saved, 0);
    gMaybeClose();
    #ok(end);
  };

  public shared ({ caller }) func gameAuto(stake : Types.StakeOption, stopAt : Nat) : async Result.Result<Types.AutoResult, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    gMaybeClose();
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
        switch (await gStart(caller, placeholder.token, idx)) {
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

    let credit = gCredit(caller);
    if (credit < ex.stake) {
      let need = Game.sub(ex.stake, credit) + Game.FEE;
      let chk = await lPlayerCheck(caller, need);
      ex := switch (gSame(caller, token)) {
        case (?e) e;
        case null return #err("Your excavation changed. Try again.");
      };
      if (chk != #ok) {
        gDrop(caller, token);
        return #err(gCheckMessage(chk, need));
      };
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

    let due = gDue(caller, ex.stake, points);
    var charged = 0;
    if (due > 0) {
      let res = await lCharge(caller, due);
      ex := switch (gSame(caller, token)) {
        case (?e) e;
        case null {
          if (res == #ok) gRecoverCharge(caller, due);
          return #err("Your excavation changed. Try again.");
        };
      };
      switch (res) {
        case (#ok) { charged := due };
        case (#funds) {
          gNote(caller);
          gDrop(caller, token);
          return #err("Excavation cancelled: the funds were not available.");
        };
        case (#down) {
          gDrop(caller, token);
          return #err("Excavation cancelled: the ledger is unavailable.");
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
    let end = gSettle(caller, f, points, kind, charged);
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
      blocked = gBlocked(caller);
      stakes;
      balance = gBalance(caller);
      allowance = gAllowance(caller);
      credit = gCredit(caller);
      pendingPayout = pending;
      pool = gameState.pool;
      faucetRemaining = Game.sub(Game.FAUCET_CAP, gFaucetUsed(caller));
      open;
      stats = gStats(caller);
      history = switch (gameState.history.get(caller)) { case (?l) l.toArray(); case null [] };
    };
  };

  public query func gameRanking() : async Types.Ranking {
    var staked = 0;
    let rows = List.empty<Types.PlayerRow>();
    for ((p, s) in gameState.stats.entries()) {
      staked += s.staked;
      rows.add({ player = p; excavations = s.excavations; staked = s.staked; returned = s.returned; jackpotWon = s.jackpotWon; bestPoints = s.bestPoints; deepest = s.deepest });
    };
    let net = func(r : Types.PlayerRow) : Int { (r.returned + r.jackpotWon : Int) - r.staked };
    let sorted = Array.sort(rows.toArray(), func(a : Types.PlayerRow, b : Types.PlayerRow) : { #less; #equal; #greater } { Int.compare(net(b), net(a)) });
    {
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      pool = gameState.pool;
      staked;
      players = if (sorted.size() > 200) Array.sliceToArray(sorted, 0, 200) else sorted;
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
    let stakes = gStakes();
    let all = gameState.payouts.values().toArray();
    let tn = gameState.tournaments.size();
    #ok({
      tournament = gameState.tournament;
      endsAt = gameState.endsAt;
      durationDays = gameState.durationDays;
      realLedger = gameState.realLedger;
      bank = gameState.bank;
      owed = gameState.owed;
      pool = gameState.pool;
      reserve = gameState.reserve;
      cycles = gameState.cycles;
      burned = gameState.burned;
      fund = gFund();
      withdrawable = gWithdrawable();
      stakes;
      paused = gPaused();
      staked;
      bankAllowance = gameState.bankAllowance;
      bankAccount = gameState.bankAccount;
      selfId = gameState.selfId;
      payouts = if (all.size() > 200) Array.sliceToArray(all, all.size() - 200, all.size()) else all;
      lastClose = if (tn == 0) null else gameState.tournaments.get(tn - 1);
    });
  };

  public shared ({ caller }) func gameAdminCloseTournament() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gAnyBusy()) return #err("Excavations in progress. Try again in a few seconds.");
    gCloseTournament();
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
    if (goldao == 0 or goldao > 10_000_000) return #err("Enter an amount.");
    let amount = goldao * Game.E8S;
    let after : Int = gFund() - amount;
    if (after < Game.FUND_FLOOR) return #err("The bank fund would fall below its floor.");
    gameState.pool += amount;
    #ok(gameState.pool);
  };

  public shared ({ caller }) func gameAdminTestDeposit(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #err("Not available with the real ledger.");
    if (goldao == 0 or goldao > 10_000_000) return #err("Enter an amount.");
    gameState.bank += goldao * Game.E8S;
    #ok(gameState.bank);
  };

  public shared ({ caller }) func gameAdminTestApprove(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #err("Authorize from the admin wallet.");
    if (goldao > Game.MAX_APPROVE / Game.E8S) return #err("Amount too large.");
    if (gameState.bank < Game.FEE) return #err("The bank wallet cannot pay the fee.");
    gameState.bank := gSub(gameState.bank, Game.FEE);
    gameState.burned += Game.FEE;
    gameState.bankAllowance := goldao * Game.E8S;
    #ok(gameState.bankAllowance);
  };

  public shared ({ caller }) func gameAdminPay() : async Result.Result<{ paid : Nat; failed : Nat; remaining : Nat }, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    let now = Time.now();
    if (gameState.payingSince != 0 and now - gameState.payingSince < Game.BUSY_STALE_NS) {
      return #err("A payment run is in progress.");
    };
    if (gSat > 0 or not gAccountingOk()) return #err("Accounting check failed. Payments are blocked.");
    gameState.payingSince := now;
    if (gameState.realLedger and not (await lBankRefresh())) {
      gameState.payingSince := 0;
      return #err("The ledger is unavailable.");
    };
    if (gSat > 0 or not gAccountingOk() or gUnpaidTotal() > gameState.bank) {
      gameState.payingSince := 0;
      return #err("Accounting check failed. Payments are blocked.");
    };
    let pending = Array.sort(
      gameState.payouts.values().filter(func(po : Types.Payout) : Bool { not po.paid }).toArray(),
      func(a : Types.Payout, b : Types.Payout) : { #less; #equal; #greater } { Nat.compare(a.id, b.id) },
    );
    var paid = 0;
    var failed = 0;
    var firstError : ?Text = null;
    var handled = 0;
    for (po in pending.values()) {
      if (handled < Game.PAY_BATCH) {
        handled += 1;
        switch (gameState.payouts.get(po.id)) {
          case (?cur) {
            if (not cur.paid) {
              let res = await lPay(cur.to, cur.amount, cur.id, cur.stamp);
              switch (res) {
                case (#ok) {
                  switch (gameState.payouts.get(cur.id)) {
                    case (?now2) {
                      if (not now2.paid) {
                        gameState.payouts.add(cur.id, { now2 with paid = true });
                        gameState.owed := gSub(gameState.owed, now2.amount + Game.FEE);
                        paid += 1;
                      };
                    };
                    case null {};
                  };
                };
                case (#err m) {
                  failed += 1;
                  if (firstError == null) firstError := ?m;
                };
              };
            };
          };
          case null {};
        };
      };
    };
    gameState.payingSince := 0;
    var remaining = 0;
    for ((_, po) in gameState.payouts.entries()) { if (not po.paid) remaining += 1 };
    if (paid == 0 and failed > 0) {
      return #err(switch (firstError) { case (?m) m; case null "Payment failed." });
    };
    #ok({ paid; failed; remaining });
  };

  public shared ({ caller }) func gameAdminWithdraw(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #err("Not available with the real ledger.");
    if (goldao == 0) return #err("Enter an amount.");
    let amount = goldao * Game.E8S;
    if (amount > gWithdrawable() or amount > gameState.bank) return #err("Above the available amount.");
    gameState.bank := Game.sub(gameState.bank, amount);
    gameState.cycles := Game.sub(gameState.cycles, amount);
    #ok(gameState.bank);
  };

  public shared ({ caller }) func gameAdminRecordWithdrawal(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gameState.realLedger) return #err("Only with the real ledger.");
    if (goldao == 0) return #err("Enter an amount.");
    let amount = goldao * Game.E8S;
    if (amount > gWithdrawable()) return #err("Above the available amount.");
    if (not (await lBankRefresh())) return #err("The ledger is unavailable. Try again later.");
    gameState.cycles := Game.sub(gameState.cycles, amount);
    #ok(gameState.bank);
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
    let flagged = gameState.blocked.entries().map(func((p, at) : (Principal, Nat)) : Types.FlagEntry { { player = p; at = Nat.toInt(at) } }).toArray();
    #ok({
      halted = gameState.halted;
      haltCode = gameState.haltCode;
      haltedAt = gameState.haltedAt;
      breakerMax = gameState.breakerMax;
      breakerWindowMin = Int.abs(gameState.breakerWindowNs / 60_000_000_000);
      ledgerFails = gameState.ledgerFails;
      saturations = gSat;
      accountingOk = gAccountingOk();
      flagged;
    });
  };

  public shared ({ caller }) func gameAdminAckAccounting() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (not gAccountingOk()) return #err("The accounting check still fails.");
    gSat := 0;
    #ok(());
  };

  public shared ({ caller }) func gameAdminHalt() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    gHalt(3);
    #ok(());
  };

  public shared ({ caller }) func gameAdminResume() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    gameState.halted := false;
    gameState.haltCode := 0;
    gameState.resumedAt := Time.now();
    gameState.ledgerFails := 0;
    #ok(());
  };

  public shared ({ caller }) func gameAdminSetBreaker(max : Nat, windowMinutes : Nat) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (max == 0 or max > 50) return #err("Flags must be between 1 and 50.");
    if (windowMinutes == 0 or windowMinutes > 1_440) return #err("Window must be between 1 and 1440 minutes.");
    gameState.breakerMax := max;
    gameState.breakerWindowNs := windowMinutes * 60_000_000_000;
    #ok(());
  };

  public shared ({ caller }) func gameAdminUnblock(player : Principal) : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    gameState.blocked.remove(player);
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
    gameState.burned := 0;
    Map.clear(gameState.balances);
    Map.clear(gameState.allowances);
    Map.clear(gameState.faucet);
    gameState.bank := balance;
    gameState.bankAllowance := 0;
    gameState.realLedger := true;
    #ok(balance);
  };
};
