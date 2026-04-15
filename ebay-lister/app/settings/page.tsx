import { createClient } from "@/lib/supabase/server";
import { EBAY_ENV } from "@/lib/ebay/config";
import { getTokens } from "@/lib/ebay/tokens";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ebay_connected?: string; ebay_error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = user ? await getTokens(user.id) : null;
  const sp = await searchParams;

  const connected = !!token?.access_token;
  const expiresAt = token?.expires_at ? new Date(token.expires_at) : null;
  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Connect your eBay account to start publishing.
        </p>
      </div>

      {sp.ebay_connected && (
        <div className="card p-3 text-sm" style={{
          borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.08)", color: "#86efac",
        }}>
          eBay connected successfully.
        </div>
      )}
      {sp.ebay_error && (
        <div className="card p-3 text-sm" style={{
          borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", color: "#fca5a5",
        }}>
          eBay error: {sp.ebay_error}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">eBay account</div>
            <div className="text-xs" style={{ color: "var(--fg-muted)" }}>
              Environment: <span className="uppercase">{EBAY_ENV}</span> · Marketplace: UK (EBAY_GB)
            </div>
          </div>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              color: connected && !expired ? "#86efac" : "var(--fg-muted)",
              background: connected && !expired ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
            }}
          >
            {connected ? (expired ? "Token expired" : "Connected") : "Not connected"}
          </span>
        </div>

        {connected && (
          <div className="text-xs space-y-1" style={{ color: "var(--fg-muted)" }}>
            <div>Location: {token?.merchant_location_key ?? "—"}</div>
            <div>Fulfillment policy: {token?.fulfillment_policy_id ?? "will auto-create on first publish"}</div>
            <div>Return policy: {token?.return_policy_id ?? "will auto-create on first publish"}</div>
            <div>Payment policy: {token?.payment_policy_id ?? "will auto-create on first publish"}</div>
            <div>Refresh token {token?.refresh_token ? "present" : "missing"}</div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {!connected && (
            <a href="/api/ebay/connect" className="btn btn-primary flex-1">
              Connect eBay {EBAY_ENV === "sandbox" ? "(sandbox)" : ""}
            </a>
          )}
          {connected && (
            <>
              <a href="/api/ebay/connect" className="btn flex-1">Reconnect</a>
              <form action="/api/ebay/disconnect" method="post" className="flex-1">
                <button className="btn btn-danger-outline w-full">Disconnect</button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="card p-4 text-xs space-y-1" style={{ color: "var(--fg-muted)" }}>
        <div className="font-medium" style={{ color: "var(--fg)" }}>Default listing settings</div>
        <div>Item location: Liverpool, England, United Kingdom</div>
        <div>Duration: Good &apos;Til Cancelled (FIXED_PRICE)</div>
        <div>Shipping: Royal Mail 2nd Class, £3.99, buyer pays</div>
        <div>Returns: 30 days, buyer pays return shipping</div>
        <div>Payment: managed payments, immediate pay</div>
      </div>
    </div>
  );
}
