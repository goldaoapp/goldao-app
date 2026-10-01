import { PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Coins,
  Gamepad2,
  Gem,
  Lock,
  Mountain,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { Spinner } from "../game/Spinner";
import {
  DIAMOND_CELL,
  DIAMOND_IMG,
  DIAMOND_TEXT,
  ROCK_CELL,
  TOKENS,
  type TokenKey,
  fmtGoldao,
  gold,
  ink,
  inkFaint,
  inkMid,
  panel,
} from "../game/game-utils";
import { useRanking } from "../game/useGame";

/** GameFi portal — /gamefi. Lists every game; each card opens its page. */
export default function GameFiPage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-10">
      <PageHeader
        tag="GameFi"
        tagIcon={Gamepad2}
        title="Games"
        description="Play, compete and win GOLDAO. Every game is resolved on chain with ICP randomness."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <GoldMineCard />
        <ComingSoonCard delay={0.08} />
        <ComingSoonCard delay={0.16} />
      </div>
    </section>
  );
}

function GoldMineCard() {
  const { data: ranking } = useRanking();
  const players = ranking?.players.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      <Link
        to="/gamefi/mine"
        className={cn(
          panel,
          "group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-xl",
        )}
        data-ocid="gamefi.gold-mine"
      >
        {/* Top row: position and status */}
        <div className="flex items-center justify-between border-b border-[color:var(--term-border-faint)] px-4 py-3 font-mono text-xs">
          <span
            className={cn("flex items-center gap-3 whitespace-nowrap", inkMid)}
          >
            <span className={gold}># 1</span>
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {players ?? <Spinner />}
            </span>
            <span className="flex items-center gap-1">
              <Coins className="size-3.5" />
              {ranking ? fmtGoldao(ranking.pot) : <Spinner />}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--term-green)]/50 bg-[color:var(--term-green)]/10 px-2 py-0.5 text-[10px] text-[color:var(--term-green)]">
            <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--term-green)]" />
            Live
          </span>
        </div>

        <MinePreview />

        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className={cn("font-display text-lg font-semibold", ink)}>
            Gold Mine
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {["Strategy", "Weekly tournament"].map((t) => (
              <span
                key={t}
                className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-[color:var(--term-gold)]"
              >
                {t}
              </span>
            ))}
          </div>
          <p className={cn("text-sm leading-relaxed", inkMid)}>
            Dig the mine, save before it collapses and compete every week for
            the treasure.
          </p>
          <span className="mt-auto flex items-center gap-1.5 font-mono text-xs font-semibold text-[color:var(--term-gold)]">
            Play now
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

// Fixed sample board used as the card preview.
const PREVIEW: (TokenKey | "diamond" | "rock" | null)[] = [
  null,
  "GLDT",
  null,
  null,
  "ICP",
  null,
  null,
  "GOLDAO",
  null,
  null,
  "OGY",
  null,
  "diamond",
  null,
  "GLDT",
  null,
  "ICP",
  null,
  null,
  null,
  null,
  null,
  "rock",
  "OGY",
  null,
];

function MinePreview() {
  return (
    <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,oklch(0.8_0.12_85/0.35),transparent_70%)]">
      <div className="grid aspect-square h-[84%] grid-cols-5 gap-1 transition-transform duration-500 group-hover:scale-105">
        {PREVIEW.map((c, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed preview
            key={i}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md border",
              c === null
                ? "border-[color:var(--term-border)] bg-[var(--term-header)]"
                : c === "rock"
                  ? ROCK_CELL
                  : c === "diamond"
                    ? DIAMOND_CELL
                    : TOKENS[c].cell,
            )}
          >
            {c === "rock" ? (
              <Mountain className="size-3.5 text-[color:var(--term-ink-mid)]" />
            ) : c === "diamond" ? (
              DIAMOND_IMG ? (
                <img
                  src={DIAMOND_IMG}
                  alt=""
                  className="size-4 object-contain"
                />
              ) : (
                <Gem className={cn("size-3.5", DIAMOND_TEXT)} />
              )
            ) : c ? (
              <img
                src={TOKENS[c].logo}
                alt=""
                className="size-4 rounded-full object-contain"
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ComingSoonCard({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[color:var(--term-border)] p-6 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-[color:var(--term-border)] bg-[var(--term-header)]">
        <Lock className={cn("size-5", inkFaint)} />
      </span>
      <span className={cn("font-display text-base font-semibold", inkMid)}>
        New game coming soon
      </span>
      <span className={cn("font-mono text-[11px]", inkFaint)}>
        More GOLDAO games are on the way.
      </span>
    </motion.div>
  );
}
