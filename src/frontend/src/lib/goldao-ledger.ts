import Principal "mo:core/Principal";

module {
  public let GOLDAO_LEDGER : Text = "tyyy3-4aaaa-aaaaq-aab7a-cai";

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

  public type Allowance = { allowance : Nat; expires_at : ?Nat64 };

  public type Ledger = actor {
    icrc1_balance_of : shared query Account -> async Nat;
    icrc1_fee : shared query () -> async Nat;
    icrc2_allowance : shared query { account : Account; spender : Account } -> async Allowance;
    icrc2_transfer_from : shared TransferFromArgs -> async { #Ok : Nat; #Err : TransferFromError };
  };

  public func ledger() : Ledger { actor (GOLDAO_LEDGER) : Ledger };

  public func account(p : Principal) : Account { { owner = p; subaccount = null } };
};
