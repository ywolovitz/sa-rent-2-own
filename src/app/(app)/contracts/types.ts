import type {
  BillingDirection,
  BillingFrequency,
  ContractStatus,
  ContractType,
  PaymentMethod,
} from "@/lib/database.types";

export interface ContractListItem {
  id: string;
  vehicle_id: string;
  client_id: string;
  contract_type: ContractType;
  status: ContractStatus;
  start_date: string;
  end_date: string | null;
  installment_amount: number | null;
  arrears_amount: number;
  vehicle_label: string;
  client_name: string;
}

export interface ContractWithDetails {
  id: string;
  vehicle_id: string;
  client_id: string;
  contract_type: ContractType;
  status: ContractStatus;
  start_date: string;
  end_date: string | null;
  payment_method: PaymentMethod;
  installment_amount: number | null;
  purchase_price: number | null;
  potential_sale_price: number | null;
  sale_price: number | null;
  residual_value: number | null;
  total_collected: number;
  outstanding_balance: number;
  arrears_amount: number;
  is_paid_up: boolean;
  notes: string | null;
  str_deal_details: {
    billing_day: number;
    billing_direction: BillingDirection;
    billing_frequency: BillingFrequency;
  } | null;
}

export interface SelectableVehicle {
  id: string;
  label: string;
}

export interface SelectableClient {
  id: string;
  label: string;
}
