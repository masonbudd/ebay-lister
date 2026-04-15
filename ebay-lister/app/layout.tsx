import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { GearIcon, SignOutIcon } from "@/components/Icons";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "eBay Lister",
  description: "Photograph, describe with AI, list on eBay.",
};

export const viewport = {
  themeColor: "#0f1117",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en-GB" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">
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

        {user && <BottomNav />}
      </body>
    </html>
  );
}
