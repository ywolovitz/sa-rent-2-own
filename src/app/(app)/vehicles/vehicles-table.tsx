"use client";

import { useCallback, useRef, useState, useTransition } from "react";
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
import { toBlob } from "html-to-image";
import { Download, ImageDown, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { daysUntil, formatDayCount, formatDisplayDate, isoDaysFromNow } from "@/lib/date-ranges";
import { dueDateColorScale, dueDateExcelChip } from "@/lib/due-date-color";
import { exportToExcel, summarizeFilters, type ExportColumn } from "@/lib/export-to-excel";
import { useColumnOrder } from "@/lib/use-column-order";
import { compareNumbers, compareStrings, useTableControls } from "@/lib/use-table-controls";
import { formatSaPhoneForDisplay } from "@/lib/phone";
import {
  VEHICLE_COLOUR_OPTIONS,
  readableTextColor,
  resolveVehicleColourHex,
  toArgb,
} from "@/lib/vehicle-colours";
import type { PaymentMethod, TrackerStatus, VehicleStatus } from "@/lib/database.types";

import { vehicleStatusValues } from "./schema";
import { updateVehicleColour, updateVehicleStatus } from "./actions";
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

/** Plain date display that turns red when the date has already passed —
 * same "text-destructive font-medium" treatment as the countdown columns,
 * for date columns where being in the past is itself the problem (a
 * service date that's come and gone, a license disc that's expired). */
function PastDueDate({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const overdue = daysUntil(date) < 0;
  return (
    <span className={overdue ? "text-destructive font-medium" : undefined}>
      {formatDisplayDate(date)}
    </span>
  );
}

/** Date chip with a red -> amber -> green cell-fill colour scale based on
 * how far out the date is, matching the client's spreadsheet's conditional
 * formatting. */
function DueDateGradient({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(date);
  const { background, foreground } = dueDateColorScale(days);
  return (
    <Badge
      variant="outline"
      style={{ backgroundColor: background, color: foreground, borderColor: "rgba(0,0,0,0.15)" }}
    >
      {formatDisplayDate(date)}
    </Badge>
  );
}

function ColourChip({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  const hex = resolveVehicleColourHex(name);
  if (!hex) return <Badge variant="outline">{name}</Badge>;
  return (
    <Badge
      variant="outline"
      style={{ backgroundColor: hex, color: readableTextColor(hex), borderColor: "rgba(0,0,0,0.15)" }}
    >
      {name}
    </Badge>
  );
}

/** A compact, borderless Select styled to look like its trigger content
 * (a Badge) rather than a form control, so it reads as the same chip the
 * read-only cell renders, just clickable. */
const INLINE_SELECT_TRIGGER_CLASS =
  "h-auto w-fit gap-1 border-none bg-transparent p-0 shadow-none hover:opacity-80 focus-visible:ring-1 data-[state=open]:opacity-80 [&_svg]:size-3 [&_svg]:opacity-40";

function StatusCell({
  vehicle,
  canManage,
}: {
  vehicle: VehicleWithRegistration;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return <Badge variant={STATUS_VARIANT[vehicle.status]}>{STATUS_LABELS[vehicle.status]}</Badge>;
  }

  return (
    <Select
      value={vehicle.status}
      disabled={isPending}
      onValueChange={(value) => {
        const status = value as VehicleStatus;
        if (status === vehicle.status) return;
        startTransition(async () => {
          const result = await updateVehicleStatus(vehicle.id, status);
          if (result.error) toast.error(result.error);
        });
      }}
    >
      <SelectTrigger size="sm" className={INLINE_SELECT_TRIGGER_CLASS} onClick={(e) => e.stopPropagation()}>
        <Badge variant={STATUS_VARIANT[vehicle.status]}>{STATUS_LABELS[vehicle.status]}</Badge>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {vehicleStatusValues.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColourCell({
  vehicle,
  canManage,
}: {
  vehicle: VehicleWithRegistration;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return <ColourChip name={vehicle.colour} />;
  }

  const current = vehicle.colour;

  return (
    <Select
      value={current ?? undefined}
      disabled={isPending}
      onValueChange={(value) => {
        if (value === current) return;
        startTransition(async () => {
          const result = await updateVehicleColour(vehicle.id, value);
          if (result.error) toast.error(result.error);
        });
      }}
    >
      <SelectTrigger size="sm" className={INLINE_SELECT_TRIGGER_CLASS} onClick={(e) => e.stopPropagation()}>
        <ColourChip name={current} />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {VEHICLE_COLOUR_OPTIONS.map((option) => {
          const hex = resolveVehicleColourHex(option);
          return (
            <SelectItem key={option} value={option}>
              <span className="flex items-center gap-2">
                {hex && (
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full border border-black/15"
                    style={{ backgroundColor: hex }}
                  />
                )}
                {option}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
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
  | "nextServiceDate"
  | "monthsLeft"
  | "contractEndDate"
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
  "nextServiceDate",
  "monthsLeft",
  "contractEndDate",
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
  nextServiceDate: "Next service date",
  monthsLeft: "Months left",
  contractEndDate: "Contract end date",
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
  "contractEndDate",
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

function renderCell(column: ColumnId, vehicle: VehicleWithRegistration, canManage: boolean) {
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
      return <ColourCell vehicle={vehicle} canManage={canManage} />;
    case "vin":
      return vehicle.vin ?? "—";
    case "engineNumber":
      return vehicle.engine_number ?? "—";
    case "status":
      return <StatusCell vehicle={vehicle} canManage={canManage} />;
    case "legacyStatusNote":
      return vehicle.legacy_status_note ?? "—";
    case "client":
      return vehicle.current_client_name ?? "—";
    case "nextService":
      return <ServiceCountdown date={vehicle.next_service_date} />;
    case "nextServiceDate":
      return <DueDateGradient date={vehicle.next_service_date} />;
    case "monthsLeft":
      return <ContractCountdown date={vehicle.current_contract_end_date} />;
    case "contractEndDate":
      return <PastDueDate date={vehicle.current_contract_end_date} />;
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
      return <PastDueDate date={vehicle.license_disc_expiry} />;
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
      return formatDisplayDate(vehicle.current_contract_start_date);
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
    case "nextServiceDate":
      return vehicle.next_service_date ?? "";
    case "monthsLeft":
      return formatContractCountdown(vehicle.current_contract_end_date);
    case "contractEndDate":
      return vehicle.current_contract_end_date ?? "";
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
  // Split from a single combined "due for service" filter into overdue vs.
  // upcoming, since those call for different urgency when staff are
  // triaging the fleet.
  const [serviceOverdue, setServiceOverdue] = useState(false);
  const [serviceUpcoming, setServiceUpcoming] = useState(initialServiceDueSoon ?? false);
  const [contractEndingSoon, setContractEndingSoon] = useState(initialContractEndingSoon ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const captureRef = useRef<HTMLDivElement>(null);

  // Status, service overdue/upcoming, and "contract ending" are presented
  // as one set of quick filters (the pill row, plus this dropdown and
  // button), so picking one clears the others — combining them silently
  // intersects to an empty, confusing result (e.g. Idle + Contract ending,
  // when no idle vehicle's contract happens to be ending soon).
  function selectStatus(status: "all" | VehicleStatus) {
    setStatusFilter(status);
    setServiceOverdue(false);
    setServiceUpcoming(false);
    setContractEndingSoon(false);
  }
  function toggleServiceOverdue() {
    setServiceOverdue((was) => {
      const next = !was;
      if (next) {
        setStatusFilter("all");
        setServiceUpcoming(false);
        setContractEndingSoon(false);
      }
      return next;
    });
  }
  function toggleServiceUpcoming() {
    setServiceUpcoming((was) => {
      const next = !was;
      if (next) {
        setStatusFilter("all");
        setServiceOverdue(false);
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
        setServiceOverdue(false);
        setServiceUpcoming(false);
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
    nextServiceDate: (a, b) =>
      compareNumbers(
        a.next_service_date ? Date.parse(a.next_service_date) : null,
        b.next_service_date ? Date.parse(b.next_service_date) : null
      ),
    monthsLeft: (a, b) =>
      compareNumbers(
        a.current_contract_end_date ? Date.parse(a.current_contract_end_date) : null,
        b.current_contract_end_date ? Date.parse(b.current_contract_end_date) : null
      ),
    contractEndDate: (a, b) =>
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

  const today = isoDaysFromNow(0);
  const serviceDueCutoff = isoDaysFromNow(30);
  const contractEndingCutoff = isoDaysFromNow(30);

  // Quick-filter pill counts — always against the full dataset, not
  // preFiltered/filteredRows, so they read as stable totals rather than
  // shrinking as other filters narrow the table.
  const fleetCount = rows.length;
  const activeCount = rows.filter((r) => r.status === "on_road").length;
  const idleCount = rows.filter((r) => r.status === "parked").length;
  const workshopCount = rows.filter((r) => r.status === "in_repair").length;
  const serviceOverdueCount = rows.filter(
    (r) => r.next_service_date && r.next_service_date < today
  ).length;
  const serviceUpcomingCount = rows.filter(
    (r) => r.next_service_date && r.next_service_date >= today && r.next_service_date <= serviceDueCutoff
  ).length;

  const preFiltered = rows
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter((r) => !serviceOverdue || (r.next_service_date && r.next_service_date < today))
    .filter(
      (r) =>
        !serviceUpcoming ||
        (r.next_service_date && r.next_service_date >= today && r.next_service_date <= serviceDueCutoff)
    )
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
    storageKey: "sar2o:vehicles-sort",
  });

  const MONEY_COLUMNS = new Set<ColumnId>([
    "installment",
    "potentialSalePrice",
    "purchasePrice",
    "totalCollected",
    "residualValue",
  ]);
  const NUMBER_COLUMNS = new Set<ColumnId>(["currentMileage", "nextServiceKm"]);

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = filteredRows.some((r) => selectedIds.has(r.id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredRows.forEach((r) => next.delete(r.id));
      } else {
        filteredRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  const selectedRows = filteredRows.filter((r) => selectedIds.has(r.id));

  async function handleCopyAsImage() {
    if (!captureRef.current || selectedRows.length === 0) return;
    const count = selectedRows.length;
    let blob: Blob | null;
    try {
      // html-to-image sizes its output from the capture node's own
      // scrollWidth/Height, but that div has no overflow style of its own
      // (default "visible"), so its scrollWidth just reports its own box
      // width rather than the wide <table> overflowing inside it — the
      // table itself is what actually has the real content width.
      const node = captureRef.current;
      const table = node.querySelector("table");
      const width = table?.scrollWidth ?? node.scrollWidth;
      const height = table?.scrollHeight ?? node.scrollHeight;
      blob = await toBlob(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width,
        height,
        // Forces the cloned node itself to the real width as an inline
        // style — without this, the clone can still reflow/wrap narrower
        // than the live DOM, even with width/height set above.
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
      toast.success(`Copied ${count} row${count === 1 ? "" : "s"} as an image — paste it into WhatsApp`);
    } catch {
      // Clipboard image writes aren't supported in every browser — fall back to a download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vehicles-selection-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Downloaded an image of ${count} row${count === 1 ? "" : "s"} (clipboard copy isn't supported in this browser)`
      );
    }
  }

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
            : column === "nextServiceDate"
              ? (vehicle) =>
                  vehicle.next_service_date
                    ? dueDateExcelChip(daysUntil(vehicle.next_service_date))
                    : undefined
              : column === "colour"
                ? (vehicle) => {
                    if (!vehicle.colour) return undefined;
                    const hex = resolveVehicleColourHex(vehicle.colour);
                    if (!hex) return undefined;
                    return { fill: toArgb(hex), font: toArgb(readableTextColor(hex)) };
                  }
                : undefined,
    }));

    exportToExcel({
      baseFilename: "vehicles",
      sheetName: "Vehicles",
      title: "SAR2O Fleet — Vehicles Export",
      filterSummary: summarizeFilters([
        search && `Search: "${search}"`,
        statusFilter !== "all" && `Status: ${STATUS_LABELS[statusFilter]}`,
        serviceOverdue && "Services overdue",
        serviceUpcoming && "Upcoming services",
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
          <StatButtonPill
            label="Fleet"
            value={fleetCount}
            subtitle="Total vehicles"
            isActive={statusFilter === "all" && !serviceOverdue && !serviceUpcoming && !contractEndingSoon}
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
            label="Overdue"
            value={serviceOverdueCount}
            subtitle="Services overdue"
            isActive={serviceOverdue}
            onClick={toggleServiceOverdue}
          />
          <StatButtonPill
            label="Upcoming"
            value={serviceUpcomingCount}
            subtitle="Upcoming services (next 30 days)"
            isActive={serviceUpcoming}
            onClick={toggleServiceUpcoming}
          />
          <StatLinkPill
            label="Contracts"
            value={contractsEndingSoonCount}
            subtitle="Ending within 3 months"
            href="/contracts?ending=soon"
          />
          {canManage && <VehiclePanel />}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyAsImage}
          disabled={selectedRows.length === 0}
        >
          <ImageDown />
          Copy as image
        </Button>
        {selectedRows.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear {selectedRows.length} selected
          </Button>
        )}
        <p className="text-muted-foreground text-sm">
          {filteredRows.length === rows.length
            ? `${rows.length} in the fleet`
            : `${filteredRows.length} of ${rows.length}`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <DndContext
          id="vehicles-table-columns"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <Table containerClassName="overflow-x-visible">
            <TableHeader className="bg-background sticky top-0 z-10">
              <TableRow>
                <TableHead className="sticky left-0 z-20 w-20 border-r bg-muted">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAllVisible}
                      aria-label="Select all visible rows"
                    />
                    <span className="text-muted-foreground flex-1 text-center">#</span>
                  </div>
                </TableHead>
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
              {filteredRows.map((vehicle, index) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="sticky left-0 z-10 w-20 border-r bg-background group-hover:bg-muted group-data-[state=selected]:bg-muted">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.has(vehicle.id)}
                        onCheckedChange={() => toggleRowSelected(vehicle.id)}
                        aria-label={`Select ${vehicle.current_plate ?? vehicle.file_no}`}
                      />
                      <span className="text-muted-foreground flex-1 text-center">{index + 1}</span>
                    </div>
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column} className={column === "reg" ? "font-medium" : undefined}>
                      {renderCell(column, vehicle, canManage)}
                    </TableCell>
                  ))}
                  {canManage && (
                    <TableCell className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        aria-label="Edit vehicle"
                        onClick={() => setSelectedId(vehicle.id)}
                      >
                        <Pencil className="size-3" />
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
                    colSpan={visibleColumns.length + (canManage ? 1 : 0) + 1}
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

      {/* Table captured as an image by "Copy as image" — kept fully
          rendered (not display:none, not positioned off-screen, both of
          which stop some browsers from ever painting it) and clipped to
          nothing by a zero-height, overflow-hidden ancestor instead. */}
      <div style={{ height: 0, overflow: "hidden" }} aria-hidden="true">
        <div ref={captureRef} style={{ width: "max-content" }}>
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((column) => (
                  <TableHead key={column}>{COLUMN_LABELS[column]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedRows.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  {visibleColumns.map((column) => (
                    <TableCell key={column} className={column === "reg" ? "font-medium" : undefined}>
                      {renderCell(column, vehicle, false)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
