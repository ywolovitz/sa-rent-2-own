"use client";

import { useCallback, useState } from "react";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDisplayDate } from "@/lib/date-ranges";
import { exportToExcel, summarizeFilters, type ExportColumn } from "@/lib/export-to-excel";
import { compareNumbers, compareStrings, useTableControls } from "@/lib/use-table-controls";

import type { PaymentTransactionRow } from "./types";

type SortKey = "date" | "deal" | "client" | "amount";
type TypeFilter = "all" | "receipt" | "debit_note";

const TYPE_LABELS: Record<"receipt" | "debit_note", string> = { receipt: "Receipt", debit_note: "Debit note" };

function formatRand(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

function StatusBadge({ row }: { row: PaymentTransactionRow }) {
  if (row.type === "debit_note") return <Badge variant="outline">Reversal</Badge>;
  return row.reversed ? <Badge variant="destructive">Reversed</Badge> : <Badge variant="success">Cleared</Badge>;
}

export function TransactionsTable({ rows, exportedBy }: { rows: PaymentTransactionRow[]; exportedBy: string }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const searchFn = useCallback(
    (row: PaymentTransactionRow, query: string) =>
      [row.dealNumber ?? "", row.clientName, row.reg ?? "", row.reference].some((value) =>
        value.toLowerCase().includes(query)
      ),
    []
  );

  const sortFns = {
    // Reversed vs. the others — default (ascending) sort should surface
    // the most recent transactions first, like a normal activity log.
    date: (a: PaymentTransactionRow, b: PaymentTransactionRow) =>
      compareStrings(b.transactionDate, a.transactionDate),
    deal: (a: PaymentTransactionRow, b: PaymentTransactionRow) => compareStrings(a.dealNumber, b.dealNumber),
    client: (a: PaymentTransactionRow, b: PaymentTransactionRow) => compareStrings(a.clientName, b.clientName),
    amount: (a: PaymentTransactionRow, b: PaymentTransactionRow) => compareNumbers(a.cashEffect, b.cashEffect),
  } satisfies Record<SortKey, (a: PaymentTransactionRow, b: PaymentTransactionRow) => number>;

  const preFiltered = rows.filter((r) => typeFilter === "all" || r.type === typeFilter);

  const { search, setSearch, sortKey, sortDir, onSort, filteredRows } = useTableControls<
    PaymentTransactionRow,
    SortKey
  >({
    rows: preFiltered,
    searchFn,
    sortFns,
    defaultSortKey: "date",
    storageKey: "payments-transactions-sort",
  });

  function handleExport() {
    const columns: ExportColumn<PaymentTransactionRow>[] = [
      { header: "Date", value: (r) => r.transactionDate },
      { header: "Deal number", value: (r) => r.dealNumber ?? "" },
      { header: "Client", value: (r) => r.clientName },
      { header: "Reg", value: (r) => r.reg ?? "" },
      { header: "Type", value: (r) => TYPE_LABELS[r.type] },
      { header: "Reference", value: (r) => r.reference },
      { header: "Invoice", value: (r) => r.invoiceReference },
      {
        header: "Amount",
        value: (r) => r.cashEffect,
        numberFormat: '"R"#,##0.00',
        align: "right",
        chip: (r) => {
          if (r.type === "debit_note") return { fill: "FFE5E5E5", font: "FF1F1F1F" };
          return r.reversed ? { fill: "FFFF5252" } : { fill: "FF2F9E58" };
        },
      },
    ];

    exportToExcel({
      baseFilename: "payments-transactions",
      sheetName: "Transactions",
      title: "SAR2O Fleet — Payment Transactions",
      filterSummary: summarizeFilters([
        search && `Search: "${search}"`,
        typeFilter !== "all" && `Type: ${TYPE_LABELS[typeFilter]}`,
      ]),
      exportedBy,
      columns,
      rows: filteredRows,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search deal number, client, reg, or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background max-w-xs"
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="bg-background w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="receipt">Receipt</SelectItem>
            <SelectItem value="debit_note">Debit note</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <Download />
            Export
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table containerClassName="overflow-x-visible">
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow>
              <SortableHead label="Date" sortKey="date" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Deal number" sortKey="deal" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Client" sortKey="client" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <TableHead>Reg</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Invoice</TableHead>
              <SortableHead
                label="Amount"
                sortKey="amount"
                activeKey={sortKey}
                direction={sortDir}
                onSort={onSort}
                className="text-right"
              />
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground text-center">
                  No transactions match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDisplayDate(row.transactionDate)}</TableCell>
                  <TableCell>{row.dealNumber ?? "—"}</TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>{row.reg ?? "—"}</TableCell>
                  <TableCell>{TYPE_LABELS[row.type]}</TableCell>
                  <TableCell>{row.invoiceReference}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRand(row.cashEffect)}</TableCell>
                  <TableCell>
                    <StatusBadge row={row} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
