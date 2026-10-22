"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canEdit } from "@/lib/auth/permissions";
import { normalizeSaPhone } from "@/lib/phone";

import { newStaffFormSchema } from "./schema";

export interface ActionResult {
  error?: string;
}

export async function createStaffUser(raw: unknown): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canEdit(profile.role)) {
    return { error: "Not authorized" };
  }

  const parsed = newStaffFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const phone = normalizeSaPhone(parsed.data.phone);
  if (!phone) {
    return { error: "Enter a valid South African cell number" };
  }

  const admin = createAdminClient();
  // The admin sets the password here and hands it to the new user directly,
  // so there's no SMS/WhatsApp OTP step: the number is marked confirmed up
  // front and the account can log in with number + password straight away.
  // (Once OTP delivery is live, /setup-account still works for resets.)
  const { error: createError } = await admin.auth.admin.createUser({
    phone,
    password: parsed.data.password,
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

  revalidatePath("/admin/users");
  return {};
}

export async function setStaffActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canEdit(profile.role)) {
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
