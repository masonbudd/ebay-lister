import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteTokens } from "@/lib/ebay/tokens";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  await deleteTokens(user.id);
  return NextResponse.redirect(new URL("/settings", req.url));
}
