import { cn } from "@/lib/utils";

/**
 * Small ring shown while a value is loading. It uses the current text colour
 * and size, so it follows the light and dark themes automatically.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-[max(0.7em,10px)] animate-spin rounded-full border-[max(0.1em,1.5px)] border-current border-t-transparent align-middle opacity-50",
        className,
      )}
    />
  );
}
