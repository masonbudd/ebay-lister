import { createServiceClient } from "@/lib/supabase/server";
import { ebayFor } from "./client";
import { EBAY_CURRENCY, EBAY_ENV, ebayCredentials } from "./config";
import type { EbayTokenRow } from "./tokens";

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

function buildAddFixedPriceItemXml(item: ItemRow, imageUrls: string[]): string {
  const title = escapeXml((item.title ?? "").slice(0, 80));
  const description = cdata(item.description ?? "");
  const conditionId = CONDITION_ID[item.condition ?? ""] ?? "4000";
  const price = (item.price ?? 0).toFixed(2);

  const pictureUrls = imageUrls.map((u) => `<PictureURL>${escapeXml(u)}</PictureURL>`).join("");

  const specifics = Object.entries(item.item_specifics ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([k, v]) =>
      `<NameValueList><Name>${escapeXml(k)}</Name><Value>${escapeXml(v)}</Value></NameValueList>`,
    )
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
