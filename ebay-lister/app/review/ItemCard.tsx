"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { CheckIcon, TrashIcon } from "@/components/Icons";
import PhotoViewer from "@/components/PhotoViewer";
import { useToast } from "@/components/Toast";

type Item = {
  id: string;
  status: string;
  title: string | null;
  description: string | null;
  condition: string | null;
  category_name: string | null;
  price: number | null;
  price_is_estimate: boolean | null;
  price_reasoning: string | null;
  currency: string | null;
  item_specifics: Record<string, string> | null;
  ai_confidence: string | null;
  ai_error: string | null;
  created_at: string;
};

const CONDITIONS = ["New", "Like New", "Very Good", "Good", "Acceptable"];

export default function ItemCard({
  item: initial,
  photos,
  selected,
  selectable,
  onToggle,
}: {
  item: Item;
  photos: { url: string; path: string }[];
  selected?: boolean;
  selectable?: boolean;
  onToggle?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [item, setItem] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (item.status !== "processing") return;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("items")
        .select("id,status,title,description,condition,category_name,price,price_is_estimate,price_reasoning,currency,item_specifics,ai_confidence,ai_error,created_at")
        .eq("id", item.id).single();
      if (data && data.status !== "processing") {
        setItem(data as Item);
        startTransition(() => router.refresh());
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [item.status, item.id, supabase, router]);

  function patch(fields: Partial<Item>) {
    setItem((it) => ({ ...it, ...fields }));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("items").update({
      title: item.title, description: item.description, condition: item.condition,
      price: item.price, price_is_estimate: item.price_is_estimate,
      item_specifics: item.item_specifics,
    }).eq("id", item.id);
    setSaving(false);
    if (error) toast(error.message, "error");
    else toast("Saved.", "success");
  }

  async function approve() {
    await save();
    const { error } = await supabase.from("items").update({ status: "approved" }).eq("id", item.id);
    if (error) return toast(error.message, "error");
    toast(`Approved “${item.title ?? "item"}”.`, "success");
    router.refresh();
  }

  async function reject() {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    if (error) return toast(error.message, "error");
    toast("Deleted.", "success");
    router.refresh();
  }

  async function retry() {
    await supabase.from("items").update({ status: "processing", ai_error: null }).eq("id", item.id);
    setItem((it) => ({ ...it, status: "processing", ai_error: null }));
    fetch("/api/process", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => {});
  }

  const specifics = item.item_specifics ?? {};
  const photoUrls = photos.map((p) => p.url).filter(Boolean);

  return (
    <div className="card overflow-hidden relative">
      {selectable && (
        <label className="absolute top-3 left-3 z-10 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggle}
            className="w-6 h-6 accent-blue-500"
          />
        </label>
      )}

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto p-3 pb-2" style={{ scrollSnapType: "x mandatory" }}>
          {photos.map((p, i) => (
            <button
              type="button"
              key={p.path}
              onClick={() => setViewerIdx(i)}
              className="shrink-0 rounded-xl overflow-hidden"
              style={{ scrollSnapAlign: "start", border: "1px solid var(--border)", padding: 0 }}
            >
              <img
                src={p.url}
                alt=""
                className="object-cover"
                style={{ width: 180, height: 180 }}
              />
            </button>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">
        {item.status === "processing" && (
          <div
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
            style={{
              background: "rgba(245,158,11,0.12)",
              color: "#fbbf24",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#f59e0b" }} />
            Processing with AI…
          </div>
        )}

        {item.ai_error && (
          <div
            className="text-sm px-3 py-2 rounded-lg flex items-center justify-between gap-2"
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <span className="truncate">AI error: {item.ai_error}</span>
            <button onClick={retry} className="underline shrink-0">Retry</button>
          </div>
        )}

        <label className="block text-sm space-y-1.5">
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--fg-muted)" }}>Title</span>
            <span className="text-xs" style={{ color: "var(--fg-dim)" }}>
              {(item.title ?? "").length}/80
            </span>
          </div>
          <input
            type="text"
            value={item.title ?? ""} maxLength={80}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>

        <label className="block text-sm space-y-1.5">
          <span style={{ color: "var(--fg-muted)" }}>Description</span>
          <textarea
            value={item.description ?? ""} rows={6}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="block space-y-1.5">
            <span style={{ color: "var(--fg-muted)" }}>Condition</span>
            <select
              value={item.condition ?? ""}
              onChange={(e) => patch({ condition: e.target.value })}
            >
              <option value="">—</option>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span style={{ color: "var(--fg-muted)" }}>
              Price (GBP){item.price_is_estimate ? " · est." : ""}
            </span>
            <input
              type="number" step="0.01" min="0"
              value={item.price ?? ""}
              onChange={(e) => patch({
                price: e.target.value === "" ? null : Number(e.target.value),
                price_is_estimate: false,
              })}
            />
          </label>
        </div>

        {item.price_reasoning && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{
              background: item.price_is_estimate ? "rgba(245,158,11,0.08)" : "rgba(59,130,246,0.08)",
              border: `1px solid ${item.price_is_estimate ? "rgba(245,158,11,0.25)" : "rgba(59,130,246,0.25)"}`,
              color: item.price_is_estimate ? "#fbbf24" : "#93c5fd",
            }}
          >
            {item.price_reasoning}
          </div>
        )}

        {Object.keys(specifics).length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer select-none py-1" style={{ color: "var(--fg-muted)" }}>
              Item specifics ({Object.keys(specifics).length})
            </summary>
            <div className="mt-2 space-y-2">
              {Object.entries(specifics).map(([k, v]) => (
                <div key={k} className="flex gap-2 items-center">
                  <span className="w-32 shrink-0 text-xs" style={{ color: "var(--fg-dim)" }}>{k}</span>
                  <input
                    type="text"
                    value={v}
                    onChange={(e) => patch({ item_specifics: { ...specifics, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--fg-dim)" }}>
          {item.category_name && <span>Category: {item.category_name}</span>}
          {item.ai_confidence && <span>Confidence: {item.ai_confidence}</span>}
        </div>
      </div>

      <div
        className="sticky bottom-0 grid grid-cols-4 gap-2 p-3"
        style={{
          background: "rgba(15,17,23,0.92)",
          borderTop: "1px solid var(--border)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <button onClick={reject} className="btn btn-danger-outline" aria-label="Delete">
          <TrashIcon size={18} />
        </button>
        <button onClick={save} disabled={saving} className="btn">
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={approve}
          disabled={item.status !== "draft"}
          className="btn btn-primary col-span-2"
        >
          <CheckIcon size={18} /> Approve
        </button>
      </div>

      {viewerIdx !== null && photoUrls.length > 0 && (
        <PhotoViewer
          urls={photoUrls}
          startIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </div>
  );
}
