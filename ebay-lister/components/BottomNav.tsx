"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CameraIcon, HomeIcon, ListIcon, TagIcon } from "./Icons";

const tabs = [
  { href: "/", label: "Dashboard", Icon: HomeIcon },
  { href: "/upload", label: "Upload", Icon: CameraIcon },
  { href: "/review", label: "Review", Icon: ListIcon },
  { href: "/listings", label: "Listings", Icon: TagIcon },
];

export default function BottomNav() {
  const path = usePathname();
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
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors"
                style={{
                  color: active ? "var(--accent)" : "var(--fg-muted)",
                  minHeight: 56,
                }}
              >
                <Icon size={22} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
