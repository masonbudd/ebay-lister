-- Track the eBay offer id so retries can skip creating a duplicate offer.
alter table items
  add column if not exists ebay_offer_id text;
