import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  LayoutDashboard,
  ListOrdered,
  Pickaxe,
  Shield,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { AdminGamePanel } from "./AdminGamePanel";
import { MineBoard } from "./MineBoard";
import { PlayerDashboard } from "./PlayerDashboard";
import { PrizeGuide } from "./PrizeGuide";
import { RankingTable } from "./RankingTable";
import { WalletPanel } from "./WalletPanel";
import { fmtCountdown, gold, inkFaint, inkMid, panel } from "./game-utils";
import {
  useAdminView,
  useDashboard,
  useGameConfig,
  useRanking,
  useTournaments,
} from "./useGame";

/**
 * Gold mine game — /gamefi/mine.
 */
export default function GamePage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const { data: config } = useGameConfig();
  const { data: dashboard } = useDashboard();
  const { data: ranking } = useRanking();
  const { data: tournaments } = useTournaments();
  const { data: adminView } = useAdminView(isAuthenticated);

  const isAdmin = !!adminView;
  // Admins land on the admin tab; an admin view that arrives late still wins.
  const [picked, setPicked] = useState<string | null>(null);
  const tab = picked ?? (isAdmin ? "admin" : "mine");

  const tournament = dashboard?.tournament ?? ranking?.tournament;
  const paused = dashboard?.paused ?? false;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-10">
      <Link
        to="/gamefi"
        className={cn(
          "-mb-4 flex w-fit items-center gap-1.5 font-mono text-xs transition-colors hover:text-[color:var(--term-gold)]",
          inkFaint,
        )}
      >
        <ArrowLeft className="size-3.5" />
        All games
      </Link>
      <PageHeader
        tag="Game"
        tagIcon={Pickaxe}
        title="Gold Mine"
        description="Dig, decide when to save and chase the diamond jackpot. Tournaments run on a fixed schedule."
      >
        {tournament !== undefined && (
          <motion.span
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--term-border)] bg-[var(--term-card)] px-3 py-1.5 font-mono text-[11px]"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                paused
                  ? "bg-[color:var(--term-warn)]"
                  : "animate-pulse bg-[color:var(--term-green)]",
              )}
            />
            <span className={inkMid}>Tournament #{Number(tournament)}</span>
            <span className={gold}>
              {paused
                ? "paused"
                : dashboard
                  ? `ends in ${fmtCountdown(dashboard.endsAt)}`
                  : "open"}
            </span>
          </motion.span>
        )}
      </PageHeader>

      {isAuthenticated ? (
        isAdmin ? null : (
          <WalletPanel dashboard={dashboard} config={config} />
        )
      ) : (
        <div
          className={cn(
            panel,
            "flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p className={cn("text-sm", inkMid)}>
            Sign in with Internet Identity to start digging.
          </p>
          <Button
            onClick={() => login()}
            disabled={isLoading}
            className="rounded-full gradient-primary text-primary-foreground"
          >
            <Sparkles className="size-4" />
            Sign in
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setPicked} className="gap-4">
        <TabsList className="grid h-auto w-full auto-cols-fr grid-flow-col rounded-lg border border-[color:var(--term-border)] bg-[var(--term-header)] p-1 sm:flex sm:h-10 sm:w-fit sm:justify-start">
          {!isAdmin && <Tab value="mine" icon={<Pickaxe />} label="Mine" />}
          {!isAdmin && (
            <Tab
              value="stats"
              icon={<LayoutDashboard />}
              label="My stats"
              short="Stats"
            />
          )}
          <Tab value="ranking" icon={<ListOrdered />} label="Ranking" />
          <Tab
            value="guide"
            icon={<BookOpen />}
            label="How it works"
            short="Guide"
          />
          {adminView && <Tab value="admin" icon={<Shield />} label="Admin" />}
        </TabsList>

        {!isAdmin && (
          <TabsContent value="mine">
            <Fade>
              <MineBoard dashboard={dashboard} config={config} />
            </Fade>
          </TabsContent>
        )}
        {!isAdmin && (
          <TabsContent value="stats">
            <Fade>
              <PlayerDashboard dashboard={dashboard} />
            </Fade>
          </TabsContent>
        )}
        <TabsContent value="ranking">
          <Fade>
            <RankingTable ranking={ranking} tournaments={tournaments} />
          </Fade>
        </TabsContent>
        <TabsContent value="guide">
          <Fade>
            <PrizeGuide config={config} stakes={dashboard?.stakes} />
          </Fade>
        </TabsContent>
        {adminView && (
          <TabsContent value="admin">
            <Fade>
              <AdminGamePanel view={adminView} />
            </Fade>
          </TabsContent>
        )}
      </Tabs>

      <p className={cn("text-center font-mono text-[11px]", inkFaint)}>
        Every pick is resolved on chain with ICP randomness (raw_rand). The page
        only shows the result.
      </p>
    </section>
  );
}

function Tab({
  value,
  icon,
  label,
  short,
}: { value: string; icon: ReactNode; label: string; short?: string }) {
  return (
    <TabsTrigger
      value={value}
      className="h-full min-w-0 flex-col gap-1 px-1 py-1.5 sm:min-w-max font-mono text-[10px] sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1 sm:text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground [&_svg]:size-3.5"
    >
      {icon}
      <span className="sm:hidden">{short ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
    </TabsTrigger>
  );
}

function Fade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
