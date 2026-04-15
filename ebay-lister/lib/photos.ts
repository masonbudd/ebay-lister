import { createServiceClient } from "@/lib/supabase/server";

export async function signedUrlsFor(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const service = createServiceClient();
  const { data, error } = await service.storage
    .from("item-photos")
    .createSignedUrls(paths, 60 * 60);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}
