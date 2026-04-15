import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { itemId } = await req.json().catch(() => ({}));
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  // RLS ensures the item belongs to this user.
  const { error } = await supabase
    .from("items")
    .update({
      status: "approved",
      ebay_listing_id: null,
      ebay_listing_url: null,
      ebay_listing_status: null,
      ebay_offer_id: null,
      ebay_error: null,
    })
    .eq("id", itemId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
