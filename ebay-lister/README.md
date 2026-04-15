# eBay Lister

Photograph items → AI drafts eBay listings → review → (next session) publish to eBay.co.uk.

Stack: Next.js 16 (App Router), Supabase (Postgres + Storage + Auth), NVIDIA NIM API (`qwen/qwen3.5-397b-a17b`, OpenAI-compatible), Tailwind.

## What's in this build

Steps 1–4 of the build order:

1. Scaffold + DB schema
2. Auth (email/password)
3. Upload flow (conveyor belt UX, mobile-first)
4. AI processing + review queue

Next session: eBay OAuth + listing publication.

## One-time setup

### 1. Supabase

1. Create a project at https://supabase.com.
2. SQL editor → paste and run `supabase/schema.sql`.
3. Storage → **New bucket** called `item-photos`, **Private** (not public).
4. Storage → Policies for `item-photos`. Add one policy per action (SELECT, INSERT, UPDATE, DELETE) with expression:
   ```
   bucket_id = 'item-photos'
   AND (storage.foldername(name))[1] = auth.uid()::text
   ```
   (The upload flow stores objects under `{user_id}/{item_id}/{uuid}.jpg`.)
5. Authentication → Providers → keep Email enabled. For fast local testing, disable "Confirm email".
6. Copy project URL, anon key, service role key into `.env.local`.

### 2. NVIDIA NIM

Create an API key at https://build.nvidia.com → set `NVIDIA_API_KEY`.

### 3. Env vars

Copy `.env.local.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NVIDIA_API_KEY=
NVIDIA_MODEL=qwen/qwen3.5-397b-a17b
```

eBay vars can stay blank for now.

### 4. Run it

```
npm run dev
```

Open http://localhost:3000, sign up, then `/upload`.

## How the upload flow works

- Tap **+** to pick/take up to 5 photos per item.
- Each photo is compressed client-side (~1.2 MB max) and streamed to Supabase Storage in parallel. The `items` row is created on first photo.
- Tap **Next item →**. The item flips to `processing`, a fire-and-forget POST hits `/api/process`, and you're on a fresh item immediately.
- `/api/process` downloads photos with the service role, sends them to the NVIDIA NIM chat/completions endpoint as base64 data URIs (OpenAI vision format), writes the draft back. Status becomes `draft`.
- `/review` polls processing items every 3s and lets you edit/approve/delete.

## Notes

- Single-user app — no multi-tenant concerns, but RLS is on so you can't footgun yourself.
- `/api/process` runs on the Node runtime with `maxDuration = 120`. On Vercel Hobby the hard cap is 10s — bump the plan or move to a queue before deploying.
- No web-search tool (NVIDIA doesn't support it) — price is estimated from the model's knowledge; verify in the review queue.

## eBay setup

1. Run the migration at `supabase/migrations/2026_04_15_ebay_policies.sql` in the Supabase SQL editor.
2. In the [eBay developer portal](https://developer.ebay.com), under your application:
   - Find the **RuName** (e.g. `Mason_Budd-MasonBud-MyList-ocdqg`) under "User Tokens → Get a Token from eBay via Your Application".
   - Set the "Your auth accepted URL" for that RuName to `http://<your-host>/api/ebay/callback` (e.g. `http://localhost:3000/api/ebay/callback` for local dev, or your ngrok URL for mobile).
   - Make sure "Your auth declined URL" is set too (use the same base + `/settings`).
3. Fill env vars in `.env.local`:
   ```
   EBAY_ENVIRONMENT=sandbox
   EBAY_SANDBOX_APP_ID=...         # Client ID
   EBAY_SANDBOX_CERT_ID=...        # Client Secret
   EBAY_SANDBOX_DEV_ID=...
   EBAY_SANDBOX_REDIRECT_URI=Mason_Budd-MasonBud-MyList-ocdqg   # RuName
   ```
4. Open `/settings` in the app → "Connect eBay". You'll be redirected to eBay to authorise, then back to `/settings`.
5. First publish auto-creates a Liverpool merchant location, a Royal Mail 2nd Class fulfillment policy (£3.99, buyer pays, 1-day handling), a 30-day return policy (buyer pays return), and a managed-payments policy (immediate pay).

## Publishing a listing

1. Review drafts in `/review`, edit, **Approve**.
2. Approved items appear at the top of `/listings`. Tap **Publish to eBay** on each one.
3. Publish creates inventory item → offer → publishes offer via the Inventory API. Photos are uploaded via Supabase signed URLs (valid 7 days) as `imageUrls` on the inventory item.
4. On success the item moves to `status = 'listed'`, with its eBay listing URL stored on the row.

## Known TODOs for future

- Taxonomy API lookup for `category_id` + required item specifics (currently the AI suggests a category ID — sometimes wrong).
- End/revise listings from the UI.
- Handle fulfilment/orders (shipping label, tracking).
- Prod toggle in the UI (currently driven by `EBAY_ENVIRONMENT` env only).
