import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedUrlsFor } from "@/lib/photos";
import PublishButton from "@/app/review/PublishButton";
import ResetButton from "./ResetButton";

export const dynamic = "force-dynamic";

type ListItem = {
  id: string;
  status: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  ebay_listing_id: string | null;
  ebay_listing_url: string | null;
  ebay_listing_status: string | null;
  ebay_error: string | null;
  created_at: string;
};

export default async function ListingsPage() {
  const supabase = await createClient();

  const { data: approved } = await supabase.from("items")
    .select("id,status,title,price,currency,ebay_listing_id,ebay_listing_url,ebay_listing_status,ebay_error,created_at")
    .eq("status", "approved").order("created_at", { ascending: false });
  const { data: listed } = await supabase.from("items")
    .select("id,status,title,price,currency,ebay_listing_id,ebay_listing_url,ebay_listing_status,ebay_error,created_at")
    .in("status", ["listed", "sold"]).order("created_at", { ascending: false });

  const approvedItems = (approved ?? []) as ListItem[];
  const listedItems = (listed ?? []) as ListItem[];

  const allIds = [...approvedItems, ...listedItems].map((i) => i.id);
  const { data: photos } = allIds.length
    ? await supabase.from("photos")
        .select("item_id,storage_path,sort_order").in("item_id", allIds).order("sort_order")
    : { data: [] as { item_id: string; storage_path: string; sort_order: number }[] };

  // Thumbnail = first photo of each item.
  const firstByItem = new Map<string, string>();
  for (const p of photos ?? []) if (!firstByItem.has(p.item_id)) firstByItem.set(p.item_id, p.storage_path);
  const urls = await signedUrlsFor([...firstByItem.values()]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Ready to publish and already on eBay.
        </p>
      </div>

      <Section title={`Ready to publish (${approvedItems.length})`}>
        {approvedItems.length === 0 ? (
          <Empty>Nothing approved yet. Approve drafts in Review.</Empty>
        ) : (
          approvedItems.map((i) => (
            <Row
              key={i.id} item={i}
              thumb={urls[firstByItem.get(i.id) ?? ""] ?? ""}
              right={<PublishButton itemId={i.id} />}
            />
          ))
        )}
      </Section>

      <Section title={`Published (${listedItems.length})`}>
        {listedItems.length === 0 ? (
          <Empty>No live listings yet.</Empty>
        ) : (
          listedItems.map((i) => (
            <Row
              key={i.id} item={i}
              thumb={urls[firstByItem.get(i.id) ?? ""] ?? ""}
              right={
                <div className="flex flex-col items-end gap-1">
                  {i.ebay_listing_url && (
                    <a
                      href={i.ebay_listing_url} target="_blank" rel="noreferrer"
                      className="btn"
                      style={{ minHeight: 36, padding: "0 10px", fontSize: 12 }}
                    >
                      View on eBay
                    </a>
                  )}
                  <ResetButton itemId={i.id} />
                </div>
              }
            />
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 text-sm text-center" style={{ color: "var(--fg-muted)" }}>
      {children}
    </div>
  );
}

function Row({
  item, thumb, right,
}: { item: ListItem; thumb: string; right: React.ReactNode }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div
        className="w-16 h-16 rounded-lg shrink-0 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
      >
        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{item.title ?? "Untitled"}</div>
        <div className="text-xs" style={{ color: "var(--fg-muted)" }}>
          £{item.price?.toFixed(2) ?? "—"} · {item.status}
          {item.ebay_listing_status ? ` · ${item.ebay_listing_status}` : ""}
        </div>
        {item.ebay_error && (
          <div className="text-xs mt-1 truncate" style={{ color: "#fca5a5" }}>
            {item.ebay_error}
          </div>
        )}
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}
