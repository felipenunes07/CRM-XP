import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isTest = import.meta.env.MODE === "test";

if ((!supabaseUrl || !supabaseAnonKey) && !isTest) {
  throw new Error("VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar configuradas.");
}

export const supabase = createClient(
  supabaseUrl || "http://localhost:54321",
  supabaseAnonKey || "test-anon-key",
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  },
);
