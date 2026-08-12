import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export default function EmptyState({
  icon: Icon,
  title,
  description,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-base font-semibold text-foreground">
          {title}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
