export type EbayEnv = "sandbox" | "production";

export const EBAY_ENV: EbayEnv =
  (process.env.EBAY_ENVIRONMENT as EbayEnv) === "production" ? "production" : "sandbox";

export const EBAY_MARKETPLACE = "EBAY_GB";
export const EBAY_CURRENCY = "GBP";
export const EBAY_LANGUAGE = "en-GB";

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ");

type Endpoints = {
  authorize: string;
  token: string;
  api: string;
};

const ENDPOINTS: Record<EbayEnv, Endpoints> = {
  sandbox: {
    authorize: "https://auth.sandbox.ebay.com/oauth2/authorize",
    token: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
    api: "https://api.sandbox.ebay.com",
  },
  production: {
    authorize: "https://auth.ebay.com/oauth2/authorize",
    token: "https://api.ebay.com/identity/v1/oauth2/token",
    api: "https://api.ebay.com",
  },
};

export function ebayEndpoints(env: EbayEnv = EBAY_ENV) {
  return ENDPOINTS[env];
}

export function ebayCredentials(env: EbayEnv = EBAY_ENV) {
  const prefix = env === "production" ? "EBAY_PROD" : "EBAY_SANDBOX";
  const clientId = process.env[`${prefix}_APP_ID`];
  const clientSecret = process.env[`${prefix}_CERT_ID`];
  const redirectUri = process.env[`${prefix}_REDIRECT_URI`]; // This is the RuName for authorize,
                                                             // and the actual redirect for the callback.
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(`Missing eBay ${env} credentials in env`);
  }
  return { clientId, clientSecret, redirectUri };
}

export function basicAuthHeader(env: EbayEnv = EBAY_ENV) {
  const { clientId, clientSecret } = ebayCredentials(env);
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}
