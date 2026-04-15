import { ebayFetch } from "./client";
import { upsertTokens, type EbayTokenRow } from "./tokens";
import { EBAY_CURRENCY, EBAY_MARKETPLACE } from "./config";

const LOCATION_KEY = "liverpool_default";

export async function ensureMerchantLocation(
  userId: string, token: EbayTokenRow,
): Promise<EbayTokenRow> {
  if (token.merchant_location_key) return token;
  try {
    await ebayFetch(token, `/sell/inventory/v1/location/${LOCATION_KEY}`);
  } catch {
    await ebayFetch(token, `/sell/inventory/v1/location/${LOCATION_KEY}`, {
      method: "POST",
      body: {
        location: {
          address: {
            addressLine1: "Liverpool",
            city: "Liverpool",
            stateOrProvince: "Merseyside",
            postalCode: "L1 1AA",
            country: "GB",
          },
        },
        locationInstructions: "Items ship within 1 business day.",
        name: "Liverpool",
        merchantLocationStatus: "ENABLED",
        locationTypes: ["STORE"],
      },
      allowEmpty: true,
    });
  }
  return upsertTokens(userId, { merchant_location_key: LOCATION_KEY });
}

type PolicyList<T> = { total?: number; [key: string]: unknown } & Record<string, T[] | number | undefined>;

export async function ensureBusinessPolicies(
  userId: string, token: EbayTokenRow,
): Promise<EbayTokenRow> {
  let next = token;
  if (!next.fulfillment_policy_id) next = await ensureFulfillment(userId, next);
  if (!next.return_policy_id) next = await ensureReturn(userId, next);
  if (!next.payment_policy_id) next = await ensurePayment(userId, next);
  return next;
}

async function ensureFulfillment(userId: string, token: EbayTokenRow): Promise<EbayTokenRow> {
  const list = await ebayFetch<PolicyList<{ fulfillmentPolicyId: string; name: string }>>(
    token, `/sell/account/v1/fulfillment_policy?marketplace_id=${EBAY_MARKETPLACE}`,
  );
  const arr = (list.fulfillmentPolicies as { fulfillmentPolicyId: string; name: string }[] | undefined) ?? [];
  const existing = arr.find((p) => p.name === "Auto Royal Mail UK");
  if (existing) {
    return upsertTokens(userId, { fulfillment_policy_id: existing.fulfillmentPolicyId });
  }
  const created = await ebayFetch<{ fulfillmentPolicyId: string }>(
    token, "/sell/account/v1/fulfillment_policy",
    {
      method: "POST",
      body: {
        name: "Auto Royal Mail UK",
        marketplaceId: EBAY_MARKETPLACE,
        categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
        handlingTime: { value: 1, unit: "DAY" },
        shippingOptions: [{
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [{
            sortOrder: 1,
            shippingCarrierCode: "RoyalMail",
            shippingServiceCode: "UK_RoyalMailSecondClassStandard",
            shippingCost: { value: "3.99", currency: EBAY_CURRENCY },
            freeShipping: false,
            buyerResponsibleForShipping: false,
          }],
        }],
      },
    },
  );
  return upsertTokens(userId, { fulfillment_policy_id: created.fulfillmentPolicyId });
}

async function ensureReturn(userId: string, token: EbayTokenRow): Promise<EbayTokenRow> {
  const list = await ebayFetch<PolicyList<{ returnPolicyId: string; name: string }>>(
    token, `/sell/account/v1/return_policy?marketplace_id=${EBAY_MARKETPLACE}`,
  );
  const arr = (list.returnPolicies as { returnPolicyId: string; name: string }[] | undefined) ?? [];
  const existing = arr.find((p) => p.name === "Auto 30-day returns");
  if (existing) {
    return upsertTokens(userId, { return_policy_id: existing.returnPolicyId });
  }
  const created = await ebayFetch<{ returnPolicyId: string }>(
    token, "/sell/account/v1/return_policy",
    {
      method: "POST",
      body: {
        name: "Auto 30-day returns",
        marketplaceId: EBAY_MARKETPLACE,
        categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
        returnsAccepted: true,
        returnPeriod: { value: 30, unit: "DAY" },
        returnShippingCostPayer: "BUYER",
        returnMethod: "REPLACEMENT_OR_MONEY_BACK",
      },
    },
  );
  return upsertTokens(userId, { return_policy_id: created.returnPolicyId });
}

async function ensurePayment(userId: string, token: EbayTokenRow): Promise<EbayTokenRow> {
  const list = await ebayFetch<PolicyList<{ paymentPolicyId: string; name: string }>>(
    token, `/sell/account/v1/payment_policy?marketplace_id=${EBAY_MARKETPLACE}`,
  );
  const arr = (list.paymentPolicies as { paymentPolicyId: string; name: string }[] | undefined) ?? [];
  const existing = arr.find((p) => p.name === "Auto managed payments");
  if (existing) {
    return upsertTokens(userId, { payment_policy_id: existing.paymentPolicyId });
  }
  const created = await ebayFetch<{ paymentPolicyId: string }>(
    token, "/sell/account/v1/payment_policy",
    {
      method: "POST",
      body: {
        name: "Auto managed payments",
        marketplaceId: EBAY_MARKETPLACE,
        categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
        immediatePay: true,
      },
    },
  );
  return upsertTokens(userId, { payment_policy_id: created.paymentPolicyId });
}
