import { Gavel } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";

export default function ProposalsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Governance"
        title="Proposals"
        description="Review active proposals, examine their rationale, and cast your vote on the future direction of the DAO."
      />

      <Card className="border-border/80 shadow-subtle">
        <CardContent className="py-8">
          <EmptyState
            icon={Gavel}
            title="No proposals yet"
            description="Active proposals and voting workflows will appear here once governance is connected."
          />
        </CardContent>
      </Card>
    </section>
  );
}
