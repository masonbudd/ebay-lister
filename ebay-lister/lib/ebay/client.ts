import { EBAY_LANGUAGE, EBAY_MARKETPLACE, ebayEndpoints } from "./config";
import { ensureValidAccessToken, type EbayTokenRow } from "./tokens";

type Options = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** eBay API returns 204 or an empty body for some endpoints. */
  allowEmpty?: boolean;
  /** Override Content-Language header. */
  contentLanguage?: string;
};

export async function ebayFetch<T = unknown>(
  token: EbayTokenRow, path: string, opts: Options = {},
): Promise<T> {
  const { api } = ebayEndpoints();
  const res = await fetch(`${api}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE,
      "Content-Language": opts.contentLanguage ?? EBAY_LANGUAGE,
      "Accept-Language": EBAY_LANGUAGE,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`eBay ${opts.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 600)}`);
  }
  if (!text) return (opts.allowEmpty ? undefined : (null as unknown)) as T;
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

export async function ebayFor(userId: string): Promise<EbayTokenRow> {
  return ensureValidAccessToken(userId);
}
