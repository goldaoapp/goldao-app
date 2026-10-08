import Principal "mo:core/Principal";

module {
  // The one switch that decides which ledger the game uses.
  //   #test: the GOLDAO TEST token (no value), with the test faucet available.
  //   #production: the real GOLDAO. The test faucet refuses to run.
  // To move between them, change this single line, deploy a new version and follow
  // "Switching ledger" in the admin panel (the game must be empty: the switch erases game data).
  public type Mode = { #test; #production };
  public let MODE : Mode = #test;

  public let GOLDAO_LEDGER_PRODUCTION : Text = "tyyy3-4aaaa-aaaaq-aab7a-cai";
  public let GOLDAO_LEDGER_TEST : Text = "q4yq5-miaaa-aaaaj-qsjca-cai";

  // Symbol the real GOLDAO ledger reports. With MODE = #production the game refuses to connect
  // to a ledger that reports anything else.
  public let PRODUCTION_SYMBOL : Text = "GOLDAO";

  // A function, not a constant: a switch is not allowed at module level.
  public func ledgerId() : Text {
    switch (MODE) {
      case (#test) GOLDAO_LEDGER_TEST;
      case (#production) GOLDAO_LEDGER_PRODUCTION;
    };
  };

  public type Account = { owner : Principal; subaccount : ?Blob };

  public type TransferFromArgs = {
    spender_subaccount : ?Blob;
    from : Account;
    to : Account;
    amount : Nat;
    fee : ?Nat;
    memo : ?Blob;
    created_at_time : ?Nat64;
  };

  public type TransferFromError = {
    #BadFee : { expected_fee : Nat };
    #BadBurn : { min_burn_amount : Nat };
    #InsufficientFunds : { balance : Nat };
    #InsufficientAllowance : { allowance : Nat };
    #TooOld;
    #CreatedInFuture : { ledger_time : Nat64 };
    #Duplicate : { duplicate_of : Nat };
    #TemporarilyUnavailable;
    #GenericError : { error_code : Nat; message : Text };
  };

  public type TransferFromResult = { #Ok : Nat; #Err : TransferFromError };

  public type Allowance = { allowance : Nat; expires_at : ?Nat64 };

  public type Ledger = actor {
    icrc1_balance_of : shared query Account -> async Nat;
    icrc1_fee : shared query () -> async Nat;
    icrc1_symbol : shared query () -> async Text;
    icrc2_allowance : shared query { account : Account; spender : Account } -> async Allowance;
    icrc2_transfer_from : shared TransferFromArgs -> async { #Ok : Nat; #Err : TransferFromError };
  };

  public func ledger() : Ledger { actor (ledgerId()) : Ledger };

  public func account(p : Principal) : Account { { owner = p; subaccount = null } };
};
