import { UserRole } from "@/backend";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { Principal } from "@icp-sdk/core/principal";
import { Check, Copy, Shield, ShieldAlert, UserCog } from "lucide-react";
import { type ReactNode, useState } from "react";

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
      setStatus({ type: "err", msg: "Principal inválido." });
      return;
    }

    setSubmitting(true);
    try {
      await actor.assignCallerUserRole(principal, selectedRole);
      setStatus({
        type: "ok",
        msg: `Rol "${selectedRole}" asignado a ${target.trim()}.`,
      });
      // Si me reasigné a mí mismo, refrescar el estado local.
      if (principalId && target.trim() === principalId) await refresh();
      setTarget("");
    } catch (e) {
      setStatus({
        type: "err",
        msg: e instanceof Error ? e.message : "No se pudo asignar el rol.",
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
        title="Panel de administración"
        description="Gestión de roles de acceso del canister GOLDAO."
      />
      {children}
    </section>
  );

  if (isLoading || (isAuthenticated && roleLoading)) {
    return shell(<p className="text-sm text-muted-foreground">Cargando…</p>);
  }

  if (!isAuthenticated) {
    return shell(
      <Card className="border-border/80 shadow-subtle">
        <CardContent className="flex flex-col items-start gap-4 py-8">
          <p className="text-sm text-muted-foreground">
            Iniciá sesión con Internet Identity para acceder al panel.
          </p>
          <Button
            onClick={() => login()}
            className="rounded-full gradient-primary text-primary-foreground font-medium shadow-subtle hover:opacity-90"
          >
            <Shield className="size-4" />
            Iniciar sesión
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
            <p className="text-sm font-medium">Acceso no autorizado</p>
            <p className="text-sm text-muted-foreground">
              Tu principal no tiene rol de administrador
              {role ? ` (rol actual: ${role})` : ""}.
            </p>
          </div>
        </CardContent>
      </Card>,
    );
  }

  return shell(
    <div className="flex flex-col gap-6">
      {/* Identidad del admin */}
      <Card className="border-border/80 shadow-subtle">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Tu sesión
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
              aria-label="Copiar principal"
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

      {/* Asignar rol a un principal */}
      <Card className="border-border/80 shadow-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <UserCog className="size-4 text-primary" />
            Asignar rol
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
              Rol
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
              {submitting ? "Asignando…" : "Asignar rol"}
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
            El primer principal que inicia sesión queda como admin
            automáticamente. Desde acá podés promover otros principals o
            cambiarte el rol.
          </p>
        </CardContent>
      </Card>
    </div>,
  );
}
