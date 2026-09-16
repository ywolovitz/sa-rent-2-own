"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createContract, updateContract } from "./actions";
import {
  billingDirectionValues,
  billingFrequencyValues,
  contractFormSchema,
  contractStatusValues,
  contractTypeValues,
  paymentMethodValues,
  type ContractFormValues,
} from "./schema";
import type { ContractWithDetails, SelectableClient, SelectableVehicle } from "./types";

const CONTRACT_TYPE_LABELS: Record<(typeof contractTypeValues)[number], string> = {
  rent_to_own: "Rent-to-own",
  short_term_rental: "Short-term rental",
  other: "Other",
};

const STATUS_LABELS: Record<(typeof contractStatusValues)[number], string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  defaulted: "Defaulted",
  repossessed: "Repossessed",
};

const PAYMENT_METHOD_LABELS: Record<(typeof paymentMethodValues)[number], string> = {
  eft: "EFT",
  cash: "Cash",
  other: "Other",
};

function toFormValues(contract?: ContractWithDetails): ContractFormValues {
  if (!contract) {
    return {
      vehicleId: "",
      clientId: "",
      contractType: "rent_to_own",
      status: "active",
      startDate: new Date().toISOString().slice(0, 10),
      paymentMethod: "eft",
      billingDirection: "arrears",
      billingFrequency: "monthly",
    };
  }

  return {
    vehicleId: contract.vehicle_id,
    clientId: contract.client_id,
    contractType: contract.contract_type,
    status: contract.status,
    startDate: contract.start_date,
    endDate: contract.end_date ?? undefined,
    paymentMethod: contract.payment_method,
    installmentAmount: contract.installment_amount?.toString() ?? undefined,
    purchasePrice: contract.purchase_price?.toString() ?? undefined,
    potentialSalePrice: contract.potential_sale_price?.toString() ?? undefined,
    salePrice: contract.sale_price?.toString() ?? undefined,
    residualValue: contract.residual_value?.toString() ?? undefined,
    totalCollected: contract.total_collected?.toString() ?? undefined,
    outstandingBalance: contract.outstanding_balance?.toString() ?? undefined,
    arrearsAmount: contract.arrears_amount?.toString() ?? undefined,
    isPaidUp: contract.is_paid_up,
    notes: contract.notes ?? undefined,
    billingDay: contract.str_deal_details?.billing_day.toString() ?? undefined,
    billingDirection: contract.str_deal_details?.billing_direction ?? "arrears",
    billingFrequency: contract.str_deal_details?.billing_frequency ?? "monthly",
  };
}

export function ContractPanel({
  contract,
  vehicles,
  clients,
}: {
  contract?: ContractWithDetails;
  vehicles: SelectableVehicle[];
  clients: SelectableClient[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isEditing = Boolean(contract);

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: toFormValues(contract),
  });

  const contractType = useWatch({ control: form.control, name: "contractType" });

  function onSubmit(values: ContractFormValues) {
    startTransition(async () => {
      const result = isEditing
        ? await updateContract(contract!.id, values)
        : await createContract(values);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isEditing ? "Contract updated" : "Contract created");
      setOpen(false);
      form.reset(toFormValues(undefined));
    });
  }

  // When editing, the vehicle/client already on this contract might not be
  // in the "available" list passed in — make sure they still show up.
  const vehicleOptions =
    isEditing && !vehicles.some((v) => v.id === contract!.vehicle_id)
      ? [{ id: contract!.vehicle_id, label: "(current vehicle)" }, ...vehicles]
      : vehicles;
  const clientOptions =
    isEditing && !clients.some((c) => c.id === contract!.client_id)
      ? [{ id: contract!.client_id, label: "(current client)" }, ...clients]
      : clients;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(toFormValues(contract));
      }}
    >
      <SheetTrigger asChild>
        {isEditing ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus />
            Add contract
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit contract" : "Add contract"}</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form id="contract-form" onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <SheetBody>
            <section className="grid gap-4 sm:grid-cols-2">
              <h3 className="text-muted-foreground col-span-full text-xs font-semibold tracking-wide uppercase">
                Deal
              </h3>
              <FormField
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select vehicle" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vehicleOptions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clientOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contractType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contractTypeValues.map((t) => (
                          <SelectItem key={t} value={t}>
                            {CONTRACT_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contractStatusValues.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract end date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {contractType === "short_term_rental" && (
              <section className="grid gap-4 sm:grid-cols-3">
                <h3 className="text-muted-foreground col-span-full text-xs font-semibold tracking-wide uppercase">
                  STR billing
                </h3>
                <FormField
                  control={form.control}
                  name="billingDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing day</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billingDirection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Direction</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {billingDirectionValues.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d === "advance" ? "Pays ahead" : "Pays in arrears"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="billingFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {billingFrequencyValues.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f === "weekly" ? "Weekly" : "Monthly"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-3">
              <h3 className="text-muted-foreground col-span-full text-xs font-semibold tracking-wide uppercase">
                Financials
              </h3>
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment method</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethodValues.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="installmentAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Installment</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="residualValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Residual value (RV)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purchasePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase price</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="potentialSalePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Potential sale price</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale price (if sold)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="totalCollected"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total collected</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outstandingBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Outstanding balance</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="arrearsAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arrears</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isPaidUp"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 self-end pb-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">Paid up</FormLabel>
                  </FormItem>
                )}
              />
            </section>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            </SheetBody>
          </form>
        </Form>
        <SheetFooter>
          <Button type="submit" form="contract-form" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
