import { PageHeader } from "@/components/common";
import { useGldtData } from "@/lib/gldt-data";
import { Coins } from "lucide-react";
import { useRef } from "react";
import { CreamTerminals } from "./CreamTerminals";
import { DataPanel } from "./DataPanel";
import { ImageEditor, type ImageEditorHandle } from "./ImageEditor";

/**
 * GLDT module — /gldt (not linked in the nav; URL-only for now).
 * Top: Cream Terminal views (Gold Data Post + GLDT Status) with PNG export.
 * Below: live token data panel + image editor.
 */
export default function GldtPage() {
  const { data, isLoading, isFetching, refetch } = useGldtData();
  const editorRef = useRef<ImageEditorHandle>(null);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        tag="GLDT"
        tagIcon={Coins}
        title="GLDT TERMINAL"
      />

      {/* Cream Terminals */}
      <div className="mb-8">
        <CreamTerminals data={data} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[20rem_1fr]">
        <div className="xl:order-1">
          <DataPanel
            data={data}
            isLoading={isLoading}
            isFetching={isFetching}
            onRefresh={() => void refetch()}
            onInsert={(text) => editorRef.current?.addText(text)}
          />
        </div>

        <div className="xl:order-2">
          <ImageEditor ref={editorRef} />
        </div>
      </div>
    </section>
  );
}
