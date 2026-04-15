-- Run this in the Supabase SQL editor once.

create extension if not exists "pgcrypto";

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'uploading',

  title text,
  description text,
  condition text,
  category_id text,
  category_name text,
  price numeric(10,2),
  price_is_estimate boolean default true,
  currency text default 'GBP',

  item_specifics jsonb default '{}'::jsonb,

  ebay_listing_id text,
  ebay_listing_url text,
  ebay_listing_status text,
  ebay_error text,

  ai_raw_response jsonb,
  ai_confidence text,
  ai_error text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists items_user_status_idx on items (user_id, status, created_at desc);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null,
  public_url text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists photos_item_idx on photos (item_id, sort_order);

create table if not exists ebay_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  environment text not null default 'sandbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, environment)
);

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists items_updated_at on items;
create trigger items_updated_at before update on items
  for each row execute procedure set_updated_at();

drop trigger if exists ebay_tokens_updated_at on ebay_tokens;
create trigger ebay_tokens_updated_at before update on ebay_tokens
  for each row execute procedure set_updated_at();

-- RLS
alter table items enable row level security;
alter table photos enable row level security;
alter table ebay_tokens enable row level security;

drop policy if exists "items own" on items;
create policy "items own" on items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "photos own" on photos;
create policy "photos own" on photos for all
  using (exists (select 1 from items i where i.id = photos.item_id and i.user_id = auth.uid()))
  with check (exists (select 1 from items i where i.id = photos.item_id and i.user_id = auth.uid()));

drop policy if exists "tokens own" on ebay_tokens;
create policy "tokens own" on ebay_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage bucket: create bucket 'item-photos' (private) via dashboard, then:
-- Storage policies:
--   select/insert/update/delete: bucket_id = 'item-photos'
--     AND (storage.foldername(name))[1] = auth.uid()::text
