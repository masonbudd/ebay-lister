"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

type Item = { id: string; title: string | null };

export default function BulkPublishButton({ items }: { items: Item[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ i: number; total: number } | null>(null);

  async function run() {
    if (items.length === 0) return;
    if (!confirm(`Publish ${items.length} approved items to eBay?`)) return;
    setProgress({ i: 0, total: items.length });

    let ok = 0, failed = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      setProgress({ i: i + 1, total: items.length });
      try {
        const res = await fetch("/api/ebay/publish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: it.id }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        ok++;
        toast(`Listed “${it.title ?? "item"}”.`, "success");
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        toast(`Failed “${it.title ?? "item"}”: ${msg.slice(0, 120)}`, "error");
        // error is already persisted by /api/ebay/publish; continue.
      }
      router.refresh();
    }

    setProgress(null);
    toast(
      `Done. ${ok} published, ${failed} failed.`,
      failed > 0 ? (ok > 0 ? "info" : "error") : "success",
    );
  }

  if (items.length === 0) return null;

  return (
    <button
      onClick={run}
      disabled={progress !== null}
      className="btn btn-primary w-full"
      style={{ minHeight: 44 }}
    >
      {progress
        ? `Publishing ${progress.i}/${progress.total}…`
        : `Publish all ${items.length} approved`}
    </button>
  );
}
