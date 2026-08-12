import { Link } from "@tanstack/react-router";
import { Github, MessageCircle, Send } from "lucide-react";

import { Separator } from "@/components/ui/separator";

type FooterLink = {
  label: string;
  to: string;
  ocid: string;
};

const FOOTER_LINKS: FooterLink[] = [
  { label: "Home", to: "/", ocid: "footer.home" },
  { label: "Treasury", to: "/treasury", ocid: "footer.treasury" },
  { label: "Proposals", to: "/proposals", ocid: "footer.proposals" },
  { label: "Rewards Simulator", to: "/rewards", ocid: "footer.rewards" },
  {
    label: "Documentation",
    to: "/documentation",
    ocid: "footer.documentation",
  },
  { label: "News", to: "/news", ocid: "footer.news" },
];

const SOCIAL_LINKS: {
  label: string;
  href: string;
  icon: typeof Github;
  ocid: string;
}[] = [
  {
    label: "Discord",
    href: "#",
    icon: MessageCircle,
    ocid: "footer.social.discord",
  },
  { label: "GitHub", href: "#", icon: Github, ocid: "footer.social.github" },
  { label: "Telegram", href: "#", icon: Send, ocid: "footer.social.telegram" },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const attributionUrl = `https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(
    typeof window !== "undefined" ? window.location.hostname : "goldao",
  )}`;

  return (
    <footer data-ocid="footer" className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand + tagline */}
          <div className="max-w-sm">
            <Link
              to="/"
              data-ocid="footer.brand"
              className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
            >
              <span className="flex size-7 items-center justify-center rounded-md gradient-primary text-primary-foreground font-display font-bold text-sm">
                G
              </span>
              <span className="font-display text-base font-semibold tracking-tight text-foreground">
                GOLDAO
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Gold-backed governance for the decentralized future. A
              community-owned treasury, transparent proposals, and sustainable
              rewards.
            </p>
          </div>

          {/* Nav links */}
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3"
          >
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                data-ocid={link.ocid}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md w-fit"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <Separator className="my-8 bg-border" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {year}. Built with love using{" "}
            <a
              href={attributionUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
            >
              caffeine.ai
            </a>
          </p>
          <div className="flex items-center gap-1">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                data-ocid={social.ocid}
                aria-label={social.label}
                className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <social.icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
