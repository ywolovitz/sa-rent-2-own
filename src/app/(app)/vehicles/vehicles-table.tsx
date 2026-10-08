"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Download, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnVisibilityMenu } from "@/components/ui/column-visibility-menu";
import { DraggableTableHead } from "@/components/ui/draggable-table-head";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatButtonPill, StatLinkPill } from "@/components/dashboard/stat-pill";
import { daysUntil, formatDayCount, isoDaysFromNow } from "@/lib/date-ranges";
import { exportToExcel, summarizeFilters, type ExportColumn } from "@/lib/export-to-excel";
import { useColumnOrder } from "@/lib/use-column-order";
import { compareNumbers, compareStrings, useTableControls } from "@/lib/use-table-controls";
import { formatSaPhoneForDisplay } from "@/lib/phone";
import type { PaymentMethod, TrackerStatus, VehicleStatus } from "@/lib/database.types";

import { vehicleStatusValues } from "./schema";
import { DeleteVehicleButton } from "./delete-vehicle-button";
import { VehiclePanel } from "./vehicle-panel";
import type { VehicleWithRegistration } from "./types";

const STATUS_VARIANT: Record<
  VehicleStatus,
  "default" | "secondary" | "destructive" | "warning" | "success" | "outline"
> = {
  available: "secondary",
  on_road: "success",
  parked: "outline",
  in_repair: "warning",
  for_sale: "default",
  sold: "secondary",
  written_off: "destructive",
};

const STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  on_road: "On road",
  parked: "Parked",
  in_repair: "In repair",
  for_sale: "For sale",
  sold: "Sold",
  written_off: "Written off",
};

const STATUS_CHIP_COLORS: Record<VehicleStatus, { fill: string; font?: string }> = {
  available: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  on_road: { fill: "FF2F9E58" },
  parked: { fill: "FFFFFFFF", font: "FF1F1F1F" },
  in_repair: { fill: "FFF0A830" },
  for_sale: { fill: "FF1F1F1F" },
  sold: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  written_off: { fill: "FFFF5252" },
};

const TRACKER_LABELS: Record<TrackerStatus, string> = {
  yes: "Yes",
  no: "No",
  no_info: "No info",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  eft: "EFT",
  cash: "Cash",
  other: "Other",
};

const PAID_CHIP_COLORS = {
  yes: { fill: "FF2F9E58" },
  no: { fill: "FFFF5252" },
};

function formatMoney(amount: number | null): string {
  return amount != null ? `R${amount.toLocaleString()}` : "—";
}

function formatYesNo(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Yes" : "No";
}

function formatServiceCountdown(date: string | null): string {
  if (!date) return "—";
  const diff = daysUntil(date);
  if (diff === 0) return "Due today";
  return formatDayCount(Math.abs(diff));
}

function ServiceCountdown({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const overdue = daysUntil(date) < 0;
  return (
    <span className={overdue ? "text-destructive font-medium" : undefined}>
      {formatServiceCountdown(date)}
    </span>
  );
}

function formatContractCountdown(date: string | null): string {
  if (!date) return "—";
  const diff = daysUntil(date);
  return diff < 0 ? "Ended" : formatDayCount(diff);
}

function ContractCountdown({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const overdue = daysUntil(date) < 0;
  return (
    <span className={overdue ? "text-destructive font-medium" : undefined}>
      {formatContractCountdown(date)}
    </span>
  );
}

type ColumnId =
  | "reg"
  | "fileNo"
  | "make"
  | "model"
  | "year"
  | "colour"
  | "vin"
  | "engineNumber"
  | "status"
  | "legacyStatusNote"
  | "client"
  | "nextService"
  | "monthsLeft"
  | "currentMileage"
  | "nextServiceKm"
  | "lastServicedBy"
  | "trackerRunning"
  | "trackerSupplier"
  | "natis"
  | "spareKey"
  | "contractFile"
  | "warranty"
  | "licenseDiscExpiry"
  | "clientCell"
  | "pastClients"
  | "installment"
  | "paymentMethod"
  | "potentialSalePrice"
  | "purchasePrice"
  | "purchaseDate"
  | "totalCollected"
  | "residualValue"
  | "paidUp";

const DEFAULT_COLUMN_ORDER: ColumnId[] = [
  "reg",
  "fileNo",
  "make",
  "model",
  "year",
  "colour",
  "vin",
  "engineNumber",
  "status",
  "legacyStatusNote",
  "client",
  "nextService",
  "monthsLeft",
  "currentMileage",
  "nextServiceKm",
  "lastServicedBy",
  "trackerRunning",
  "trackerSupplier",
  "natis",
  "spareKey",
  "contractFile",
  "warranty",
  "licenseDiscExpiry",
  "clientCell",
  "pastClients",
  "installment",
  "paymentMethod",
  "potentialSalePrice",
  "purchasePrice",
  "purchaseDate",
  "totalCollected",
  "residualValue",
  "paidUp",
];

// New columns default to hidden (still toggleable via the Columns menu) so
// the existing default view doesn't suddenly balloon to 30+ columns.
const DEFAULT_HIDDEN_COLUMNS: ColumnId[] = [
  "legacyStatusNote",
  "currentMileage",
  "nextServiceKm",
  "lastServicedBy",
  "trackerRunning",
  "trackerSupplier",
  "natis",
  "spareKey",
  "contractFile",
  "warranty",
  "licenseDiscExpiry",
  "clientCell",
  "pastClients",
  "installment",
  "paymentMethod",
  "potentialSalePrice",
  "purchasePrice",
  "purchaseDate",
  "totalCollected",
  "residualValue",
  "paidUp",
];

const COLUMN_LABELS: Record<ColumnId, string> = {
  reg: "Reg",
  fileNo: "File no",
  make: "Make",
  model: "Model",
  year: "Year",
  colour: "Colour",
  vin: "VIN",
  engineNumber: "Engine no",
  status: "Status",
  legacyStatusNote: "Status/location note",
  client: "Client",
  nextService: "Next service in:",
  monthsLeft: "Months left",
  currentMileage: "Current mileage",
  nextServiceKm: "Next service km",
  lastServicedBy: "Last serviced by",
  trackerRunning: "Tracker running",
  trackerSupplier: "Tracker supplier",
  natis: "NATIS",
  spareKey: "Spare key",
  contractFile: "Contract on file",
  warranty: "Warranty",
  licenseDiscExpiry: "License disc expiry",
  clientCell: "Client cell",
  pastClients: "Past clients",
  installment: "Installment",
  paymentMethod: "Payment method",
  potentialSalePrice: "Potential sale price",
  purchasePrice: "Purchase price",
  purchaseDate: "Purchase date",
  totalCollected: "Total collected",
  residualValue: "RV",
  paidUp: "Paid",
};

const MANAGER_ONLY_COLUMNS = new Set<ColumnId>([
  "client",
  "monthsLeft",
  "clientCell",
  "pastClients",
  "installment",
  "paymentMethod",
  "potentialSalePrice",
  "purchasePrice",
  "purchaseDate",
  "totalCollected",
  "residualValue",
  "paidUp",
]);

function renderCell(column: ColumnId, vehicle: VehicleWithRegistration) {
  switch (column) {
    case "reg":
      return vehicle.current_plate ?? "—";
    case "fileNo":
      return vehicle.file_no;
    case "make":
      return vehicle.make ?? "—";
    case "model":
      return vehicle.model ?? "—";
    case "year":
      return vehicle.year ?? "—";
    case "colour":
      return vehicle.colour ?? "—";
    case "vin":
      return vehicle.vin ?? "—";
    case "engineNumber":
      return vehicle.engine_number ?? "—";
    case "status":
      return <Badge variant={STATUS_VARIANT[vehicle.status]}>{STATUS_LABELS[vehicle.status]}</Badge>;
    case "legacyStatusNote":
      return vehicle.legacy_status_note ?? "—";
    case "client":
      return vehicle.current_client_name ?? "—";
    case "nextService":
      return <ServiceCountdown date={vehicle.next_service_date} />;
    case "monthsLeft":
      return <ContractCountdown date={vehicle.current_contract_end_date} />;
    case "currentMileage":
      return vehicle.current_mileage?.toLocaleString() ?? "—";
    case "nextServiceKm":
      return vehicle.next_service_km?.toLocaleString() ?? "—";
    case "lastServicedBy":
      return vehicle.last_serviced_by ?? "—";
    case "trackerRunning":
      return TRACKER_LABELS[vehicle.tracker_running];
    case "trackerSupplier":
      return vehicle.tracker_supplier ?? "—";
    case "natis":
      return vehicle.natis_on_file ? "On file" : "Missing";
    case "spareKey":
      return formatYesNo(vehicle.has_spare_key);
    case "contractFile":
      return formatYesNo(vehicle.has_contract_file);
    case "warranty":
      return vehicle.warranty_active ? "Active" : "Inactive";
    case "licenseDiscExpiry":
      return vehicle.license_disc_expiry ?? "—";
    case "clientCell":
      return vehicle.current_client_cell
        ? formatSaPhoneForDisplay(vehicle.current_client_cell)
        : "—";
    case "pastClients":
      return vehicle.past_client_names ?? "—";
    case "installment":
      return formatMoney(vehicle.current_installment_amount);
    case "paymentMethod":
      return vehicle.current_payment_method ? PAYMENT_METHOD_LABELS[vehicle.current_payment_method] : "—";
    case "potentialSalePrice":
      return formatMoney(vehicle.current_potential_sale_price);
    case "purchasePrice":
      return formatMoney(vehicle.current_purchase_price);
    case "purchaseDate":
      return vehicle.current_contract_start_date ?? "—";
    case "totalCollected":
      return formatMoney(vehicle.current_total_collected);
    case "residualValue":
      return formatMoney(vehicle.current_residual_value);
    case "paidUp":
      return formatYesNo(vehicle.current_is_paid_up);
  }
}

function exportValue(column: ColumnId, vehicle: VehicleWithRegistration): string | number {
  switch (column) {
    case "reg":
      return vehicle.current_plate ?? "";
    case "fileNo":
      return vehicle.file_no;
    case "make":
      return vehicle.make ?? "";
    case "model":
      return vehicle.model ?? "";
    case "year":
      return vehicle.year ?? "";
    case "colour":
      return vehicle.colour ?? "";
    case "vin":
      return vehicle.vin ?? "";
    case "engineNumber":
      return vehicle.engine_number ?? "";
    case "status":
      return STATUS_LABELS[vehicle.status];
    case "legacyStatusNote":
      return vehicle.legacy_status_note ?? "";
    case "client":
      return vehicle.current_client_name ?? "";
    case "nextService":
      return formatServiceCountdown(vehicle.next_service_date);
    case "monthsLeft":
      return formatContractCountdown(vehicle.current_contract_end_date);
    case "currentMileage":
      return vehicle.current_mileage ?? "";
    case "nextServiceKm":
      return vehicle.next_service_km ?? "";
    case "lastServicedBy":
      return vehicle.last_serviced_by ?? "";
    case "trackerRunning":
      return TRACKER_LABELS[vehicle.tracker_running];
    case "trackerSupplier":
      return vehicle.tracker_supplier ?? "";
    case "natis":
      return vehicle.natis_on_file ? "On file" : "Missing";
    case "spareKey":
      return formatYesNo(vehicle.has_spare_key);
    case "contractFile":
      return formatYesNo(vehicle.has_contract_file);
    case "warranty":
      return vehicle.warranty_active ? "Active" : "Inactive";
    case "licenseDiscExpiry":
      return vehicle.license_disc_expiry ?? "";
    case "clientCell":
      return vehicle.current_client_cell ? formatSaPhoneForDisplay(vehicle.current_client_cell) : "";
    case "pastClients":
      return vehicle.past_client_names ?? "";
    case "installment":
      return vehicle.current_installment_amount ?? "";
    case "paymentMethod":
      return vehicle.current_payment_method ? PAYMENT_METHOD_LABELS[vehicle.current_payment_method] : "";
    case "potentialSalePrice":
      return vehicle.current_potential_sale_price ?? "";
    case "purchasePrice":
      return vehicle.current_purchase_price ?? "";
    case "purchaseDate":
      return vehicle.current_contract_start_date ?? "";
    case "totalCollected":
      return vehicle.current_total_collected ?? "";
    case "residualValue":
      return vehicle.current_residual_value ?? "";
    case "paidUp":
      return formatYesNo(vehicle.current_is_paid_up);
  }
}

export function VehiclesTable({
  rows,
  canManage,
  initialStatus,
  initialServiceDueSoon,
  initialContractEndingSoon,
  contractsEndingSoonCount,
  exportedBy,
}: {
  rows: VehicleWithRegistration[];
  canManage: boolean;
  initialStatus?: VehicleStatus;
  initialServiceDueSoon?: boolean;
  initialContractEndingSoon?: boolean;
  contractsEndingSoonCount: number;
  exportedBy: string;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | VehicleStatus>(initialStatus ?? "all");
  const [serviceDueSoon, setServiceDueSoon] = useState(initialServiceDueSoon ?? false);
  const [contractEndingSoon, setContractEndingSoon] = useState(initialContractEndingSoon ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Status, "due for service", and "contract ending" are presented as one
  // set of quick filters (the pill row, plus this dropdown and button), so
  // picking one clears the others — combining them silently intersects to
  // an empty, confusing result (e.g. Idle + Contract ending, when no idle
  // vehicle's contract happens to be ending soon).
  function selectStatus(status: "all" | VehicleStatus) {
    setStatusFilter(status);
    setServiceDueSoon(false);
    setContractEndingSoon(false);
  }
  function toggleServiceDueSoon() {
    setServiceDueSoon((was) => {
      const next = !was;
      if (next) {
        setStatusFilter("all");
        setContractEndingSoon(false);
      }
      return next;
    });
  }
  function toggleContractEndingSoon() {
    setContractEndingSoon((was) => {
      const next = !was;
      if (next) {
        setStatusFilter("all");
        setServiceDueSoon(false);
      }
      return next;
    });
  }

  const { order, isHidden, reorder, toggleHidden, reset } = useColumnOrder(
    "sar2o:vehicles-columns",
    DEFAULT_COLUMN_ORDER,
    DEFAULT_HIDDEN_COLUMNS
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(active.id as ColumnId, over.id as ColumnId);
    }
  }

  const visibleColumns = order.filter(
    (id) => !isHidden(id) && (!MANAGER_ONLY_COLUMNS.has(id) || canManage)
  );
  const toggleableColumns = DEFAULT_COLUMN_ORDER.filter(
    (id) => !MANAGER_ONLY_COLUMNS.has(id) || canManage
  ).map((id) => ({ id, label: COLUMN_LABELS[id] }));

  const searchFn = useCallback(
    (row: VehicleWithRegistration, query: string) =>
      [
        row.current_plate,
        row.file_no,
        row.make,
        row.model,
        row.vin,
        row.current_client_name,
        row.current_client_cell,
        row.past_client_names,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    []
  );

  const sortFns: Record<ColumnId, (a: VehicleWithRegistration, b: VehicleWithRegistration) => number> = {
    reg: (a, b) => compareStrings(a.current_plate, b.current_plate),
    fileNo: (a, b) => compareStrings(a.file_no, b.file_no),
    make: (a, b) => compareStrings(a.make, b.make),
    model: (a, b) => compareStrings(a.model, b.model),
    year: (a, b) => compareNumbers(a.year, b.year),
    colour: (a, b) => compareStrings(a.colour, b.colour),
    vin: (a, b) => compareStrings(a.vin, b.vin),
    engineNumber: (a, b) => compareStrings(a.engine_number, b.engine_number),
    status: (a, b) => compareStrings(a.status, b.status),
    legacyStatusNote: (a, b) => compareStrings(a.legacy_status_note, b.legacy_status_note),
    client: (a, b) => compareStrings(a.current_client_name, b.current_client_name),
    nextService: (a, b) =>
      compareNumbers(
        a.next_service_date ? Date.parse(a.next_service_date) : null,
        b.next_service_date ? Date.parse(b.next_service_date) : null
      ),
    monthsLeft: (a, b) =>
      compareNumbers(
        a.current_contract_end_date ? Date.parse(a.current_contract_end_date) : null,
        b.current_contract_end_date ? Date.parse(b.current_contract_end_date) : null
      ),
    currentMileage: (a, b) => compareNumbers(a.current_mileage, b.current_mileage),
    nextServiceKm: (a, b) => compareNumbers(a.next_service_km, b.next_service_km),
    lastServicedBy: (a, b) => compareStrings(a.last_serviced_by, b.last_serviced_by),
    trackerRunning: (a, b) => compareStrings(a.tracker_running, b.tracker_running),
    trackerSupplier: (a, b) => compareStrings(a.tracker_supplier, b.tracker_supplier),
    natis: (a, b) => compareNumbers(Number(a.natis_on_file), Number(b.natis_on_file)),
    spareKey: (a, b) => compareNumbers(Number(a.has_spare_key), Number(b.has_spare_key)),
    contractFile: (a, b) => compareNumbers(Number(a.has_contract_file), Number(b.has_contract_file)),
    warranty: (a, b) => compareNumbers(Number(a.warranty_active), Number(b.warranty_active)),
    licenseDiscExpiry: (a, b) =>
      compareNumbers(
        a.license_disc_expiry ? Date.parse(a.license_disc_expiry) : null,
        b.license_disc_expiry ? Date.parse(b.license_disc_expiry) : null
      ),
    clientCell: (a, b) => compareStrings(a.current_client_cell, b.current_client_cell),
    pastClients: (a, b) => compareStrings(a.past_client_names, b.past_client_names),
    installment: (a, b) => compareNumbers(a.current_installment_amount, b.current_installment_amount),
    paymentMethod: (a, b) => compareStrings(a.current_payment_method, b.current_payment_method),
    potentialSalePrice: (a, b) =>
      compareNumbers(a.current_potential_sale_price, b.current_potential_sale_price),
    purchasePrice: (a, b) => compareNumbers(a.current_purchase_price, b.current_purchase_price),
    purchaseDate: (a, b) =>
      compareNumbers(
        a.current_contract_start_date ? Date.parse(a.current_contract_start_date) : null,
        b.current_contract_start_date ? Date.parse(b.current_contract_start_date) : null
      ),
    totalCollected: (a, b) => compareNumbers(a.current_total_collected, b.current_total_collected),
    residualValue: (a, b) => compareNumbers(a.current_residual_value, b.current_residual_value),
    paidUp: (a, b) =>
      compareNumbers(
        a.current_is_paid_up === null ? null : Number(a.current_is_paid_up),
        b.current_is_paid_up === null ? null : Number(b.current_is_paid_up)
      ),
  };

  const serviceDueCutoff = isoDaysFromNow(30);
  const contractEndingCutoff = isoDaysFromNow(30);

  // Quick-filter pill counts — always against the full dataset, not
  // preFiltered/filteredRows, so they read as stable totals rather than
  // shrinking as other filters narrow the table.
  const fleetCount = rows.length;
  const activeCount = rows.filter((r) => r.status === "on_road").length;
  const idleCount = rows.filter((r) => r.status === "parked").length;
  const workshopCount = rows.filter((r) => r.status === "in_repair").length;
  const servicingDueSoonCount = rows.filter(
    (r) => r.next_service_date && r.next_service_date <= serviceDueCutoff
  ).length;

  const preFiltered = rows
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter((r) => !serviceDueSoon || (r.next_service_date && r.next_service_date <= serviceDueCutoff))
    .filter(
      (r) =>
        !contractEndingSoon ||
        (r.current_contract_end_date && r.current_contract_end_date <= contractEndingCutoff)
    );

  const { search, setSearch, sortKey, sortDir, onSort, filteredRows } = useTableControls<
    VehicleWithRegistration,
    ColumnId
  >({
    rows: preFiltered,
    searchFn,
    sortFns,
    defaultSortKey: "nextService",
  });

  const MONEY_COLUMNS = new Set<ColumnId>([
    "installment",
    "potentialSalePrice",
    "purchasePrice",
    "totalCollected",
    "residualValue",
  ]);
  const NUMBER_COLUMNS = new Set<ColumnId>(["currentMileage", "nextServiceKm"]);

  function handleExport() {
    const columns: ExportColumn<VehicleWithRegistration>[] = visibleColumns.map((column) => ({
      header: COLUMN_LABELS[column],
      value: (vehicle) => exportValue(column, vehicle),
      align: column === "year" || MONEY_COLUMNS.has(column) || NUMBER_COLUMNS.has(column) ? "right" : undefined,
      numberFormat: MONEY_COLUMNS.has(column) ? '"R"#,##0.00' : undefined,
      chip:
        column === "status"
          ? (vehicle) => STATUS_CHIP_COLORS[vehicle.status]
          : column === "paidUp"
            ? (vehicle) =>
                vehicle.current_is_paid_up === null
                  ? undefined
                  : vehicle.current_is_paid_up
                    ? PAID_CHIP_COLORS.yes
                    : PAID_CHIP_COLORS.no
            : undefined,
    }));

    exportToExcel({
      baseFilename: "vehicles",
      sheetName: "Vehicles",
      title: "SAR2O Fleet — Vehicles Export",
      filterSummary: summarizeFilters([
        search && `Search: "${search}"`,
        statusFilter !== "all" && `Status: ${STATUS_LABELS[statusFilter]}`,
        serviceDueSoon && "Due for service",
        contractEndingSoon && "Contract ending",
      ]),
      exportedBy,
      columns,
      rows: filteredRows,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && <VehiclePanel />}
          <StatButtonPill
            label="Fleet"
            value={fleetCount}
            subtitle="Total vehicles"
            isActive={statusFilter === "all" && !serviceDueSoon && !contractEndingSoon}
            onClick={() => selectStatus("all")}
          />
          <StatButtonPill
            label="Active"
            value={activeCount}
            subtitle="On road"
            isActive={statusFilter === "on_road"}
            onClick={() => selectStatus("on_road")}
          />
          <StatButtonPill
            label="Idle"
            value={idleCount}
            subtitle="Parked"
            isActive={statusFilter === "parked"}
            onClick={() => selectStatus("parked")}
          />
          <StatButtonPill
            label="Workshop"
            value={workshopCount}
            subtitle="In repair"
            isActive={statusFilter === "in_repair"}
            onClick={() => selectStatus("in_repair")}
          />
          <StatButtonPill
            label="Servicing"
            value={servicingDueSoonCount}
            subtitle="Due within 30 days"
            isActive={serviceDueSoon}
            onClick={toggleServiceDueSoon}
          />
          <StatLinkPill
            label="Contracts"
            value={contractsEndingSoonCount}
            subtitle="Ending within 3 months"
            href="/contracts?ending=soon"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search reg, model, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => selectStatus(v as "all" | VehicleStatus)}>
          <SelectTrigger className="bg-background w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {vehicleStatusValues.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button
            type="button"
            variant={contractEndingSoon ? "default" : "outline"}
            size="sm"
            onClick={toggleContractEndingSoon}
          >
            Contract ending
          </Button>
        )}
        <ColumnVisibilityMenu
          columns={toggleableColumns}
          isHidden={isHidden}
          onToggle={toggleHidden}
          onReset={reset}
        />
        <Button type="button" variant="outline" size="sm" onClick={handleExport}>
          <Download />
          Export
        </Button>
        <p className="text-muted-foreground text-sm">
          {filteredRows.length === rows.length
            ? `${rows.length} in the fleet`
            : `${filteredRows.length} of ${rows.length}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table containerClassName="overflow-x-visible">
            <TableHeader className="bg-background sticky top-0 z-10">
              <TableRow>
                <SortableContext items={visibleColumns} strategy={horizontalListSortingStrategy}>
                  {visibleColumns.map((column) => (
                    <DraggableTableHead
                      key={column}
                      id={column}
                      label={COLUMN_LABELS[column]}
                      sortKey={column}
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={onSort}
                    />
                  ))}
                </SortableContext>
                {canManage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((vehicle) => (
                <TableRow
                  key={vehicle.id}
                  className={canManage ? "cursor-pointer" : undefined}
                  onClick={() => canManage && setSelectedId(vehicle.id)}
                >
                  {visibleColumns.map((column) => (
                    <TableCell key={column} className={column === "reg" ? "font-medium" : undefined}>
                      {renderCell(column, vehicle)}
                    </TableCell>
                  ))}
                  {canManage && (
                    <TableCell
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit vehicle"
                        onClick={() => setSelectedId(vehicle.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <VehiclePanel
                        vehicle={vehicle}
                        canManage={canManage}
                        open={selectedId === vehicle.id}
                        onOpenChange={(next) => setSelectedId(next ? vehicle.id : null)}
                      />
                      <DeleteVehicleButton
                        vehicleId={vehicle.id}
                        label={vehicle.current_plate ?? vehicle.file_no}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + (canManage ? 1 : 0)}
                    className="text-muted-foreground text-center py-8"
                  >
                    No vehicles match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </div>
    </div>
  );
}
