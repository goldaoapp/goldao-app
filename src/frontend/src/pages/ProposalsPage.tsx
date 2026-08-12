import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ProposalStatus = "Active" | "Pending" | "Closed";

type SampleProposal = {
  id: number;
  title: string;
  summary: string;
  status: ProposalStatus;
};

const SAMPLE_PROPOSALS: SampleProposal[] = [
  {
    id: 1,
    title: "Treasury Diversification into Stablecoin Reserve",
    summary:
      "Rebalance a portion of the treasury into yield-bearing stable assets to reduce volatility exposure.",
    status: "Active",
  },
  {
    id: 2,
    title: "Update Validator Slashing Parameters for Q4",
    summary:
      "Adjust the slashing window and penalty curve to better reflect current network conditions.",
    status: "Pending",
  },
  {
    id: 3,
    title: "Community Grants Program — Cohort 3 Funding",
    summary:
      "Renew the grants program budget and refine eligibility criteria for the next cohort of builders.",
    status: "Closed",
  },
];

const STATUS_VARIANT: Record<
  ProposalStatus,
  "default" | "secondary" | "outline"
> = {
  Active: "default",
  Pending: "secondary",
  Closed: "outline",
};

export default function ProposalsPage() {
  return (
    <section
      data-ocid="page.proposals"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <header className="flex flex-col gap-6 pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-primary">
            Governance
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Proposals
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Review active proposals, examine their rationale, and cast your vote
            on the future direction of the DAO. Proposal details and voting
            workflows will be available soon.
          </p>
        </div>
        <Button
          data-ocid="proposals.new_proposal_button"
          variant="default"
          size="default"
          className="self-start sm:self-end"
        >
          <Plus aria-hidden="true" />
          New Proposal
        </Button>
      </header>

      <div
        data-ocid="proposals.list"
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {SAMPLE_PROPOSALS.map((proposal, index) => (
          <Card
            key={proposal.id}
            data-ocid={`proposals.card.${index + 1}`}
            className="shadow-subtle transition-smooth hover:shadow-elevated"
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <Badge
                  data-ocid={`proposals.status_badge.${index + 1}`}
                  variant={STATUS_VARIANT[proposal.status]}
                >
                  {proposal.status}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  P-{String(proposal.id).padStart(3, "0")}
                </span>
              </div>
              <CardTitle className="font-display text-lg leading-snug">
                {proposal.title}
              </CardTitle>
              <CardDescription>{proposal.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm italic text-muted-foreground">
                Details coming soon.
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
