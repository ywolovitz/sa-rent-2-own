import { z } from "zod";

export const staffRoleValues = ["admin", "manager", "technician"] as const;

export const newStaffFormSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Cell number is required"),
  role: z.enum(staffRoleValues),
});

export type NewStaffFormValues = z.infer<typeof newStaffFormSchema>;
