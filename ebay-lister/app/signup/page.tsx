"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setMsg("Check your email to confirm, then sign in.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
            Start listing in seconds.
          </p>
        </div>
        <input type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required minLength={6} placeholder="Password (min 6)" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>}
        {msg && <p className="text-sm" style={{ color: "#86efac" }}>{msg}</p>}
        <button disabled={loading} className="btn btn-primary w-full">
          {loading ? "Creating…" : "Sign up"}
        </button>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Have an account? <Link href="/login" className="underline" style={{ color: "var(--accent)" }}>Sign in</Link>
        </p>
      </form>
    </div>
  );
}
