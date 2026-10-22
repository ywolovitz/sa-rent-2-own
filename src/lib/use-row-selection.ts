import { useCallback, useMemo, useState } from "react";

/**
 * Checkbox selection over a table's currently visible (filtered) rows.
 * Selections are keyed by id and survive filtering/sorting, but
 * `selectedRows` only ever returns rows that are still visible, so
 * "Copy as image" never captures something the user has filtered out.
 */
export function useRowSelection<Row>(visibleRows: Row[], getId: (row: Row) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedIds.has(getId(r)));
  const someVisibleSelected = visibleRows.some((r) => selectedIds.has(getId(r)));

  const selectedRows = useMemo(
    () => visibleRows.filter((r) => selectedIds.has(getId(r))),
    // getId is a stable accessor per table, not meant to re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRows, selectedIds]
  );

  // Stable identities (they only touch state via the functional setter) so
  // memoised table rows that receive them as props don't re-render on every
  // selection or filter change.
  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleRows.forEach((r) => next.delete(getId(r)));
      else visibleRows.forEach((r) => next.add(getId(r)));
      return next;
    });
  }

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    selectedRows,
    allVisibleSelected,
    someVisibleSelected,
    toggleRow,
    toggleAllVisible,
    clear,
  };
}
