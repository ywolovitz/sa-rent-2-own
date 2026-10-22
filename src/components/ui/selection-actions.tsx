import type { ReactNode, Ref } from "react";
import { ImageDown } from "lucide-react";

import { Button } from "@/components/ui/button";

/** "Copy as image" + "Clear N selected" toolbar buttons shared by the selectable tables. */
export function SelectionActions({
  selectedCount,
  onCopyAsImage,
  onClear,
}: {
  selectedCount: number;
  onCopyAsImage: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCopyAsImage}
        disabled={selectedCount === 0}
      >
        <ImageDown />
        Copy as image
      </Button>
      {selectedCount > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear {selectedCount} selected
        </Button>
      )}
    </>
  );
}

/**
 * Wrapper for the table captured by "Copy as image" — kept fully rendered
 * (not display:none, not positioned off-screen, both of which stop some
 * browsers from ever painting it) and clipped to nothing by a zero-height,
 * overflow-hidden ancestor instead.
 */
export function ImageCaptureArea({ captureRef, children }: { captureRef: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div style={{ height: 0, overflow: "hidden" }} aria-hidden="true">
      <div ref={captureRef} style={{ width: "max-content" }}>
        {children}
      </div>
    </div>
  );
}
