"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ItemCard from "./ItemCard";
import PullToRefresh from "@/components/PullToRefresh";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/Toast";

type Item = React.ComponentProps<typeof ItemCard>["item"];
type PhotoMap = Record<string, { url: string; path: string }[]>;

export default function ReviewList({
  items, photosByItem,
}: { items: Item[]; photosByItem: PhotoMap }) {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const draftIds = useMemo(
    () => items.filter((i) => i.status === "draft").map((i) => i.id),
    [items],
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) =>
      s.size === draftIds.length ? new Set() : new Set(draftIds),
    );
  }

  async function approveSelected() {
    if (selected.size === 0) return;
    setBulkRunning(true);
    const ids = [...selected];
    const { error } = await supabase.from("items")
      .update({ status: "approved" }).in("id", ids);
    setBulkRunning(false);
    if (error) return toast(error.message, "error");
    toast(`Approved ${ids.length} item${ids.length === 1 ? "" : "s"}.`, "success");
    setSelected(new Set());
    router.refresh();
  }

  const allChecked = draftIds.length > 0 && selected.size === draftIds.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <PullToRefresh>
      {draftIds.length > 0 && (
        <label
          className="flex items-center gap-3 px-1 text-sm cursor-pointer select-none"
          style={{ color: "var(--fg-muted)" }}
        >
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onChange={toggleAll}
            className="w-5 h-5 accent-blue-500"
            style={{ minHeight: 20 }}
          />
          <span>Select all drafts ({draftIds.length})</span>
        </label>
      )}

      <div className="space-y-4 mt-3">
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            photos={photosByItem[item.id] ?? []}
            selected={selected.has(item.id)}
            selectable={item.status === "draft"}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>

      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 z-40 safe-bottom"
          style={{
            bottom: "var(--tab-h)",
            background: "rgba(15,17,23,0.92)",
            borderTop: "1px solid var(--border)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          <div className="max-w-lg mx-auto flex items-center gap-2 px-4 py-3">
            <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
              {selected.size} selected
            </span>
            <button onClick={() => setSelected(new Set())} className="btn ml-auto" style={{ minHeight: 40 }}>
              Clear
            </button>
            <button onClick={approveSelected} disabled={bulkRunning} className="btn btn-primary" style={{ minHeight: 40 }}>
              {bulkRunning ? "Approving…" : `Approve ${selected.size}`}
            </button>
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
