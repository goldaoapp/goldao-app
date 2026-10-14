import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";
import { inkMid, panel } from "./game-utils";

/** Shown instead of the admin panel while the sign-in lasts longer than an admin session should. */
export function AdminSessionLock({
  onRenew,
  busy,
}: { onRenew: () => void; busy: boolean }) {
  return (
    <div
      className={cn(
        panel,
        "flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <p className={cn("flex items-start gap-2 text-sm", inkMid)}>
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        Admin actions need a short sign-in (8 hours). Sign in again to open the
        admin panel.
      </p>
      <Button
        onClick={onRenew}
        disabled={busy}
        className="rounded-full gradient-primary text-primary-foreground"
      >
        Sign in for 8 hours
      </Button>
    </div>
  );
}
