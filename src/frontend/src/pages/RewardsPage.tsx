import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RewardsPage() {
  return (
    <section
      data-ocid="page.rewards"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
    >
      <header className="flex flex-col gap-2 pb-10">
        <span className="text-xs font-medium uppercase tracking-wider text-primary">
          Staking
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Rewards Simulator
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Model your staking position, lock duration, and projected APY to
          estimate your GOLDAO rewards over time. Adjust the inputs below to
          preview how stake size and lock period shape your expected returns.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          data-ocid="rewards.simulator_form.card"
          className="border-border/60 shadow-subtle"
        >
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Simulation inputs
            </CardTitle>
            <CardDescription>
              Enter your staking parameters to project estimated rewards.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="stake-amount">Stake amount</Label>
              <Input
                id="stake-amount"
                type="text"
                inputMode="decimal"
                placeholder="Enter stake amount"
                data-ocid="rewards.stake_amount.input"
                aria-describedby="stake-amount-hint"
              />
              <p
                id="stake-amount-hint"
                className="text-xs text-muted-foreground"
              >
                Amount of GOLDAO you intend to lock.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="stake-duration">Duration</Label>
              <Input
                id="stake-duration"
                type="text"
                placeholder="Select duration"
                data-ocid="rewards.duration.input"
                aria-describedby="stake-duration-hint"
              />
              <p
                id="stake-duration-hint"
                className="text-xs text-muted-foreground"
              >
                Lock period in days or cycles.
              </p>
            </div>

            <Button
              type="button"
              size="lg"
              data-ocid="rewards.simulate.button"
              className="w-full gradient-primary text-primary-foreground hover:opacity-90"
            >
              Simulate
            </Button>
          </CardContent>
        </Card>

        <Card
          data-ocid="rewards.result.card"
          className="border-border/60 shadow-subtle"
        >
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Projected rewards
            </CardTitle>
            <CardDescription>
              Your simulated rewards summary will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              data-ocid="rewards.result.empty_state"
              className="flex min-h-[14rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center"
            >
              <span className="font-mono text-xs uppercase tracking-wider text-primary">
                Awaiting input
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                Simulated rewards will appear here once you enter your stake
                amount and duration, then run the simulator.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
