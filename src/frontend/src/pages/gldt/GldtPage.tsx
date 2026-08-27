import { PageHeader } from "@/components/common";
import { useGldtData } from "@/lib/gldt-data";
import { Coins } from "lucide-react";
import { useRef } from "react";
import { DataPanel } from "./DataPanel";
import { ImageEditor, type ImageEditorHandle } from "./ImageEditor";

/**
 * GLDT module — /gldt (not linked in the nav; URL-only for now).
 * Left: live token data (copy / insert into the image).
 * Right: image editor in the GLDT ad style, with PNG export.
 */
export default function GldtPage() {
  const { data, isLoading, isFetching, refetch } = useGldtData();
  const editorRef = useRef<ImageEditorHandle>(null);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader
        tag="GLDT"
        tagIcon={Coins}
        title="GLDT image studio"
        description="Build gold-style visuals with live GLDT data, then export as PNG."
      />

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
