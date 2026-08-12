import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  // Inlined from mo:caffeineai-authorization/access-control (migrations must be self-contained).
  public type UserRole = {
    #admin;
    #user;
    #guest;
  };

  public type AccessControlState = {
    var adminAssigned : Bool;
    userRoles : Map.Map<Principal, UserRole>;
  };

  // First migration: introduce stable state for the first time, so OldActor is empty.
  public type OldActor = {};
  public type NewActor = {
    accessControlState : AccessControlState;
  };

  public func migration(old : OldActor) : NewActor {
    {
      accessControlState = {
        var adminAssigned = false;
        userRoles = Map.empty();
      };
    };
  };
};
