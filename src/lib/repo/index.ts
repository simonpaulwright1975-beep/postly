import { supabase } from "../supabase";
import { LocalRepo } from "./local";
import { SupabaseRepo } from "./supabase";
import type { Repo } from "./types";

export * from "./types";

let cached: Repo | null = null;

/** The active repository: Supabase when configured, otherwise browser-local. */
export function getRepo(): Repo {
  if (!cached) {
    cached = supabase ? new SupabaseRepo(supabase) : new LocalRepo();
  }
  return cached;
}

/** True when running against the browser-local fallback store. */
export const isLocalStore = !supabase;
