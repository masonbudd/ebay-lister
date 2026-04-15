"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm mt-1" style={{ color: "var(--fg-muted)" }}>
            Welcome back.
          </p>
        </div>
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>}
        <button disabled={loading} className="btn btn-primary w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          No account? <Link href="/signup" className="underline" style={{ color: "var(--accent)" }}>Sign up</Link>
        </p>
      </form>
    </div>
  );
}
