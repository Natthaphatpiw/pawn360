# LIFF Mock Preview Setup

Use this guide when you want to preview LINE LIFF pages locally without opening the app inside LINE.

## 1. Create `.env.local`

Create a local environment file at the project root:

```bash
touch .env.local
```

Add the mock flag:

```env
NEXT_PUBLIC_LIFF_MOCK=true
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

`NEXT_PUBLIC_LIFF_MOCK=true` makes `lib/liff/liff-provider.tsx` skip real LIFF initialization and use the built-in development profile:

```txt
userId: Umock_dev_user_001
displayName: Mock User (Dev)
```

## 2. Add any route-specific variables

Some pages also need public LIFF IDs or backend service keys. Use placeholder values locally unless you are testing real integrations:

```env
NEXT_PUBLIC_LIFF_ID=your_liff_id_here
NEXT_PUBLIC_LIFF_ID_STORE=your_store_liff_id_here
NEXT_PUBLIC_LIFF_ID_DROPPOINT=your_drop_point_liff_id_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Do not commit real keys, tokens, database URLs, or LINE credentials.

## 3. Restart the dev server

Next.js reads environment variables when the dev server starts. After changing `.env.local`, restart:

```bash
npm run dev
```

Then open:

```txt
http://localhost:3000
```

## 4. Preview LIFF mock pages

For the pawn delivery LIFF mockup, you can open:

```txt
http://localhost:3000/pawn-delivery?preview=1
```

Optional query params:

```txt
http://localhost:3000/pawn-delivery?preview=1&stage=assigned
http://localhost:3000/pawn-delivery?preview=1&stage=picked
http://localhost:3000/pawn-delivery?preview=1&stage=arrived
```

## Why `.env.local` is not in GitHub

This repository ignores all `.env*` files in `.gitignore`:

```gitignore
.env*
```

Every developer should create their own `.env.local` on their machine. This prevents secrets from being uploaded to GitHub main.
