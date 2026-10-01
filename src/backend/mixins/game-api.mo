import Types "../types/game";
import Game "../lib/game";
import Map "mo:core/Map";
import List "mo:core/List";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Random "mo:core/Random";
import Result "mo:core/Result";
import Time "mo:core/Time";

// Gold mine (simulated mode): internal balances, no ledger.
// All randomness and accounting is resolved here; the frontend only displays.
mixin (
  gameState : Types.GameState,
  accessControlState : Types.AccessControlState,
) {

  // Helpers

  func gIsAdmin(p : Principal) : Bool {
    switch (accessControlState.userRoles.get(p)) {
      case (?#admin) true;
      case _ false;
    };
  };

  func gBalance(p : Principal) : Nat {
    switch (gameState.balances.get(p)) { case (?b) b; case null 0 };
  };

  func gStats(p : Principal) : Types.WeekStats {
    switch (gameState.stats.get(p)) {
      case (?s) s;
      case null ({ playTx = 0; collapses = 0; best = 0; deepest = 0 });
    };
  };

  func gPlayTx(p : Principal) : Nat { gStats(p).playTx };

  func gFaucetUsed(p : Principal) : Nat {
    switch (gameState.faucet.get(p)) {
      case (?(w, used)) if (w == gameState.week) used else 0;
      case null 0;
    };
  };

  func gExcView(e : Types.Excavation) : Types.ExcavationView {
    {
      chipId = e.chipId;
      picks = e.picks;
      diamonds = e.diamonds;
      runPoints = Game.pointsAt(e.picks);
      ifCollapse = if (e.picks >= Game.SAFE) Game.collapsePoints(e.picks) else 0;
      nextPoints = if (e.picks < Game.MAX_PICKS) Game.pointsAt(e.picks + 1) else 0;
      safePctX100 = Game.safePctX100(e.picks);
      canSave = Game.canSave(e.picks);
    };
  };

  func gRandomBytes() : async [Nat8] {
    (await Random.blob()).values().toArray();
  };

  // Closes the player's open excavation and adds the points to its chip
  func gEndExcavation(p : Principal, e : Types.Excavation, pts : Nat, collapsed : Bool) {
    switch (gameState.chips.get(e.chipId)) {
      case (?f) {
        let used = f.used + 1;
        gameState.chips.add(
          f.id,
          {
            f with used;
            points = f.points + pts;
            finishedAt = if (used == Game.EXCAVATIONS_PER_CHIP) Time.now() else 0;
          },
        );
      };
      case null {};
    };
    let s = gStats(p);
    gameState.stats.add(
      p,
      {
        s with collapses = s.collapses + (if collapsed 1 else 0);
        best = Nat.max(s.best, pts);
        deepest = Nat.max(s.deepest, e.picks);
      },
    );
    gameState.open.remove(p);
  };

  func gAddDiamond(chipId : Nat) {
    switch (gameState.chips.get(chipId)) {
      case (?f) gameState.chips.add(f.id, { f with diamonds = f.diamonds + 1 });
      case null {};
    };
  };

  func gSettlement() : Game.Settlement {
    Game.settle(gameState.chips, gPlayTx, gameState.drawCarry);
  };

  func gRequireUser(caller : Principal) : ?Text {
    if (Principal.isAnonymous(caller)) ?"Sign in with Internet Identity." else null;
  };

  // Public

  public query func gameConfig() : async Types.GameConfig {
    {
      chipPriceE8s = Game.CHIP_PRICE;
      feeE8s = Game.FEE;
      excavationsPerChip = Game.EXCAVATIONS_PER_CHIP;
      cells = Game.CELLS;
      mines = Game.MINES;
      safePicks = Game.SAFE;
      diamondBps = Game.DIAMOND_BPS;
      tierCutsPct = Game.CUTS_PCT;
      tierMultBps = Game.MULT_BPS;
      treasuryBps = Game.TREASURY_BPS;
      drawBps = Game.DRAW_BPS;
      minChips = Game.MIN_CHIPS;
      faucetCapE8s = Game.FAUCET_CAP;
      pointsTable = Game.POINTS;
      week = gameState.week;
      status = gameState.status;
    };
  };

  /// Test GOLDAO: up to 10,000 per principal per week.
  public shared ({ caller }) func gameRequestTestTokens(goldao : Nat) : async Result.Result<Nat, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (goldao == 0) return #err("Enter an amount.");
    let amount = goldao * Game.E8S;
    let used = gFaucetUsed(caller);
    if (used + amount > Game.FAUCET_CAP) {
      let left = if (Game.FAUCET_CAP > used) (Game.FAUCET_CAP - used) / Game.E8S else 0;
      return #err("Weekly cap of 10,000 test GOLDAO reached. Remaining: " # Nat.toText(left) # ".");
    };
    gameState.faucet.add(caller, (gameState.week, used + amount));
    let b = gBalance(caller) + amount;
    gameState.balances.add(caller, b);
    #ok(b);
  };

  /// Buys chips: sends n x 1,000 to the treasury + 10 fee.
  public shared ({ caller }) func gameBuyChips(n : Nat) : async Result.Result<Nat, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gameState.status != #open) return #err("The week is closed. Wait for the admin to open the next one.");
    if (n == 0 or n > Game.MAX_CHIPS_PER_BUY) return #err("You can buy between 1 and 10 chips at a time.");
    let cost = n * Game.CHIP_PRICE + Game.FEE;
    let bal = gBalance(caller);
    if (bal < cost) return #err("Insufficient balance: you need " # Nat.toText(cost / Game.E8S) # " GOLDAO.");
    gameState.balances.add(caller, bal - cost);
    gameState.treasury += n * Game.CHIP_PRICE;
    gameState.burned += Game.FEE;
    var i = 0;
    while (i < n) {
      let id = gameState.nextChipId;
      gameState.nextChipId += 1;
      gameState.chips.add(id, { id; owner = caller; used = 0; points = 0; diamonds = 0; finishedAt = 0 });
      i += 1;
    };
    let s = gStats(caller);
    gameState.stats.add(caller, { s with playTx = s.playTx + 1 });
    #ok(bal - cost);
  };

  public shared ({ caller }) func gameStartExcavation() : async Result.Result<Types.ExcavationView, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gameState.status != #open) return #err("The week is closed.");
    if (gameState.open.get(caller) != null) return #err("Finish your open excavation first: save or keep digging.");
    let mine = gameState.chips.values().filter(func(f : Types.Chip) : Bool { f.owner == caller and f.used < Game.EXCAVATIONS_PER_CHIP }).toArray();
    if (mine.size() == 0) return #err("No excavations left. Buy a chip first.");
    let f = Array.sort(mine, func(a : Types.Chip, b : Types.Chip) : { #less; #equal; #greater } { Nat.compare(a.id, b.id) })[0];
    let e : Types.Excavation = { chipId = f.id; picks = 0; diamonds = 0; busy = false };
    gameState.open.add(caller, e);
    #ok(gExcView(e));
  };

  /// One pick. Calls raw_rand to resolve collapse (from the 3rd pick) and diamond.
  public shared ({ caller }) func gamePick() : async Result.Result<Types.PickResult, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gameState.status != #open) return #err("The week is closed.");
    let ex = switch (gameState.open.get(caller)) {
      case (?e) e;
      case null return #err("Start a new excavation.");
    };
    if (ex.busy) return #err("Wait for the previous pick to finish.");
    if (ex.picks >= Game.MAX_PICKS) return #err("The mine is empty: save.");
    let week = gameState.week;
    gameState.open.add(caller, { ex with busy = true });

    let bytes = try { await gRandomBytes() } catch (_) {
      switch (gameState.open.get(caller)) {
        case (?e) gameState.open.add(caller, { e with busy = false });
        case null {};
      };
      return #err("Could not get randomness. Try again.");
    };

    // The week may have closed while waiting
    let cur = switch (gameState.open.get(caller)) {
      case (?e) e;
      case null return #err("The excavation was closed by the weekly close.");
    };
    if (gameState.week != week or gameState.status != #open or cur.chipId != ex.chipId) {
      return #err("The excavation was closed by the weekly close.");
    };

    let d = Game.decidePick(cur.picks, bytes);
    if (d.collapsed) {
      let pts = Game.collapsePoints(cur.picks);
      gEndExcavation(caller, { cur with busy = false }, pts, true);
      return #ok({ collapsed = true; diamond = false; picks = cur.picks; ended = true; pointsSaved = pts; excavation = null });
    };

    if (d.diamond) gAddDiamond(cur.chipId);
    let next : Types.Excavation = {
      cur with picks = cur.picks + 1;
      diamonds = cur.diamonds + (if (d.diamond) 1 else 0);
      busy = false;
    };
    if (next.picks == Game.MAX_PICKS) {
      let pts = Game.pointsAt(next.picks);
      gEndExcavation(caller, next, pts, false);
      return #ok({ collapsed = false; diamond = d.diamond; picks = next.picks; ended = true; pointsSaved = pts; excavation = null });
    };
    gameState.open.add(caller, next);
    #ok({ collapsed = false; diamond = d.diamond; picks = next.picks; ended = false; pointsSaved = 0; excavation = ?gExcView(next) });
  };

  public shared ({ caller }) func gameSave() : async Result.Result<Nat, Text> {
    switch (gRequireUser(caller)) { case (?e) return #err(e); case null {} };
    if (gameState.status != #open) return #err("The week is closed.");
    let ex = switch (gameState.open.get(caller)) {
      case (?e) e;
      case null return #err("There is no open excavation.");
    };
    if (ex.busy) return #err("Wait for the pick to finish.");
    if (not Game.canSave(ex.picks)) return #err("The first two picks are free: you can save from the third one.");
    let pts = Game.pointsAt(ex.picks);
    gEndExcavation(caller, ex, pts, false);
    #ok(pts);
  };

  public shared query ({ caller }) func gameMyDashboard() : async Types.Dashboard {
    let st = gSettlement();
    var tiers = [0, 0, 0, 0, 0];
    var diamonds = 0;
    var paid = 0;
    var est = 0;
    for ((p, a) in st.players.values()) {
      if (p == caller) {
        tiers := a.tiers;
        diamonds := a.diamonds;
        paid := Game.paidFor(a, gPlayTx(p));
        est := Game.netFor(a, gPlayTx(p));
      };
    };
    let chips = Array.filterMap<(Types.Chip, Nat, Nat), Types.ChipView>(
      st.ranked,
      func((f, t, _)) {
        if (f.owner != caller) return null;
        let gap : ?Nat = if (t == 0 or f.used == 0) null else switch (st.cutsX100[t - 1]) {
          case (?c) { let a = Game.avgX100(f); ?(if (c > a) c - a + 1 else 1) };
          case null null;
        };
        ?{ id = f.id; used = f.used; points = f.points; avgX100 = Game.avgX100(f); diamonds = f.diamonds; tier = t; gapToNextX100 = gap };
      },
    );
    let sorted = Array.sort(chips, func(a : Types.ChipView, b : Types.ChipView) : { #less; #equal; #greater } { Nat.compare(a.id, b.id) });
    var left = 0;
    for (f in sorted.values()) left += Game.EXCAVATIONS_PER_CHIP - f.used;
    let open = switch (gameState.open.get(caller)) { case (?e) ?gExcView(e); case null null };
    if (open != null and left > 0) left -= 1;
    let history = switch (gameState.history.get(caller)) {
      case (?l) l.toArray();
      case null [];
    };
    {
      week = gameState.week;
      status = gameState.status;
      balance = gBalance(caller);
      faucetRemaining = if (Game.FAUCET_CAP > gFaucetUsed(caller)) Game.FAUCET_CAP - gFaucetUsed(caller) else 0;
      chips = sorted;
      excavationsLeft = left;
      open;
      tiers;
      diamonds;
      totalDiamonds = st.totalDiamonds;
      stats = gStats(caller);
      paid;
      estimatedReceive = est;
      history;
    };
  };

  public query func gameRanking() : async Types.Ranking {
    let st = gSettlement();
    let rows = Array.map<(Principal, Game.PlayerAgg), Types.PlayerRow>(
      st.players,
      func((p, a)) {
        {
          player = p;
          avgX100 = if (a.used == 0) 0 else a.points * 100 / a.used;
          chips = a.chips;
          tiers = a.tiers;
          diamonds = a.diamonds;
          paid = Game.paidFor(a, gPlayTx(p));
          estimatedReceive = Game.netFor(a, gPlayTx(p));
          playing = a.playing;
        };
      },
    );
    {
      week = gameState.week;
      status = gameState.status;
      chips = st.ranked.size();
      pot = st.pot;
      treasurePerChip = st.treasurePerChip;
      drawPrize = st.drawPrize;
      treasuryKeep = st.treasuryKeep;
      totalDiamonds = st.totalDiamonds;
      cutsX100 = st.cutsX100;
      players = Array.sort(rows, func(a : Types.PlayerRow, b : Types.PlayerRow) : { #less; #equal; #greater } { Nat.compare(b.avgX100, a.avgX100) });
    };
  };

  public query func gameWeeks() : async [Types.WeekSummary] {
    gameState.weeks.toArray();
  };

  // Admin

  public shared query ({ caller }) func gameAdminView() : async Result.Result<Types.AdminView, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    #ok({
      week = gameState.week;
      status = gameState.status;
      treasury = gameState.treasury;
      burned = gameState.burned;
      drawCarry = gameState.drawCarry;
      payouts = gameState.payouts;
      lastClose = gameState.lastClose;
    });
  };

  /// Closes the week: saves open excavations, auto-plays the remaining ones
  /// saving at 3, ranks chips, computes payouts and runs the diamond draw.
  public shared ({ caller }) func gameAdminCloseWeek() : async Result.Result<Types.WeekSummary, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.status != #open) return #err("The week is not open.");
    let k = gameState.chips.size();
    if (k < Game.MIN_CHIPS) {
      return #err("There are " # Nat.toText(k) # " chips. With fewer than 20 the week is extended.");
    };
    gameState.status := #closing;

    // Open excavations: saved if past the free picks, otherwise returned
    for ((p, e) in gameState.open.entries().toArray().values()) {
      if (Game.canSave(e.picks)) gEndExcavation(p, e, Game.pointsAt(e.picks), false) else gameState.open.remove(p);
    };

    let bytes = try { await gRandomBytes() } catch (_) {
      gameState.status := #open;
      return #err("Could not get randomness. Try again.");
    };

    // Unused excavations: auto-played saving at 3
    let rng = Game.Prng(Nat.toNat64(Game.bytesToNat(bytes, 0, 8)));
    for (f in gameState.chips.values().toArray().values()) {
      if (f.used < Game.EXCAVATIONS_PER_CHIP) {
        var used = f.used;
        var points = f.points;
        var diamonds = f.diamonds;
        while (used < Game.EXCAVATIONS_PER_CHIP) {
          let (pts, d) = Game.autoExcavation(rng, Game.AUTO_SAVE_AT);
          points += pts;
          diamonds += d;
          used += 1;
        };
        gameState.chips.add(f.id, { f with used; points; diamonds; finishedAt = Time.now() });
      };
    };

    let st = gSettlement();

    // Diamond draw: tickets ordered by principal
    let drawRandom = Game.bytesToNat(bytes, 8, 8);
    var winner : ?Principal = null;
    var ticket = 0;
    if (st.totalDiamonds > 0) {
      ticket := drawRandom % st.totalDiamonds + 1;
      var acc = 0;
      label pick for ((p, a) in st.players.values()) {
        acc += a.diamonds;
        if (ticket <= acc) { winner := ?p; break pick };
      };
    };

    let payouts = List.empty<Types.Payout>();
    let results = List.empty<(Principal, Types.PlayerWeekResult)>();
    for ((p, a) in st.players.values()) {
      let tx = gPlayTx(p);
      let net = Game.netFor(a, tx);
      if (net > 0) payouts.add({ to = p; amount = net; concept = #prize; tiers = a.tiers });
      let won = winner == ?p;
      let drawNet = if (won and st.drawPrize > Game.FEE) st.drawPrize - Game.FEE else 0;
      let s = gStats(p);
      results.add((p, { week = gameState.week; chips = a.chips; tiers = a.tiers; diamonds = a.diamonds; paid = Game.paidFor(a, tx); received = net + drawNet; drawWon = won; best = s.best; deepest = s.deepest; collapses = s.collapses }));
    };
    switch (winner) {
      case (?w) if (st.drawPrize > Game.FEE) payouts.add({ to = w; amount = st.drawPrize - Game.FEE; concept = #draw; tiers = [] });
      case null {};
    };

    let summary : Types.WeekSummary = {
      week = gameState.week;
      chips = st.ranked.size();
      players = st.players.size();
      pot = st.pot;
      treasurePerChip = st.treasurePerChip;
      treasuryKeep = st.treasuryKeep;
      drawPrize = st.drawPrize;
      drawTickets = st.totalDiamonds;
      drawTicket = ticket;
      drawWinner = winner;
      drawRandom;
      closedAt = Time.now();
    };
    gameState.payouts := payouts.toArray();
    gameState.pendingResults := results.toArray();
    gameState.lastClose := ?summary;
    gameState.drawCarry := if (winner == null) st.drawPrize else 0;
    gameState.status := #closed;
    #ok(summary);
  };

  /// Credits all payouts (simulated), archives the week and opens the next one.
  public shared ({ caller }) func gameAdminPayAndOpenNext() : async Result.Result<Nat, Text> {
    if (not gIsAdmin(caller)) return #err("Admin only.");
    if (gameState.status != #closed) return #err("Close the week first.");
    var total = 0;
    for (po in gameState.payouts.values()) {
      gameState.balances.add(po.to, gBalance(po.to) + po.amount);
      gameState.burned += Game.FEE;
      let cost = po.amount + Game.FEE;
      gameState.treasury := if (gameState.treasury > cost) gameState.treasury - cost else 0;
      total += po.amount;
    };
    for ((p, r) in gameState.pendingResults.values()) {
      let l = switch (gameState.history.get(p)) {
        case (?l) l;
        case null { let l = List.empty<Types.PlayerWeekResult>(); gameState.history.add(p, l); l };
      };
      l.add(r);
    };
    switch (gameState.lastClose) { case (?s) gameState.weeks.add(s); case null {} };
    gameState.payouts := [];
    gameState.pendingResults := [];
    gameState.chips.clear();
    gameState.open.clear();
    gameState.stats.clear();
    gameState.week += 1;
    gameState.status := #open;
    #ok(total);
  };
};
