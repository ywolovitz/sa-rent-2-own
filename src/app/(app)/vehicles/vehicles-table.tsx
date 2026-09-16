"use client";

import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
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

type SortKey = "reg" | "model" | "status" | "client" | "nextService";

export function VehiclesTable({
  rows,
  canManage,
}: {
  rows: VehicleWithRegistration[];
  canManage: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | VehicleStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchFn = useCallback(
    (row: VehicleWithRegistration, query: string) =>
      [row.current_plate, row.file_no, row.make, row.model, row.current_client_name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    []
  );

  const sortFns = {
    reg: (a: VehicleWithRegistration, b: VehicleWithRegistration) =>
      compareStrings(a.current_plate, b.current_plate),
    model: (a: VehicleWithRegistration, b: VehicleWithRegistration) =>
      compareStrings(a.model, b.model),
    status: (a: VehicleWithRegistration, b: VehicleWithRegistration) =>
      compareStrings(a.status, b.status),
    client: (a: VehicleWithRegistration, b: VehicleWithRegistration) =>
      compareStrings(a.current_client_name, b.current_client_name),
    nextService: (a: VehicleWithRegistration, b: VehicleWithRegistration) =>
      compareNumbers(
        a.next_service_date ? Date.parse(a.next_service_date) : null,
        b.next_service_date ? Date.parse(b.next_service_date) : null
      ),
  } satisfies Record<SortKey, (a: VehicleWithRegistration, b: VehicleWithRegistration) => number>;

  const { search, setSearch, sortKey, sortDir, onSort, filteredRows } = useTableControls<
    VehicleWithRegistration,
    SortKey
  >({
    rows: statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter),
    searchFn,
    sortFns,
    defaultSortKey: "nextService",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search reg, model, client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | VehicleStatus)}>
          <SelectTrigger className="w-44">
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
        <p className="text-muted-foreground text-sm">
          {filteredRows.length === rows.length
            ? `${rows.length} in the fleet`
            : `${filteredRows.length} of ${rows.length}`}
        </p>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Reg" sortKey="reg" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Model" sortKey="model" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Status" sortKey="status" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              {canManage && (
                <SortableHead label="Client" sortKey="client" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              )}
              <SortableHead
                label="Next service"
                sortKey="nextService"
                activeKey={sortKey}
                direction={sortDir}
                onSort={onSort}
              />
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
                <TableCell className="font-medium">{vehicle.current_plate ?? "—"}</TableCell>
                <TableCell>
                  {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[vehicle.status]}>{STATUS_LABELS[vehicle.status]}</Badge>
                </TableCell>
                {canManage && <TableCell>{vehicle.current_client_name ?? "—"}</TableCell>}
                <TableCell>{vehicle.next_service_date ?? "—"}</TableCell>
                {canManage && (
                  <TableCell
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
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
                <TableCell colSpan={6} className="text-muted-foreground text-center py-8">
                  No vehicles match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

