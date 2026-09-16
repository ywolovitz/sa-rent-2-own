import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

/**
 * Client-side search + sort for a list already fully loaded (these
 * datasets run in the hundreds of rows, not millions — filtering
 * in-memory is simpler and more responsive than round-tripping to the
 * server on every keystroke).
 */
export function useTableControls<Row, SortKey extends string>({
  rows,
  searchFn,
  sortFns,
  defaultSortKey,
}: {
  rows: Row[];
  searchFn: (row: Row, query: string) => boolean;
  sortFns: Record<SortKey, (a: Row, b: Row) => number>;
  defaultSortKey: SortKey;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? rows.filter((row) => searchFn(row, query)) : rows;
    const sortFn = sortFns[sortKey];
    const sorted = [...filtered].sort((a, b) => (sortDir === "asc" ? sortFn(a, b) : sortFn(b, a)));
    return sorted;
  }, [rows, search, sortKey, sortDir, searchFn, sortFns]);

  return { search, setSearch, sortKey, sortDir, onSort, filteredRows };
}

export function compareStrings(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").localeCompare(b ?? "");
}

export function compareNumbers(a: number | null | undefined, b: number | null | undefined) {
  return (a ?? -Infinity) - (b ?? -Infinity);
}
