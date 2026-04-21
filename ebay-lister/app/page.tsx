import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { PlusIcon } from "@/components/Icons";
import PullToRefresh from "@/components/PullToRefresh";
import DashboardActions from "./DashboardActions";

export const dynamic = "force-dynamic";

const CARDS = [
  { key: "uploading", label: "Uploading", colour: "#3b82f6" },
  { key: "processing", label: "Processing", colour: "#f59e0b" },
  { key: "draft", label: "Drafts", colour: "#10b981", href: "/review" },
  { key: "approved", label: "Approved", colour: "#a855f7" },
  { key: "listed", label: "Listed", colour: "#60a5fa" },
  { key: "sold", label: "Sold", colour: "#22c55e" },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="p-8 text-center" style={{ color: "var(--fg-muted)" }}>Not signed in.</div>;

  const db = createServiceClient();

  // Reclaim stuck processing.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db.from("items").update({
    status: "draft", title: "Unidentified Item - Please Edit", description: "",
    price_is_estimate: true, ai_error: "Processing timed out — please edit manually.",
  }).eq("user_id", user.id).eq("status", "processing").lt("updated_at", cutoff);

  const counts = await Promise.all(
    CARDS.map(async ({ key }) => {
      const { count } = await db
        .from("items").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", key);
      return [key, count ?? 0] as const;
    }),
  );
  const map = Object.fromEntries(counts) as Record<string, number>;

  return (
    <PullToRefresh>
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Your listing pipeline at a glance.
          </p>
        </div>
        <Link href="/upload" className="btn btn-primary">
          <PlusIcon size={18} /> Add
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <Stat
            key={c.key}
            label={c.label}
            value={map[c.key]}
            colour={c.colour}
            href={"href" in c ? c.href : undefined}
          />
        ))}
      </div>

      <DashboardActions />
    </div>
    </PullToRefresh>
  );
}

function Stat({
  label, value, colour, href,
}: { label: string; value: number; colour: string; href?: string }) {
  const body = (
    <div
      className="card p-4 relative overflow-hidden transition-transform active:scale-[0.98]"
      style={{ borderLeft: `3px solid ${colour}` }}
    >
      <div
        aria-hidden
        className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-20 blur-2xl"
        style={{ background: colour }}
      />
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
        {label}
      </div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
