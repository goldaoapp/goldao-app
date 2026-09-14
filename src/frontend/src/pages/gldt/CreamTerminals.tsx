import { type GldtData } from "@/lib/gldt-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import html2canvas from "html2canvas";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BG_SRC, fmtNum, fmtUsd, fmtUsdCompact } from "./types";

/* ── Constants ───────────────────────────────────────────────────────────── */

const GLDT_LOGO_SRC = "/assets/gldt/gldt-emblem.svg";
const TROY_OZ_GRAMS = 31.1035;
const FIRST_TRADE = new Date("2024-10-30");

/* ── Theme tokens ────────────────────────────────────────────────────────── */

type TerminalTheme = "cream" | "dark";

interface ThemeTokens {
  bg: string;
  ink: string;
  inkMid: string;
  inkLight: string;
  inkFaint: string;
  inkFaintest: string;
  gold: string;
  goldDark: string;
  green: string;
  borderColor: string;
  borderLight: string;
  borderFaint: string;
  borderFaintest: string;
  tableBg: string;
  tableHeaderBg: string;
  tableAltBg: string;
  cardBg: string;
  greenBg: string;
  greenBorder: string;
  footerText: string;
  rowBorder: string;
  goldFaded: string;
  inkFaded: string;
  volumeLabel: string;
  headerLabel: string;
  useBgImage: boolean;
}

const THEMES: Record<TerminalTheme, ThemeTokens> = {
  cream: {
    bg: "#e8cfc0",
    ink: "#2a2520",
    inkMid: "rgba(42,37,32,0.55)",
    inkLight: "rgba(42,37,32,0.5)",
    inkFaint: "rgba(42,37,32,0.45)",
    inkFaintest: "rgba(42,37,32,0.35)",
    gold: "#c79a3b",
    goldDark: "#b08830",
    green: "#2d8a5e",
    borderColor: "rgba(58,53,47,0.18)",
    borderLight: "rgba(58,53,47,0.15)",
    borderFaint: "rgba(58,53,47,0.12)",
    borderFaintest: "rgba(58,53,47,0.08)",
    tableBg: "rgba(255,255,255,0.3)",
    tableHeaderBg: "rgba(58,53,47,0.07)",
    tableAltBg: "rgba(58,53,47,0.04)",
    cardBg: "rgba(255,255,255,0.3)",
    greenBg: "rgba(45,138,94,0.08)",
    greenBorder: "rgba(45,138,94,0.2)",
    footerText: "#2a2520",
    rowBorder: "rgba(58,53,47,0.1)",
    goldFaded: "rgba(176,136,48,0.7)",
    inkFaded: "rgba(42,37,32,0.7)",
    volumeLabel: "rgba(42,37,32,0.4)",
    headerLabel: "rgba(42,37,32,0.55)",
    useBgImage: true,
  },
  dark: {
    bg: "#1c1e22",
    ink: "#f0e6d6",
    inkMid: "rgba(255,255,255,0.35)",
    inkLight: "rgba(255,255,255,0.35)",
    inkFaint: "rgba(255,255,255,0.3)",
    inkFaintest: "rgba(255,255,255,0.25)",
    gold: "#c79a3b",
    goldDark: "#c79a3b",
    green: "#3dba78",
    borderColor: "rgba(199,154,59,0.15)",
    borderLight: "rgba(199,154,59,0.12)",
    borderFaint: "rgba(199,154,59,0.1)",
    borderFaintest: "rgba(199,154,59,0.08)",
    tableBg: "rgba(255,255,255,0.03)",
    tableHeaderBg: "rgba(199,154,59,0.06)",
    tableAltBg: "rgba(199,154,59,0.03)",
    cardBg: "rgba(255,255,255,0.04)",
    greenBg: "rgba(61,186,120,0.08)",
    greenBorder: "rgba(61,186,120,0.18)",
    footerText: "rgba(255,255,255,0.5)",
    rowBorder: "rgba(199,154,59,0.08)",
    goldFaded: "rgba(199,154,59,0.6)",
    inkFaded: "rgba(240,230,214,0.6)",
    volumeLabel: "rgba(255,255,255,0.3)",
    headerLabel: "rgba(255,255,255,0.4)",
    useBgImage: false,
  },
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const mono = "'JetBrains Mono', monospace";
const grotesk = "'Space Grotesk', sans-serif";
const sans = "'DM Sans', sans-serif";

function injectTerminalFonts() {
  const id = "gldt-terminal-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap";
  document.head.appendChild(link);
}

function fmtTerminalDate(d: Date): string {
  return d
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase();
}

function daysSince(from: Date): number {
  const now = new Date();
  const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.floor((utcNow - utcFrom) / 86_400_000);
}

/** Strip ALL oklch() values html2canvas can't parse. */
function purgeOklch(root: HTMLElement) {
  const walk = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      const val = cs.getPropertyValue(prop);
      if (val?.includes("oklch")) {
        el.style.setProperty(prop, "transparent");
      }
    }
    for (const child of el.children) {
      if (child instanceof HTMLElement) walk(child);
    }
  };
  walk(root);
}

/**
 * Export a terminal element as 1080×1080 PNG.
 * Clones the node to an offscreen container to avoid CSS transform issues.
 */
async function exportTerminalPng(el: HTMLElement, name: string) {
  const clone = el.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: "absolute",
    left: "-9999px",
    top: "0",
    transform: "none",
    width: "1080px",
    height: "1080px",
    zIndex: "-1",
  });
  document.body.appendChild(clone);
  purgeOklch(clone);
  try {
    const canvas = await html2canvas(clone, {
      width: 1080,
      height: 1080,
      scale: 1,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });
    await new Promise<void>((resolve) => {
      canvas.toBlob((blob: Blob | null) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${name}-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
        resolve();
      }, "image/png");
    });
  } finally {
    document.body.removeChild(clone);
  }
}

/* ── Terminal backgrounds ────────────────────────────────────────────────── */

function CreamBg() {
  return (
    <>
      <img
        src={BG_SRC}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 70% at 50% 45%, rgba(248,222,209,0.9) 0%, rgba(196,167,151,0.4) 60%, rgba(140,105,75,0.35) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(90deg, transparent, transparent 107px, rgba(58,53,47,0.03) 107px, rgba(58,53,47,0.03) 108px), repeating-linear-gradient(0deg, transparent, transparent 107px, rgba(58,53,47,0.03) 107px, rgba(58,53,47,0.03) 108px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </>
  );
}

function DarkBg() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 40%, rgba(199,154,59,0.04) 0%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(90deg, transparent, transparent 107px, rgba(199,154,59,0.02) 107px, rgba(199,154,59,0.02) 108px), repeating-linear-gradient(0deg, transparent, transparent 107px, rgba(199,154,59,0.02) 107px, rgba(199,154,59,0.02) 108px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </>
  );
}

function TerminalBg({ theme }: { theme: TerminalTheme }) {
  return theme === "cream" ? <CreamBg /> : <DarkBg />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GOLD DATA POST (1080×1080)
   ═══════════════════════════════════════════════════════════════════════════ */

interface TerminalProps {
  data: GldtData | undefined;
  theme?: TerminalTheme;
}

const GoldDataTerminal = forwardRef<HTMLDivElement, TerminalProps>(
  ({ data: d, theme = "cream" }, ref) => {
    const t = THEMES[theme];
    const now = d?.fetchedAt ? new Date(d.fetchedAt) : new Date();
    const gldtPrice = d?.priceUsdGecko ?? d?.priceUsdOnchain ?? null;
    const goldSpotOz = d?.goldSpotOzUsd ?? null;
    const goldSpotGram = goldSpotOz != null ? goldSpotOz / TROY_OZ_GRAMS : null;
    const impliedOz = d?.impliedGoldOzUsd ?? null;
    const impliedGram = impliedOz != null ? impliedOz / TROY_OZ_GRAMS : null;
    const spreadOz =
      goldSpotOz != null && impliedOz != null ? goldSpotOz - impliedOz : null;
    const spreadPct = d?.premiumPct != null ? Math.abs(d.premiumPct) : null;
    const isDiscount = d?.premiumPct != null && d.premiumPct < 0;
    const spreadColor = isDiscount ? t.green : t.ink;

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          background: t.bg,
          position: "relative",
          overflow: "hidden",
          padding: 52,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
        }}
      >
        <TerminalBg theme={theme} />
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `1.5px solid ${t.borderColor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={GLDT_LOGO_SRC} alt="" style={{ width: 40, height: 40 }} />
              <span style={{ fontWeight: 700, fontSize: 26, color: theme === "dark" ? t.gold : t.ink, letterSpacing: 2 }}>GLDT TERMINAL</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.gold, display: "inline-block" }} />
              <span style={{ fontSize: 18, color: t.inkMid, fontWeight: 500 }}>LIVE · {fmtTerminalDate(now)}</span>
            </div>
          </div>
          {/* 0.01g price */}
          <div style={{ marginTop: 28, textAlign: "center" }}>
            <div style={{ fontSize: 17, color: t.inkMid, letterSpacing: 3, fontWeight: 500 }}>0.01g GOLD IN GLDT</div>
            <div style={{ fontWeight: 700, fontSize: 64, color: t.gold, marginTop: 6 }}>{gldtPrice != null ? fmtUsd(gldtPrice) : "—"}</div>
          </div>
          {/* Data table */}
          <div style={{ marginTop: 24, border: `1.5px solid ${t.borderLight}`, borderRadius: 6, overflow: "hidden", background: t.tableBg }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", background: t.tableHeaderBg, padding: "18px 28px" }}>
              <div style={{ fontSize: 15, color: t.headerLabel, letterSpacing: 2, fontWeight: 600 }}>ASSET</div>
              <div style={{ fontSize: 15, color: t.headerLabel, letterSpacing: 2, fontWeight: 600, textAlign: "right" }}>PER OUNCE</div>
              <div style={{ fontSize: 15, color: t.headerLabel, letterSpacing: 2, fontWeight: 600, textAlign: "right" }}>PER GRAM</div>
            </div>
            {/* GOLD SPOT */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", padding: "24px 28px", borderBottom: `1px solid ${t.rowBorder}` }}>
              <div style={{ fontWeight: 700, fontSize: 24, color: t.ink }}>GOLD SPOT</div>
              <div style={{ fontWeight: 700, fontSize: 34, color: t.ink, textAlign: "right" }}>{goldSpotOz != null ? fmtUsd(goldSpotOz) : "—"}</div>
              <div style={{ fontWeight: 700, fontSize: 28, color: t.inkFaded, textAlign: "right" }}>{goldSpotGram != null ? fmtUsd(goldSpotGram) : "—"}</div>
            </div>
            {/* GLDT IMPLIED */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", padding: "24px 28px", borderBottom: `1px solid ${t.rowBorder}` }}>
              <div style={{ fontWeight: 700, fontSize: 24, color: t.goldDark }}>GLDT (IMPLIED)</div>
              <div style={{ fontWeight: 700, fontSize: 34, color: t.goldDark, textAlign: "right" }}>{impliedOz != null ? fmtUsd(impliedOz) : "—"}</div>
              <div style={{ fontWeight: 700, fontSize: 28, color: t.goldFaded, textAlign: "right" }}>{impliedGram != null ? fmtUsd(impliedGram) : "—"}</div>
            </div>
            {/* SPREAD */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", padding: "24px 28px", background: t.tableAltBg }}>
              <div style={{ fontWeight: 600, fontSize: 22, color: t.inkLight }}>SPREAD</div>
              <div style={{ fontWeight: 700, fontSize: 34, color: spreadColor, textAlign: "right" }}>{spreadOz != null ? fmtUsd(spreadOz) : "—"}</div>
              <div style={{ fontWeight: 700, fontSize: 28, color: spreadColor, textAlign: "right" }}>{spreadPct != null ? `${spreadPct.toFixed(2)}%` : "—"}</div>
            </div>
          </div>

          {/* Discount callout */}
          {isDiscount && (
            <div style={{ marginTop: 24, background: t.greenBg, border: `1.5px solid ${t.greenBorder}`, borderRadius: 6, padding: "28px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>GLDT IS TRADING AT A</div>
                <div style={{ marginTop: 6, lineHeight: 1 }}>
                  <span style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 58, color: t.green }}>{spreadPct != null ? `${spreadPct.toFixed(2)}%` : "—"}</span>
                  <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 42, color: t.ink, marginLeft: 8 }}>discount</span>
                </div>
              </div>
              <div style={{ fontSize: 16, color: t.inkFaint, textAlign: "right", lineHeight: 1.6, fontWeight: 500 }}>vs Gold Spot<br />per troy ounce</div>
            </div>
          )}
          {/* Footer */}
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 18, borderTop: `1.5px solid ${t.borderFaint}` }}>
            <div style={{ fontSize: 14, color: t.footerText, fontWeight: 600 }}>100 GLDT = 1g · Metalor 999.9 · Swiss Vaults · KPMG Audited</div>
          </div>
        </div>
      </div>
    );
  },
);
GoldDataTerminal.displayName = "GoldDataTerminal";

/* ═══════════════════════════════════════════════════════════════════════════
   GLDT STATUS (1080×1080)
   ═══════════════════════════════════════════════════════════════════════════ */

const GldtStatusTerminal = forwardRef<HTMLDivElement, TerminalProps>(
  ({ data: d, theme = "cream" }, ref) => {
    const t = THEMES[theme];
    const now = d?.fetchedAt ? new Date(d.fetchedAt) : new Date();
    const goldGrams = d?.goldGramsBacked ?? null;
    const goldOz = d?.goldOzBacked ?? null;
    const marketCap = d?.marketCapUsd ?? null;
    const uptime = daysSince(FIRST_TRADE);
    const vol7d = d?.volume7dUsd ?? null;
    const vol7dPct = d?.volume7dPctStored ?? null;
    const totalVol = d?.totalVolumeUsd ?? null;

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          background: t.bg,
          position: "relative",
          overflow: "hidden",
          padding: 34,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
        }}
      >
        <TerminalBg theme={theme} />
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `1.5px solid ${t.borderColor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={GLDT_LOGO_SRC} alt="" style={{ width: 40, height: 40 }} />
              <span style={{ fontWeight: 700, fontSize: 28, color: theme === "dark" ? t.gold : t.ink, letterSpacing: 2 }}>GLDT STATUS</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.gold, display: "inline-block" }} />
              <span style={{ fontSize: 18, color: t.inkMid, fontWeight: 500 }}>LIVE · {fmtTerminalDate(now)}</span>
            </div>
          </div>
          {/* Hero metrics */}
          <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <div style={{ background: t.cardBg, border: `1.5px solid ${t.borderFaint}`, borderRadius: 6, padding: "32px 28px" }}>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>GOLD IN VAULT</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 52, color: t.ink, marginTop: 10, lineHeight: 1 }}>{goldGrams != null ? `${fmtNum(goldGrams, 2)}g` : "—"}</div>
              <div style={{ fontSize: 20, color: t.inkFaint, marginTop: 6, fontWeight: 500 }}>{goldOz != null ? `~${fmtNum(goldOz, 0)} oz` : "—"}</div>
            </div>
            <div style={{ background: t.cardBg, border: `1.5px solid ${t.borderFaint}`, borderRadius: 6, padding: "32px 28px" }}>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>MARKET CAP</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 52, color: t.gold, marginTop: 10, lineHeight: 1 }}>{marketCap != null ? fmtUsdCompact(marketCap) : "—"}</div>
              <div style={{ fontSize: 20, color: t.inkFaint, marginTop: 6, fontWeight: 500 }}>USD</div>
            </div>
            <div style={{ background: t.cardBg, border: `1.5px solid ${t.borderFaint}`, borderRadius: 6, padding: "32px 28px" }}>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>DEX</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 52, color: t.ink, marginTop: 10, lineHeight: 1 }}>ICPSWAP</div>
              <div style={{ fontSize: 20, color: t.inkFaint, marginTop: 6, fontWeight: 500 }}>exchange</div>
            </div>
          </div>
          {/* Volume table */}
          <div style={{ marginTop: 24, border: `1.5px solid ${t.borderLight}`, borderRadius: 6, overflow: "hidden", background: t.tableBg }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", background: t.tableHeaderBg, padding: "18px 28px" }}>
              <div style={{ fontSize: 15, color: t.headerLabel, letterSpacing: 2, fontWeight: 600 }}>METRIC</div>
              <div style={{ fontSize: 15, color: t.headerLabel, letterSpacing: 2, fontWeight: 600, textAlign: "right" }}>VALUE</div>
              <div style={{ fontSize: 15, color: t.headerLabel, letterSpacing: 2, fontWeight: 600, textAlign: "right" }}>% OF STORED</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", padding: "26px 28px", borderBottom: `1px solid ${t.rowBorder}` }}>
              <div style={{ fontWeight: 700, fontSize: 28, color: t.ink }}>VOLUME 7D</div>
              <div style={{ fontWeight: 700, fontSize: 42, color: t.ink, textAlign: "right" }}>{vol7d != null ? fmtUsdCompact(vol7d) : "—"}</div>
              <div style={{ fontWeight: 700, fontSize: 36, color: t.inkFaded, textAlign: "right" }}>{vol7dPct != null ? `${vol7dPct.toFixed(2)}%` : "—"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", padding: "26px 28px", background: t.tableAltBg }}>
              <div style={{ fontWeight: 700, fontSize: 28, color: t.ink }}>TOTAL VOLUME</div>
              <div style={{ fontWeight: 700, fontSize: 42, color: t.gold, textAlign: "right" }}>{totalVol != null ? fmtUsdCompact(totalVol) : "—"}</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: t.inkFaintest, textAlign: "right", alignSelf: "center" }}>ALL TIME</div>
            </div>
          </div>
          {/* Uptime callout */}
          <div style={{ marginTop: 24, background: t.greenBg, border: `1.5px solid ${t.greenBorder}`, borderRadius: 6, padding: "32px 36px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>UPTIME</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 64, color: t.green, lineHeight: 1, marginTop: 8 }}>{uptime}+</div>
              <div style={{ fontSize: 18, color: t.inkLight, fontWeight: 500, marginTop: 4 }}>days</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>SINCE FIRST TRADE</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 34, color: t.ink, marginTop: 10, lineHeight: 1.2 }}>Oct 30, 2024</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>DOWNTIME</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 64, color: t.green, lineHeight: 1, marginTop: 8 }}>ZERO</div>
            </div>
          </div>
          {/* Footer */}
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 18, borderTop: `1.5px solid ${t.borderFaint}` }}>
            <div style={{ fontSize: 14, color: t.footerText, fontWeight: 600 }}>100 GLDT = 1g · Metalor 999.9 · Swiss Vaults · KPMG Audited</div>
          </div>
        </div>
      </div>
    );
  },
);
GldtStatusTerminal.displayName = "GldtStatusTerminal";

/* ═══════════════════════════════════════════════════════════════════════════
   PERFORMANCE COMPARISON (1080×1080)
   ═══════════════════════════════════════════════════════════════════════════ */

const PerformanceTerminal = forwardRef<HTMLDivElement, TerminalProps>(
  ({ data: d, theme = "cream" }, ref) => {
    const t = THEMES[theme];
    const now = d?.fetchedAt ? new Date(d.fetchedAt) : new Date();
    const gldtPrice = d?.priceUsdGecko ?? d?.priceUsdOnchain ?? null;

    // Baseline prices (Nov 1, 2024)
    const gldtBase = 0.884;
    const btcBase = 69495;
    const icpBase = 7.95;

    // Current prices from data where available
    const gldtNow = gldtPrice ?? 1.39;
    // TODO: wire btcNow / icpNow from data when available
    const btcNow = (d as any)?.btcPriceUsd ?? 77210;
    const icpNow = (d as any)?.icpPriceUsd ?? 2.78;

    const gldtPct = ((gldtNow - gldtBase) / gldtBase) * 100;
    const btcPct = ((btcNow - btcBase) / btcBase) * 100;
    const icpPct = ((icpNow - icpBase) / icpBase) * 100;

    const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
    const fmtPrice = (v: number) => v >= 1000 ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${v.toFixed(v < 10 ? 3 : 2)}`;

    // Chart colors
    const gldtColor = t.green;
    const btcColor = "#F7931A";
    const icpColor = "#8B6CC1";
    const gridLine = theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(58,53,47,0.06)";
    const zeroLine = theme === "dark" ? "rgba(199,154,59,0.12)" : "rgba(199,154,59,0.2)";
    const axisLabel = theme === "dark" ? "rgba(255,255,255,0.25)" : "rgba(42,37,32,0.35)";
    const chartBg = theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.25)";
    const chartBorder = theme === "dark" ? "rgba(199,154,59,0.1)" : "rgba(58,53,47,0.1)";
    const labelColor = theme === "dark" ? "#f0e6d6" : t.ink;
    const subLabel = theme === "dark" ? "rgba(255,255,255,0.45)" : "rgba(42,37,32,0.5)";
    const gradId = theme === "dark" ? "gldtFillDark" : "gldtFillCream";

    // Card backgrounds
    const btcCardBg = theme === "dark" ? "rgba(247,147,26,0.06)" : "rgba(247,147,26,0.08)";
    const btcCardBorder = theme === "dark" ? "rgba(247,147,26,0.15)" : "rgba(247,147,26,0.2)";
    const gldtCardBg = t.greenBg;
    const gldtCardBorder = t.greenBorder;
    const icpCardBg = theme === "dark" ? "rgba(139,108,193,0.06)" : "rgba(139,108,193,0.08)";
    const icpCardBorder = theme === "dark" ? "rgba(139,108,193,0.15)" : "rgba(139,108,193,0.2)";

    // Static SVG chart paths (approximate representation)
    const gldtPath = "M70.0,275.6 L107.7,262.3 L145.5,256.5 L183.2,285.4 L220.9,247.8 L258.6,227.6 L296.4,218.9 L334.1,213.1 L371.8,198.7 L409.5,192.9 L447.3,184.2 L485.0,190.0 L522.7,169.7 L560.5,149.5 L598.2,120.6 L635.9,83.0 L673.6,54.1 L711.4,111.9 L749.1,207.3 L786.8,227.6 L824.5,213.1 L862.3,103.3 L900.0,129.3";
    const btcPath = "M70.0,275.6 L107.7,178.1 L145.5,181.8 L183.2,185.4 L220.9,60.4 L258.6,108.2 L296.4,137.6 L334.1,163.4 L371.8,174.4 L409.5,207.5 L447.3,189.1 L485.0,181.8 L522.7,167.1 L560.5,181.8 L598.2,192.8 L635.9,218.5 L673.6,236.9 L711.4,262.7 L749.1,303.1 L786.8,281.1 L824.5,288.4 L862.3,236.9 L900.0,247.2";
    const icpPath = "M70.0,275.6 L107.7,129.3 L145.5,225.7 L183.2,273.9 L220.9,257.9 L258.6,290.0 L296.4,306.1 L334.1,322.2 L371.8,338.2 L409.5,354.3 L447.3,354.3 L485.0,370.4 L522.7,418.6 L560.5,434.7 L598.2,434.7 L635.9,434.7 L673.6,428.2 L711.4,418.6 L749.1,434.7 L786.8,428.2 L824.5,418.6 L862.3,434.7 L900.0,441.7";
    const gldtArea = `${gldtPath} L900,480 L70,480 Z`;

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          background: t.bg,
          position: "relative",
          overflow: "hidden",
          padding: 34,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
        }}
      >
        <TerminalBg theme={theme} />
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", flex: 1 }}>
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `1.5px solid ${t.borderColor}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={GLDT_LOGO_SRC} alt="" style={{ width: 40, height: 40 }} />
              <span style={{ fontWeight: 700, fontSize: 26, color: theme === "dark" ? t.gold : t.ink, letterSpacing: 2 }}>GLDT TERMINAL</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.gold, display: "inline-block" }} />
              <span style={{ fontSize: 18, color: t.inkMid, fontWeight: 500 }}>LIVE · {fmtTerminalDate(now)}</span>
            </div>
          </div>
          {/* Title */}
          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 15, color: t.inkLight, letterSpacing: 2, fontWeight: 500 }}>PERFORMANCE COMPARISON</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 38, color: t.ink, marginTop: 4, lineHeight: 1 }}>GLDT vs BTC vs ICP</div>
            </div>
            <div style={{ fontSize: 14, color: t.inkFaint, fontWeight: 500, textAlign: "right" }}>% change since<br />Nov 1, 2024</div>
          </div>
          {/* Legend */}
          <div style={{ marginTop: 18, display: "flex", gap: 32, alignItems: "center" }}>
            {[{ color: gldtColor, label: "GLDT" }, { color: btcColor, label: "BTC" }, { color: icpColor, label: "ICP" }].map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 4, background: item.color, borderRadius: 2 }} />
                <span style={{ fontSize: 15, color: labelColor, fontWeight: 600 }}>{item.label}</span>
              </div>
            ))}
          </div>
          {/* Chart */}
          <div style={{ marginTop: 16, flex: 1, background: chartBg, border: `1.5px solid ${chartBorder}`, borderRadius: 6, padding: "16px 12px 8px 0", position: "relative" }}>
            <svg aria-label="Terminals Graph" viewBox="0 0 960 510" style={{ width: "100%", height: "100%", overflow: "visible" }}> 
              <title>Terminals Graph</title>
              {/* Grid lines */}
              {[428.9, 377.8, 326.7, 224.4, 173.3, 122.2, 71.1, 20.0].map((y) => (
                <line key={y} x1="70" y1={y} x2="900" y2={y} stroke={gridLine} strokeWidth="1" />
              ))}
              <line x1="70" y1="275.6" x2="900" y2="275.6" stroke={zeroLine} strokeWidth="1" strokeDasharray="4,4" />
              {/* Y-axis labels */}
              {[
                { y: 432, label: "−60%" }, { y: 381, label: "−40%" }, { y: 330, label: "−20%" },
                { y: 228, label: "+20%" }, { y: 177, label: "+40%" }, { y: 126, label: "+60%" },
                { y: 75, label: "+80%" }, { y: 24, label: "+100%" },
              ].map(({ y, label }) => (
                <text key={y} x="64" y={y} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="11" fill={axisLabel}>{label}</text>
              ))}
              <text x="64" y="279" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="11" fill={theme === "dark" ? "rgba(199,154,59,0.5)" : "rgba(199,154,59,0.7)"} fontWeight="600">0%</text>
              {/* X-axis labels */}
              {[
                { x: 70, label: "Nov 24" }, { x: 183.2, label: "Feb 25" }, { x: 296.4, label: "May" },
                { x: 409.5, label: "Aug" }, { x: 522.7, label: "Nov" }, { x: 635.9, label: "Feb 26" },
                { x: 749.1, label: "May" }, { x: 862.3, label: "Aug" }, { x: 920, label: "Sep" },
              ].map(({ x, label }) => (
                <text key={x} x={x} y="500" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fill={axisLabel}>{label}</text>
              ))}
              {/* GLDT area fill */}
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gldtColor} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={gldtColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <path d={gldtArea} fill={`url(#${gradId})`} />
              {/* Lines */}
              <path d={icpPath} fill="none" stroke={icpColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d={btcPath} fill="none" stroke={btcColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d={gldtPath} fill="none" stroke={gldtColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {/* End dots */}
              <circle cx="900" cy="129.3" r="5" fill={gldtColor} />
              <circle cx="900" cy="247.2" r="4" fill={btcColor} />
              <circle cx="900" cy="441.7" r="4" fill={icpColor} />
              {/* End labels */}
              <text x="912" y="125" fontFamily="JetBrains Mono, monospace" fontSize="13" fill={gldtColor} fontWeight="700">{fmtPct(gldtPct)}</text>
              <text x="912" y="243" fontFamily="JetBrains Mono, monospace" fontSize="13" fill={btcColor} fontWeight="700">{fmtPct(btcPct)}</text>
              <text x="912" y="451" fontFamily="JetBrains Mono, monospace" fontSize="13" fill={icpColor} fontWeight="700">{fmtPct(icpPct)}</text>
            </svg>
          </div>
          {/* Performance summary cards */}
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1.15fr 1fr", gap: 14 }}>
            <div style={{ background: btcCardBg, border: `1.5px solid ${btcCardBorder}`, borderRadius: 6, padding: "20px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: labelColor, letterSpacing: 2, fontWeight: 600 }}>BTC</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 42, color: btcColor, lineHeight: 1, marginTop: 6 }}>{fmtPct(btcPct)}</div>
              <div style={{ fontSize: 14, color: subLabel, marginTop: 4 }}>{fmtPrice(btcBase)} → {fmtPrice(btcNow)}</div>
            </div>
            <div style={{ background: gldtCardBg, border: `1.5px solid ${gldtCardBorder}`, borderRadius: 6, padding: "20px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: labelColor, letterSpacing: 2, fontWeight: 600 }}>GLDT</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 48, color: gldtColor, lineHeight: 1, marginTop: 6 }}>{fmtPct(gldtPct)}</div>
              <div style={{ fontSize: 14, color: subLabel, marginTop: 4 }}>{fmtPrice(gldtBase)} → {fmtPrice(gldtNow)}</div>
            </div>
            <div style={{ background: icpCardBg, border: `1.5px solid ${icpCardBorder}`, borderRadius: 6, padding: "20px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: labelColor, letterSpacing: 2, fontWeight: 600 }}>ICP</div>
              <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 42, color: icpColor, lineHeight: 1, marginTop: 6 }}>{fmtPct(icpPct)}</div>
              <div style={{ fontSize: 14, color: subLabel, marginTop: 4 }}>{fmtPrice(icpBase)} → {fmtPrice(icpNow)}</div>
            </div>
          </div>
          {/* Footer */}
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 14, borderTop: `1.5px solid ${t.borderFaint}` }}>
            <div style={{ fontSize: 14, color: t.footerText, fontWeight: 600 }}>100 GLDT = 1g · Metalor 999.9 · Swiss Vaults · KPMG Audited</div>
          </div>
        </div>
      </div>
    );
  },
);
PerformanceTerminal.displayName = "PerformanceTerminal";

/* ═══════════════════════════════════════════════════════════════════════════
   WRAPPER — theme toggle + tabs + scaled viewport + export
   ═══════════════════════════════════════════════════════════════════════════ */

type TerminalTab = "gold-data" | "status" | "performance";

export function CreamTerminals({ data }: { data: GldtData | undefined }) {
  const [theme, setTheme] = useState<TerminalTheme>("cream");
  const [tab, setTab] = useState<TerminalTab>("gold-data");
  const [exporting, setExporting] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(540);

  useEffect(injectTerminalFonts, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setCw(entries[0].contentRect.width));
    ro.observe(el);
    setCw(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const handleExport = useCallback(async () => {
    const el = termRef.current;
    if (!el) return;
    setExporting(true);
    try {
      await exportTerminalPng(el, `gldt-${tab}-${theme}`);
    } finally {
      setExporting(false);
    }
  }, [tab, theme]);

  const scale = cw / 1080;

  const tabs: { id: TerminalTab; label: string }[] = [
    { id: "gold-data", label: "Gold Data Post" },
    { id: "status", label: "GLDT Status" },
    { id: "performance", label: "Performance" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card shadow-subtle overflow-hidden">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
        {/* Theme toggle */}
        <div className="flex items-center rounded-md border border-border mr-3">
          <button
            type="button"
            onClick={() => setTheme("cream")}
            className={cn(
              "rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors",
              theme === "cream" ? "bg-[#e8cfc0] text-[#2a2520]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Cream
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={cn(
              "rounded-r-md px-3 py-1.5 text-xs font-medium transition-colors",
              theme === "dark" ? "bg-[#1c1e22] text-[#f0e6d6]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Dark
          </button>
        </div>
        {/* Terminal tabs */}
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "Exporting…" : "Export PNG"}
          </Button>
        </div>
      </div>
      {/* Scaled terminal viewport */}
      <div
        ref={containerRef}
        style={{ width: "100%", aspectRatio: "1 / 1", overflow: "hidden", position: "relative" }}
      >
        <div
          style={{
            width: 1080,
            height: 1080,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {tab === "gold-data" && <GoldDataTerminal ref={termRef} data={data} theme={theme} />}
          {tab === "status" && <GldtStatusTerminal ref={termRef} data={data} theme={theme} />}
          {tab === "performance" && <PerformanceTerminal ref={termRef} data={data} theme={theme} />}
        </div>
      </div>
    </div>
  );
}
