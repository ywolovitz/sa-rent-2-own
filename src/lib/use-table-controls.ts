import { useEffect, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

interface StoredSortPrefs {
  sortKey?: string;
  sortDir?: SortDirection;
}

/**
 * Client-side search + sort for a list already fully loaded (these
 * datasets run in the hundreds of rows, not millions — filtering
 * in-memory is simpler and more responsive than round-tripping to the
 * server on every keystroke).
 *
 * `storageKey`, when given, persists sort (not search) per-viewer in
 * localStorage — unique per table so different tables don't clobber each
 * other's preferences. Omit it to keep sort session-only.
 */
export function useTableControls<Row, SortKey extends string>({
  rows,
  searchFn,
  sortFns,
  defaultSortKey,
  storageKey,
}: {
  rows: Row[];
  searchFn: (row: Row, query: string) => boolean;
  sortFns: Record<SortKey, (a: Row, b: Row) => number>;
  defaultSortKey: SortKey;
  storageKey?: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  useEffect(() => {
    // localStorage is unavailable during SSR, so preferences are synced
    // after mount rather than read in a lazy useState initializer (which
    // would run during hydration too and could mismatch the
    // server-rendered default sort).
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredSortPrefs;
      if (parsed.sortKey && parsed.sortKey in sortFns) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSortKey(parsed.sortKey as SortKey);
      }
      if (parsed.sortDir === "asc" || parsed.sortDir === "desc") {
        setSortDir(parsed.sortDir);
      }
    } catch {
      // Private browsing / blocked storage / corrupt value — defaults stand.
    }
    // storageKey/sortFns are static per table, not meant to re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(nextSortKey: SortKey, nextSortDir: SortDirection) {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ sortKey: nextSortKey, sortDir: nextSortDir }));
    } catch {
      // Ignore — preference just won't persist this session.
    }
  }

  function onSort(key: SortKey) {
    if (key === sortKey) {
      const nextDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(nextDir);
      persist(key, nextDir);
    } else {
      setSortKey(key);
      setSortDir("asc");
      persist(key, "asc");
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
