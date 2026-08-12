import { Activity, Coins, TrendingUp, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StatCard = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  caption: string;
};

const STAT_CARDS: StatCard[] = [
  {
    id: "balance",
    label: "Treasury Balance",
    icon: Wallet,
    value: "—",
    caption: "Total reserves across all custodied assets.",
  },
  {
    id: "assets",
    label: "Active Assets",
    icon: Coins,
    value: "—",
    caption: "Distinct assets held across custodied wallets.",
  },
  {
    id: "activity",
    label: "Recent Activity",
    icon: Activity,
    value: "—",
    caption: "Inflows and outflows over the trailing 30 days.",
  },
];

export default function TreasuryPage() {
  return (
    <section
      data-ocid="page.treasury"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <header
        data-ocid="page.treasury.header"
        className="flex flex-col gap-3 pb-10"
      >
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          Treasury
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Treasury Dashboard
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          A transparent view of the GOLDAO treasury reserves, allocations, and
          historical flows. Track custodied assets, monitor recent activity, and
          review balance trends as the dashboard comes online.
        </p>
      </header>

      <div
        data-ocid="page.treasury.stats"
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {STAT_CARDS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.id}
              data-ocid={`page.treasury.stats.card.${stat.id}`}
              className="group relative overflow-hidden border-border/80 shadow-subtle transition-smooth hover:shadow-elevated"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary transition-smooth group-hover:border-primary/40">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-primary/30 text-primary/90"
                  >
                    Coming soon
                  </Badge>
                </div>
                <CardTitle className="mt-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  <span className="font-display text-4xl font-bold tracking-tight text-foreground">
                    {stat.value}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {stat.caption}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card
        data-ocid="page.treasury.chart"
        className="mt-6 overflow-hidden border-border/80 shadow-subtle"
      >
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Balance Trend
                </CardTitle>
                <CardDescription className="mt-0.5">
                  Historical treasury balance over the selected window.
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-primary/30 text-primary/90"
            >
              Coming soon
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            data-ocid="page.treasury.chart.placeholder"
            className="relative flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-display text-base font-semibold text-foreground">
                Chart coming soon
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                An interactive balance chart will appear here once the treasury
                data feed is connected.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
