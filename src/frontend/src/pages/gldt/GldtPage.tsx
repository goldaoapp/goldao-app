import { PageHeader } from "@/components/common";
import { type GldtData, useGldtData } from "@/lib/gldt-data";
import { Coins } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { CreamTerminals } from "./CreamTerminals";
import { DataPanel } from "./DataPanel";
import { ImageEditor, type ImageEditorHandle } from "./ImageEditor";
import type { ManualFields } from "./types";

/**
 * GLDT module — /gldt (not linked in the nav; URL-only for now).
 * Top: Cream Terminal views (Gold Data Post + GLDT Status) with PNG export.
 * Middle: live token data panel (horizontal, with editable manual fields).
 * Bottom: image editor.
 */
export default function GldtPage() {
  const { data, isLoading, isFetching, refetch } = useGldtData();
  const editorRef = useRef<ImageEditorHandle>(null);

  const [manual, setManual] = useState<ManualFields>({
    volume7dUsd: null,
    volume7dPctStored: null,
    totalVolumeUsd: null,
  });

  const handleManual = useCallback(
    <K extends keyof ManualFields>(key: K, value: ManualFields[K]) =>
      setManual((prev) => ({ ...prev, [key]: value })),
    [],
  );

  /** API data merged with manual overrides (manual wins when non-null). */
  const merged: GldtData | undefined = useMemo(() => {
    if (!data) return undefined;
    return {
      ...data,
      volume7dUsd: manual.volume7dUsd ?? data.volume7dUsd,
      volume7dPctStored: manual.volume7dPctStored ?? data.volume7dPctStored,
      totalVolumeUsd: manual.totalVolumeUsd ?? data.totalVolumeUsd,
    };
  }, [data, manual]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        tag="GLDT"
        tagIcon={Coins}
        title="GLDT TERMINAL"
        description=""
      />

      {/* Cream Terminals */}
      <div className="mb-8">
        <CreamTerminals data={merged} />
      </div>

      {/* GLDT live data — horizontal */}
      <div className="mb-8">
        <DataPanel
          data={merged}
          isLoading={isLoading}
          isFetching={isFetching}
          onRefresh={() => void refetch()}
          onInsert={(text) => editorRef.current?.addText(text)}
          manual={manual}
          onManual={handleManual}
        />
      </div>

      {/* Image editor */}
      <ImageEditor ref={editorRef} />
    </section>
  );
}
