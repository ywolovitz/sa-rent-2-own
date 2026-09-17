"use client";

import { useState } from "react";
import { MapPin, ZoomIn, ZoomOut } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO_PINS = [
  { id: "1", top: "28%", left: "22%" },
  { id: "2", top: "45%", left: "58%" },
  { id: "3", top: "62%", left: "34%" },
  { id: "4", top: "20%", left: "70%" },
  { id: "5", top: "72%", left: "68%" },
  { id: "6", top: "50%", left: "12%" },
];

/** Static placeholder — no live vehicle locations exist yet. Zoom and
 * pin selection are real interactions wired to nothing, standing in
 * for the fleet-tracking map this will become. */
export function FleetMapPlaceholder() {
  const [zoom, setZoom] = useState(1);
  const [activePin, setActivePin] = useState<string | null>(null);

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold tracking-tight">Fleet map</h3>
          <p className="text-muted-foreground text-sm">Live vehicle locations, coming soon.</p>
        </div>
        <Badge variant="secondary">Preview</Badge>
      </div>

      <div className="bg-muted relative h-80 overflow-hidden rounded-md">
        <div
          className="absolute inset-0 transition-transform duration-200"
          style={{
            transform: `scale(${zoom})`,
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        >
          {DEMO_PINS.map((pin) => (
            <button
              key={pin.id}
              type="button"
              className="group absolute -translate-x-1/2 -translate-y-full"
              style={{ top: pin.top, left: pin.left }}
              onClick={() => setActivePin((v) => (v === pin.id ? null : pin.id))}
              aria-label="Demo vehicle pin"
            >
              <MapPin
                className={cn(
                  "text-destructive size-7 drop-shadow transition-transform group-hover:scale-110",
                  activePin === pin.id && "scale-125"
                )}
                fill="currentColor"
              />
              {activePin === pin.id && (
                <div className="bg-popover text-popover-foreground absolute bottom-full left-1/2 mb-1 w-max -translate-x-1/2 rounded-md border px-2 py-1 text-xs shadow-md">
                  Demo pin — location tracking not connected yet
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="absolute right-3 bottom-3 flex flex-col gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => setZoom((z) => Math.min(z + 0.25, 2))}
            aria-label="Zoom in"
          >
            <ZoomIn />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => setZoom((z) => Math.max(z - 0.25, 0.75))}
            aria-label="Zoom out"
          >
            <ZoomOut />
          </Button>
        </div>
      </div>
    </div>
  );
}
