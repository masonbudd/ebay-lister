import { createServiceClient } from "@/lib/supabase/server";
import { ebayFetch, ebayFor } from "./client";
import { EBAY_CURRENCY, EBAY_ENV, ebayCredentials } from "./config";
import type { EbayTokenRow } from "./tokens";
import { cleanTitle } from "@/lib/ai/listing";

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

// Trading API uses numeric ConditionID values.
const CONDITION_ID: Record<string, string> = {
  "New": "1000",
  "Like New": "1500",
  "Very Good": "4000",
  "Good": "5000",
  "Acceptable": "6000",
};

const TRADING_ENDPOINT =
  EBAY_ENV === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";

const SITE_ID_UK = "3";
const COMPAT_LEVEL = "1193";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  // Safely wrap HTML/description in CDATA.
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

// Look up a leaf category for the item title via the Taxonomy API.
// Tree id 3 = EBAY_GB. Returns null on any failure so callers can fall back.
async function suggestLeafCategory(token: EbayTokenRow, title: string): Promise<string | null> {
  try {
    const path = `/commerce/taxonomy/v1/category_tree/3/get_category_suggestions?q=${encodeURIComponent(title)}`;
    const resp = await ebayFetch<{
      categorySuggestions?: {
        category?: { categoryId?: string; categoryName?: string };
      }[];
    }>(token, path);
    const first = resp.categorySuggestions?.[0]?.category?.categoryId;
    return first ?? null;
  } catch (e) {
    console.warn("[ebay] taxonomy lookup failed, falling back to AI category:", (e as Error).message);
    return null;
  }
}

// Aliases: eBay required aspect name -> array of AI field names we might already have.
// Left side is normalised (lowercase).
const ASPECT_ALIASES: Record<string, string[]> = {
  "publication name": ["Publisher", "Publication", "Publication Title", "Imprint"],
  "publication year": ["Publication Year", "Year Published", "Year"],
  "book title": ["Title", "Book Title"],
  "author": ["Author", "Authors", "By"],
  "subject": ["Topic", "Subject", "Genre"],
  "topic": ["Topic", "Subject", "Genre"],
  "genre": ["Genre", "Topic", "Subject"],
  "format": ["Format", "Binding", "Cover"],
  "language": ["Language"],
  "educational level": ["Level", "Grade", "Key Stage", "Age Range"],
  "type": ["Type", "Category", "Book Type"],
  "brand": ["Brand", "Manufacturer", "Maker"],
  "material": ["Material", "Materials"],
  "colour": ["Colour", "Color"],
  "color": ["Colour", "Color"],
  "country/region of manufacture": ["Country of Manufacture", "Country", "Origin"],
  "issue number": ["Issue Number", "Issue", "Issue No"],
  "publication date": ["Publication Date", "Issue Date", "Date"],
  "isbn": ["ISBN", "ISBN-13", "ISBN-10"],
};

// Category-agnostic heuristic fallbacks when both AI data and aliases come up empty.
const HEURISTIC_FALLBACKS: Record<string, string> = {
  "type": "Textbook",
  "format": "Paperback",
  "language": "English",
  "country/region of manufacture": "United Kingdom",
};

type AspectMeta = { name: string; required: boolean };

async function fetchRequiredAspects(
  token: EbayTokenRow, categoryId: string,
): Promise<AspectMeta[]> {
  try {
    const resp = await ebayFetch<{
      aspects?: {
        localizedAspectName?: string;
        aspectConstraint?: { aspectRequired?: boolean };
      }[];
    }>(token, `/commerce/taxonomy/v1/category_tree/3/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`);
    return (resp.aspects ?? [])
      .filter((a) => a.localizedAspectName)
      .map((a) => ({
        name: a.localizedAspectName!,
        required: a.aspectConstraint?.aspectRequired === true,
      }));
  } catch (e) {
    console.warn("[ebay] aspects lookup failed:", (e as Error).message);
    return [];
  }
}

function findExistingAspect(
  specifics: Record<string, string>, required: string,
): string | null {
  const key = required.toLowerCase();
  // Exact case-insensitive match.
  for (const [k, v] of Object.entries(specifics)) {
    if (k.toLowerCase() === key && v.trim()) return v.trim();
  }
  // Aliased match.
  const aliases = ASPECT_ALIASES[key] ?? [];
  for (const alias of aliases) {
    for (const [k, v] of Object.entries(specifics)) {
      if (k.toLowerCase() === alias.toLowerCase() && v.trim()) return v.trim();
    }
  }
  return null;
}

async function fillRequiredAspects(
  token: EbayTokenRow, categoryId: string, item: ItemRow,
): Promise<void> {
  const aspects = await fetchRequiredAspects(token, categoryId);
  const required = aspects.filter((a) => a.required);
  if (required.length === 0) return;

  const specifics: Record<string, string> = { ...(item.item_specifics ?? {}) };
  const filled: string[] = [];

  for (const { name } of required) {
    // Already present (case-insensitive)?
    const existing = Object.keys(specifics).find((k) => k.toLowerCase() === name.toLowerCase());
    if (existing && specifics[existing]?.trim()) continue;

    const fromAi = findExistingAspect(specifics, name);
    const heuristic = HEURISTIC_FALLBACKS[name.toLowerCase()];
    const value = fromAi ?? heuristic ?? "N/A";
    specifics[name] = value;
    filled.push(`${name}=${value}`);
  }

  if (filled.length) {
    console.log("[ebay] filled required aspects:", filled.join(", "));
    item.item_specifics = specifics;
  }
}

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

const ASPECT_MAX_LEN = 65;

// eBay rejects item-specific values over 65 chars. Truncate cleanly; for Author
// fields, keep the first 1–2 authors and append "et al." when needed.
function sanitiseAspectValue(name: string, raw: string): string {
  const value = raw.trim();
  if (value.length <= ASPECT_MAX_LEN) return value;

  if (name.toLowerCase() === "author") {
    const authors = value.split(/\s*(?:,|;|\band\b|&)\s*/i).filter(Boolean);
    for (const n of [2, 1]) {
      const candidate = `${authors.slice(0, n).join(", ")} et al.`;
      if (candidate.length <= ASPECT_MAX_LEN) return candidate;
    }
    // Single author name longer than 65 chars — fall through to hard truncation.
  }

  // Word-boundary trim, reserving space for the ellipsis.
  const cap = ASPECT_MAX_LEN - 1;
  const sliced = value.slice(0, cap);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed = lastSpace > 30 ? sliced.slice(0, lastSpace) : sliced;
  return `${trimmed.trimEnd()}…`;
}

function buildAddFixedPriceItemXml(item: ItemRow, imageUrls: string[]): string {
  const title = escapeXml(cleanTitle(item.title ?? ""));
  const description = cdata(item.description ?? "");
  const conditionId = CONDITION_ID[item.condition ?? ""] ?? "4000";
  const price = (item.price ?? 0).toFixed(2);

  const pictureUrls = imageUrls.map((u) => `<PictureURL>${escapeXml(u)}</PictureURL>`).join("");

  const specifics = Object.entries(item.item_specifics ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) => {
      const value = sanitiseAspectValue(k, v);
      return `<NameValueList><Name>${escapeXml(k)}</Name><Value>${escapeXml(value)}</Value></NameValueList>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${title}</Title>
    <Description>${description}</Description>
    <PrimaryCategory><CategoryID>${escapeXml(item.category_id ?? "")}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="${EBAY_CURRENCY}">${price}</StartPrice>
    <ConditionID>${conditionId}</ConditionID>
    <Country>GB</Country>
    <Currency>${EBAY_CURRENCY}</Currency>
    <Location>Liverpool</Location>
    <Site>UK</Site>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>1</Quantity>
    <DispatchTimeMax>1</DispatchTimeMax>
    ${pictureUrls ? `<PictureDetails>${pictureUrls}</PictureDetails>` : ""}
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>UK_RoyalMailSecondClassStandard</ShippingService>
        <ShippingServiceCost currencyID="${EBAY_CURRENCY}">3.99</ShippingServiceCost>
        <ShippingServiceAdditionalCost currencyID="${EBAY_CURRENCY}">0.00</ShippingServiceAdditionalCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    ${specifics ? `<ItemSpecifics>${specifics}</ItemSpecifics>` : ""}
  </Item>
</AddFixedPriceItemRequest>`;
}

type TradingResult =
  | { ok: true; itemId: string; fee: string | null }
  | { ok: false; message: string };

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function extractAllErrors(xml: string): { code: string; short: string; long: string; severity: string }[] {
  const out: { code: string; short: string; long: string; severity: string }[] = [];
  const re = /<Errors>([\s\S]*?)<\/Errors>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const chunk = m[1];
    out.push({
      code: extractTag(chunk, "ErrorCode") ?? "",
      short: extractTag(chunk, "ShortMessage") ?? "",
      long: extractTag(chunk, "LongMessage") ?? "",
      severity: extractTag(chunk, "SeverityCode") ?? "",
    });
  }
  return out;
}

async function callTradingApi(token: EbayTokenRow, callName: string, xml: string): Promise<string> {
  const { clientId, clientSecret } = ebayCredentials();
  // clientSecret = CertID, clientId = AppID. DevID is separate.
  const devId = process.env[`EBAY_${EBAY_ENV === "production" ? "PROD" : "SANDBOX"}_DEV_ID`];
  if (!devId) throw new Error("Missing eBay DEV_ID env var");

  const res = await fetch(TRADING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "X-EBAY-API-COMPATIBILITY-LEVEL": COMPAT_LEVEL,
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": SITE_ID_UK,
      "X-EBAY-API-APP-NAME": clientId,
      "X-EBAY-API-DEV-NAME": devId,
      "X-EBAY-API-CERT-NAME": clientSecret,
      "X-EBAY-API-IAF-TOKEN": token.access_token,
    },
    body: xml,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Trading ${callName} ${res.status}: ${text.slice(0, 600)}`);
  return text;
}

async function addFixedPriceItem(token: EbayTokenRow, item: ItemRow, imageUrls: string[]): Promise<TradingResult> {
  const xml = buildAddFixedPriceItemXml(item, imageUrls);
  const response = await callTradingApi(token, "AddFixedPriceItem", xml);

  const ack = extractTag(response, "Ack");
  const itemId = extractTag(response, "ItemID");
  const errors = extractAllErrors(response);

  if ((ack === "Success" || ack === "Warning") && itemId) {
    const fee = extractTag(response, "ListingFee");
    if (errors.length) {
      console.warn("[ebay] Trading API warnings:", errors);
    }
    return { ok: true, itemId, fee };
  }

  const message = errors.length
    ? errors.map((e) => `[${e.code}] ${e.short}${e.long ? ` — ${e.long}` : ""}`).join("; ")
    : `Trading API returned Ack=${ack ?? "?"} with no ItemID`;
  return { ok: false, message };
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

  const token = await ebayFor(userId);

  const imageUrls = await publicPhotoUrls(item.id);
  if (imageUrls.length === 0) throw new Error("No photos to upload");

  // Resolve a real leaf category from the Taxonomy API before publishing —
  // the AI-suggested id is often a branch node that Trading API rejects.
  const leaf = await suggestLeafCategory(token, item.title!);
  if (leaf && leaf !== item.category_id) {
    console.log(`[ebay] category ${item.category_id} -> leaf ${leaf}`);
    item.category_id = leaf;
    await db.from("items").update({ category_id: leaf }).eq("id", itemId);
  }

  // Fill any required item specifics for the (possibly updated) leaf category.
  await fillRequiredAspects(token, item.category_id!, item);
  await db.from("items").update({ item_specifics: item.item_specifics ?? {} }).eq("id", itemId);

  const result = await addFixedPriceItem(token, item, imageUrls);
  if (!result.ok) throw new Error(result.message);

  const listingUrl = EBAY_ENV === "sandbox"
    ? `https://www.sandbox.ebay.co.uk/itm/${result.itemId}`
    : `https://www.ebay.co.uk/itm/${result.itemId}`;

  await db.from("items").update({
    status: "listed",
    ebay_listing_id: result.itemId,
    ebay_listing_url: listingUrl,
    ebay_listing_status: "ACTIVE",
    ebay_error: null,
  }).eq("id", itemId);

  return { listingId: result.itemId, listingUrl };
}
