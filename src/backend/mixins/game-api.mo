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
import Set "mo:core/Set";
import Time "mo:core/Time";

mixin (
  gameState : Types.GameState,
  accessControlState : Types.AccessControlState,
) {

  transient var gSat : Nat = 0;
  // Players with a credit load in flight: one at a time.
  transient let gLoading = Set.empty<Principal>();

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
    gameState.halted or gStakes().size() == 0;
  };

  func gHalt(code : Nat) {
    if (gameState.halted) return;
    gameState.halted := true;
    gameState.haltCode := code;
    gameState.haltedAt := Time.now();
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

  // Pulls the amount from the player's wallet into the bank. The caller grants
  // the credit only after this returns #ok, i.e. after the ledger confirmed it.
  func lLoad(p : Principal, amount : Nat) : async Types.Charge {
    gameState.movSeq += 1;
    let need = amount + Game.FEE;
    if (not gameState.realLedger) {
      if (gAllowance(p) < need) return #allowance;
      if (gBalance(p) < need) return #funds;
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
        case (#Err(#InsufficientAllowance _)) #allowance;
        case (#Err(#InsufficientFunds _)) #funds;
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

    // Small balances stay in To collect for the next tournament. A full close
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
        gameState.payouts.add(id, { id; tournament = t; to = p; amount = c - Game.FEE; paid = false; stamp = Nat.toNat64(Int.abs(Time.now())) });
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
      if (po.paid and po.tournament + 1 < t) gameState.payouts.remove(id);
    };
    for ((p, lost) in settled.values()) {
      gameState.credits.remove(p);
      if (lost > 0) gameState.owed := gSub(gameState.owed, lost);
    };
    gameState.stats.clear();
    gameState.tournament := t + 1;
    gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
  };

  func gMaybeClose() {
    if (gameState.endsAt == 0) {
      gameState.endsAt := Time.now() + gameState.durationDays * Game.DAY_NS;
      return;
    };
    if (Time.now() >= gameState.endsAt and not gAnyBusy()) gCloseTournament(false);
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
    if (gCredit(p) < started.stake) {
      gDrop(p, token);
      return #err("Load credit first: your To collect balance must cover the stake.");
    };
    #ok(started);
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
      loadMin = Game.LOAD_MIN;
      loadMax = Game.LOAD_MAX;
      creditCapE8s = Game.CREDIT_CAP;
      minPayoutE8s = Game.MIN_PAYOUT;
      top10Bps = Game.TOP10_BPS;
      top10Weights = Game.TOP10_WEIGHTS;
      top10MinVolumeE8s = Game.TOP10_MIN_VOLUME;
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

  // Credit: the player loads To collect from the wallet. It backs every stake.

  public shared ({ caller }) func gameLoadCredit(goldao : Nat) : async Result.Result<Nat, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    gMaybeClose();
    if (gameState.halted) return #err("Bets are paused. Try again later.");
    if (gClosing()) return #err("The tournament is closing. Try again in a few seconds.");
    if (goldao < Game.LOAD_MIN or goldao > Game.LOAD_MAX) {
      return #err("Choose between " # Nat.toText(Game.LOAD_MIN) # " and " # Nat.toText(Game.LOAD_MAX) # " GOLDAO.");
    };
    let amount = goldao * Game.E8S;
    if (gCredit(caller) + amount > Game.CREDIT_CAP) {
      return #err("To collect cannot go above " # Nat.toText(Game.CREDIT_CAP / Game.E8S) # " GOLDAO.");
    };
    if (gLoading.contains(caller)) return #err("A load is already in progress.");
    gLoading.add(caller);
    let res = await lLoad(caller, amount);
    gLoading.remove(caller);
    let need = amount + Game.FEE;
    switch (res) {
      case (#ok) {
        gameState.credits.add(caller, gCredit(caller) + amount);
        gameState.owed += amount;
        #ok(gCredit(caller));
      };
      case (#allowance) #err("Authorize the game to charge up to " # Nat.toText(need / Game.E8S) # " GOLDAO.");
      case (#funds) #err("Insufficient balance: you need " # Nat.toText(need / Game.E8S) # " GOLDAO (amount plus the network fee).");
      case (#down) #err("The ledger is unavailable. Try again later.");
    };
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
      history = switch (gameState.history.get(caller)) { case (?l) l.toArray(); case null [] };
    };
  };

  public query func gameRanking() : async Types.Ranking {
    var staked = 0;
    let rows = List.empty<Types.PlayerRow>();
    for ((p, s) in gameState.stats.entries()) {
      staked += s.staked;
      rows.add({ player = p; excavations = s.excavations; staked = s.staked; returned = s.returned; jackpotWon = s.jackpotWon; bestPoints = s.bestPoints; deepest = s.deepest; rank = 0; prize = 0 });
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
      payouts = if (all.size() > 200) Array.sliceToArray(all, all.size() - 200, all.size()) else all;
      lastClose = if (tn == 0) null else gameState.tournaments.get(tn - 1);
    });
  };

  public shared ({ caller }) func gameAdminCloseTournament() : async Result.Result<(), Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
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

  public shared ({ caller }) func gameAdminSeedPool() : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.pool >= Game.POOL_SEED) return #err("The jackpot pool is already at its minimum.");
    let amount = Game.POOL_SEED - gameState.pool;
    let after : Int = gFund() - amount;
    if (after < Game.FUND_FLOOR) return #err("The bank fund would fall below its floor.");
    gameState.pool += amount;
    #ok(gameState.pool);
  };

  public shared ({ caller }) func gameAdminTestDeposit(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.realLedger) return #err("Not available with the real ledger.");
    if (Array.indexOf<Nat>(Game.TEST_DEPOSITS, Nat.equal, goldao) == null) return #err("Choose one of the listed amounts.");
    gameState.bank += goldao * Game.E8S;
    #ok(gameState.bank);
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
    if (not gameState.realLedger) {
      let total = gUnpaidTotal();
      if (gameState.bankAllowance < total) {
        if (gameState.bank < total + Game.FEE) {
          gameState.payingSince := 0;
          return #err("The bank wallet does not cover the pending payouts.");
        };
        gameState.bank := gSub(gameState.bank, Game.FEE);
        gameState.burned += Game.FEE;
        gameState.bankAllowance := total;
      };
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

  func gWithdrawBlocked(kind : Types.WithdrawKind) : ?Text {
    if (gSat > 0 or not gAccountingOk()) return ?"Accounting check failed. Withdrawals are blocked.";
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

  func lWithdraw(amount : Nat) : async Result.Result<(), Text> {
    gameState.movSeq += 1;
    if (not gameState.realLedger) {
      let need = amount + Game.FEE;
      if (gameState.bank < need) return #err("Above the available amount.");
      gameState.bank := gSub(gameState.bank, need);
      gameState.burned += Game.FEE;
      gameState.movSeq += 1;
      return #ok(());
    };
    let bankAcct = switch (gameState.bankAccount) { case (?a) a; case null return #err("Ledger mode is not configured.") };
    try {
      let res = await Ledger.ledger().icrc2_transfer_from({
        spender_subaccount = null;
        from = Ledger.account(bankAcct);
        to = Ledger.account(Game.treasury());
        amount;
        fee = ?Game.FEE;
        memo = null;
        created_at_time = ?Nat.toNat64(Int.abs(Time.now()));
      });
      gameState.movSeq += 1;
      switch (res) {
        case (#Ok _) {
          gameState.bank := gSub(gameState.bank, amount + Game.FEE);
          #ok(());
        };
        case (#Err(#InsufficientAllowance _)) #err("The withdrawal authorization is too low.");
        case (#Err(#InsufficientFunds _)) #err("The bank wallet does not cover the withdrawal.");
        case (#Err _) #err("The ledger rejected the withdrawal.");
      };
    } catch (_) {
      gameState.movSeq += 1;
      #err("The ledger is unavailable. Refresh the bank before trying again.");
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
    switch (res) {
      case (#err m) return #err(m);
      case (#ok) {};
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
      saturations = gSat;
      accountingOk = gAccountingOk();
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
    gameState.top10 := 0;
    gameState.lastTop10 := [];
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
