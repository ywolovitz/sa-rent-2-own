import { z } from "zod";

export const contractTypeValues = ["rent_to_own", "short_term_rental", "other"] as const;
export const contractStatusValues = [
  "active",
  "completed",
  "cancelled",
  "defaulted",
  "repossessed",
] as const;
export const paymentMethodValues = ["eft", "cash", "other"] as const;
export const billingDirectionValues = ["advance", "arrears"] as const;
export const billingFrequencyValues = ["weekly", "monthly"] as const;

export const contractFormSchema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  clientId: z.string().min(1, "Select a client"),
  contractType: z.enum(contractTypeValues),
  status: z.enum(contractStatusValues),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  paymentMethod: z.enum(paymentMethodValues),
  installmentAmount: z.string().optional(),
  purchasePrice: z.string().optional(),
  potentialSalePrice: z.string().optional(),
  salePrice: z.string().optional(),
  residualValue: z.string().optional(),
  totalCollected: z.string().optional(),
  outstandingBalance: z.string().optional(),
  arrearsAmount: z.string().optional(),
  isPaidUp: z.boolean().optional(),
  notes: z.string().optional(),

  // Only used when contractType === "short_term_rental"
  billingDay: z.string().optional(),
  billingDirection: z.enum(billingDirectionValues).optional(),
  billingFrequency: z.enum(billingFrequencyValues).optional(),
});

export type ContractFormValues = z.infer<typeof contractFormSchema>;
