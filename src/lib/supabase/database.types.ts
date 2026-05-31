// Auto-generado con: npm run db:types
// No editar manualmente — ejecutar el comando después de cada migración.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      services: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          debit_day: number;
          active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          amount: number;
          debit_day: number;
          active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount?: number;
          debit_day?: number;
          active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      annual_expenses: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          due_date: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          amount: number;
          due_date: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount?: number;
          due_date?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      income: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          amount: number;
          frequency: "monthly" | "annual" | "fixed";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          description: string;
          amount: number;
          frequency: "monthly" | "annual" | "fixed";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          amount?: number;
          frequency?: "monthly" | "annual" | "fixed";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      attachments: {
        Row: {
          id: string;
          user_id: string;
          entity_type: "service" | "annual_expense" | "income";
          entity_id: string;
          file_url: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          entity_type: "service" | "annual_expense" | "income";
          entity_id: string;
          file_url: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entity_type?: "service" | "annual_expense" | "income";
          entity_id?: string;
          file_url?: string;
          file_name?: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      income_frequency: "monthly" | "annual" | "fixed";
      attachment_entity: "service" | "annual_expense" | "income";
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
