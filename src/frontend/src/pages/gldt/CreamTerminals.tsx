import { type GldtData } from "@/lib/gldt-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
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

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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
  return Math.floor((Date.now() - from.getTime()) / 86_400_000);
}

/** Load html2canvas — tries npm import first, then CDN fallback. */
async function getHtml2Canvas(): Promise<any> {
  if ((window as any).html2canvas) return (window as any).html2canvas;
  try {
    const mod = await import(/* webpackIgnore: true */ "html2canvas");
    return (mod as any).default ?? mod;
  } catch {
    /* fall through to CDN */
  }
  return new Promise<any>((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => resolve((window as any).html2canvas);
    s.onerror = () => reject(new Error("Failed to load html2canvas"));
    document.head.appendChild(s);
  });
}

async function exportTerminalPng(el: HTMLElement, name: string) {
  const h2c = await getHtml2Canvas();
  const canvas = await h2c(el, {
    width: 1080,
    height: 1080,
    scale: 1,
    useCORS: true,
    backgroundColor: null,
  });
  canvas.toBlob((blob: Blob | null) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

/* ── Shared terminal background ──────────────────────────────────────────── */

function TerminalBg() {
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

/* ── Inline style constants ──────────────────────────────────────────────── */

const mono = "'JetBrains Mono', monospace";
const grotesk = "'Space Grotesk', sans-serif";
const sans = "'DM Sans', sans-serif";
const ink = "#2a2520";
const inkMid = "rgba(42,37,32,0.55)";
const inkLight = "rgba(42,37,32,0.5)";
const inkFaint = "rgba(42,37,32,0.45)";
const inkFaintest = "rgba(42,37,32,0.35)";
const gold = "#c79a3b";
const goldDark = "#b08830";
const green = "#2d8a5e";

/* ═══════════════════════════════════════════════════════════════════════════
   CREAM TERMINAL — Gold Data Post (1080×1080)
   ═══════════════════════════════════════════════════════════════════════════ */

interface TerminalProps {
  data: GldtData | undefined;
}

const GoldDataTerminal = forwardRef<HTMLDivElement, TerminalProps>(
  ({ data: d }, ref) => {
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
    const vol7d = d?.volume7dUsd ?? null;

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          background: "#e8cfc0",
          position: "relative",
          overflow: "hidden",
          padding: 52,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
        }}
      >
        <TerminalBg />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}
        >
          {/* ── Top bar ──────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 18,
              borderBottom: "1.5px solid rgba(58,53,47,0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={GLDT_LOGO_SRC} alt="" style={{ width: 40, height: 40 }} />
              <span
                style={{ fontWeight: 700, fontSize: 26, color: ink, letterSpacing: 2 }}
              >
                GLDT TERMINAL
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: gold,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 18, color: inkMid, fontWeight: 500 }}>
                LIVE · {fmtTerminalDate(now)}
              </span>
            </div>
          </div>

          {/* ── 0.01g price ──────────────────────────────────────── */}
          <div style={{ marginTop: 28, textAlign: "center" }}>
            <div
              style={{ fontSize: 17, color: inkMid, letterSpacing: 3, fontWeight: 500 }}
            >
              0.01g GOLD IN GLDT
            </div>
            <div style={{ fontWeight: 700, fontSize: 64, color: gold, marginTop: 6 }}>
              {gldtPrice != null ? fmtUsd(gldtPrice) : "—"}
            </div>
          </div>

          {/* ── Data table ───────────────────────────────────────── */}
          <div
            style={{
              marginTop: 24,
              border: "1.5px solid rgba(58,53,47,0.15)",
              borderRadius: 6,
              overflow: "hidden",
              background: "rgba(255,255,255,0.3)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                background: "rgba(58,53,47,0.07)",
                padding: "18px 28px",
              }}
            >
              <div style={{ fontSize: 15, color: inkMid, letterSpacing: 2, fontWeight: 600 }}>
                ASSET
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: inkMid,
                  letterSpacing: 2,
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                PER OUNCE
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: inkMid,
                  letterSpacing: 2,
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                PER GRAM
              </div>
            </div>
            {/* GOLD SPOT */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                padding: "24px 28px",
                borderBottom: "1px solid rgba(58,53,47,0.1)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 24, color: ink }}>GOLD SPOT</div>
              <div style={{ fontWeight: 700, fontSize: 34, color: ink, textAlign: "right" }}>
                {goldSpotOz != null ? fmtUsd(goldSpotOz) : "—"}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 28,
                  color: "rgba(42,37,32,0.7)",
                  textAlign: "right",
                }}
              >
                {goldSpotGram != null ? fmtUsd(goldSpotGram) : "—"}
              </div>
            </div>
            {/* GLDT IMPLIED */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                padding: "24px 28px",
                borderBottom: "1px solid rgba(58,53,47,0.1)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 24, color: goldDark }}>
                GLDT (IMPLIED)
              </div>
              <div style={{ fontWeight: 700, fontSize: 34, color: goldDark, textAlign: "right" }}>
                {impliedOz != null ? fmtUsd(impliedOz) : "—"}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 28,
                  color: "rgba(176,136,48,0.7)",
                  textAlign: "right",
                }}
              >
                {impliedGram != null ? fmtUsd(impliedGram) : "—"}
              </div>
            </div>
            {/* SPREAD */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                padding: "24px 28px",
                background: "rgba(58,53,47,0.04)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 22, color: inkLight }}>SPREAD</div>
              <div style={{ fontWeight: 700, fontSize: 34, color: green, textAlign: "right" }}>
                {spreadOz != null ? fmtUsd(spreadOz) : "—"}
              </div>
              <div style={{ fontWeight: 700, fontSize: 28, color: green, textAlign: "right" }}>
                {spreadPct != null ? `${spreadPct.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>

          {/* ── Volume row ───────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 1fr",
              padding: "24px 28px",
              marginTop: 16,
              background: "rgba(255,255,255,0.2)",
              borderRadius: 6,
              border: "1px solid rgba(58,53,47,0.08)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 22, color: inkLight }}>
              7D VOLUME
            </div>
            <div style={{ fontWeight: 700, fontSize: 34, color: ink, textAlign: "right" }}>
              {vol7d != null ? fmtUsdCompact(vol7d) : "—"}
            </div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 16,
                color: "rgba(42,37,32,0.4)",
                textAlign: "right",
                alignSelf: "center",
              }}
            >
              GLDT/USD
            </div>
          </div>

          {/* ── Spread callout ───────────────────────────────────── */}
          <div
            style={{
              marginTop: 24,
              background: "rgba(45,138,94,0.08)",
              border: "1.5px solid rgba(45,138,94,0.2)",
              borderRadius: 6,
              padding: "28px 32px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                GLDT IS TRADING AT A
              </div>
              <div style={{ marginTop: 6, lineHeight: 1 }}>
                <span
                  style={{
                    fontFamily: grotesk,
                    fontWeight: 700,
                    fontSize: 58,
                    color: green,
                  }}
                >
                  {spreadPct != null ? `${spreadPct.toFixed(2)}%` : "—"}
                </span>
                <span
                  style={{
                    fontFamily: sans,
                    fontWeight: 600,
                    fontSize: 42,
                    color: ink,
                    marginLeft: 8,
                  }}
                >
                  {isDiscount ? "discount" : "premium"}
                </span>
              </div>
            </div>
            <div
              style={{
                fontSize: 16,
                color: inkFaint,
                textAlign: "right",
                lineHeight: 1.6,
                fontWeight: 500,
              }}
            >
              vs Gold Spot
              <br />
              per troy ounce
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              paddingTop: 18,
              borderTop: "1.5px solid rgba(58,53,47,0.12)",
            }}
          >
            <div style={{ fontSize: 14, color: ink, fontWeight: 600 }}>
              100 GLDT = 1g · Metalor 999.9 · Swiss Vaults · KPMG Audited
            </div>
          </div>
        </div>
      </div>
    );
  },
);

GoldDataTerminal.displayName = "GoldDataTerminal";

/* ═══════════════════════════════════════════════════════════════════════════
   GLDT STATUS — Cream Terminal (1080×1080)
   ═══════════════════════════════════════════════════════════════════════════ */

const GldtStatusTerminal = forwardRef<HTMLDivElement, TerminalProps>(
  ({ data: d }, ref) => {
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
          background: "#e8cfc0",
          position: "relative",
          overflow: "hidden",
          padding: 34,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          fontFamily: mono,
        }}
      >
        <TerminalBg />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}
        >
          {/* ── Top bar ──────────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 18,
              borderBottom: "1.5px solid rgba(58,53,47,0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src={GLDT_LOGO_SRC} alt="" style={{ width: 40, height: 40 }} />
              <span
                style={{ fontWeight: 700, fontSize: 28, color: ink, letterSpacing: 2 }}
              >
                GLDT STATUS
              </span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: gold,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 18, color: inkMid, fontWeight: 500 }}>
                LIVE · {fmtTerminalDate(now)}
              </span>
            </div>
          </div>

          {/* ── Hero metrics ─────────────────────────────────────── */}
          <div
            style={{
              marginTop: 32,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 20,
            }}
          >
            {/* Gold in vault */}
            <div
              style={{
                background: "rgba(255,255,255,0.3)",
                border: "1.5px solid rgba(58,53,47,0.12)",
                borderRadius: 6,
                padding: "32px 28px",
              }}
            >
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                GOLD IN VAULT
              </div>
              <div
                style={{
                  fontFamily: grotesk,
                  fontWeight: 700,
                  fontSize: 52,
                  color: ink,
                  marginTop: 10,
                  lineHeight: 1,
                }}
              >
                {goldGrams != null ? `${fmtNum(goldGrams, 2)}g` : "—"}
              </div>
              <div style={{ fontSize: 20, color: inkFaint, marginTop: 6, fontWeight: 500 }}>
                {goldOz != null ? `~${fmtNum(goldOz, 0)} oz` : "—"}
              </div>
            </div>
            {/* Market cap */}
            <div
              style={{
                background: "rgba(255,255,255,0.3)",
                border: "1.5px solid rgba(58,53,47,0.12)",
                borderRadius: 6,
                padding: "32px 28px",
              }}
            >
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                MARKET CAP
              </div>
              <div
                style={{
                  fontFamily: grotesk,
                  fontWeight: 700,
                  fontSize: 52,
                  color: gold,
                  marginTop: 10,
                  lineHeight: 1,
                }}
              >
                {marketCap != null ? fmtUsdCompact(marketCap) : "—"}
              </div>
              <div style={{ fontSize: 20, color: inkFaint, marginTop: 6, fontWeight: 500 }}>
                USD
              </div>
            </div>
            {/* DEX */}
            <div
              style={{
                background: "rgba(255,255,255,0.3)",
                border: "1.5px solid rgba(58,53,47,0.12)",
                borderRadius: 6,
                padding: "32px 28px",
              }}
            >
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                DEX
              </div>
              <div
                style={{
                  fontFamily: grotesk,
                  fontWeight: 700,
                  fontSize: 52,
                  color: ink,
                  marginTop: 10,
                  lineHeight: 1,
                }}
              >
                ICPSWAP
              </div>
              <div style={{ fontSize: 20, color: inkFaint, marginTop: 6, fontWeight: 500 }}>
                exchange
              </div>
            </div>
          </div>

          {/* ── Volume table ─────────────────────────────────────── */}
          <div
            style={{
              marginTop: 24,
              border: "1.5px solid rgba(58,53,47,0.15)",
              borderRadius: 6,
              overflow: "hidden",
              background: "rgba(255,255,255,0.3)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                background: "rgba(58,53,47,0.07)",
                padding: "18px 28px",
              }}
            >
              <div style={{ fontSize: 15, color: inkMid, letterSpacing: 2, fontWeight: 600 }}>
                METRIC
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: inkMid,
                  letterSpacing: 2,
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                VALUE
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: inkMid,
                  letterSpacing: 2,
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                % OF STORED
              </div>
            </div>
            {/* Volume 7D */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                padding: "26px 28px",
                borderBottom: "1px solid rgba(58,53,47,0.1)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 28, color: ink }}>VOLUME 7D</div>
              <div style={{ fontWeight: 700, fontSize: 42, color: ink, textAlign: "right" }}>
                {vol7d != null ? fmtUsdCompact(vol7d) : "—"}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 36,
                  color: "rgba(42,37,32,0.7)",
                  textAlign: "right",
                }}
              >
                {vol7dPct != null ? `${vol7dPct.toFixed(2)}%` : "—"}
              </div>
            </div>
            {/* Total Volume */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                padding: "26px 28px",
                background: "rgba(58,53,47,0.04)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 28, color: ink }}>TOTAL VOLUME</div>
              <div style={{ fontWeight: 700, fontSize: 42, color: gold, textAlign: "right" }}>
                {totalVol != null ? fmtUsdCompact(totalVol) : "—"}
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  color: inkFaintest,
                  textAlign: "right",
                  alignSelf: "center",
                }}
              >
                ALL TIME
              </div>
            </div>
          </div>

          {/* ── Uptime callout ───────────────────────────────────── */}
          <div
            style={{
              marginTop: 24,
              background: "rgba(45,138,94,0.08)",
              border: "1.5px solid rgba(45,138,94,0.2)",
              borderRadius: 6,
              padding: "32px 36px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 20,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                UPTIME
              </div>
              <div
                style={{
                  fontFamily: grotesk,
                  fontWeight: 700,
                  fontSize: 64,
                  color: green,
                  lineHeight: 1,
                  marginTop: 8,
                }}
              >
                {uptime}+
              </div>
              <div style={{ fontSize: 18, color: inkLight, fontWeight: 500, marginTop: 4 }}>
                days
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                SINCE FIRST TRADE
              </div>
              <div
                style={{
                  fontFamily: grotesk,
                  fontWeight: 700,
                  fontSize: 34,
                  color: ink,
                  marginTop: 10,
                  lineHeight: 1.2,
                }}
              >
                Oct 30, 2024
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, color: inkLight, letterSpacing: 2, fontWeight: 500 }}>
                DOWNTIME
              </div>
              <div
                style={{
                  fontFamily: grotesk,
                  fontWeight: 700,
                  fontSize: 64,
                  color: green,
                  lineHeight: 1,
                  marginTop: 8,
                }}
              >
                ZERO
              </div>
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              paddingTop: 18,
              borderTop: "1.5px solid rgba(58,53,47,0.12)",
            }}
          >
            <div style={{ fontSize: 14, color: ink, fontWeight: 600 }}>
              100 GLDT = 1g · Metalor 999.9 · Swiss Vaults · KPMG Audited
            </div>
          </div>
        </div>
      </div>
    );
  },
);

GldtStatusTerminal.displayName = "GldtStatusTerminal";

/* ═══════════════════════════════════════════════════════════════════════════
   WRAPPER — tabs + scaled viewport + export
   ═══════════════════════════════════════════════════════════════════════════ */

export function CreamTerminals({ data }: TerminalProps) {
  const [tab, setTab] = useState<"gold-data" | "status">("gold-data");
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
      await exportTerminalPng(el, `gldt-${tab}`);
    } finally {
      setExporting(false);
    }
  }, [tab]);

  const scale = cw / 1080;

  return (
    <div className="rounded-xl border border-border bg-card shadow-subtle overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setTab("gold-data")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "gold-data"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Gold Data Post
        </button>
        <button
          type="button"
          onClick={() => setTab("status")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "status"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          GLDT Status
        </button>
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
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          position: "relative",
        }}
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
          {tab === "gold-data" ? (
            <GoldDataTerminal ref={termRef} data={data} />
          ) : (
            <GldtStatusTerminal ref={termRef} data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
