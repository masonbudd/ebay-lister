import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedUrlsFor } from "@/lib/photos";
import ReviewList from "./ReviewList";
import { reclaimStuckProcessing } from "@/lib/items";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REVIEW_STATUSES = ["uploading", "processing", "draft"];

export default async function ReviewPage() {
  const supabase = await createClient();

  // Critical: force a session refresh so the server client has a valid JWT for RLS.
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  console.log("[review] auth:", user?.id ?? "NO USER", authErr ? `error: ${authErr.message}` : "ok");

  if (!user) {
    console.error("[review] no user session — RLS will block all queries");
  }

  await reclaimStuckProcessing(supabase);

  // Debug: count ALL items for this user regardless of status.
  const { count: total, error: countErr } = await supabase
    .from("items").select("*", { count: "exact", head: true });
  console.log("[review] total items visible to RLS:", total, countErr ? `error: ${countErr.message}` : "");

  // Count per status for diagnosis.
  for (const st of ["uploading", "processing", "draft", "approved", "listed", "sold"]) {
    const { count } = await supabase
      .from("items").select("*", { count: "exact", head: true }).eq("status", st);
    if (count && count > 0) console.log(`[review]   status=${st}: ${count}`);
  }

  const { data: items, error: fetchErr } = await supabase
    .from("items")
    .select("id,status,title,description,condition,category_name,price,price_is_estimate,price_reasoning,currency,item_specifics,ai_confidence,ai_error,created_at")
    .in("status", REVIEW_STATUSES)
    .order("created_at", { ascending: false });

  console.log("[review] query returned", items?.length ?? 0, "items", fetchErr ? `error: ${fetchErr.message}` : "");
  if (items?.length) console.log("[review] first:", items[0].id, items[0].status, items[0].title?.slice(0, 40));

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
