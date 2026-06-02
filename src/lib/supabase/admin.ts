import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase con service role para uso fuera del request del usuario
 * (servidor MCP). Bypassa RLS, por lo que TODA operación debe filtrar/insertar
 * explícitamente con el user_id correspondiente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
