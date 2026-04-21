import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateListing, cleanTitle } from "@/lib/ai/listing";
import { suggestMarketPrice } from "@/lib/ebay/pricing";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { itemId } = await req.json().catch(() => ({}));
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: item, error: itemErr } = await supabase
    .from("items").select("id,user_id,status").eq("id", itemId).single();
  if (itemErr || !item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (item.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: photos, error: photoErr } = await supabase
    .from("photos").select("storage_path,sort_order").eq("item_id", itemId).order("sort_order");
  if (photoErr) return NextResponse.json({ error: photoErr.message }, { status: 500 });
  if (!photos || photos.length === 0) {
    await supabase.from("items").update({ status: "draft", ai_error: "No photos" }).eq("id", itemId);
    return NextResponse.json({ ok: false, error: "no photos" });
  }

  await supabase.from("items").update({ status: "processing", ai_error: null }).eq("id", itemId);

  try {
    const tStart = Date.now();

    // Download photos (bucket is public but use service role for reliability).
    const service = createServiceClient();
    const images = await Promise.all(photos.map(async (p) => {
      const { data, error } = await service.storage.from("item-photos").download(p.storage_path);
      if (error || !data) throw error ?? new Error("download failed");
      const buf = Buffer.from(await data.arrayBuffer());
      return { data: buf.toString("base64"), mediaType: "image/jpeg" };
    }));
    console.log(`[process] ${itemId} photos downloaded in ${Date.now() - tStart}ms (${images.length} files, ~${Math.round(images.reduce((s, i) => s + i.data.length * 0.75, 0) / 1024)} KB)`);

    const tAI = Date.now();
    const { listing, raw } = await generateListing(images);
    console.log(`[process] ${itemId} AI done in ${Date.now() - tAI}ms`);

    const title = cleanTitle(listing.title ?? "");

    const tPrice = Date.now();
    const suggestion = await suggestMarketPrice(
      Number(listing.price_gbp) || 0,
      title,
      listing.condition,
    );
    console.log(`[process] ${itemId} pricing done in ${Date.now() - tPrice}ms — £${suggestion.price}`);
    console.log(`[process] ${itemId} total: ${Date.now() - tStart}ms`);

    await supabase.from("items").update({
      status: "draft",
      title,
      description: listing.description,
      condition: listing.condition,
      category_id: listing.category_id ?? null,
      category_name: listing.category_name ?? null,
      price: suggestion.price,
      price_is_estimate: suggestion.is_estimate,
      price_reasoning: suggestion.reasoning,
      currency: "GBP",
      item_specifics: listing.item_specifics ?? {},
      ai_raw_response: raw as object,
      ai_confidence: listing.confidence,
      ai_error: null,
    }).eq("id", itemId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Hard-failure fallback: photos are still in storage, so surface the item in the
    // review queue with a manual-edit placeholder instead of leaving it silently broken.
    await supabase.from("items").update({
      status: "draft",
      title: "Unidentified Item - Please Edit",
      description: "",
      price_is_estimate: true,
      ai_error: message,
    }).eq("id", itemId);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
