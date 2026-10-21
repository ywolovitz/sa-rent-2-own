"use client";

import { useCallback, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { Download, ImageDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableHead } from "@/components/ui/sortable-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportToExcel, summarizeFilters, type ExportColumn } from "@/lib/export-to-excel";
import { compareNumbers, compareStrings, useTableControls } from "@/lib/use-table-controls";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/database.types";

import { paymentMethodValues } from "../contracts/schema";
import type { ContractMonthlyReportRow } from "./types";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  debit_order: "Debit order",
  eft: "EFT",
  cash: "Cash",
  other: "Other",
};

type SortKey = "deal" | "client" | "reg" | "missed";

function formatRand(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function MonthlyReportTable({
  rows,
  monthLabels,
  exportedBy,
}: {
  rows: ContractMonthlyReportRow[];
  monthLabels: string[];
  exportedBy: string;
}) {
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<"all" | PaymentMethod>("all");
  const [missedOnly, setMissedOnly] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const searchFn = useCallback(
    (row: ContractMonthlyReportRow, query: string) =>
      [row.dealNumber ?? "", row.clientName, row.reg ?? ""].some((value) =>
        value.toLowerCase().includes(query)
      ),
    []
  );

  const sortFns = {
    deal: (a: ContractMonthlyReportRow, b: ContractMonthlyReportRow) => compareStrings(a.dealNumber, b.dealNumber),
    client: (a: ContractMonthlyReportRow, b: ContractMonthlyReportRow) => compareStrings(a.clientName, b.clientName),
    reg: (a: ContractMonthlyReportRow, b: ContractMonthlyReportRow) => compareStrings(a.reg, b.reg),
    // Reversed vs. the other columns — the default (ascending) sort should
    // surface the worst-paying accounts first, since that's the point of
    // this report, not bury them at the bottom of an ascending list.
    missed: (a: ContractMonthlyReportRow, b: ContractMonthlyReportRow) => compareNumbers(b.missedCount, a.missedCount),
  } satisfies Record<SortKey, (a: ContractMonthlyReportRow, b: ContractMonthlyReportRow) => number>;

  const preFiltered = rows
    .filter((r) => paymentTypeFilter === "all" || r.paymentMethod === paymentTypeFilter)
    .filter((r) => !missedOnly || r.missedCount > 0);

  const { search, setSearch, sortKey, sortDir, onSort, filteredRows } = useTableControls<
    ContractMonthlyReportRow,
    SortKey
  >({
    rows: preFiltered,
    searchFn,
    sortFns,
    defaultSortKey: "missed",
    storageKey: "payments-report-sort",
  });

  function handleExport() {
    const columns: ExportColumn<ContractMonthlyReportRow>[] = [
      { header: "Deal number", value: (r) => r.dealNumber ?? "" },
      { header: "Client", value: (r) => r.clientName },
      { header: "Reg", value: (r) => r.reg ?? "" },
      ...monthLabels.map((label, i) => ({
        header: label,
        value: (r: ContractMonthlyReportRow) => r.months[i].netCollected,
        numberFormat: '"R"#,##0',
        align: "right" as const,
        chip: (r: ContractMonthlyReportRow) => {
          const cell = r.months[i];
          if (cell.beforeCoverage) return null;
          return cell.missed ? { fill: "FFFF5252" } : { fill: "FF2F9E58" };
        },
      })),
    ];

    exportToExcel({
      baseFilename: "payments-report",
      sheetName: "Payments",
      title: "SAR2O Fleet — Payments Report",
      filterSummary: summarizeFilters([
        search && `Search: "${search}"`,
        paymentTypeFilter !== "all" && `Payment type: ${PAYMENT_METHOD_LABELS[paymentTypeFilter]}`,
        missedOnly && "Accounts with a missed payment only",
      ]),
      exportedBy,
      columns,
      rows: filteredRows,
    });
  }

  async function handleCopyAsImage() {
    if (!captureRef.current) return;
    let blob: Blob | null;
    try {
      const node = captureRef.current;
      const table = node.querySelector("table");
      const width = table?.scrollWidth ?? node.scrollWidth;
      const height = table?.scrollHeight ?? node.scrollHeight;
      blob = await toBlob(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width,
        height,
        style: { width: `${width}px`, minWidth: `${width}px` },
      });
    } catch {
      toast.error("Couldn't create the image");
      return;
    }
    if (!blob) {
      toast.error("Couldn't create the image");
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast.success("Copied the report as an image — paste it into WhatsApp");
    } catch {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments-report-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded the report as an image (clipboard copy isn't supported in this browser)");
    }
  }

  function renderRows() {
    return filteredRows.map((row) => (
      <TableRow key={row.contractId}>
        <TableCell>{row.dealNumber ?? "—"}</TableCell>
        <TableCell>{row.clientName}</TableCell>
        <TableCell>{row.reg ?? "—"}</TableCell>
        {row.months.map((cell) => (
          <TableCell
            key={cell.monthKey}
            className={cn(
              "text-right tabular-nums",
              cell.beforeCoverage && "text-muted-foreground",
              !cell.beforeCoverage && cell.missed && "bg-destructive/10 text-destructive font-semibold",
              !cell.beforeCoverage && !cell.missed && "bg-success/10"
            )}
          >
            {cell.beforeCoverage ? "—" : formatRand(cell.netCollected)}
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search deal number, client, or reg…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background max-w-xs"
        />
        <Select
          value={paymentTypeFilter}
          onValueChange={(v) => setPaymentTypeFilter(v as "all" | PaymentMethod)}
        >
          <SelectTrigger className="bg-background w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment types</SelectItem>
            {paymentMethodValues.map((method) => (
              <SelectItem key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={missedOnly} onCheckedChange={(v) => setMissedOnly(Boolean(v))} />
          Only accounts with a missed payment
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCopyAsImage}>
            <ImageDown />
            Copy as image
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <Download />
            Export
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow>
              <SortableHead label="Deal number" sortKey="deal" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Client" sortKey="client" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Reg" sortKey="reg" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              {monthLabels.map((label) => (
                <TableHead key={label} className="text-right">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3 + monthLabels.length} className="text-muted-foreground text-center">
                  No accounts match this filter.
                </TableCell>
              </TableRow>
            ) : (
              renderRows()
            )}
          </TableBody>
        </Table>
      </div>

      {/* Off-screen mirror of the visible table, captured for "Copy as
          image" — see vehicles-table.tsx's handleCopyAsImage for why this
          needs its own node rather than capturing the visible (scrollable,
          clipped) table directly. */}
      <div style={{ height: 0, overflow: "hidden" }} aria-hidden="true">
        <div ref={captureRef} style={{ width: "max-content" }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Reg</TableHead>
                {monthLabels.map((label) => (
                  <TableHead key={label} className="text-right">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{renderRows()}</TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
