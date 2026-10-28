"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, Plus, Receipt, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDisplayDate } from "@/lib/date-ranges";

import {
  createVehicleCost,
  deleteVehicleCost,
  getInvoiceUrl,
  listVehicleCosts,
} from "./cost-actions";
import { vehicleCostTypeValues, type VehicleCost } from "./costs-schema";

const COST_TYPE_LABELS: Record<(typeof vehicleCostTypeValues)[number], string> = {
  service: "Service",
  repair: "Repair",
  car_wash: "Car wash",
  maintenance: "Maintenance",
  other: "Other",
};

type TabValue = "all" | (typeof vehicleCostTypeValues)[number];

function InvoiceLink({ filePath }: { filePath: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="text-primary inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline disabled:opacity-50"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await getInvoiceUrl(filePath);
          if (result.error || !result.url) {
            toast.error(result.error ?? "Couldn't open invoice");
            return;
          }
          window.open(result.url, "_blank", "noopener,noreferrer");
        })
      }
    >
      <Paperclip className="size-3" />
      Invoice
    </button>
  );
}

/** WhatsApp-style mark (lucide has no brand icons): speech bubble with a handset, in WhatsApp green. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path
        transform="translate(7 7) scale(0.42)"
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      />
    </svg>
  );
}

function SourceIcon({ source }: { source: VehicleCost["source"] }) {
  return source === "whatsapp" ? (
    <span title="Logged via WhatsApp" role="img" aria-label="Logged via WhatsApp" className="shrink-0">
      <WhatsAppIcon className="size-4 text-[#25D366]" />
    </span>
  ) : (
    <span title="Entered manually" role="img" aria-label="Entered manually" className="shrink-0">
      <User className="text-muted-foreground size-4" />
    </span>
  );
}

const formatRand = (n: number) =>
  `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CostsTable({
  costs,
  showType,
  loading,
  canManage,
  isPending,
  onDelete,
}: {
  costs: VehicleCost[];
  showType: boolean;
  loading: boolean;
  canManage: boolean;
  isPending: boolean;
  onDelete: (costId: string) => void;
}) {
  if (loading) {
    return <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>;
  }

  if (costs.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No costs logged yet.</p>;
  }

  const total = costs.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showType && <TableHead>Type</TableHead>}
            <TableHead>Done by</TableHead>
            <TableHead>What was done</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Mileage</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {costs.map((cost) => (
            <TableRow key={cost.id}>
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <SourceIcon source={cost.source} />
                  {formatDisplayDate(cost.cost_date)}
                </div>
              </TableCell>
              {showType && <TableCell>{COST_TYPE_LABELS[cost.cost_type]}</TableCell>}
              <TableCell>{cost.supplier || "—"}</TableCell>
              <TableCell className="max-w-64 whitespace-normal">{cost.work_done || "—"}</TableCell>
              <TableCell className="max-w-64 whitespace-normal">{cost.notes || "—"}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {cost.mileage_at_time != null ? `${cost.mileage_at_time.toLocaleString("en-ZA")} km` : "—"}
              </TableCell>
              <TableCell className="text-right font-medium whitespace-nowrap">{formatRand(cost.amount)}</TableCell>
              <TableCell>
                {cost.invoice_file_path ? (
                  <InvoiceLink filePath={cost.invoice_file_path} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Delete cost"
                    disabled={isPending}
                    onClick={() => onDelete(cost.id)}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={showType ? 6 : 5} className="text-muted-foreground text-right text-xs uppercase">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold whitespace-nowrap">{formatRand(total)}</TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * In the vehicle panel this is just a one-line summary and a button; the cost
 * history and the add form live in a wide centred modal, where the table has
 * room for every column.
 */
export function VehicleCostsSection({
  vehicleId,
  canManage,
}: {
  vehicleId: string;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [costs, setCosts] = useState<VehicleCost[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    listVehicleCosts(vehicleId).then((result) => {
      if (!cancelled) setCosts(result.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  function refresh() {
    listVehicleCosts(vehicleId).then((result) => setCosts(result.data ?? []));
  }

  function onAddSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createVehicleCost(vehicleId, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cost added");
      formRef.current?.reset();
      setShowAddForm(false);
      refresh();
    });
  }

  function onDelete(costId: string) {
    startTransition(async () => {
      const result = await deleteVehicleCost(costId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Cost entry deleted");
      refresh();
    });
  }

  const visibleCosts = (costs ?? []).filter(
    (c) => activeTab === "all" || c.cost_type === activeTab
  );
  const total = (costs ?? []).reduce((sum, c) => sum + c.amount, 0);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Transactions</h3>
      <Dialog open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-sm">
            {costs === null
              ? "Loading…"
              : costs.length === 0
                ? "No costs logged yet."
                : `${costs.length} ${costs.length === 1 ? "entry" : "entries"} · ${formatRand(total)}`}
          </p>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Receipt />
              View costs
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Vehicle costs</DialogTitle>
            <DialogDescription>Services, repairs and other costs logged against this vehicle.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="all">All</TabsTrigger>
                {vehicleCostTypeValues.map((t) => (
                  <TabsTrigger key={t} value={t}>
                    {COST_TYPE_LABELS[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {canManage && (
              <Button type="button" size="sm" onClick={() => setShowAddForm((v) => !v)}>
                <Plus />
                Add cost
              </Button>
            )}
          </div>

          {showAddForm && (
            <form ref={formRef} action={onAddSubmit} className="bg-muted/30 flex flex-col gap-3 rounded-md border p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="costType">Type</Label>
                  <Select name="costType" defaultValue="service">
                    <SelectTrigger id="costType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleCostTypeValues.map((t) => (
                        <SelectItem key={t} value={t}>
                          {COST_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="costDate">Date</Label>
                  <Input
                    id="costDate"
                    name="costDate"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="supplier">Done by</Label>
                  <Input id="supplier" name="supplier" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="amount">Amount (R)</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="mileageAtTime">Mileage</Label>
                  <Input id="mileageAtTime" name="mileageAtTime" type="number" />
                </div>
                <div className="grid gap-1.5 md:col-span-3">
                  <Label htmlFor="invoice">Invoice (PDF)</Label>
                  <Input id="invoice" name="invoice" type="file" accept="application/pdf" />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="workDone">What was done</Label>
                  <Textarea id="workDone" name="workDone" rows={2} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={2} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? "Saving…" : "Save cost"}
                </Button>
              </div>
            </form>
          )}

          <CostsTable
            costs={visibleCosts}
            showType={activeTab === "all"}
            loading={costs === null}
            canManage={canManage}
            isPending={isPending}
            onDelete={onDelete}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
