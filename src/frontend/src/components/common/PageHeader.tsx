import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  tag: string;
  tagIcon?: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
};

export default function PageHeader({
  tag,
  tagIcon: Icon,
  title,
  description,
  children,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-6 pb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-primary">
          {Icon && <Icon className="size-3.5" aria-hidden="true" />}
          {tag}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{description}</p>
      </div>
      {children}
    </header>
  );
}
