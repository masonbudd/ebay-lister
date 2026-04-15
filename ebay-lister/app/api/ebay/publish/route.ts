import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { publishItem } from "@/lib/ebay/publish";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { itemId } = await req.json().catch(() => ({}));
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  try {
    const result = await publishItem(user.id, itemId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const db = createServiceClient();
    await db.from("items").update({ ebay_error: msg.slice(0, 1000) }).eq("id", itemId);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
