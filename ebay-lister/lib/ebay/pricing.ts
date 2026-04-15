// Market-price helper. Always uses PRODUCTION eBay creds regardless of EBAY_ENV
// because the sandbox Browse catalogue has no real market data.

const PROD_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const PROD_API = "https://api.ebay.com";

function prodCreds() {
  const clientId = process.env.EBAY_PROD_APP_ID;
  const clientSecret = process.env.EBAY_PROD_CERT_ID;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_PROD_APP_ID / EBAY_PROD_CERT_ID not set — needed for market pricing");
  }
  return { clientId, clientSecret };
}

type Cached = { token: string; expiresAt: number };
let cached: Cached | null = null;

async function getAppOnlyToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const { clientId, clientSecret } = prodCreds();
  const res = await fetch(PROD_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!res.ok) throw new Error(`app-only token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json() as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export type Comparable = { price: number; currency: string; title: string; url?: string };

async function browseSearch(token: string, q: string, condition: "USED" | "NEW"): Promise<Comparable[]> {
  const url = new URL(`${PROD_API}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("filter", `buyingOptions:{FIXED_PRICE},conditions:{${condition}}`);
  url.searchParams.set("sort", "price");
  url.searchParams.set("limit", "5");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    console.warn(`[pricing] browse ${condition} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return [];
  }
  const body = await res.json() as {
    itemSummaries?: {
      title?: string;
      price?: { value?: string; currency?: string };
      itemWebUrl?: string;
    }[];
  };
  const out: Comparable[] = [];
  for (const s of body.itemSummaries ?? []) {
    const v = parseFloat(s.price?.value ?? "");
    if (!Number.isFinite(v) || v <= 0) continue;
    out.push({ price: v, currency: s.price?.currency ?? "GBP", title: s.title ?? "", url: s.itemWebUrl });
  }
  return out;
}

export type PriceSuggestion = {
  price: number;
  is_estimate: boolean;
  reasoning: string;
};

function undercut(cheapest: number): number {
  // Undercut by a meaningful but tidy amount, ending in .99 where sensible.
  let target: number;
  if (cheapest <= 3) target = Math.max(0.99, cheapest - 0.25);
  else if (cheapest <= 10) target = cheapest - 0.5;
  else if (cheapest <= 30) target = cheapest - 1;
  else target = cheapest * 0.9;

  // Snap to .99 if close.
  const floor = Math.floor(target);
  const snapped = floor + 0.99;
  if (Math.abs(snapped - target) <= 0.6) target = snapped;
  return Math.max(0.99, Math.round(target * 100) / 100);
}

// Produces a market-anchored price when possible, else flags the AI estimate.
export async function suggestMarketPrice(
  aiPrice: number,
  title: string,
  condition: string | null | undefined,
): Promise<PriceSuggestion> {
  try {
    const token = await getAppOnlyToken();
    // Condition: default USED unless the AI said New.
    const primary: "USED" | "NEW" = condition === "New" ? "NEW" : "USED";
    const results = await browseSearch(token, title, primary);
    if (results.length === 0) {
      return {
        price: aiPrice,
        is_estimate: true,
        reasoning: `No market data on eBay UK for this search — using AI estimate: £${aiPrice.toFixed(2)}.`,
      };
    }
    const sorted = [...results].sort((a, b) => a.price - b.price);
    const cheapest = sorted[0].price;
    const price = undercut(cheapest);
    const n = sorted.length;
    return {
      price,
      is_estimate: false,
      reasoning: `Cheapest comparable on eBay UK: £${cheapest.toFixed(2)} (from ${n} live ${primary.toLowerCase()} listing${n === 1 ? "" : "s"}) — priced at £${price.toFixed(2)} to sell quickly.`,
    };
  } catch (e) {
    console.warn("[pricing] failed:", (e as Error).message);
    return {
      price: aiPrice,
      is_estimate: true,
      reasoning: `Market lookup failed — using AI estimate: £${aiPrice.toFixed(2)}.`,
    };
  }
}
