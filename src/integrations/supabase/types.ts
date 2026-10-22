export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          admin_note: string | null
          admin_note_at: string | null
          admin_note_by: string | null
          check_in_at: string
          check_in_distance_m: number | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_note: string | null
          check_out_at: string | null
          check_out_distance_m: number | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_note: string | null
          id: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          admin_note_at?: string | null
          admin_note_by?: string | null
          check_in_at?: string
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_note?: string | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_note?: string | null
          id?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          admin_note_at?: string | null
          admin_note_by?: string | null
          check_in_at?: string
          check_in_distance_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_note?: string | null
          check_out_at?: string | null
          check_out_distance_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_note?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          table_name: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          table_name: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          table_name?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      beta_testers: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_access: {
        Row: {
          enabled: boolean
          feature_key: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_rollouts: {
        Row: {
          enabled_all: boolean
          feature_key: string
        }
        Insert: {
          enabled_all?: boolean
          feature_key: string
        }
        Update: {
          enabled_all?: boolean
          feature_key?: string
        }
        Relationships: []
      }
      office_settings: {
        Row: {
          id: number
          latitude: number
          longitude: number
          name: string
          radius_m: number
          updated_at: string
        }
        Insert: {
          id?: number
          latitude: number
          longitude: number
          name?: string
          radius_m?: number
          updated_at?: string
        }
        Update: {
          id?: number
          latitude?: number
          longitude?: number
          name?: string
          radius_m?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          employee_code: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      punch_events: {
        Row: {
          accuracy_m: number | null
          action: string
          admin_note: string | null
          created_at: string
          device_id: string | null
          distance_m: number | null
          flags: string[]
          id: string
          ip: string | null
          lat: number | null
          lng: number | null
          status: string
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          action: string
          admin_note?: string | null
          created_at?: string
          device_id?: string | null
          distance_m?: number | null
          flags?: string[]
          id?: string
          ip?: string | null
          lat?: number | null
          lng?: number | null
          status?: string
          success?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          action?: string
          admin_note?: string | null
          created_at?: string
          device_id?: string | null
          distance_m?: number | null
          flags?: string[]
          id?: string
          ip?: string | null
          lat?: number | null
          lng?: number | null
          status?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_outings: {
        Row: {
          attendance_id: string
          back_at: string | null
          back_distance_m: number | null
          back_lat: number | null
          back_lng: number | null
          id: string
          out_at: string
          out_distance_m: number | null
          out_lat: number | null
          out_lng: number | null
          reason: string | null
          user_id: string
        }
        Insert: {
          attendance_id: string
          back_at?: string | null
          back_distance_m?: number | null
          back_lat?: number | null
          back_lng?: number | null
          id?: string
          out_at?: string
          out_distance_m?: number | null
          out_lat?: number | null
          out_lng?: number | null
          reason?: string | null
          user_id: string
        }
        Update: {
          attendance_id?: string
          back_at?: string | null
          back_distance_m?: number | null
          back_lat?: number | null
          back_lng?: number | null
          id?: string
          out_at?: string
          out_distance_m?: number | null
          out_lat?: number | null
          out_lng?: number | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_outings_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clock_action: {
        Args: {
          _acc?: number
          _device?: string
          _lat: number
          _lng: number
          _note?: string
          _ua?: string
        }
        Returns: Json
      }
      distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      has_feature_access: {
        Args: { _feature: string; _uid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_beta: { Args: { _uid: string }; Returns: boolean }
      log_punch: {
        Args: {
          _acc: number
          _action: string
          _device: string
          _dist: number
          _lat: number
          _lng: number
          _ok: boolean
          _ua: string
        }
        Returns: undefined
      }
      my_feature_versions: { Args: never; Returns: string[] }
      outing_action: {
        Args: {
          _acc?: number
          _device?: string
          _lat?: number
          _lng?: number
          _reason?: string
          _ua?: string
        }
        Returns: Json
      }
      set_version_everyone: {
        Args: { _enabled: boolean; _feature: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee"],
    },
  },
} as const
