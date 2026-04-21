import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { GearIcon, SignOutIcon } from "@/components/Icons";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "eBay Lister",
  description: "Photograph, describe with AI, list on eBay.",
  applicationName: "eBay Lister",
  appleWebApp: {
    capable: true,
    title: "Lister",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0f1117",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

async function reviewCount(userId: string) {
  const db = createServiceClient();
  const { count } = await db.from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["uploading", "processing", "draft"]);
  return count ?? 0;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en-GB" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
        {user && (
          <header
            className="sticky top-0 z-20"
            style={{
              background: "rgba(15,17,23,0.75)",
              backdropFilter: "blur(14px) saturate(140%)",
              WebkitBackdropFilter: "blur(14px) saturate(140%)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="max-w-lg mx-auto flex items-center gap-2 px-4 py-3">
              <span className="font-semibold tracking-tight">eBay Lister</span>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href="/settings"
                  className="btn"
                  style={{ minHeight: 40, padding: "0 12px" }}
                  aria-label="Settings"
                >
                  <GearIcon size={18} />
                </Link>
                <form action="/auth/signout" method="post">
                  <button
                    className="btn"
                    style={{ minHeight: 40, padding: "0 12px" }}
                    aria-label="Sign out"
                  >
                    <SignOutIcon size={18} />
                  </button>
                </form>
              </div>
            </div>
          </header>
        )}

        <main
          className="flex-1"
          style={{ paddingBottom: user ? "calc(var(--tab-h) + env(safe-area-inset-bottom))" : 0 }}
        >
          {children}
        </main>

        {user && <BottomNav draftCount={await reviewCount(user.id)} />}
        </ToastProvider>
      </body>
    </html>
  );
}
