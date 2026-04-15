import { createServiceClient } from "@/lib/supabase/server";
import { ebayFetch } from "./client";
import { ebayFor } from "./client";
import { ensureMerchantLocation, ensureBusinessPolicies } from "./setup";
import { EBAY_CURRENCY, EBAY_MARKETPLACE, EBAY_ENV } from "./config";

type ItemRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  condition: string | null;
  category_id: string | null;
  price: number | null;
  item_specifics: Record<string, string> | null;
};

// eBay condition IDs (standard). Good enough for books/collectibles on UK.
const CONDITION_MAP: Record<string, string> = {
  "New": "1000",
  "Like New": "1500",
  "Very Good": "4000",
  "Good": "5000",
  "Acceptable": "6000",
};

function skuFor(itemId: string) {
  return `ITEM-${itemId.replace(/-/g, "").slice(0, 24).toUpperCase()}`;
}

function toAspects(specifics: Record<string, string> | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(specifics ?? {})) {
    if (typeof v === "string" && v.trim().length) out[k] = [v.trim()];
  }
  return out;
}

async function signedPhotoUrls(itemId: string, expirySeconds = 60 * 60 * 24 * 7): Promise<string[]> {
  const db = createServiceClient();
  const { data: photos, error } = await db.from("photos")
    .select("storage_path,sort_order").eq("item_id", itemId).order("sort_order");
  if (error) throw new Error(`photos: ${error.message}`);
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length === 0) return [];
  const { data, error: e2 } = await db.storage.from("item-photos").createSignedUrls(paths, expirySeconds);
  if (e2) throw new Error(`signed urls: ${e2.message}`);
  return (data ?? []).map((d) => d.signedUrl).filter(Boolean);
}

export async function publishItem(userId: string, itemId: string): Promise<{
  listingId: string; listingUrl: string;
}> {
  const db = createServiceClient();
  const { data: row, error } = await db.from("items")
    .select("id,user_id,title,description,condition,category_id,price,item_specifics")
    .eq("id", itemId).single();
  if (error || !row) throw new Error("item not found");
  const item = row as ItemRow;
  if (item.user_id !== userId) throw new Error("forbidden");
  if (!item.title || !item.description || !item.price || !item.condition || !item.category_id) {
    throw new Error("Item is missing title, description, price, condition, or category_id");
  }

  let token = await ebayFor(userId);
  token = await ensureMerchantLocation(userId, token);
  token = await ensureBusinessPolicies(userId, token);

  const sku = skuFor(item.id);
  const imageUrls = await signedPhotoUrls(item.id);
  if (imageUrls.length === 0) throw new Error("No photos to upload");

  // 1) Create / replace inventory item
  await ebayFetch(token, `/sell/inventory/v1/inventory_item/${sku}`, {
    method: "PUT",
    body: {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: CONDITION_MAP[item.condition] ?? "4000",
      product: {
        title: item.title.slice(0, 80),
        description: item.description,
        aspects: toAspects(item.item_specifics),
        imageUrls,
      },
    },
    allowEmpty: true,
  });

  // 2) Create offer
  const offer = await ebayFetch<{ offerId: string }>(token, "/sell/inventory/v1/offer", {
    method: "POST",
    body: {
      sku,
      marketplaceId: EBAY_MARKETPLACE,
      format: "FIXED_PRICE",
      availableQuantity: 1,
      categoryId: item.category_id,
      listingDescription: item.description,
      listingPolicies: {
        fulfillmentPolicyId: token.fulfillment_policy_id,
        paymentPolicyId: token.payment_policy_id,
        returnPolicyId: token.return_policy_id,
      },
      merchantLocationKey: token.merchant_location_key,
      pricingSummary: {
        price: { value: item.price.toFixed(2), currency: EBAY_CURRENCY },
      },
    },
  });

  // 3) Publish offer
  const published = await ebayFetch<{ listingId: string }>(
    token, `/sell/inventory/v1/offer/${offer.offerId}/publish`,
    { method: "POST" },
  );

  const listingUrl = EBAY_ENV === "sandbox"
    ? `https://www.sandbox.ebay.co.uk/itm/${published.listingId}`
    : `https://www.ebay.co.uk/itm/${published.listingId}`;

  await db.from("items").update({
    status: "listed",
    ebay_listing_id: published.listingId,
    ebay_listing_url: listingUrl,
    ebay_listing_status: "ACTIVE",
    ebay_error: null,
  }).eq("id", itemId);

  return { listingId: published.listingId, listingUrl };
}
