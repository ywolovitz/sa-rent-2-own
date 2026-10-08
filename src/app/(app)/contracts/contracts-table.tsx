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
import { StatButtonPill, StatLinkPill } from "@/components/dashboard/stat-pill";
import { isoDaysFromNow } from "@/lib/date-ranges";
import { exportToExcel, summarizeFilters, type ExportColumn } from "@/lib/export-to-excel";
import { compareNumbers, compareStrings, useTableControls } from "@/lib/use-table-controls";
import type { ContractStatus, ContractType } from "@/lib/database.types";

import { contractStatusValues, contractTypeValues } from "./schema";
import { ContractPanel } from "./contract-panel";
import { DeleteContractButton } from "./delete-contract-button";
import type { ContractRow, SelectableClient, SelectableVehicle } from "./types";

const STATUS_VARIANT: Record<
  ContractStatus,
  "default" | "secondary" | "destructive" | "warning" | "success" | "outline"
> = {
  active: "success",
  completed: "secondary",
  cancelled: "outline",
  defaulted: "destructive",
  repossessed: "destructive",
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  defaulted: "Defaulted",
  repossessed: "Repossessed",
};

const TYPE_LABELS: Record<ContractType, string> = {
  rent_to_own: "Rent-to-own",
  short_term_rental: "Short-term rental",
  other: "Other",
};

const STATUS_CHIP_COLORS: Record<ContractStatus, { fill: string; font?: string }> = {
  active: { fill: "FF2F9E58" },
  completed: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  cancelled: { fill: "FFFFFFFF", font: "FF1F1F1F" },
  defaulted: { fill: "FFFF5252" },
  repossessed: { fill: "FFFF5252" },
};

const ARREARS_CHIP = { fill: "FFFF5252" };

type SortKey = "vehicle" | "client" | "type" | "status" | "installment" | "arrears" | "endDate";

export function ContractsTable({
  rows,
  vehicles,
  clients,
  initialEndingSoon,
  vehicleStatFilters,
  exportedBy,
}: {
  rows: ContractRow[];
  vehicles: SelectableVehicle[];
  clients: SelectableClient[];
  initialEndingSoon?: boolean;
  vehicleStatFilters: {
    fleetCount: number;
    activeCount: number;
    idleCount: number;
    workshopCount: number;
    servicingDueSoonCount: number;
  };
  exportedBy: string;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ContractType>("all");
  const [endingSoon, setEndingSoon] = useState(initialEndingSoon ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchFn = useCallback(
    (row: ContractRow, query: string) =>
      [row.vehicleLabel, row.clientName].some((value) => value.toLowerCase().includes(query)),
    []
  );

  const sortFns = {
    vehicle: (a: ContractRow, b: ContractRow) => compareStrings(a.vehicleLabel, b.vehicleLabel),
    client: (a: ContractRow, b: ContractRow) => compareStrings(a.clientName, b.clientName),
    type: (a: ContractRow, b: ContractRow) => compareStrings(a.contract_type, b.contract_type),
    status: (a: ContractRow, b: ContractRow) => compareStrings(a.status, b.status),
    installment: (a: ContractRow, b: ContractRow) =>
      compareNumbers(a.installment_amount, b.installment_amount),
    arrears: (a: ContractRow, b: ContractRow) => compareNumbers(a.arrears_amount, b.arrears_amount),
    endDate: (a: ContractRow, b: ContractRow) =>
      compareStrings(a.end_date, b.end_date),
  } satisfies Record<SortKey, (a: ContractRow, b: ContractRow) => number>;

  const endingSoonCutoff = isoDaysFromNow(90);
  // Matches the preFiltered predicate below exactly, so the pill's count is
  // always what clicking it actually shows.
  const endingSoonCount = rows.filter((r) => r.end_date && r.end_date <= endingSoonCutoff).length;
  const preFiltered = rows
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter((r) => typeFilter === "all" || r.contract_type === typeFilter)
    .filter((r) => !endingSoon || (r.end_date && r.end_date <= endingSoonCutoff));

  const { search, setSearch, sortKey, sortDir, onSort, filteredRows } = useTableControls<
    ContractRow,
    SortKey
  >({
    rows: preFiltered,
    searchFn,
    sortFns,
    defaultSortKey: "endDate",
  });

  function handleExport() {
    const columns: ExportColumn<ContractRow>[] = [
      { header: "Vehicle", value: (r) => r.vehicleLabel },
      { header: "Client", value: (r) => r.clientName },
      { header: "Type", value: (r) => TYPE_LABELS[r.contract_type] },
      {
        header: "Status",
        value: (r) => STATUS_LABELS[r.status],
        chip: (r) => STATUS_CHIP_COLORS[r.status],
      },
      {
        header: "Installment",
        value: (r) => r.installment_amount ?? "",
        numberFormat: '"R"#,##0.00',
        align: "right",
      },
      {
        header: "Arrears",
        value: (r) => r.arrears_amount,
        numberFormat: '"R"#,##0.00',
        align: "right",
        chip: (r) => (r.arrears_amount > 0 ? ARREARS_CHIP : null),
      },
      { header: "End date", value: (r) => r.end_date ?? "" },
    ];

    exportToExcel({
      baseFilename: "contracts",
      sheetName: "Contracts",
      title: "SAR2O Fleet — Contracts Export",
      filterSummary: summarizeFilters([
        search && `Search: "${search}"`,
        statusFilter !== "all" && `Status: ${STATUS_LABELS[statusFilter]}`,
        typeFilter !== "all" && `Type: ${TYPE_LABELS[typeFilter]}`,
        endingSoon && "Ending within 3 months",
      ]),
      exportedBy,
      columns,
      rows: filteredRows,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatLinkPill
            label="Fleet"
            value={vehicleStatFilters.fleetCount}
            subtitle="Total vehicles"
            href="/vehicles"
          />
          <StatLinkPill
            label="Active"
            value={vehicleStatFilters.activeCount}
            subtitle="On road"
            href="/vehicles?status=on_road"
          />
          <StatLinkPill
            label="Idle"
            value={vehicleStatFilters.idleCount}
            subtitle="Parked"
            href="/vehicles?status=parked"
          />
          <StatLinkPill
            label="Workshop"
            value={vehicleStatFilters.workshopCount}
            subtitle="In repair"
            href="/vehicles?status=in_repair"
          />
          <StatLinkPill
            label="Servicing"
            value={vehicleStatFilters.servicingDueSoonCount}
            subtitle="Due within 30 days"
            href="/vehicles?service=due_soon"
          />
          <StatButtonPill
            label="Contracts"
            value={endingSoonCount}
            subtitle="Ending within 3 months"
            isActive={endingSoon}
            onClick={() => setEndingSoon((v) => !v)}
          />
          <ContractPanel vehicles={vehicles} clients={clients} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search vehicle or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | ContractStatus)}>
          <SelectTrigger className="bg-background w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {contractStatusValues.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | ContractType)}>
          <SelectTrigger className="bg-background w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {contractTypeValues.map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={handleExport}>
          <Download />
          Export
        </Button>
        <p className="text-muted-foreground text-sm">
          {filteredRows.length === rows.length
            ? `${rows.length} on record`
            : `${filteredRows.length} of ${rows.length}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <Table containerClassName="overflow-x-visible">
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow>
              <SortableHead label="Vehicle" sortKey="vehicle" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Client" sortKey="client" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Type" sortKey="type" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead
                label="Installment"
                sortKey="installment"
                activeKey={sortKey}
                direction={sortDir}
                onSort={onSort}
              />
              <SortableHead label="Arrears" sortKey="arrears" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead
                label="End date"
                sortKey="endDate"
                activeKey={sortKey}
                direction={sortDir}
                onSort={onSort}
              />
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(row.id)}
              >
                <TableCell className="font-medium">{row.vehicleLabel}</TableCell>
                <TableCell>{row.clientName}</TableCell>
                <TableCell className="capitalize">{row.contract_type.replace(/_/g, " ")}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                </TableCell>
                <TableCell>
                  {row.installment_amount ? `R${row.installment_amount.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell>
                  {row.arrears_amount > 0 ? (
                    <Badge variant="destructive">R{row.arrears_amount.toLocaleString()}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{row.end_date ?? "—"}</TableCell>
                <TableCell
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ContractPanel
                    contract={row}
                    vehicles={vehicles}
                    clients={clients}
                    open={selectedId === row.id}
                    onOpenChange={(next) => setSelectedId(next ? row.id : null)}
                  />
                  <DeleteContractButton contractId={row.id} label={row.vehicleLabel} />
                </TableCell>
              </TableRow>
            ))}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground text-center py-8">
                  No contracts match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
