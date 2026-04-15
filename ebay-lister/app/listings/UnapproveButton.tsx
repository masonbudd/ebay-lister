"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/Toast";

export default function UnapproveButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function unapprove() {
    if (!confirm("Move this back to Draft for editing?")) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("items")
      .update({ status: "draft" }).eq("id", itemId);
    setLoading(false);
    if (error) return toast(error.message, "error");
    toast("Moved to draft.", "success");
    router.refresh();
  }

  return (
    <button
      onClick={unapprove} disabled={loading}
      className="btn"
      style={{ minHeight: 36, padding: "0 10px", fontSize: 12 }}
    >
      {loading ? "…" : "Move to Draft"}
    </button>
  );
}
