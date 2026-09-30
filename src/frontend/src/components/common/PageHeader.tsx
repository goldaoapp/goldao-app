import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  tag: string;
  tagIcon?: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
};

/** Page title in the terminal style: gold mono eyebrow, sober title, short description. */
export default function PageHeader({
  tag,
  tagIcon: Icon,
  title,
  description,
  children,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-6 pb-8 pr-20 sm:flex-row sm:items-end sm:justify-between md:pr-0">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--term-gold)]">
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
          {tag}
        </span>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[color:var(--term-ink)] sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-2xl text-sm text-[color:var(--term-ink-mid)] sm:text-base">
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}
