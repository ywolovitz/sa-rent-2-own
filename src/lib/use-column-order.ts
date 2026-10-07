import { useEffect, useState } from "react";

interface StoredColumnPrefs {
  order?: string[];
  hidden?: string[];
}

/** Drag-reorderable, hide/show-able column state for a table, persisted
 * per-viewer in localStorage. `storageKey` should be unique per table so
 * different tables don't clobber each other's preferences. */
export function useColumnOrder<T extends string>(
  storageKey: string,
  defaultOrder: T[],
  defaultHidden: T[] = []
) {
  const [order, setOrder] = useState<T[]>(defaultOrder);
  const [hidden, setHidden] = useState<Set<T>>(new Set(defaultHidden));

  useEffect(() => {
    // localStorage is unavailable during SSR, so preferences are synced
    // after mount rather than read in a lazy useState initializer (which
    // would run during hydration too and could mismatch the
    // server-rendered default order/visibility).
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredColumnPrefs;
      const known = new Set<string>(defaultOrder);

      if (Array.isArray(parsed.order)) {
        const kept = parsed.order.filter((id): id is T => known.has(id));
        const missing = defaultOrder.filter((id) => !kept.includes(id));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrder([...kept, ...missing]);
      }
      if (Array.isArray(parsed.hidden)) {
        setHidden(new Set(parsed.hidden.filter((id): id is T => known.has(id))));
      }
    } catch {
      // Private browsing / blocked storage / corrupt value — defaults stand.
    }
    // defaultOrder/defaultHidden are static per table, not meant to re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(nextOrder: T[], nextHidden: Set<T>) {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ order: nextOrder, hidden: [...nextHidden] })
      );
    } catch {
      // Ignore — preference just won't persist this session.
    }
  }

  function reorder(activeId: T, overId: T) {
    setOrder((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = prev.slice();
      next.splice(from, 1);
      next.splice(to, 0, activeId);
      persist(next, hidden);
      return next;
    });
  }

  function toggleHidden(id: T) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      persist(order, next);
      return next;
    });
  }

  function reset() {
    setOrder(defaultOrder);
    setHidden(new Set(defaultHidden));
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore.
    }
  }

  return { order, hidden, reorder, toggleHidden, reset, isHidden: (id: T) => hidden.has(id) };
}
