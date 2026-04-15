"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export default function PublishButton({ itemId, title, className }: { itemId: string; title?: string | null; className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ebay/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast(`Listed “${title ?? "item"}”.`, "success");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast(`Publish failed: ${msg.slice(0, 160)}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={publish} disabled={loading} className={`btn btn-primary ${className ?? ""}`} style={{ minHeight: 40, padding: "0 14px" }}>
        {loading ? "Publishing…" : "Publish to eBay"}
      </button>
      {error && (
        <span className="text-[11px] max-w-[220px] text-right" style={{ color: "#fca5a5" }}>{error}</span>
      )}
    </div>
  );
}
