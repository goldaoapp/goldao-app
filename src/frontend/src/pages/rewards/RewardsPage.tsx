import { Gift } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";

export default function RewardsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Staking"
        title="Rewards Simulator"
        description="Model your staking position, lock duration, and projected APY to estimate your GOLDAO rewards over time."
      />

      <Card className="border-border/80 shadow-subtle">
        <CardContent className="py-8">
          <EmptyState
            icon={Gift}
            title="Simulator coming soon"
            description="Staking simulator and real-time reward flow diagram — coming soon."
          />
        </CardContent>
      </Card>
    </section>
  );
}
