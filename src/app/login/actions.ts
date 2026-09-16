"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeSaPhone } from "@/lib/phone";

const loginSchema = z.object({
  phone: z.string().min(1, "Enter your cell number"),
  password: z.string().min(1, "Enter your password"),
  redirectTo: z.string().optional(),
});

export interface LoginState {
  error?: string;
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const phone = normalizeSaPhone(parsed.data.phone);
  if (!phone) {
    return { error: "Enter a valid South African cell number" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    phone,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Incorrect cell number or password" };
  }

  redirect(parsed.data.redirectTo || "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
