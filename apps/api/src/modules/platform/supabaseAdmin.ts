import { createClient } from "@supabase/supabase-js";
import { env } from "../../lib/env.js";

export function getSupabaseUrl() {
  return env.SUPABASE_URL || env.VITE_SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
}

export function isSupabaseAuthConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function isSupabaseAdminConfigured() {
  return Boolean(getSupabaseUrl() && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAuthClient() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL/SUPABASE_ANON_KEY precisam estar configuradas para autenticacao.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabaseAdminClient() {
  const url = getSupabaseUrl();
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no backend.");
  }

  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
