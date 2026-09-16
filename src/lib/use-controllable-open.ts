import { useState } from "react";

/**
 * Lets a component work both ways: pass nothing and it manages its own
 * open state (renders its own trigger button), or pass open/onOpenChange
 * to drive it from outside (e.g. a table row click) with no visible
 * trigger of its own.
 */
export function useControllableOpen(open?: boolean, onOpenChange?: (open: boolean) => void) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;

  return {
    open: isControlled ? open : internalOpen,
    setOpen: isControlled ? onOpenChange! : setInternalOpen,
    isControlled,
  };
}
