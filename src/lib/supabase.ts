import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when Supabase env vars are present and the client can talk to a project. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * The Supabase client, or null when not yet configured. The UI renders in a
 * "setup needed" state when this is null so the app is still browsable locally.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;
