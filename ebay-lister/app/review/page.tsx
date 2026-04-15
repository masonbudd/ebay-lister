import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedUrlsFor } from "@/lib/photos";
import ReviewList from "./ReviewList";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select("id,status,title,description,condition,category_name,price,price_is_estimate,currency,item_specifics,ai_confidence,ai_error,created_at")
    .in("status", ["processing", "draft"])
    .order("created_at", { ascending: false });

  const ids = (items ?? []).map((i) => i.id);
  const { data: photos } = ids.length
    ? await supabase.from("photos").select("item_id,storage_path,sort_order").in("item_id", ids).order("sort_order")
    : { data: [] as { item_id: string; storage_path: string; sort_order: number }[] };

  const allPaths = (photos ?? []).map((p) => p.storage_path);
  const urls = await signedUrlsFor(allPaths);

  const photosByItem = new Map<string, { url: string; path: string }[]>();
  for (const p of photos ?? []) {
    const arr = photosByItem.get(p.item_id) ?? [];
    arr.push({ url: urls[p.storage_path] ?? "", path: p.storage_path });
    photosByItem.set(p.item_id, arr);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {(items ?? []).length} item{(items ?? []).length === 1 ? "" : "s"} awaiting review.
          </p>
        </div>
        <Link href="/upload" className="btn" style={{ minHeight: 40, padding: "0 12px" }}>
          + Add
        </Link>
      </div>

      {(items ?? []).length === 0 && (
        <div className="card p-8 text-center" style={{ color: "var(--fg-muted)" }}>
          Nothing to review yet. Upload some items to get started.
        </div>
      )}

      <ReviewList
        items={items ?? []}
        photosByItem={Object.fromEntries(photosByItem)}
      />
    </div>
  );
}
