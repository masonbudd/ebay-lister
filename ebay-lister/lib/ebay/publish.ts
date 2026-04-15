import { createServiceClient } from "@/lib/supabase/server";
import { ebayFetch } from "./client";
import { ebayFor } from "./client";
import { ensureMerchantLocation } from "./setup";
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
  ebay_offer_id: string | null;
};

// Inventory API uses conditionEnum values, not numeric condition IDs.
const CONDITION_MAP: Record<string, string> = {
  "New": "NEW",
  "Like New": "LIKE_NEW",
  "Very Good": "USED_VERY_GOOD",
  "Good": "USED_GOOD",
  "Acceptable": "USED_ACCEPTABLE",
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

// eBay's imageUrls field limits URL length (and signed URLs blow past it).
// Use Supabase's short public URL format: the `item-photos` bucket must be PUBLIC.
async function publicPhotoUrls(itemId: string): Promise<string[]> {
  const db = createServiceClient();
  const { data: photos, error } = await db.from("photos")
    .select("storage_path,sort_order").eq("item_id", itemId).order("sort_order");
  if (error) throw new Error(`photos: ${error.message}`);
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length === 0) return [];
  return paths.map((path) => {
    const { data } = db.storage.from("item-photos").getPublicUrl(path);
    return data.publicUrl;
  });
}

// Create an offer; if eBay says one already exists for this SKU, look it up and
// update it so the latest item data is applied before publishing.
async function resolveOfferId(
  token: Parameters<typeof ebayFetch>[0],
  sku: string,
  item: ItemRow,
  offerBody: Record<string, unknown>,
): Promise<string> {
  // Prefer an id we've already persisted from a prior attempt.
  if (item.ebay_offer_id) {
    try {
      await ebayFetch(token, `/sell/inventory/v1/offer/${item.ebay_offer_id}`, {
        method: "PUT", body: offerBody, allowEmpty: true,
      });
      return item.ebay_offer_id;
    } catch (e) {
      // Stale id (e.g. offer was deleted) — fall through to POST / lookup.
      console.warn("[ebay] stored offerId PUT failed, falling back:", (e as Error).message);
    }
  }

  try {
    const created = await ebayFetch<{ offerId: string }>(
      token, "/sell/inventory/v1/offer",
      { method: "POST", body: offerBody },
    );
    return created.offerId;
  } catch (e) {
    const msg = (e as Error).message;
    const isAlreadyExists = /25002/.test(msg) || /already exists/i.test(msg);
    if (!isAlreadyExists) throw e;

    // Look up the existing offer for this SKU and PUT the updated body.
    const list = await ebayFetch<{ offers?: { offerId: string; sku: string }[] }>(
      token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
    );
    const existing = (list.offers ?? []).find((o) => o.sku === sku);
    if (!existing) throw new Error(`25002 but offer lookup empty for sku ${sku}`);
    await ebayFetch(token, `/sell/inventory/v1/offer/${existing.offerId}`, {
      method: "PUT", body: offerBody, allowEmpty: true,
    });
    return existing.offerId;
  }
}

export async function publishItem(userId: string, itemId: string): Promise<{
  listingId: string; listingUrl: string;
}> {
  const db = createServiceClient();
  const { data: row, error } = await db.from("items")
    .select("id,user_id,title,description,condition,category_id,price,item_specifics,ebay_offer_id")
    .eq("id", itemId).single();
  if (error || !row) throw new Error("item not found");
  const item = row as ItemRow;
  if (item.user_id !== userId) throw new Error("forbidden");
  if (!item.title || !item.description || !item.price || !item.condition || !item.category_id) {
    throw new Error("Item is missing title, description, price, condition, or category_id");
  }

  let token = await ebayFor(userId);
  token = await ensureMerchantLocation(userId, token);
  // Sandbox sellers aren't eligible for Business Policies — skip policy creation
  // and set shipping / returns / payment inline on the offer below.

  const sku = skuFor(item.id);
  const imageUrls = await publicPhotoUrls(item.id);
  if (imageUrls.length === 0) throw new Error("No photos to upload");

  // 1) Create / replace inventory item
  await ebayFetch(token, `/sell/inventory/v1/inventory_item/${sku}`, {
    method: "PUT",
    body: {
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: CONDITION_MAP[item.condition] ?? "USED_VERY_GOOD",
      product: {
        title: item.title.slice(0, 80),
        description: item.description,
        aspects: toAspects(item.item_specifics),
        imageUrls,
      },
    },
    allowEmpty: true,
  });

  // 2) Create (or look up + update) offer — inline shipping / return / payment terms.
  const offerBody = {
    sku,
    marketplaceId: EBAY_MARKETPLACE,
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId: item.category_id,
    listingDescription: item.description,
    merchantLocationKey: token.merchant_location_key,
    pricingSummary: {
      price: { value: item.price.toFixed(2), currency: EBAY_CURRENCY },
    },
    listingPolicies: {
      shippingCostOverrides: [
        {
          surcharge: { value: "0.00", currency: EBAY_CURRENCY },
          shippingCost: { value: "3.99", currency: EBAY_CURRENCY },
          additionalShippingCost: { value: "0.00", currency: EBAY_CURRENCY },
          shippingServiceType: "DOMESTIC",
          priority: 1,
        },
      ],
    },
    returnTerms: {
      returnsAccepted: true,
      refundMethod: "MONEY_BACK",
      returnMethod: "REPLACEMENT_OR_MONEY_BACK",
      returnPeriod: { value: 30, unit: "DAY" },
      returnShippingCostPayer: "BUYER",
    },
    paymentTerms: { immediatePay: true },
  };

  const offerId = await resolveOfferId(token, sku, item, offerBody);
  // Persist immediately so a later retry skips straight to publish.
  if (offerId !== item.ebay_offer_id) {
    await db.from("items").update({ ebay_offer_id: offerId }).eq("id", itemId);
  }

  // 3) Publish offer
  const published = await ebayFetch<{ listingId: string }>(
    token, `/sell/inventory/v1/offer/${offerId}/publish`,
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
