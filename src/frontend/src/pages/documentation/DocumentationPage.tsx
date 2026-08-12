import { BookOpen } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";

export default function DocumentationPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Docs"
        title="Documentation"
        description="Guides, technical references, and governance manuals for participating in the GOLDAO ecosystem."
      />

      <Card className="border-border/80 shadow-subtle">
        <CardContent className="py-8">
          <EmptyState
            icon={BookOpen}
            title="Documentation coming soon"
            description="Overview, governance guides, smart contract references, and FAQs will be available here."
          />
        </CardContent>
      </Card>
    </section>
  );
}
