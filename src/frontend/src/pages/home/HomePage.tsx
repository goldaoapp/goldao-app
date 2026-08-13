export default function HomePage() {
  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto">
      {/* Alpha Banner */}
      <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 text-center text-sm text-primary font-medium">
        ALPHA VERSION — Data is under development and may be inaccurate.
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center text-center gap-4 py-8 sm:py-12 animate-fade-in-up">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-mono font-medium text-primary tracking-wider uppercase">
          100% On-Chain
        </span>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          <span className="text-gradient-gold">GOLDAO APP</span>
        </h1>
        <p className="font-display text-lg sm:text-xl font-medium text-foreground">
          Your DAO. Your treasury. Fully on-chain.
        </p>
        <p className="max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
          Real-time treasury tracking, governance proposals, rewards simulation,
          and community tools — all 100% on-chain on the Internet Computer.
        </p>
      </section>

      {/* GOLDAO Token Stats */}
      <section>
        <h2 className="font-mono text-[10px] tracking-widest uppercase text-primary mb-3">
          GOLDAO Token
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            value="600"
            label="ICP / GOLDAO Ratio"
            accent
          />
          <StatCard
            value="580"
            label="ICP / GOLDAO Equilibrium"
            accent
          />
          <StatCard
            value="442.5 M"
            label="Total Burn"
          />
          <StatCard
            value="557.5 M"
            label="Supply"
          />
        </div>
      </section>

      {/* Treasury Overview */}
      <section>
        <h2 className="font-mono text-[10px] tracking-widest uppercase text-primary mb-3">
          Treasury Overview
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value="580 K"
            label="ICP"
            accent
          />
          <StatCard
            value="500 M"
            label="OGY"
          />
          <StatCard
            value="6.2 M"
            label="WTN"
          />
        </div>
      </section>

      {/* Quick Stats */}
      <section>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            value="12"
            label="Active Proposals"
          />
          <StatCard
            value="1,847"
            label="Members"
          />
          <StatCard
            value="8.2%"
            label="APY Estimate"
            accent
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-lg border border-primary/15 bg-gradient-to-br from-primary/8 to-primary/2 p-4 sm:p-5 text-center"
          : "rounded-lg border border-border bg-card/50 p-4 sm:p-5 text-center"
      }
    >
      <div
        className={`font-mono text-lg sm:text-xl lg:text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-snug">
        {label}
      </div>
    </div>
  );
}
