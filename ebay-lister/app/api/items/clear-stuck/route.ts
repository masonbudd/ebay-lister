import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Scope to this user + status=uploading + older than 10 minutes.
  const { data: stuck, error } = await supabase
    .from("items")
    .select("id")
    .eq("status", "uploading")
    .lt("created_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (stuck ?? []).map((r) => r.id);
  if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  // Gather photo paths so we can purge storage (RLS scopes via join).
  const { data: photos } = await supabase
    .from("photos").select("storage_path,item_id").in("item_id", ids);
  const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean);

  if (paths.length) {
    const service = createServiceClient();
    const { error: rmErr } = await service.storage.from("item-photos").remove(paths);
    if (rmErr) console.warn("[clear-stuck] storage remove error:", rmErr.message);
  }

  // Deleting items cascades to photos rows.
  const { error: delErr } = await supabase.from("items").delete().in("id", ids);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: ids.length });
}
