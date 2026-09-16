// Hand-maintained to match supabase/migrations/*.sql. Regenerate with
// `supabase gen types typescript --local` once a local/hosted Supabase
// instance is available, and diff against this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "manager" | "technician";
export type VehicleStatus =
  | "available"
  | "on_road"
  | "parked"
  | "in_repair"
  | "for_sale"
  | "sold"
  | "written_off";
export type TrackerStatus = "yes" | "no" | "no_info";
export type InsuranceClaimStatus = "none" | "pending" | "paid" | "denied";
export type ContractType = "rent_to_own" | "short_term_rental" | "other";
export type ContractStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "defaulted"
  | "repossessed";
export type PaymentMethod = "eft" | "cash" | "other";
export type BillingDirection = "advance" | "arrears";
export type BillingFrequency = "weekly" | "monthly";
export type RentalPeriodStatus = "paid" | "owed" | "ended" | "upcoming";
export type VehicleCostType =
  | "service"
  | "repair"
  | "car_wash"
  | "maintenance"
  | "other";
export type BankAccountType = "cheque" | "savings" | "other";
export type AuditAction = "insert" | "update" | "delete" | "reveal";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone: string;
          email?: string | null;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      vehicle_assignments: {
        Row: {
          id: string;
          vehicle_id: string;
          technician_id: string;
          assigned_at: string;
          unassigned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          technician_id: string;
          assigned_at?: string;
          unassigned_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["vehicle_assignments"]["Insert"]
        >;
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          full_name: string;
          id_number: string | null;
          cell_number: string;
          alt_cell_number: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          id_number?: string | null;
          cell_number: string;
          alt_cell_number?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      client_banking_details: {
        Row: {
          id: string;
          client_id: string;
          bank_name: string;
          account_type: BankAccountType;
          branch_code: string | null;
          account_holder_name_encrypted: string;
          account_holder_name_iv: string;
          account_number_encrypted: string;
          account_number_iv: string;
          account_number_last4: string;
          key_version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          bank_name: string;
          account_type?: BankAccountType;
          branch_code?: string | null;
          account_holder_name_encrypted: string;
          account_holder_name_iv: string;
          account_number_encrypted: string;
          account_number_iv: string;
          account_number_last4: string;
          key_version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["client_banking_details"]["Insert"]
        >;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          file_no: string;
          make: string | null;
          model: string | null;
          year: number | null;
          colour: string | null;
          vin: string | null;
          engine_number: string | null;
          status: VehicleStatus;
          legacy_status_note: string | null;
          assigned_to: string | null;
          assigned_to_name: string | null;
          current_mileage: number | null;
          next_service_km: number | null;
          next_service_date: string | null;
          last_serviced_by: string | null;
          tracker_supplier: string | null;
          tracker_running: TrackerStatus;
          natis_on_file: boolean;
          license_disc_expiry: string | null;
          has_spare_key: boolean;
          warranty_active: boolean;
          warranty_notes: string | null;
          has_contract_file: boolean;
          insurance_claim_status: InsuranceClaimStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          file_no: string;
          make?: string | null;
          model?: string | null;
          year?: number | null;
          colour?: string | null;
          vin?: string | null;
          engine_number?: string | null;
          status?: VehicleStatus;
          legacy_status_note?: string | null;
          assigned_to?: string | null;
          assigned_to_name?: string | null;
          current_mileage?: number | null;
          next_service_km?: number | null;
          next_service_date?: string | null;
          last_serviced_by?: string | null;
          tracker_supplier?: string | null;
          tracker_running?: TrackerStatus;
          natis_on_file?: boolean;
          license_disc_expiry?: string | null;
          has_spare_key?: boolean;
          warranty_active?: boolean;
          warranty_notes?: string | null;
          has_contract_file?: boolean;
          insurance_claim_status?: InsuranceClaimStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
        Relationships: [];
      };
      vehicle_registrations: {
        Row: {
          id: string;
          vehicle_id: string;
          plate_number: string;
          effective_from: string;
          effective_to: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          plate_number: string;
          effective_from?: string;
          effective_to?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["vehicle_registrations"]["Insert"]
        >;
        Relationships: [];
      };
      vehicle_costs: {
        Row: {
          id: string;
          vehicle_id: string;
          cost_type: VehicleCostType;
          cost_date: string;
          supplier: string | null;
          amount: number;
          mileage_at_time: number | null;
          invoice_file_path: string | null;
          notes: string | null;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          cost_type?: VehicleCostType;
          cost_date?: string;
          supplier?: string | null;
          amount: number;
          mileage_at_time?: number | null;
          invoice_file_path?: string | null;
          notes?: string | null;
          recorded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["vehicle_costs"]["Insert"]
        >;
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          vehicle_id: string;
          client_id: string;
          contract_type: ContractType;
          start_date: string;
          end_date: string | null;
          status: ContractStatus;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          client_id: string;
          contract_type?: ContractType;
          start_date?: string;
          end_date?: string | null;
          status?: ContractStatus;
          payment_method?: PaymentMethod;
          installment_amount?: number | null;
          purchase_price?: number | null;
          potential_sale_price?: number | null;
          sale_price?: number | null;
          residual_value?: number | null;
          total_collected?: number;
          outstanding_balance?: number;
          arrears_amount?: number;
          is_paid_up?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
        Relationships: [];
      };
      str_deal_details: {
        Row: {
          contract_id: string;
          billing_day: number;
          billing_direction: BillingDirection;
          billing_frequency: BillingFrequency;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          contract_id: string;
          billing_day: number;
          billing_direction?: BillingDirection;
          billing_frequency?: BillingFrequency;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["str_deal_details"]["Insert"]
        >;
        Relationships: [];
      };
      rental_payment_periods: {
        Row: {
          id: string;
          contract_id: string;
          period_label: string;
          due_date: string | null;
          status: RentalPeriodStatus;
          amount_due: number | null;
          amount_owed: number | null;
          paid_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contract_id: string;
          period_label: string;
          due_date?: string | null;
          status?: RentalPeriodStatus;
          amount_due?: number | null;
          amount_owed?: number | null;
          paid_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["rental_payment_periods"]["Insert"]
        >;
        Relationships: [];
      };
      insurance_claims: {
        Row: {
          id: string;
          vehicle_id: string;
          claimant_name: string | null;
          amount: number | null;
          filed_date: string | null;
          paid_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          claimant_name?: string | null;
          amount?: number | null;
          filed_date?: string | null;
          paid_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["insurance_claims"]["Insert"]
        >;
        Relationships: [];
      };
      sale_listings: {
        Row: {
          id: string;
          vehicle_id: string;
          spec: string | null;
          condition: string | null;
          mileage_at_listing: number | null;
          location: string | null;
          dealer_price: number | null;
          listed_price: number | null;
          listed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          spec?: string | null;
          condition?: string | null;
          mileage_at_listing?: number | null;
          location?: string | null;
          dealer_price?: number | null;
          listed_price?: number | null;
          listed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["sale_listings"]["Insert"]
        >;
        Relationships: [];
      };
      status_migration_map: {
        Row: {
          raw_status: string;
          normalized_status: VehicleStatus;
          assigned_to: string | null;
          contract_type: ContractType | null;
          created_at: string;
        };
        Insert: {
          raw_status: string;
          normalized_status: VehicleStatus;
          assigned_to?: string | null;
          contract_type?: ContractType | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["status_migration_map"]["Insert"]
        >;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          table_name: string;
          record_id: string | null;
          action: AuditAction;
          changed_by: string | null;
          diff: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          table_name: string;
          record_id?: string | null;
          action: AuditAction;
          changed_by?: string | null;
          diff?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      vehicle_current_registration: {
        Row: {
          vehicle_id: string;
          plate_number: string;
          effective_from: string;
        };
        Relationships: [];
      };
      vehicle_current_contract: {
        Row: Database["public"]["Tables"]["contracts"]["Row"];
        Relationships: [];
      };
    };
    Functions: {
      current_user_role: {
        Args: Record<string, never>;
        Returns: UserRole;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_manager_or_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      vehicle_status: VehicleStatus;
      tracker_status: TrackerStatus;
      insurance_claim_status: InsuranceClaimStatus;
      contract_type: ContractType;
      contract_status: ContractStatus;
      payment_method: PaymentMethod;
      billing_direction: BillingDirection;
      billing_frequency: BillingFrequency;
      rental_period_status: RentalPeriodStatus;
      vehicle_cost_type: VehicleCostType;
      bank_account_type: BankAccountType;
      audit_action: AuditAction;
    };
  };
}
