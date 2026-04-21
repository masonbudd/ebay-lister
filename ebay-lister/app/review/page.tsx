import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { signedUrlsFor } from "@/lib/photos";
import ReviewList from "./ReviewList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const REVIEW_STATUSES = ["uploading", "processing", "draft"];

export default async function ReviewPage() {
  // Use the auth-aware client only to identify the user.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 text-center" style={{ color: "var(--fg-muted)" }}>
        Not signed in. Please log in.
      </div>
    );
  }

  // Use the service client (bypasses RLS) with an explicit user_id filter.
  // This sidesteps the server-side cookie/JWT issue that causes RLS to
  // silently return 0 rows while the browser client works fine.
  const db = createServiceClient();

  // Reclaim stuck processing items (>5 min).
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.from("items").update({
    status: "draft",
    title: "Unidentified Item - Please Edit",
    description: "",
    price_is_estimate: true,
    ai_error: "Processing timed out after 5 minutes — please edit manually.",
  }).eq("user_id", user.id).eq("status", "processing").lt("updated_at", cutoff);

  const { data: items, error: qErr } = await db
    .from("items")
    .select("id,status,title,description,condition,category_name,price,price_is_estimate,price_reasoning,currency,item_specifics,ai_confidence,ai_error,created_at")
    .eq("user_id", user.id)
    .in("status", REVIEW_STATUSES)
    .order("created_at", { ascending: false });

  console.log(`[review] server render at ${new Date().toISOString()}: user=${user.id.slice(0,8)}, items=${items?.length ?? 0}, error=${qErr?.message ?? "none"}`);

  const ids = (items ?? []).map((i) => i.id);
  const { data: photos } = ids.length
    ? await db.from("photos").select("item_id,storage_path,sort_order").in("item_id", ids).order("sort_order")
    : { data: [] as { item_id: string; storage_path: string; sort_order: number }[] };

  const allPaths = (photos ?? []).map((p) => p.storage_path);
  const urls = await signedUrlsFor(allPaths);

  const photosByItem = new Map<string, { url: string; path: string }[]>();
  for (const p of photos ?? []) {
    const arr = photosByItem.get(p.item_id) ?? [];
    arr.push({ url: urls[p.storage_path] ?? "", path: p.storage_path });
    photosByItem.set(p.item_id, arr);
  }

  const itemCount = (items ?? []).length;
  const now = new Date().toISOString();

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {itemCount} item{itemCount === 1 ? "" : "s"} awaiting review.
          </p>
        </div>
        <Link href="/upload" className="btn" style={{ minHeight: 40, padding: "0 12px" }}>
          + Add
        </Link>
      </div>

      {/* Debug line — remove once the issue is resolved. */}
      <p className="text-[10px] font-mono" style={{ color: "var(--fg-dim)" }}>
        server: {itemCount} items, user: {user.id.slice(0, 8)}, rendered: {now}
      </p>

      {itemCount === 0 && (
        <div className="card p-8 text-center" style={{ color: "var(--fg-muted)" }}>
          Nothing to review yet. Upload some items to get started.
        </div>
      )}

      {itemCount > 0 && (
        <ReviewList
          items={items!}
          photosByItem={Object.fromEntries(photosByItem)}
        />
      )}
    </div>
  );
}
