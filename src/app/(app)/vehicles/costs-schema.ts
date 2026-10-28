import { z } from "zod";

export const vehicleCostTypeValues = [
  "service",
  "repair",
  "car_wash",
  "maintenance",
  "other",
] as const;

export const vehicleCostFormSchema = z.object({
  costType: z.enum(vehicleCostTypeValues),
  costDate: z.string().min(1, "Date is required"),
  supplier: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  mileageAtTime: z.string().optional(),
  workDone: z.string().optional(),
  notes: z.string().optional(),
});

export type VehicleCostFormValues = z.infer<typeof vehicleCostFormSchema>;

export interface VehicleCost {
  id: string;
  cost_type: (typeof vehicleCostTypeValues)[number];
  cost_date: string;
  supplier: string | null;
  amount: number;
  mileage_at_time: number | null;
  invoice_file_path: string | null;
  work_done: string | null;
  notes: string | null;
  source: "web" | "whatsapp";
  /** Name of the person who logged it; null for older entries with no recorded user. */
  recorded_by_name: string | null;
}
