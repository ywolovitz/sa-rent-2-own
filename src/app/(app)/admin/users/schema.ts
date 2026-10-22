import { z } from "zod";

import { ASSIGNABLE_ROLES } from "@/lib/auth/permissions";

export const MIN_PASSWORD_LENGTH = 8;

export const newStaffFormSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Cell number is required"),
  role: z.enum(ASSIGNABLE_ROLES),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export type NewStaffFormValues = z.infer<typeof newStaffFormSchema>;
