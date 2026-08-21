import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  public type UserRole = {
    #admin;
    #user;
    #guest;
  };

  public type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  public type TreasurySnapshot = {
    date       : Text;
    icp_amount : Float;
    icp_usd    : Float;
    ogy_amount : Float;
    ogy_usd    : Float;
    wtn_amount : Float;
    wtn_usd    : Float;
    total_usd  : Float;
    timestamp  : Nat64;
  };

  public type OldActor = {
    accessControlState : AccessControlState;
  };

  public type NewActor = {
    accessControlState  : AccessControlState;
    treasurySnapshots   : Map.Map<Text, TreasurySnapshot>;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      accessControlState = _old.accessControlState;
      treasurySnapshots  = Map.empty();
    };
  };
};
