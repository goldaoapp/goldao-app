import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Coins,
  FileText,
  Gavel,
  Gift,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SectionCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
};

const SECTION_CARDS: SectionCard[] = [
  {
    icon: Coins,
    title: "Treasury Dashboard",
    description:
      "Track the community-owned reserve. Reserves, allocations, and flows at a glance.",
    to: "/treasury",
  },
  {
    icon: Gavel,
    title: "Proposals",
    description:
      "Review active governance proposals, see voting weight, and follow outcomes.",
    to: "/proposals",
  },
  {
    icon: Gift,
    title: "Rewards Simulator",
    description:
      "Model staking and participation rewards before committing your gold.",
    to: "/rewards",
  },
  {
    icon: BookOpen,
    title: "Documentation",
    description:
      "Read the DAO charter, governance process, and integration guides.",
    to: "/documentation",
  },
  {
    icon: FileText,
    title: "News",
    description:
      "Announcements, treasury updates, and community signals from the GOLDAO council.",
    to: "/news",
  },
];

export default function HomePage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center text-center gap-6 py-16 sm:py-20 animate-fade-in-up">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-subtle">
          Gold-backed governance
        </span>
        <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="text-gradient-gold">GOLDAO</span>
        </h1>
        <p className="font-display text-xl font-medium text-foreground sm:text-2xl">
          Sovereign treasury, transparent governance.
        </p>
        <p className="max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg">
          A community-owned DAO stewarding a gold-backed reserve through open
          proposals and sustainable rewards.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SECTION_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.to}
              to={card.to}
              aria-label={`${card.title} — open section`}
              className="group outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl"
            >
              <Card className="h-full transition-smooth hover:border-primary/40 hover:shadow-elevated">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-lg border border-border bg-secondary text-primary transition-smooth group-hover:border-primary/40 group-hover:bg-primary/10">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <ArrowRight
                      className="size-4 text-muted-foreground transition-smooth group-hover:translate-x-0.5 group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <CardTitle className="font-display text-lg text-foreground">
                    {card.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {card.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
