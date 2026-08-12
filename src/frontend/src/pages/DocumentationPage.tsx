import {
  BookOpen,
  Code2,
  HelpCircle,
  type LucideIcon,
  Scale,
  Search,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DocCategory = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const docCategories: DocCategory[] = [
  {
    title: "Overview",
    description:
      "A high-level introduction to GOLDAO, its mission, and how the protocol fits together.",
    icon: BookOpen,
  },
  {
    title: "Governance",
    description:
      "How proposals are introduced, debated, and decided across the GOLDAO community.",
    icon: Scale,
  },
  {
    title: "Smart Contracts",
    description:
      "Technical references for the canisters, interfaces, and security model behind GOLDAO.",
    icon: Code2,
  },
  {
    title: "FAQ",
    description:
      "Answers to the most common questions from new members and prospective contributors.",
    icon: HelpCircle,
  },
];

export default function DocumentationPage() {
  return (
    <section
      data-ocid="page.documentation"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <header className="flex flex-col gap-3 pb-10">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          Docs
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Documentation
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Guides, technical references, and governance manuals for participating
          in the GOLDAO ecosystem. Browse the categories below to get started —
          full documentation is on its way.
        </p>
      </header>

      <div data-ocid="documentation.search" className="relative pb-12">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search documentation..."
          aria-label="Search documentation"
          data-ocid="documentation.search_input"
          className="h-12 rounded-xl border-border/60 bg-card pl-11 pr-4 text-base shadow-subtle focus-visible:border-ring"
        />
      </div>

      <div
        data-ocid="documentation.category_list"
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        {docCategories.map((category, index) => {
          const Icon = category.icon;
          return (
            <Card
              key={category.title}
              data-ocid={`documentation.category_card.${index}`}
              className="group relative overflow-hidden border-border/60 shadow-subtle transition-smooth hover:border-primary/40 hover:shadow-elevated"
            >
              <CardHeader className="gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition-smooth group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="font-display text-lg tracking-tight">
                  {category.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {category.description}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                  Content coming soon
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
