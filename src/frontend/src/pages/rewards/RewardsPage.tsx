import { PageHeader } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import RewardsFlow from "./RewardsFlow";
import RewardsSimulator from "./RewardsSimulator";

export default function RewardsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <PageHeader
        tag="Rewards"
        title="Staking rewards"
        description="Simulate your GOLDAO rewards, then trace where the reward flow sits in real time."
      />

      <Tabs defaultValue="simulator" className="gap-6">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="simulator" className="flex-1 sm:flex-none">
            Simulator
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex-1 sm:flex-none">
            Reward Flow
          </TabsTrigger>
        </TabsList>

        <TabsContent value="simulator">
          <RewardsSimulator />
        </TabsContent>
        <TabsContent value="flow">
          <RewardsFlow />
        </TabsContent>
      </Tabs>
    </div>
  );
}
