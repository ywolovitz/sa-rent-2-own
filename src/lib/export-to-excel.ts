import * as XLSX from "xlsx";

import { isoDaysFromNow } from "@/lib/date-ranges";

/** Downloads `rows` (plain objects, keys become column headers in the
 * order they first appear) as a .xlsx file. Browser-only — XLSX.writeFile
 * triggers the download itself, no server round-trip. */
export function exportRowsToExcel(
  baseFilename: string,
  sheetName: string,
  rows: Record<string, string | number>[]
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${baseFilename}-${isoDaysFromNow(0)}.xlsx`);
}
