"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A reorderable (drag handle) table header cell, optionally also
 * sortable. Must be rendered inside a dnd-kit DndContext + SortableContext
 * whose `items` include this cell's `id`. */
export function DraggableTableHead<T extends string>({
  id,
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  id: string;
  label: string;
  sortKey?: T;
  activeKey?: T | null;
  direction?: "asc" | "desc";
  onSort?: (key: T) => void;
  className?: string;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });

  const isActive = sortKey !== undefined && activeKey === sortKey;
  const Icon = isActive ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "bg-background relative z-20 opacity-80", className)}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none cursor-grab active:cursor-grabbing"
          aria-label={`Drag to reorder ${label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        {sortKey !== undefined && onSort ? (
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            className={cn(
              "inline-flex items-center gap-1 font-semibold",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            <Icon className="size-3.5" />
          </button>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </TableHead>
  );
}
