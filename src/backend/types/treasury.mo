module {
  public type TreasurySnapshot = {
    date       : Text;    // "YYYY-MM-DD"
    icp_amount : Float;
    icp_usd    : Float;
    ogy_amount : Float;
    ogy_usd    : Float;
    wtn_amount : Float;
    wtn_usd    : Float;
    total_usd  : Float;
    timestamp  : Nat64;   // unix ms when saved
  };
};
