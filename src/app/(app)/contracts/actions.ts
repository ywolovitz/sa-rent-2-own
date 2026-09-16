"use server";

import { revalidatePath } from "next/cache";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { contractFormSchema, type ContractFormValues } from "./schema";

export interface ActionResult {
  error?: string;
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toContractRow(values: ContractFormValues) {
  return {
    vehicle_id: values.vehicleId,
    client_id: values.clientId,
    contract_type: values.contractType,
    status: values.status,
    start_date: values.startDate,
    end_date: values.endDate || null,
    payment_method: values.paymentMethod,
    installment_amount: toNumber(values.installmentAmount),
    purchase_price: toNumber(values.purchasePrice),
    potential_sale_price: toNumber(values.potentialSalePrice),
    sale_price: toNumber(values.salePrice),
    residual_value: toNumber(values.residualValue),
    total_collected: toNumber(values.totalCollected) ?? 0,
    outstanding_balance: toNumber(values.outstandingBalance) ?? 0,
    arrears_amount: toNumber(values.arrearsAmount) ?? 0,
    is_paid_up: values.isPaidUp ?? false,
    notes: values.notes || null,
  };
}

async function syncStrDealDetails(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  contractId: string,
  values: ContractFormValues
): Promise<string | null> {
  if (values.contractType !== "short_term_rental") {
    await supabase.from("str_deal_details").delete().eq("contract_id", contractId);
    return null;
  }

  const billingDay = toNumber(values.billingDay);
  if (!billingDay) {
    return "Billing day is required for short-term rental deals";
  }

  const { error } = await supabase.from("str_deal_details").upsert(
    {
      contract_id: contractId,
      billing_day: billingDay,
      billing_direction: values.billingDirection ?? "arrears",
      billing_frequency: values.billingFrequency ?? "monthly",
    },
    { onConflict: "contract_id" }
  );

  return error ? "Contract saved, but couldn't save the STR billing details" : null;
}

function friendlyInsertError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "That vehicle already has an active contract — end it first";
  }
  if (error.code === "23503") {
    return "Selected vehicle or client no longer exists";
  }
  return "Couldn't save the contract";
}

export async function createContract(raw: ContractFormValues): Promise<ActionResult> {
  await requireManagerOrAdmin();
  const parsed = contractFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const values = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert(toContractRow(values))
    .select("id")
    .single();

  if (error || !contract) {
    return { error: friendlyInsertError(error ?? { message: "unknown" }) };
  }

  const strError = await syncStrDealDetails(supabase, contract.id, values);
  if (strError) {
    return { error: strError };
  }

  revalidatePath("/contracts");
  revalidatePath("/vehicles");
  return {};
}

export async function updateContract(
  contractId: string,
  raw: ContractFormValues
): Promise<ActionResult> {
  await requireManagerOrAdmin();
  const parsed = contractFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const values = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("contracts")
    .update(toContractRow(values))
    .eq("id", contractId);

  if (error) {
    return { error: friendlyInsertError(error) };
  }

  const strError = await syncStrDealDetails(supabase, contractId, values);
  if (strError) {
    return { error: strError };
  }

  revalidatePath("/contracts");
  revalidatePath("/vehicles");
  return {};
}

export async function deleteContract(contractId: string): Promise<ActionResult> {
  await requireManagerOrAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("contracts").delete().eq("id", contractId);

  if (error) {
    return { error: "Couldn't delete the contract" };
  }

  revalidatePath("/contracts");
  revalidatePath("/vehicles");
  return {};
}
