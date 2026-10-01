/**
 * Small presentational pieces for the Docs module (terminal style, --term-*).
 */

import { cn } from "@/lib/utils";
import { ArrowUpRight, Info, TriangleAlert } from "lucide-react";
import type React from "react";

export const ink = "text-[color:var(--term-ink)]";
export const inkMid = "text-[color:var(--term-ink-mid)]";
export const inkFaint = "text-[color:var(--term-ink-faint)]";
export const gold = "text-[color:var(--term-gold)]";
export const border = "border-[color:var(--term-border)]";

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className={cn(
        "mt-10 mb-3 font-display text-xl font-semibold tracking-tight first:mt-0",
        ink,
      )}
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className={cn(
        "mt-6 mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
        gold,
      )}
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn("my-3 text-[15px] leading-relaxed", inkMid)}>{children}</p>
  );
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong className={cn("font-semibold", ink)}>{children}</strong>;
}

export function A({
  href,
  children,
}: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-baseline gap-0.5 underline decoration-[color:var(--term-gold)]/50 underline-offset-2 hover:decoration-[color:var(--term-gold)]",
        gold,
      )}
    >
      {children}
      <ArrowUpRight className="size-3 self-center" aria-hidden="true" />
    </a>
  );
}

/** Internal link to another docs page (hash navigation). */
export function DocLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`#${to}`}
      className={cn(
        "underline decoration-[color:var(--term-gold)]/50 underline-offset-2 hover:decoration-[color:var(--term-gold)]",
        gold,
      )}
    >
      {children}
    </a>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      className={cn(
        "break-all rounded bg-[var(--term-alt)] px-1.5 py-0.5 font-mono text-[12px]",
        ink,
      )}
    >
      {children}
    </code>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul
      className={cn(
        "my-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed marker:text-[color:var(--term-gold)]",
        inkMid,
      )}
    >
      {children}
    </ul>
  );
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol
      className={cn(
        "my-3 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed marker:font-mono marker:text-[color:var(--term-gold)]",
        inkMid,
      )}
    >
      {children}
    </ol>
  );
}

export function Callout({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "my-4 flex gap-3 rounded-md border px-4 py-3 text-sm leading-relaxed",
        tone === "warn"
          ? "border-[color:var(--term-warn)]/40 bg-[var(--term-warn-bg)]"
          : "border-[color:var(--term-border)] bg-[var(--term-gold-soft)]",
        inkMid,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-[color:var(--term-warn)]" : gold,
        )}
        aria-hidden="true"
      />
      <div>{children}</div>
    </div>
  );
}

export function Table({
  head,
  rows,
}: {
  head?: React.ReactNode[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className={cn("my-4 overflow-x-auto rounded-md border", border)}>
      <table className="w-full text-left text-sm">
        {head && (
          <thead className="bg-[var(--term-header)]">
            <tr>
              {head.map((h, i) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: static table
                  key={i}
                  className={cn(
                    "px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
                    inkMid,
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: static table
              key={i}
              className="border-t border-[color:var(--term-border-faint)] first:border-t-0"
            >
              {r.map((c, j) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: static table
                  key={j}
                  className={cn(
                    "px-4 py-2.5 align-top text-[13px]",
                    j === 0 ? inkMid : ink,
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Figure({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className={cn("my-4 overflow-hidden rounded-md border", border)}>
      <img src={src} alt={alt} loading="lazy" className="w-full" />
    </figure>
  );
}

export function Faq({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className={cn(
        "group my-2 rounded-md border bg-[var(--term-card)] px-4 py-3 open:pb-4",
        border,
      )}
    >
      <summary
        className={cn(
          "cursor-pointer list-none font-display text-[15px] font-semibold marker:hidden",
          ink,
        )}
      >
        <span className="mr-2 inline-block font-mono text-[color:var(--term-gold)] transition-transform group-open:rotate-90">
          ›
        </span>
        {q}
      </summary>
      <div className="mt-2 pl-5">{children}</div>
    </details>
  );
}

/** Live number placeholder: shows "…" while loading, "—" if unavailable. */
export function Live({
  value,
  unit,
  digits = 0,
}: {
  value: number | null | undefined;
  unit?: string;
  digits?: number;
}) {
  const text =
    value === undefined
      ? "…"
      : value === null
        ? "—"
        : value.toLocaleString("en-US", {
            maximumFractionDigits: digits,
            minimumFractionDigits: digits,
          });
  return (
    <span className="whitespace-nowrap font-mono tabular-nums">
      {text}
      {unit && value != null ? ` ${unit}` : ""}
    </span>
  );
}
