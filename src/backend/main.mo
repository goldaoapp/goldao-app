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
import Map "mo:core/Map";
import Float "mo:core/Float";

import TreasuryTypes "types/treasury";
import TreasuryMixin "mixins/treasury-api";

actor {
  let accessControlState : AccessControl.AccessControlState;
  include MixinAuthorization(accessControlState, null);

  // ── Treasury state ─────────────────────────────────────────────────────
  let treasurySnapshots : Map.Map<Text, TreasuryTypes.TreasurySnapshot>;

  include TreasuryMixin(treasurySnapshots);

  // ── OQL (Data Intelligence) ────────────────────────────────────────────
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

      OQL.Entity.manual<TreasuryTypes.TreasurySnapshot>(
        "treasurySnapshot",
        func () = treasurySnapshots.values(),
        "TreasurySnapshot",
        "date",
      )
        .payload("date",       func s = s.date)
        .payload("icp_amount", func s = s.icp_amount.toText())
        .payload("icp_usd",    func s = s.icp_usd.toText())
        .payload("ogy_amount", func s = s.ogy_amount.toText())
        .payload("ogy_usd",    func s = s.ogy_usd.toText())
        .payload("wtn_amount", func s = s.wtn_amount.toText())
        .payload("wtn_usd",    func s = s.wtn_usd.toText())
        .payload("total_usd",  func s = s.total_usd.toText())
        .controllerOnly()
        .build(),
    ];
  });
};
