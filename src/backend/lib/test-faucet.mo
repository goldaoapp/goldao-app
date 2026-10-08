// TEST FAUCET. Temporary: it exists only to try the game with the GOLDAO TEST token.
//
// Before the game moves to the real GOLDAO ledger, delete:
//   1. this file
//   2. mixins/test-faucet-api.mo
//   3. the import and the include of TestFaucetMixin in main.mo
//   4. in the frontend: lib/test-faucet.ts and pages/game/TestFaucetCard.tsx
//      (and its line in WalletPanel.tsx)
//
// Safety rules of this module:
//   - It holds its own copy of the TEST ledger id and builds its ledger actor only from it. It
//     never refers to the real GOLDAO ledger, so it cannot move real GOLDAO even if it is left
//     in by mistake.
//   - The mixin also refuses to run unless the ledger the game uses is exactly this test ledger.
//   - The tokens it hands out come from this canister's own account on the test ledger, never
//     from the admin (bank) wallet, so the bank audit is not affected.
//   - It keeps no stable state: nothing here needs a migration, and nothing here is part of the
//     game books.
module {
  // GOLDAO TEST ledger (symbol GOLDAOT).
  public let TEST_LEDGER : Text = "q4yq5-miaaa-aaaaj-qsjca-cai";

  public let E8S : Nat = 100_000_000;

  // Whole tokens that can be requested per click.
  public let PRESETS : [Nat] = [1_000, 5_000, 10_000, 20_000];

  // Most a single player can receive per tournament (e8s): 20,000 tokens.
  public let CAP_PER_TOURNAMENT : Nat = 2_000_000_000_000;

  // Most the faucet hands out to everyone together per tournament (e8s): 2,000,000 tokens.
  // Anyone can create principals for free, so this is what protects the pool.
  public let GLOBAL_CAP_PER_TOURNAMENT : Nat = 200_000_000_000_000;

  // A claim lock older than this is ignored, so a lost continuation can never block a player.
  public let LOCK_STALE_NS : Int = 120_000_000_000;

  public type FaucetConfig = {
    enabled : Bool;
    presets : [Nat];
    capE8s : Nat;
    usedE8s : Nat;
  };

  public type Account = { owner : Principal; subaccount : ?Blob };

  public type TransferArg = {
    from_subaccount : ?Blob;
    to : Account;
    amount : Nat;
    fee : ?Nat;
    memo : ?Blob;
    created_at_time : ?Nat64;
  };

  public type TransferError = {
    #BadFee : { expected_fee : Nat };
    #BadBurn : { min_burn_amount : Nat };
    #InsufficientFunds : { balance : Nat };
    #TooOld;
    #CreatedInFuture : { ledger_time : Nat64 };
    #Duplicate : { duplicate_of : Nat };
    #TemporarilyUnavailable;
    #GenericError : { error_code : Nat; message : Text };
  };

  public type TestLedger = actor {
    icrc1_transfer : shared TransferArg -> async { #Ok : Nat; #Err : TransferError };
  };

  public func ledger() : TestLedger { actor (TEST_LEDGER) : TestLedger };

  public func account(p : Principal) : Account { { owner = p; subaccount = null } };
};
