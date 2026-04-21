import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Diagnostic endpoint — compares what the user's RLS session sees vs what
// the service role sees, helping diagnose "badge shows count but page is empty".
export async function GET() {
  const userClient = await createClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();

  const userId = user?.id ?? null;

  // What the user's RLS session can see.
  const { data: rlsItems, error: rlsErr } = await userClient
    .from("items").select("id,status,user_id,created_at").order("created_at", { ascending: false }).limit(20);

  // What the service role can see (bypass RLS).
  const service = createServiceClient();
  const { data: allItems, error: svcErr } = await service
    .from("items").select("id,status,user_id,created_at").order("created_at", { ascending: false }).limit(20);

  return NextResponse.json({
    auth: { userId, error: authErr?.message ?? null },
    rls: {
      count: rlsItems?.length ?? 0,
      error: rlsErr?.message ?? null,
      items: (rlsItems ?? []).map((i) => ({ id: i.id, status: i.status, user_id: i.user_id })),
    },
    service: {
      count: allItems?.length ?? 0,
      error: svcErr?.message ?? null,
      items: (allItems ?? []).map((i) => ({ id: i.id, status: i.status, user_id: i.user_id })),
    },
    diagnosis: (() => {
      if (!userId) return "NO_AUTH: server client has no user session. Check proxy.ts is refreshing cookies.";
      const svcCount = (allItems ?? []).filter((i) => i.user_id === userId).length;
      const rlsCount = (rlsItems ?? []).length;
      if (svcCount > 0 && rlsCount === 0) return "RLS_BLOCK: items exist with your user_id but RLS is blocking SELECT. Check the 'items own' policy.";
      const orphans = (allItems ?? []).filter((i) => !i.user_id).length;
      if (orphans > 0) return `NULL_USER_ID: ${orphans} items have user_id=null. Run: UPDATE items SET user_id='${userId}' WHERE user_id IS NULL;`;
      const wrongUser = (allItems ?? []).filter((i) => i.user_id && i.user_id !== userId).length;
      if (wrongUser > 0) return `WRONG_USER: ${wrongUser} items belong to a different user_id.`;
      if (svcCount === 0) return "NO_ITEMS: no items exist in the database at all.";
      return "OK: RLS and auth look correct.";
    })(),
  });
}
