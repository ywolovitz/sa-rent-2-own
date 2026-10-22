"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Filter dropdown that allows ticking several options. An empty selection
 * means "no filter" (everything shown). The trigger reads `allLabel` when
 * nothing is ticked, the option's label when one is, and "N <noun>" for more.
 */
export function MultiSelectFilter<T extends string>({
  options,
  selected,
  onChange,
  allLabel,
  noun,
  className,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  allLabel: string;
  /** Plural noun for the multi-selected summary, e.g. "statuses". */
  noun: string;
  className?: string;
}) {
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? allLabel)
        : `${selected.length} ${noun}`;

  function toggle(value: T) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("bg-background w-44 justify-between font-normal", className)}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            // Keep the menu open so several can be ticked in one go.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear selection</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
