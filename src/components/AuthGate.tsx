import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { signIn, useSession } from "../lib/auth";
import { Spinner } from "./ui";

/**
 * Gates the app behind a Supabase login when cloud storage is configured.
 * In local mode (no Supabase keys) there's nothing to protect, so it passes through.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();

  if (!supabase) return <>{children}</>;
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Starting Postly…" />
      </div>
    );
  if (!session) return <Login />;
  return <>{children}</>;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal font-black text-cream">
            P
          </div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight">Postly</div>
            <div className="label-mono !text-[9px]">Social Autopilot</div>
          </div>
        </div>

        <div>
          <label className="label-mono mb-1.5 block">Email</label>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label-mono mb-1.5 block">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <div className="rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
            {error}
          </div>
        )}

        <button className="btn-primary w-full" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
