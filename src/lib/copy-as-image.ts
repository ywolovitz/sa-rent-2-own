import { toBlob } from "html-to-image";
import { toast } from "sonner";

/**
 * Renders `node` to a PNG and puts it on the clipboard (so it can be pasted
 * straight into WhatsApp); falls back to a file download where the browser
 * can't write images to the clipboard.
 */
export async function copyNodeAsImage(
  node: HTMLElement,
  { count, filenamePrefix }: { count: number; filenamePrefix: string }
) {
  const noun = `${count} row${count === 1 ? "" : "s"}`;
  let blob: Blob | null;
  try {
    // html-to-image sizes its output from the capture node's own
    // scrollWidth/Height, but that div has no overflow style of its own
    // (default "visible"), so its scrollWidth just reports its own box
    // width rather than the wide <table> overflowing inside it — the
    // table itself is what actually has the real content width.
    const table = node.querySelector("table");
    const width = table?.scrollWidth ?? node.scrollWidth;
    const height = table?.scrollHeight ?? node.scrollHeight;
    blob = await toBlob(node, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      width,
      height,
      // Forces the cloned node itself to the real width as an inline
      // style — without this, the clone can still reflow/wrap narrower
      // than the live DOM, even with width/height set above.
      style: { width: `${width}px`, minWidth: `${width}px` },
    });
  } catch {
    toast.error("Couldn't create the image");
    return;
  }
  if (!blob) {
    toast.error("Couldn't create the image");
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    toast.success(`Copied ${noun} as an image — paste it into WhatsApp`);
  } catch {
    // Clipboard image writes aren't supported in every browser — fall back to a download.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenamePrefix}-selection-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded an image of ${noun} (clipboard copy isn't supported in this browser)`);
  }
}
