"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeSaPhone } from "@/lib/phone";
import { getOtpChannel } from "@/lib/otp";

export interface SetupState {
  error?: string;
  step: "request" | "verify" | "done";
  phone?: string;
}

const requestSchema = z.object({
  phone: z.string().min(1, "Enter your cell number"),
});

export async function requestSetupCode(
  prevState: SetupState,
  formData: FormData
): Promise<SetupState> {
  const parsed = requestSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) {
    return { step: "request", error: parsed.error.issues[0]?.message };
  }

  const phone = normalizeSaPhone(parsed.data.phone);
  if (!phone) {
    return { step: "request", error: "Enter a valid South African cell number" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false, channel: getOtpChannel() },
  });

  if (error) {
    // Don't reveal whether the number has an account.
    return { step: "verify", phone };
  }

  return { step: "verify", phone };
}

const verifySchema = z.object({
  phone: z.string().min(1),
  code: z.string().min(4, "Enter the code you received"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function completeSetup(
  prevState: SetupState,
  formData: FormData
): Promise<SetupState> {
  const parsed = verifySchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      step: "verify",
      phone: String(formData.get("phone") ?? ""),
      error: parsed.error.issues[0]?.message,
    };
  }

  const { phone, code, password } = parsed.data;
  const supabase = await createClient();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });

  if (verifyError) {
    return { step: "verify", phone, error: "That code is incorrect or expired" };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { step: "verify", phone, error: "Couldn't set your password, try again" };
  }

  return { step: "done", phone };
}
