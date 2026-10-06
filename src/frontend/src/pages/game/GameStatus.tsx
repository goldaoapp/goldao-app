import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";
import { inkMid, panel } from "./game-utils";

interface Props {
  /** The session or the first game data is still on its way. */
  waiting: boolean;
  /** A request failed after its automatic retries. */
  failed: boolean;
  onRetry: () => void;
}

/**
 * Shows that the game is connecting, says so when it takes longer than usual, and offers a retry
 * when loading failed. Renders nothing once everything is loaded.
 */
export function GameStatus({ waiting, failed, onRetry }: Props) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), 8_000);
    return () => window.clearTimeout(t);
  }, [waiting]);

  if (failed) {
    return (
      <div
        role="alert"
        className={cn(
          panel,
          "flex flex-wrap items-center justify-between gap-3 border-destructive/50 p-4",
        )}
      >
        <p className="text-sm text-destructive">
          Could not load the game. Check your connection and try again.
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (!waiting) return null;
  return (
    <output className={cn(panel, "flex items-center gap-3 p-4")}>
      <Spinner className="size-4" />
      <span className={cn("font-mono text-xs", inkMid)}>
        {slow
          ? "Taking longer than usual. Still connecting to the game…"
          : "Connecting to the game…"}
      </span>
    </output>
  );
}
