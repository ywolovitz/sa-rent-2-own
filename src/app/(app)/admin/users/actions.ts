"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { normalizeSaPhone } from "@/lib/phone";
import { getOtpChannel } from "@/lib/otp";

const newStaffSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Cell number is required"),
  role: z.enum(["admin", "manager", "technician"]),
});

export interface ActionResult {
  error?: string;
}

export async function createStaffUser(raw: unknown): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return { error: "Not authorized" };
  }

  const parsed = newStaffSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const phone = normalizeSaPhone(parsed.data.phone);
  if (!phone) {
    return { error: "Enter a valid South African cell number" };
  }

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { full_name: parsed.data.fullName, role: parsed.data.role },
  });

  if (createError) {
    return {
      error: createError.message.includes("already been registered")
        ? "That cell number already has an account"
        : "Couldn't create the account",
    };
  }

  // Send the first-time setup code so the new staff member can verify
  // their number and set a password (see /setup-account).
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: getOtpChannel() },
  });

  revalidatePath("/admin/users");
  return {};
}

export async function setStaffActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return { error: "Not authorized" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) {
    return { error: "Couldn't update the account" };
  }

  revalidatePath("/admin/users");
  return {};
}
