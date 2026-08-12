import { Newspaper } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";

export default function NewsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        tag="Updates"
        tagIcon={Newspaper}
        title="News"
        description="Announcements, governance recaps, and ecosystem updates from the GOLDAO community."
      />

      <Card className="border-border/80 shadow-subtle">
        <CardContent className="py-8">
          <EmptyState
            icon={Newspaper}
            title="No news yet"
            description="Treasury updates, proposal recaps, and community announcements will appear here."
          />
        </CardContent>
      </Card>
    </section>
  );
}
