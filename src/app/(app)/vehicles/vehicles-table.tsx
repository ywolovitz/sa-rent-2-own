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
import { daysUntil, formatDayCount, isoDaysFromNow } from "@/lib/date-ranges";
import { exportRowsToExcel } from "@/lib/export-to-excel";
import { useColumnOrder } from "@/lib/use-column-order";
import { compareNumbers, compareStrings, useTableControls } from "@/lib/use-table-controls";
import type { VehicleStatus } from "@/lib/database.types";

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
  | "client"
  | "nextService"
  | "monthsLeft";

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
  "client",
  "nextService",
  "monthsLeft",
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
  client: "Client",
  nextService: "Next service in:",
  monthsLeft: "Months left",
};

const MANAGER_ONLY_COLUMNS = new Set<ColumnId>(["client", "monthsLeft"]);

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
    case "client":
      return vehicle.current_client_name ?? "—";
    case "nextService":
      return <ServiceCountdown date={vehicle.next_service_date} />;
    case "monthsLeft":
      return <ContractCountdown date={vehicle.current_contract_end_date} />;
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
    case "client":
      return vehicle.current_client_name ?? "";
    case "nextService":
      return formatServiceCountdown(vehicle.next_service_date);
    case "monthsLeft":
      return formatContractCountdown(vehicle.current_contract_end_date);
  }
}

export function VehiclesTable({
  rows,
  canManage,
  initialStatus,
  initialServiceDueSoon,
  initialContractEndingSoon,
}: {
  rows: VehicleWithRegistration[];
  canManage: boolean;
  initialStatus?: VehicleStatus;
  initialServiceDueSoon?: boolean;
  initialContractEndingSoon?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | VehicleStatus>(initialStatus ?? "all");
  const [serviceDueSoon, setServiceDueSoon] = useState(initialServiceDueSoon ?? false);
  const [contractEndingSoon, setContractEndingSoon] = useState(initialContractEndingSoon ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { order, isHidden, reorder, toggleHidden, reset } = useColumnOrder(
    "sar2o:vehicles-columns",
    DEFAULT_COLUMN_ORDER
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
      [row.current_plate, row.file_no, row.make, row.model, row.vin, row.current_client_name]
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
  };

  const serviceDueCutoff = isoDaysFromNow(30);
  const contractEndingCutoff = isoDaysFromNow(30);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search reg, model, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | VehicleStatus)}>
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
        <Button
          type="button"
          variant={serviceDueSoon ? "default" : "outline"}
          size="sm"
          onClick={() => setServiceDueSoon((v) => !v)}
        >
          Due for service
        </Button>
        {canManage && (
          <Button
            type="button"
            variant={contractEndingSoon ? "default" : "outline"}
            size="sm"
            onClick={() => setContractEndingSoon((v) => !v)}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            exportRowsToExcel(
              "vehicles",
              "Vehicles",
              filteredRows.map((vehicle) =>
                Object.fromEntries(
                  visibleColumns.map((column) => [COLUMN_LABELS[column], exportValue(column, vehicle)])
                )
              )
            )
          }
        >
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
