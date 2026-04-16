import type { createClient } from "@/lib/supabase/server";

// If an item has been stuck in `processing` for longer than 5 minutes we
// assume the AI pipeline crashed or the request was killed mid-flight.
// Kick it to `draft` with a placeholder so the user can edit manually.
export async function reclaimStuckProcessing(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabase
    .from("items")
    .update({
      status: "draft",
      title: "Unidentified Item - Please Edit",
      description: "",
      price_is_estimate: true,
      ai_error: "Processing timed out after 5 minutes — please edit manually.",
    })
    .eq("status", "processing")
    .lt("updated_at", cutoff);
}
