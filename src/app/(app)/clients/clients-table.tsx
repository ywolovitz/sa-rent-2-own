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
import { formatSaPhoneForDisplay } from "@/lib/phone";
import { compareStrings, useTableControls } from "@/lib/use-table-controls";

import { DeleteClientButton } from "./delete-client-button";
import { ClientPanel } from "./client-panel";
import type { ClientWithBanking } from "./types";

type BankingFilter = "all" | "has" | "none";
type SortKey = "name" | "cell" | "idNumber";

export function ClientsTable({ rows }: { rows: ClientWithBanking[] }) {
  const [bankingFilter, setBankingFilter] = useState<BankingFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const searchFn = useCallback(
    (row: ClientWithBanking, query: string) =>
      [row.full_name, row.cell_number, row.id_number]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    []
  );

  const sortFns = {
    name: (a: ClientWithBanking, b: ClientWithBanking) => compareStrings(a.full_name, b.full_name),
    cell: (a: ClientWithBanking, b: ClientWithBanking) => compareStrings(a.cell_number, b.cell_number),
    idNumber: (a: ClientWithBanking, b: ClientWithBanking) => compareStrings(a.id_number, b.id_number),
  } satisfies Record<SortKey, (a: ClientWithBanking, b: ClientWithBanking) => number>;

  const filteredByBanking =
    bankingFilter === "all"
      ? rows
      : rows.filter((r) => (bankingFilter === "has" ? Boolean(r.banking) : !r.banking));

  const { search, setSearch, sortKey, sortDir, onSort, filteredRows } = useTableControls<
    ClientWithBanking,
    SortKey
  >({
    rows: filteredByBanking,
    searchFn,
    sortFns,
    defaultSortKey: "name",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name, cell, ID number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={bankingFilter} onValueChange={(v) => setBankingFilter(v as BankingFilter)}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="has">Has banking on file</SelectItem>
            <SelectItem value="none">No banking on file</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          {filteredRows.length === rows.length
            ? `${rows.length} on record`
            : `${filteredRows.length} of ${rows.length}`}
        </p>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Name" sortKey="name" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead label="Cell number" sortKey="cell" activeKey={sortKey} direction={sortDir} onSort={onSort} />
              <SortableHead
                label="ID number"
                sortKey="idNumber"
                activeKey={sortKey}
                direction={sortDir}
                onSort={onSort}
              />
              <TableHead>Banking</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((client) => (
              <TableRow
                key={client.id}
                className="cursor-pointer"
                onClick={() => setSelectedId(client.id)}
              >
                <TableCell className="font-medium">{client.full_name}</TableCell>
                <TableCell>{formatSaPhoneForDisplay(client.cell_number)}</TableCell>
                <TableCell>{client.id_number ?? "—"}</TableCell>
                <TableCell>
                  {client.banking ? (
                    <Badge variant="secondary">
                      {client.banking.bank_name} •••• {client.banking.account_number_last4}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">None on file</span>
                  )}
                </TableCell>
                <TableCell
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ClientPanel
                    client={client}
                    open={selectedId === client.id}
                    onOpenChange={(next) => setSelectedId(next ? client.id : null)}
                  />
                  <DeleteClientButton clientId={client.id} label={client.full_name} />
                </TableCell>
              </TableRow>
            ))}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-8">
                  No clients match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
