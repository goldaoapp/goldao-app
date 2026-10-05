import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { inkFaint, inkMid } from "./game-utils";

/** A read-only value (an address) with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn("font-mono text-[11px]", inkFaint)}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code
          className={cn(
            "max-w-full break-all rounded-md border border-[color:var(--term-border)] px-3 py-1.5 font-mono text-xs",
            inkMid,
          )}
        >
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void copy()}
          className="gap-1.5"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
