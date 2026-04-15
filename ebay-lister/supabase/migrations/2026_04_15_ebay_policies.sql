-- Additional eBay connection metadata. Run once after schema.sql.
alter table ebay_tokens
  add column if not exists fulfillment_policy_id text,
  add column if not exists return_policy_id text,
  add column if not exists payment_policy_id text,
  add column if not exists merchant_location_key text,
  add column if not exists ebay_user text;
