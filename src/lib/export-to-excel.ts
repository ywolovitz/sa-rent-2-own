import ExcelJS from "exceljs";

const BRAND = {
  headerFill: "FF0F6B93",
  headerFont: "FFFFFFFF",
  titleFont: "FF0F6B93",
  zebraFill: "FFF2F2F2",
  border: "FFD6D6D6",
};

export interface ExportColumn<Row> {
  header: string;
  value: (row: Row) => string | number;
  /** Returns a fill/font color pair to render this cell as a chip
   * (e.g. a status badge); return null/undefined for a plain cell. */
  chip?: (row: Row) => { fill: string; font?: string } | null | undefined;
  width?: number;
  align?: "left" | "right" | "center";
  numberFormat?: string;
}

function formatExportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Joins the given filter descriptions, skipping falsy ones, or "None" if
 * nothing is active — used for the "Filter applied" meta row. */
export function summarizeFilters(parts: (string | false | null | undefined)[]): string {
  const active = parts.filter((p): p is string => Boolean(p));
  return active.length ? active.join("; ") : "None";
}

/** Builds and downloads a styled .xlsx export (title + filter/date/user
 * meta rows, a themed header row, zebra-striped and chip-colored data
 * rows) of `rows` as currently filtered/sorted in the calling table.
 * Browser-only — runs entirely client-side, no server round-trip. */
export async function exportToExcel<Row>({
  baseFilename,
  sheetName,
  title,
  filterSummary,
  exportedBy,
  columns,
  rows,
}: {
  baseFilename: string;
  sheetName: string;
  title: string;
  filterSummary: string;
  exportedBy: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SAR2O Fleet";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  const columnCount = columns.length;

  sheet.mergeCells(1, 1, 1, Math.max(columnCount, 2));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: BRAND.titleFont } };

  sheet.getCell(2, 1).value = `Filter applied: ${filterSummary}`;
  sheet.getCell(3, 1).value = `Exported: ${formatExportTimestamp(new Date())}`;
  sheet.getCell(4, 1).value = `Exported by: ${exportedBy}`;
  for (let r = 2; r <= 4; r++) {
    sheet.getCell(r, 1).font = { size: 10, color: { argb: "FF595959" } };
  }

  const headerRowIndex = 6;
  const headerRow = sheet.getRow(headerRowIndex);
  columns.forEach((column, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = column.header.toUpperCase();
    cell.font = { bold: true, size: 11, color: { argb: BRAND.headerFont } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.headerFill } };
    cell.alignment = { vertical: "middle", horizontal: column.align ?? "left" };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.border } },
      bottom: { style: "thin", color: { argb: BRAND.border } },
    };
  });
  headerRow.height = 20;
  headerRow.commit();

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(headerRowIndex + 1 + rowIndex);
    const isEven = rowIndex % 2 === 1;
    columns.forEach((column, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      cell.value = column.value(row);
      cell.alignment = { vertical: "middle", horizontal: column.align ?? "left" };
      if (column.numberFormat) cell.numFmt = column.numberFormat;
      cell.border = { bottom: { style: "hair", color: { argb: BRAND.border } } };

      const chip = column.chip?.(row);
      if (chip) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: chip.fill } };
        cell.font = { bold: true, color: { argb: chip.font ?? "FFFFFFFF" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebraFill } };
      }
    });
  });

  columns.forEach((column, i) => {
    const longest = Math.max(
      column.header.length,
      ...rows.map((row) => String(column.value(row)).length)
    );
    sheet.getColumn(i + 1).width = column.width ?? Math.min(Math.max(longest + 2, 10), 40);
  });

  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }];
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: columnCount },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseFilename}-${dateStamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
