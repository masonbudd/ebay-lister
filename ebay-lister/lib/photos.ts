import { createServiceClient } from "@/lib/supabase/server";

// Bucket `item-photos` is public — use short public URLs instead of signed URLs.
export async function signedUrlsFor(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const service = createServiceClient();
  const out: Record<string, string> = {};
  for (const path of paths) {
    const { data } = service.storage.from("item-photos").getPublicUrl(path);
    if (data?.publicUrl) out[path] = data.publicUrl;
  }
  return out;
}
