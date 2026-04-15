"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export default function DashboardActions() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function clearStuck() {
    if (!confirm("Delete all upload-stuck items older than 10 minutes? Their photos will be removed too.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/items/clear-stuck", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast(`Cleared ${body.deleted ?? 0} stuck item${body.deleted === 1 ? "" : "s"}.`, "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={clearStuck} disabled={loading} className="btn w-full" style={{ minHeight: 40 }}>
      {loading ? "Clearing…" : "Clear stuck uploads"}
    </button>
  );
}
