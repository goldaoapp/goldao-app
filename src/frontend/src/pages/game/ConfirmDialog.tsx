import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ink, inkFaint, inkMid } from "./game-utils";

interface Props {
  title: string;
  detail: string;
  /** When set, the user must type this word before confirming. */
  word?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Modal confirmation used before any action that moves funds or state. */
export function ConfirmDialog({
  title,
  detail,
  word,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-[color:var(--term-border)] bg-[var(--term-card)] p-6">
        <p className={cn("font-display text-lg font-semibold", ink)}>{title}</p>
        <p className={cn("text-sm", inkMid)}>{detail}</p>
        {word && (
          <label className="flex flex-col gap-1.5">
            <span className={cn("font-mono text-[11px]", inkFaint)}>
              Type {word} to continue
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="rounded-md border border-[color:var(--term-border)] bg-transparent px-3 py-1.5 font-mono text-sm"
            />
          </label>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!!busy || (!!word && typed !== word)}
            className="gradient-primary text-primary-foreground"
            onClick={onConfirm}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
