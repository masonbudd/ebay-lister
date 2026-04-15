"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    if (!confirm("Reset this listing to Approved? You'll be able to re-publish it.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ebay/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={reset} disabled={loading}
        className="btn"
        style={{ minHeight: 36, padding: "0 10px", fontSize: 12 }}
      >
        {loading ? "Resetting…" : "Re-publish"}
      </button>
      {error && (
        <span className="text-[11px] max-w-[200px] text-right" style={{ color: "#fca5a5" }}>{error}</span>
      )}
    </div>
  );
}
