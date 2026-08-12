import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import OQL "mo:caffeineai-oql";
import Expose "mo:caffeineai-oql/Expose";
// Resolver modules imported top-level so the OQL entity builder resolves
// `.manual`, the `.payload` / `.build` chain, and the `Text -> Value`
// implicit used by each payload extract. See extension-oql "Imports".
import Entity "mo:caffeineai-oql/Entity";
import TextValue "mo:caffeineai-oql/TextValue";
import Principal "mo:core/Principal";

actor {
  let accessControlState : AccessControl.AccessControlState;
  include MixinAuthorization(accessControlState, null);

  // OQL (Data Intelligence) — expose the persisted `userRoles` map as a
  // queryable `userRole` entity. The row identity (the Principal key) lives
  // in the Map key and the value is a variant, so this uses manual mode over
  // `.entries()`. Authorization is `.controllerOnly()` (the default): the
  // Data Intelligence agent reads it as the controller, end users do not.
  include Expose({
    entities = [
      OQL.Entity.manual<(Principal, AccessControl.UserRole)>(
        "userRole",
        func () = accessControlState.userRoles.entries(),
        "UserRoleAssignment",
        "user",
      )
        .payload("user", func ((p, _)) = p.toText())
        .payload("role", func ((_, r)) = switch r {
          case (#admin) "admin";
          case (#user) "user";
          case (#guest) "guest";
        })
        .controllerOnly()
        .build(),
    ];
  });
};
