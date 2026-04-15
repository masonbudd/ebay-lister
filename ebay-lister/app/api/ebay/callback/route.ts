import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeAuthCode, upsertTokens } from "@/lib/ebay/tokens";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const expectedState = req.headers.get("cookie")?.match(/ebay_oauth_state=([^;]+)/)?.[1];

  const settings = new URL("/settings", url);

  if (err) {
    settings.searchParams.set("ebay_error", err);
    return NextResponse.redirect(settings);
  }
  if (!code) {
    settings.searchParams.set("ebay_error", "no_code");
    return NextResponse.redirect(settings);
  }
  if (!state || !expectedState || state !== expectedState) {
    settings.searchParams.set("ebay_error", "state_mismatch");
    return NextResponse.redirect(settings);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));

  try {
    const tok = await exchangeAuthCode(code);
    await upsertTokens(user.id, {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
    });
    settings.searchParams.set("ebay_connected", "1");
  } catch (e) {
    settings.searchParams.set("ebay_error", (e as Error).message.slice(0, 200));
  }

  const res = NextResponse.redirect(settings);
  res.cookies.set("ebay_oauth_state", "", { maxAge: 0, path: "/" });
  return res;
}
