"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

export function VehicleCostsSection({
  vehicleId,
  canManage,
}: {
  vehicleId: string;
  canManage: boolean;
}) {
  const [costs, setCosts] = useState<VehicleCost[] | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
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

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Transactions
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm((v) => !v)}>
          <Plus />
          Add cost
        </Button>
      </div>

      {showAddForm && (
        <form
          ref={formRef}
          action={onAddSubmit}
          className="flex flex-col gap-3 rounded-md border p-3"
        >
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="supplier">Supplier</Label>
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
            <div className="grid gap-1.5">
              <Label htmlFor="invoice">Invoice (PDF)</Label>
              <Input id="invoice" name="invoice" type="file" accept="application/pdf" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <Button type="submit" size="sm" disabled={isPending} className="self-end">
            {isPending ? "Saving…" : "Save cost"}
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {costs === null && <p className="text-muted-foreground text-sm">Loading…</p>}
        {costs?.length === 0 && (
          <p className="text-muted-foreground text-sm">No costs logged yet.</p>
        )}
        {costs?.map((cost) => (
          <div
            key={cost.id}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{COST_TYPE_LABELS[cost.cost_type]}</Badge>
                <span className="text-muted-foreground">{cost.cost_date}</span>
                {cost.supplier && <span>{cost.supplier}</span>}
              </div>
              {cost.notes && <p className="text-muted-foreground text-xs">{cost.notes}</p>}
              {cost.invoice_file_path && <InvoiceLink filePath={cost.invoice_file_path} />}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">R{cost.amount.toLocaleString()}</span>
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
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
