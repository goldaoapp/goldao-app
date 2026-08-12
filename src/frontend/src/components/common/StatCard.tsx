import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  badge?: string;
};

export default function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  badge,
}: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden border-border/80 shadow-subtle transition-smooth hover:shadow-elevated">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary transition-smooth group-hover:border-primary/40">
            <Icon className="h-5 w-5" />
          </div>
          {badge && (
            <Badge
              variant="outline"
              className="border-primary/30 text-primary/90"
            >
              {badge}
            </Badge>
          )}
        </div>
        <CardTitle className="mt-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-4xl font-bold tracking-tight text-foreground">
            {value}
          </span>
          <p className="text-sm text-muted-foreground">{caption}</p>
        </div>
      </CardContent>
    </Card>
  );
}
