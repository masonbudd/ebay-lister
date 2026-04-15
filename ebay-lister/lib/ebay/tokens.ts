import { createServiceClient } from "@/lib/supabase/server";
import { basicAuthHeader, EBAY_ENV, ebayEndpoints } from "./config";

export type EbayTokenRow = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  environment: string;
  fulfillment_policy_id: string | null;
  return_policy_id: string | null;
  payment_policy_id: string | null;
  merchant_location_key: string | null;
  ebay_user: string | null;
};

export async function getTokens(userId: string): Promise<EbayTokenRow | null> {
  const db = createServiceClient();
  const { data } = await db.from("ebay_tokens")
    .select("*").eq("user_id", userId).eq("environment", EBAY_ENV).maybeSingle();
  return (data as EbayTokenRow | null) ?? null;
}

export async function upsertTokens(userId: string, patch: Partial<EbayTokenRow> & {
  access_token?: string; refresh_token?: string | null; expires_at?: string | null;
}): Promise<EbayTokenRow> {
  const db = createServiceClient();
  const existing = await getTokens(userId);
  if (existing) {
    const { data, error } = await db.from("ebay_tokens")
      .update(patch).eq("id", existing.id).select("*").single();
    if (error) throw new Error(`upsertTokens: ${error.message}`);
    return data as EbayTokenRow;
  }
  const { data, error } = await db.from("ebay_tokens")
    .insert({
      user_id: userId,
      environment: EBAY_ENV,
      access_token: patch.access_token ?? "",
      refresh_token: patch.refresh_token ?? null,
      expires_at: patch.expires_at ?? null,
      ...patch,
    })
    .select("*").single();
  if (error) throw new Error(`upsertTokens insert: ${error.message}`);
  return data as EbayTokenRow;
}

export async function deleteTokens(userId: string) {
  const db = createServiceClient();
  await db.from("ebay_tokens").delete().eq("user_id", userId).eq("environment", EBAY_ENV);
}

export async function exchangeAuthCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number; refresh_token_expires_in: number;
}> {
  const { token } = ebayEndpoints();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/ebay/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(token, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`eBay token exchange ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string; expires_in: number;
}> {
  const { token } = ebayEndpoints();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: [
      "https://api.ebay.com/oauth/api_scope",
      "https://api.ebay.com/oauth/api_scope/sell.inventory",
      "https://api.ebay.com/oauth/api_scope/sell.marketing",
      "https://api.ebay.com/oauth/api_scope/sell.account",
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
    ].join(" "),
  });
  const res = await fetch(token, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`eBay token refresh ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function ensureValidAccessToken(userId: string): Promise<EbayTokenRow> {
  const row = await getTokens(userId);
  if (!row) throw new Error("eBay not connected");
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp - now > 60_000) return row;
  if (!row.refresh_token) throw new Error("eBay access token expired and no refresh token");
  const refreshed = await refreshAccessToken(row.refresh_token);
  return upsertTokens(userId, {
    access_token: refreshed.access_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
}
