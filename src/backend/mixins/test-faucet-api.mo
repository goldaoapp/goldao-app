import Types "../types/game";
import Game "../lib/game";
import Ledger "../lib/ledger";
import Faucet "../lib/test-faucet";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";

// TEST FAUCET API. See lib/test-faucet.mo for what to delete before going to real GOLDAO.
//
// A player asks for test tokens and this canister sends them from its own account on the test
// ledger to the player's wallet. The player then loads balance through the normal game flow.
mixin (
  gameState : Types.GameState,
) {

  // In memory only. A canister upgrade resets both maps, which is fine for a test faucet.
  // (tournament, e8s received in it) per player.
  transient let fClaimed = Map.empty<Principal, (Nat, Nat)>();
  // Players with a claim in flight (start time): one at a time.
  transient let fLocked = Map.empty<Principal, Int>();

  // The faucet works only when the game runs on the test ledger, in ledger mode.
  func fOn() : Bool {
    Ledger.MODE == #test and Ledger.ledgerId() == Faucet.TEST_LEDGER and gameState.realLedger;
  };

  func fIsAdminOrBank(p : Principal) : Bool {
    if (Game.isBootstrapAdmin(p)) return true;
    switch (gameState.bankAccount) { case (?b) b == p; case null false };
  };

  func fUsed(p : Principal) : Nat {
    switch (fClaimed.get(p)) {
      case (?(t, used)) if (t == gameState.tournament) used else 0;
      case null 0;
    };
  };

  // Gives back a reserved amount when the ledger definitely did not send it.
  func fRelease(p : Principal, amount : Nat) {
    let used = fUsed(p);
    fClaimed.add(p, (gameState.tournament, if (used > amount) used - amount else 0));
  };

  public shared query ({ caller }) func testFaucetConfig() : async Faucet.FaucetConfig {
    {
      enabled = fOn();
      presets = Faucet.PRESETS;
      capE8s = Faucet.CAP_PER_TOURNAMENT;
      usedE8s = fUsed(caller);
    };
  };

  // `goldao` is a whole number of tokens and must be one of the presets. Returns the ledger
  // block index of the transfer.
  public shared ({ caller }) func testFaucetClaim(goldao : Nat) : async Result.Result<Nat, Text> {
    if (not fOn()) return #err("The test faucet is not available.");
    if (Principal.isAnonymous(caller)) return #err("Sign in with Internet Identity.");
    // Admin and bank wallets never receive faucet tokens: they would upset the bank audit.
    if (fIsAdminOrBank(caller)) return #err("Admin accounts cannot use the faucet.");
    if (Array.indexOf<Nat>(Faucet.PRESETS, Nat.equal, goldao) == null) return #err("Choose one of the listed amounts.");
    let amount = goldao * Faucet.E8S;
    let used = fUsed(caller);
    if (used + amount > Faucet.CAP_PER_TOURNAMENT) {
      let left = (if (Faucet.CAP_PER_TOURNAMENT > used) Faucet.CAP_PER_TOURNAMENT - used else 0) / Faucet.E8S;
      return #err("Cap of " # Nat.toText(Faucet.CAP_PER_TOURNAMENT / Faucet.E8S) # " test tokens per tournament reached. Remaining: " # Nat.toText(left) # ".");
    };
    switch (fLocked.get(caller)) {
      case (?since) {
        if (Time.now() - since < Faucet.LOCK_STALE_NS) return #err("A request is already in progress.");
      };
      case null {};
    };
    // The amount is counted before the call. If the ledger gives no answer the transfer may have
    // been executed, so it stays counted.
    fClaimed.add(caller, (gameState.tournament, used + amount));
    fLocked.add(caller, Time.now());
    let stamp = Nat.toNat64(Int.abs(Time.now()));
    let answer = try {
      ?(await Faucet.ledger().icrc1_transfer({
        from_subaccount = null;
        to = Faucet.account(caller);
        amount;
        fee = null;
        memo = null;
        created_at_time = ?stamp;
      }));
    } catch (_) { null };
    fLocked.remove(caller);
    switch (answer) {
      case null {
        #err("The ledger did not answer. Check your wallet before trying again.");
      };
      case (?(#Ok block)) #ok(block);
      case (?(#Err(#Duplicate d))) #ok(d.duplicate_of);
      case (?(#Err(#InsufficientFunds _))) {
        fRelease(caller, amount);
        #err("The faucet is empty. Ask the admin to refill it.");
      };
      case (?(#Err _)) {
        fRelease(caller, amount);
        #err("The ledger refused the transfer. Try again later.");
      };
    };
  };
};
