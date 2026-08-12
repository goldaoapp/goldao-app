import { Calendar, Newspaper } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const NEWS_ARTICLES = [
  {
    title: "GOLDAO Treasury Reaches New Milestone",
    date: "Coming soon",
    summary: "Article coming soon — full recap of the latest treasury update.",
  },
  {
    title: "Governance Proposal Recap: Q3 Highlights",
    date: "Coming soon",
    summary:
      "Article coming soon — a summary of community proposals and votes.",
  },
  {
    title: "Ecosystem Rewards Program Launch",
    date: "Coming soon",
    summary: "Article coming soon — details on the new rewards distribution.",
  },
];

export default function NewsPage() {
  return (
    <section
      data-ocid="page.news"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <header data-ocid="page.news.header" className="flex flex-col gap-2 pb-8">
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary">
          <Newspaper className="size-3.5" aria-hidden="true" />
          Updates
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          News
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Announcements, governance recaps, and ecosystem updates from the
          GOLDAO community. Stay informed on the latest treasury movements,
          proposals, and rewards.
        </p>
      </header>

      <div
        data-ocid="page.news.list"
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {NEWS_ARTICLES.map((article, index) => (
          <Card
            key={article.title}
            data-ocid={`page.news.card.${index + 1}`}
            className="group relative overflow-hidden border-border bg-card transition-smooth hover:border-primary/40 hover:shadow-elevated"
          >
            <div className="absolute inset-x-0 top-0 h-px gradient-primary opacity-0 transition-smooth group-hover:opacity-100" />
            <CardHeader>
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-primary"
                  aria-hidden="true"
                >
                  <Newspaper className="size-5" />
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  {article.date}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <CardTitle className="font-display text-lg leading-snug">
                {article.title}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {article.summary}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
