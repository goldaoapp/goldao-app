import { UserRole } from "@/backend";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Principal } from "@icp-sdk/core/principal";
import { Check, Copy, Shield, ShieldAlert, UserCog, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

const ROLES: UserRole[] = [UserRole.admin, UserRole.user, UserRole.guest];

export default function AdminPage() {
  const {
    isAuthenticated,
    isLoading,
    roleLoading,
    isAdmin,
    role,
    principalId,
    actor,
    login,
    refresh,
  } = useAuth();

  const [target, setTarget] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.admin);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "ok" | "err";
    msg: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [roles, setRoles] = useState<Array<[Principal, UserRole]>>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Load every principal that has a role (admin only).
  const loadRoles = useCallback(async () => {
    if (!actor || !isAdmin) return;
    try {
      const res = await actor.adminListRoles();
      if (res.__kind__ === "ok") {
        setRoles(res.ok);
        setRolesError(null);
      } else {
        setRolesError(res.err);
      }
    } catch (e) {
      setRolesError(
        e instanceof Error ? e.message : "Could not load the list.",
      );
    }
  }, [actor, isAdmin]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  // The backend grants the admin role only if the caller is the hardcoded
  // bootstrap principal. For anyone else it returns false and changes nothing.
  useEffect(() => {
    if (!actor || !isAuthenticated || roleLoading || isAdmin) return;
    let cancelled = false;
    void actor
      .adminSyncBootstrap()
      .then(async (granted) => {
        if (granted && !cancelled) await refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [actor, isAuthenticated, roleLoading, isAdmin, refresh]);

  const copyPrincipal = () => {
    if (!principalId) return;
    void navigator.clipboard.writeText(principalId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleAssign = async () => {
    if (!actor) return;
    setStatus(null);

    let principal: Principal;
    try {
      principal = Principal.fromText(target.trim());
    } catch {
      setStatus({ type: "err", msg: "Invalid principal." });
      return;
    }

    setSubmitting(true);
    try {
      await actor.assignCallerUserRole(principal, selectedRole);
      setStatus({
        type: "ok",
        msg: `Role "${selectedRole}" assigned to ${target.trim()}.`,
      });
      // If the caller changed their own role, refresh the local state.
      if (principalId && target.trim() === principalId) await refresh();
      setTarget("");
      await loadRoles();
    } catch (e) {
      setStatus({
        type: "err",
        msg: e instanceof Error ? e.message : "Could not assign the role.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: ReactNode) => (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Admin"
        tagIcon={Shield}
        title="Admin panel"
        description="Access role management for the GOLDAO canister."
      />
      {children}
    </section>
  );

  if (isLoading || (isAuthenticated && roleLoading)) {
    return shell(<p className="text-sm text-muted-foreground">Loading…</p>);
  }

  if (!isAuthenticated) {
    return shell(
      <Card className="border-border/80 shadow-subtle">
        <CardContent className="flex flex-col items-start gap-4 py-8">
          <p className="text-sm text-muted-foreground">
            Sign in with Internet Identity to open the panel.
          </p>
          <Button
            onClick={() => login()}
            className="rounded-full gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90"
          >
            <Shield className="size-4" />
            Sign in
          </Button>
        </CardContent>
      </Card>,
    );
  }

  if (!isAdmin) {
    return shell(
      <Card className="border-border/80 shadow-subtle">
        <CardContent className="flex items-start gap-3 py-8">
          <ShieldAlert className="size-5 flex-shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Access denied</p>
            <p className="text-sm text-muted-foreground">
              Your principal does not have the admin role
              {role ? ` (current role: ${role})` : ""}.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-border bg-muted/20 px-3 py-2 font-mono text-xs">
                {principalId}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyPrincipal}
                aria-label="Copy principal"
              >
                {copied ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>,
    );
  }

  return shell(
    <div className="flex flex-col gap-6">
      {/* Caller identity */}
      <Card className="border-border/80 shadow-subtle">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Your session
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 px-2.5 py-0.5 text-xs font-medium text-primary">
              <Shield className="size-3.5" />
              {role ?? "admin"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-border bg-muted/20 px-3 py-2 font-mono text-xs">
              {principalId}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyPrincipal}
              aria-label="Copy principal"
            >
              {copied ? (
                <Check className="size-4 text-primary" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Assign a role to a principal */}
      <Card className="border-border/80 shadow-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <UserCog className="size-4 text-primary" />
            Assign role
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-principal"
              className="text-xs font-medium text-muted-foreground"
            >
              Principal
            </label>
            <Input
              id="admin-principal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="aaaaa-bbbbb-…-cai"
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-role"
              className="text-xs font-medium text-muted-foreground"
            >
              Role
            </label>
            <select
              id="admin-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleAssign}
              disabled={submitting || target.trim().length === 0}
            >
              {submitting ? "Assigning…" : "Assign role"}
            </Button>
            {status && (
              <span
                className={
                  status.type === "ok"
                    ? "text-xs text-primary"
                    : "text-xs text-destructive"
                }
              >
                {status.msg}
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Only the bootstrap principal set in the backend becomes admin
            automatically. From here you can promote other principals or change
            a role.
          </p>
        </CardContent>
      </Card>

      {/* Principals with a role */}
      <Card className="border-border/80 shadow-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Users className="size-4 text-primary" />
            Principals with a role
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rolesError && (
            <span className="text-xs text-destructive">{rolesError}</span>
          )}
          {roles.length === 0 && !rolesError && (
            <span className="text-xs text-muted-foreground">
              No roles assigned.
            </span>
          )}
          {roles.map(([p, r]) => (
            <div key={p.toText()} className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-border bg-muted/20 px-3 py-2 font-mono text-xs">
                {p.toText()}
              </code>
              <span className="inline-flex items-center rounded-full border border-primary/30 px-2.5 py-0.5 text-xs font-medium text-primary">
                {r}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>,
  );
}
