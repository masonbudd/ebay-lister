import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EBAY_SCOPES, ebayCredentials, ebayEndpoints } from "@/lib/ebay/config";

export const runtime = "nodejs";

// Kicks off the eBay OAuth authorize flow.
// Uses the RuName as `redirect_uri` (eBay's convention for authorize URLs).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", "http://localhost"));

  const { authorize } = ebayEndpoints();
  const { clientId, redirectUri } = ebayCredentials();

  const state = crypto.randomUUID();
  // Persist state in a cookie on this response to verify on callback.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,   // this is the RuName for authorize
    response_type: "code",
    scope: EBAY_SCOPES,
    state,
    prompt: "login",
  });

  const res = NextResponse.redirect(`${authorize}?${params.toString()}`);
  res.cookies.set("ebay_oauth_state", state, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  return res;
}
