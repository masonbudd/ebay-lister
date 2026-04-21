"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CameraIcon, HomeIcon, ListIcon, TagIcon } from "./Icons";
import { createClient } from "@/lib/supabase/browser";

const tabs = [
  { href: "/", label: "Dashboard", Icon: HomeIcon, key: "dashboard" },
  { href: "/upload", label: "Upload", Icon: CameraIcon, key: "upload" },
  { href: "/review", label: "Review", Icon: ListIcon, key: "review" },
  { href: "/listings", label: "Listings", Icon: TagIcon, key: "listings" },
] as const;

export default function BottomNav({ draftCount: initial }: { draftCount: number }) {
  const path = usePathname();
  const [drafts, setDrafts] = useState(initial);

  useEffect(() => { setDrafts(initial); }, [initial]);

  // Live-update the badge by polling the drafts count.
  useEffect(() => {
    const supabase = createClient();
    let stop = false;
    async function tick() {
      if (stop) return;
      const { count } = await supabase.from("items")
        .select("*", { count: "exact", head: true })
        .in("status", ["uploading", "processing", "draft"]);
      if (!stop && typeof count === "number") setDrafts(count);
    }
    const timer = setInterval(tick, 8000);
    return () => { stop = true; clearInterval(timer); };
  }, []);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 safe-bottom"
      style={{
        background: "rgba(15,17,23,0.85)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <ul className="max-w-lg mx-auto grid grid-cols-4">
        {tabs.map(({ href, label, Icon, key }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          const showBadge = key === "review" && drafts > 0;
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors"
                style={{ color: active ? "var(--accent)" : "var(--fg-muted)", minHeight: 56 }}
              >
                <span className="relative">
                  <Icon size={22} />
                  {showBadge && (
                    <span
                      className="absolute -top-1.5 -right-2 text-[10px] font-semibold rounded-full grid place-items-center"
                      style={{
                        minWidth: 18, height: 18, padding: "0 5px",
                        background: "#3b82f6", color: "#fff",
                        boxShadow: "0 0 0 2px rgba(15,17,23,1)",
                      }}
                    >
                      {drafts > 99 ? "99+" : drafts}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
