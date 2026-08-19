import { Github, MessageCircle, Send } from "lucide-react";

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
  return (
    <footer
      data-ocid="footer"
      className="hidden md:flex items-center justify-between border-t border-border bg-card/40 px-6 py-3"
    >
      <p className="text-xs text-muted-foreground">
        GOLDAO APP — On-Chain Governance
      </p>
      <div className="flex items-center gap-1">
        {SOCIAL_LINKS.map((social) => (
          <a
            key={social.label}
            href={social.href}
            data-ocid={social.ocid}
            aria-label={social.label}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <social.icon className="size-4" />
          </a>
        ))}
      </div>
    </footer>
  );
}
