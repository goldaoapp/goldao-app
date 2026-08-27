import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Download,
  ImagePlus,
  Layers,
  RotateCw,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BG_SRC,
  DECOR_ELEMENTS,
  DEFAULT_TEXT_COLOR,
  EXPORT_H,
  EXPORT_W,
  FONTS,
  GOLD_COLOR,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "./types";

/* ── Font loading (the app only ships sans/mono; ads use a serif) ─────────── */

function injectFonts() {
  const id = "gldt-editor-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Lora:wght@400;600;700&display=swap";
  document.head.appendChild(link);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

let seq = 0;
const uid = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function defaultLayers(): Layer[] {
  return [
    {
      id: uid(),
      kind: "text",
      text: "Your headline here",
      x: 0.5,
      y: 0.4,
      opacity: 1,
      rotation: 0,
      fontSize: 92,
      color: DEFAULT_TEXT_COLOR,
      fontFamily: FONTS[0].value,
      fontWeight: 700,
      align: "center",
      lineHeight: 1.15,
    },
    {
      id: uid(),
      kind: "image",
      src: "/assets/gldt/gldt-emblem.svg",
      x: 0.5,
      y: 0.85,
      opacity: 1,
      rotation: 0,
      width: 0.09,
      ratio: 528 / 527,
    },
  ];
}

export interface ImageEditorHandle {
  addText: (text: string) => void;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export const ImageEditor = forwardRef<ImageEditorHandle>((_props, ref) => {
  const [layers, setLayers] = useState<Layer[]>(defaultLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  const scale = wrapW / EXPORT_W;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  useEffect(injectFonts, []);

  // Track preview width for scaling text/positions.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWrapW(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWrapW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const patch = useCallback((id: string, changes: Partial<Layer>) => {
    setLayers((ls) =>
      ls.map((l) => (l.id === id ? ({ ...l, ...changes } as Layer) : l)),
    );
  }, []);

  const addText = useCallback((text: string) => {
    const t: TextLayer = {
      id: uid(),
      kind: "text",
      text,
      x: 0.5,
      y: 0.5,
      opacity: 1,
      rotation: 0,
      fontSize: 64,
      color: DEFAULT_TEXT_COLOR,
      fontFamily: FONTS[0].value,
      fontWeight: 700,
      align: "center",
      lineHeight: 1.15,
    };
    setLayers((ls) => [...ls, t]);
    setSelectedId(t.id);
  }, []);

  useImperativeHandle(ref, () => ({ addText }), [addText]);

  const addImage = useCallback((elId: string) => {
    const def = DECOR_ELEMENTS.find((e) => e.id === elId);
    if (!def) return;
    const img: ImageLayer = {
      id: uid(),
      kind: "image",
      src: def.src,
      x: 0.5,
      y: 0.5,
      opacity: def.defaultOpacity,
      rotation: 0,
      width: def.defaultWidth,
      ratio: def.ratio,
    };
    setLayers((ls) => [...ls, img]);
    setSelectedId(img.id);
  }, []);

  // Attach a local image just for this session (data URL, never uploaded
  // anywhere). It exports cleanly since same-origin data URLs don't taint canvas.
  const onUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const probe = new Image();
      probe.onload = () => {
        const ratio = probe.naturalWidth / probe.naturalHeight || 1;
        const img: ImageLayer = {
          id: uid(),
          kind: "image",
          src,
          x: 0.5,
          y: 0.5,
          opacity: 1,
          rotation: 0,
          width: 0.35,
          ratio,
        };
        setLayers((ls) => [...ls, img]);
        setSelectedId(img.id);
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const reorder = useCallback((id: string, dir: 1 | -1) => {
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = ls.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  /* ── Drag ──────────────────────────────────────────────────────────────── */

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    const el = wrapRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const nx = d.baseX + (e.clientX - d.startX) / rect.width;
    const ny = d.baseY + (e.clientY - d.startY) / rect.height;
    setLayers((ls) =>
      ls.map((l) =>
        l.id === d.id
          ? {
              ...l,
              x: Math.min(1, Math.max(0, nx)),
              y: Math.min(1, Math.max(0, ny)),
            }
          : l,
      ),
    );
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent, layer: Layer) => {
      e.preventDefault();
      setSelectedId(layer.id);
      dragRef.current = {
        id: layer.id,
        startX: e.clientX,
        startY: e.clientY,
        baseX: layer.x,
        baseY: layer.y,
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [onPointerMove, endDrag],
  );

  /* ── Export ────────────────────────────────────────────────────────────── */

  const exportPng = useCallback(async () => {
    setExporting(true);
    try {
      // Make sure every used font is ready before painting the canvas.
      await Promise.allSettled(
        layers
          .filter((l): l is TextLayer => l.kind === "text")
          .map((l) =>
            document.fonts.load(`${l.fontWeight} 100px ${l.fontFamily}`),
          ),
      );

      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bg = await loadImage(BG_SRC);
      ctx.drawImage(bg, 0, 0, EXPORT_W, EXPORT_H);

      for (const l of layers) {
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.translate(l.x * EXPORT_W, l.y * EXPORT_H);
        if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180);

        if (l.kind === "image") {
          const img = await loadImage(l.src);
          const w = l.width * EXPORT_W;
          const h = w / l.ratio;
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
          ctx.fillStyle = l.color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${l.fontWeight} ${l.fontSize}px ${l.fontFamily}`;
          const lines = l.text.split("\n");
          const lh = l.fontSize * l.lineHeight;
          const first = -((lines.length - 1) * lh) / 2;
          lines.forEach((line, i) => {
            ctx.fillText(line, 0, first + i * lh);
          });
        }
        ctx.restore();
      }

      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `gldt-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
          resolve();
        }, "image/png");
      });
    } finally {
      setExporting(false);
    }
  }, [layers]);

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Canvas */}
      <div className="flex-1 min-w-0">
        <div
          ref={wrapRef}
          className="relative w-full overflow-hidden rounded-xl border border-border shadow-subtle select-none"
          style={{ aspectRatio: `${EXPORT_W} / ${EXPORT_H}` }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <img
            src={BG_SRC}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          {layers.map((l) => {
            const common: React.CSSProperties = {
              left: `${l.x * 100}%`,
              top: `${l.y * 100}%`,
              opacity: l.opacity,
              transform: `translate(-50%, -50%) rotate(${l.rotation}deg)`,
            };
            const isSel = l.id === selectedId;
            if (l.kind === "image") {
              return (
                <img
                  key={l.id}
                  src={l.src}
                  alt=""
                  draggable={false}
                  onPointerDown={(e) => startDrag(e, l)}
                  className={cn(
                    "absolute cursor-move",
                    isSel &&
                      "outline outline-2 outline-primary outline-offset-2",
                  )}
                  style={{ ...common, width: `${l.width * wrapW}px` }}
                />
              );
            }
            return (
              <div
                key={l.id}
                onPointerDown={(e) => startDrag(e, l)}
                className={cn(
                  "absolute cursor-move whitespace-pre text-center leading-none",
                  isSel && "outline outline-2 outline-primary outline-offset-4",
                )}
                style={{
                  ...common,
                  color: l.color,
                  fontFamily: l.fontFamily,
                  fontWeight: l.fontWeight,
                  fontSize: `${l.fontSize * scale}px`,
                  lineHeight: l.lineHeight,
                }}
              >
                {l.text}
              </div>
            );
          })}
        </div>

        {/* Add toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => addText("New text")}
          >
            <Type className="size-4" /> Text
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" /> Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUpload}
          />
          {DECOR_ELEMENTS.map((el) => (
            <Button
              key={el.id}
              variant="outline"
              size="sm"
              onClick={() => addImage(el.id)}
            >
              <ImagePlus className="size-4" /> {el.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLayers(defaultLayers())}
            >
              Reset
            </Button>
            <Button size="sm" onClick={exportPng} disabled={exporting}>
              <Download className="size-4" />
              {exporting ? "Exporting…" : "Export PNG"}
            </Button>
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="w-full lg:w-72 lg:flex-shrink-0">
        <div className="rounded-xl border border-border bg-card p-4 shadow-subtle">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Layers className="size-4 text-primary" />
            {selected ? "Layer" : "No selection"}
          </div>

          {!selected && (
            <p className="text-sm text-muted-foreground">
              Click an element on the canvas to edit it. Drag to reposition.
            </p>
          )}

          {selected && (
            <div className="flex flex-col gap-4">
              {selected.kind === "text" && (
                <TextControls
                  layer={selected}
                  onPatch={(c) => patch(selected.id, c)}
                />
              )}
              {selected.kind === "image" && (
                <ImageControls
                  layer={selected}
                  onPatch={(c) => patch(selected.id, c)}
                />
              )}

              {/* Common: opacity + rotation */}
              <Slider
                label={`Opacity ${Math.round(selected.opacity * 100)}%`}
                min={0}
                max={1}
                step={0.05}
                value={selected.opacity}
                onChange={(v) => patch(selected.id, { opacity: v })}
              />
              <Slider
                label={`Rotation ${Math.round(selected.rotation)}°`}
                min={-180}
                max={180}
                step={1}
                value={selected.rotation}
                onChange={(v) => patch(selected.id, { rotation: v })}
                icon={<RotateCw className="size-3.5" />}
              />

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => reorder(selected.id, 1)}
                >
                  Front
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => reorder(selected.id, -1)}
                >
                  Back
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-destructive"
                  onClick={() => removeLayer(selected.id)}
                  aria-label="Delete layer"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ImageEditor.displayName = "ImageEditor";

/* ── Sub-controls ────────────────────────────────────────────────────────── */

function TextControls({
  layer,
  onPatch,
}: {
  layer: TextLayer;
  onPatch: (c: Partial<TextLayer>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={layer.text}
        onChange={(e) => onPatch({ text: e.target.value })}
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <select
        value={layer.fontFamily}
        onChange={(e) => onPatch({ fontFamily: e.target.value })}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none"
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <select
          value={layer.fontWeight}
          onChange={(e) => onPatch({ fontWeight: Number(e.target.value) })}
          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none"
        >
          {[400, 500, 600, 700, 900].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="color"
            value={layer.color}
            onChange={(e) => onPatch({ color: e.target.value })}
            className="h-8 w-9 cursor-pointer rounded border border-input bg-background"
          />
        </label>
        <button
          type="button"
          onClick={() => onPatch({ color: GOLD_COLOR })}
          className="h-8 rounded border border-input px-2 text-xs"
          style={{ color: GOLD_COLOR }}
        >
          Gold
        </button>
      </div>
      <Slider
        label={`Size ${layer.fontSize}px`}
        min={24}
        max={200}
        step={1}
        value={layer.fontSize}
        onChange={(v) => onPatch({ fontSize: v })}
      />
      <Slider
        label={`Line height ${layer.lineHeight.toFixed(2)}`}
        min={0.9}
        max={2}
        step={0.05}
        value={layer.lineHeight}
        onChange={(v) => onPatch({ lineHeight: v })}
      />
    </div>
  );
}

function ImageControls({
  layer,
  onPatch,
}: {
  layer: ImageLayer;
  onPatch: (c: Partial<ImageLayer>) => void;
}) {
  return (
    <Slider
      label={`Size ${Math.round(layer.width * 100)}%`}
      min={0.03}
      max={1}
      step={0.01}
      value={layer.width}
      onChange={(v) => onPatch({ width: v })}
    />
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  icon,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary"
      />
    </label>
  );
}
