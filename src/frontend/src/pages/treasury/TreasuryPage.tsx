import { Activity, Coins, TrendingUp, Wallet } from "lucide-react";

import { EmptyState, PageHeader, StatCard } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATS = [
  {
    id: "balance",
    label: "Treasury Balance",
    icon: Wallet,
    caption: "Total reserves across all custodied assets.",
  },
  {
    id: "assets",
    label: "Active Assets",
    icon: Coins,
    caption: "Distinct assets held across custodied wallets.",
  },
  {
    id: "activity",
    label: "Recent Activity",
    icon: Activity,
    caption: "Inflows and outflows over the trailing 30 days.",
  },
] as const;

export default function TreasuryPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Treasury"
        title="Treasury Dashboard"
        description="A transparent view of the GOLDAO treasury reserves, allocations, and historical flows."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {STATS.map((stat) => (
          <StatCard
            key={stat.id}
            label={stat.label}
            value="—"
            caption={stat.caption}
            icon={stat.icon}
            badge="Coming soon"
          />
        ))}
      </div>

      <Card className="mt-6 overflow-hidden border-border/80 shadow-subtle">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-semibold">
              Balance Trend
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="Chart coming soon"
            description="An interactive balance chart will appear here once the treasury data feed is connected."
          />
        </CardContent>
      </Card>
    </section>
  );
}
