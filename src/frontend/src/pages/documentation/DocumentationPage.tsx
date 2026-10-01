import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";
import { DOC_GROUPS, DOC_PAGES } from "./docs-content";
import { useDocsLive } from "./docs-data";
import { border, gold, ink, inkFaint, inkMid } from "./docs-ui";

function readHashPage(): string {
  const h = window.location.hash.replace(/^#/, "");
  return DOC_PAGES.some((p) => p.id === h) ? h : DOC_PAGES[0].id;
}

/** Current page id lives in the URL hash (#nns-neuron) so links can be shared. */
function useHashPage(): [string, (id: string) => void] {
  const [id, setId] = useState(readHashPage);
  useEffect(() => {
    const onHash = () => {
      setId(readHashPage());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (next: string) => {
    window.location.hash = next;
  };
  return [id, go];
}

export default function DocumentationPage() {
  const [pageId, go] = useHashPage();
  const live = useDocsLive();
  const index = DOC_PAGES.findIndex((p) => p.id === pageId);
  const page = DOC_PAGES[index];
  const prev = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];

  const groups = useMemo(
    () =>
      DOC_GROUPS.map((g) => ({
        name: g,
        pages: DOC_PAGES.filter((p) => p.group === g),
      })),
    [],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <PageHeader
        tag="Docs"
        title="Knowledge hub"
        description="How the Gold DAO treasury, rewards and burns work, and how to take part."
      />

      {/* Mobile menu */}
      <label className="lg:hidden">
        <span className="sr-only">Choose a page</span>
        <select
          value={pageId}
          onChange={(e) => go(e.target.value)}
          className={cn(
            "w-full rounded-md border bg-[var(--term-card)] px-3 py-2.5 font-mono text-sm",
            border,
            ink,
          )}
        >
          {groups.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.child ? `— ${p.title}` : p.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Desktop menu */}
        <nav aria-label="Documentation" className="hidden lg:block">
          <div className="sticky top-6 flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.name}>
                <div
                  className={cn(
                    "mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
                    gold,
                  )}
                >
                  {g.name}
                </div>
                <ul className="flex flex-col">
                  {g.pages.map((p) => {
                    const active = p.id === pageId;
                    return (
                      <li key={p.id}>
                        <a
                          href={`#${p.id}`}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "block rounded-md py-1.5 pr-2 text-[14px] transition-colors",
                            p.child
                              ? "ml-3 border-l border-[color:var(--term-border)] pl-3"
                              : "pl-2",
                            active
                              ? cn(
                                  "bg-[var(--term-gold-soft)] font-medium",
                                  ink,
                                )
                              : cn(
                                  inkMid,
                                  "hover:text-[color:var(--term-ink)]",
                                ),
                          )}
                        >
                          {p.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <article
          className={cn(
            "min-w-0 rounded-xl border bg-[var(--term-card)]",
            border,
          )}
        >
          <header
            className={cn(
              "border-b bg-[var(--term-header)] px-5 py-4 sm:px-8",
              border,
            )}
          >
            <div
              className={cn(
                "font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
                inkMid,
              )}
            >
              {page.group}
            </div>
            <h1
              className={cn(
                "mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl",
                ink,
              )}
            >
              {page.title}
            </h1>
          </header>
          <div className="px-5 py-6 sm:px-8 sm:py-8">{page.render(live)}</div>

          {(prev || next) && (
            <footer
              className={cn(
                "grid grid-cols-2 gap-3 border-t p-4 sm:p-5",
                border,
              )}
            >
              {prev ? (
                <a
                  href={`#${prev.id}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-4 py-3 transition-colors hover:border-[color:var(--term-gold)]",
                    border,
                  )}
                >
                  <ChevronLeft className={cn("size-4 shrink-0", inkFaint)} />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block font-mono text-[10px] uppercase tracking-wider",
                        inkFaint,
                      )}
                    >
                      Previous
                    </span>
                    <span
                      className={cn("block truncate text-sm font-medium", ink)}
                    >
                      {prev.title}
                    </span>
                  </span>
                </a>
              ) : (
                <span />
              )}
              {next && (
                <a
                  href={`#${next.id}`}
                  className={cn(
                    "flex items-center justify-end gap-2 rounded-md border px-4 py-3 text-right transition-colors hover:border-[color:var(--term-gold)]",
                    border,
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block font-mono text-[10px] uppercase tracking-wider",
                        inkFaint,
                      )}
                    >
                      Next
                    </span>
                    <span
                      className={cn("block truncate text-sm font-medium", ink)}
                    >
                      {next.title}
                    </span>
                  </span>
                  <ChevronRight className={cn("size-4 shrink-0", inkFaint)} />
                </a>
              )}
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
