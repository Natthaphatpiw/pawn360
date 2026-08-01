# Environment Variables Setup

คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่าจริงผ่าน Vercel Environment Variables สำหรับ Production/Preview แยกกัน ห้าม commit ค่า secret และห้ามเปิด mock flags ใน production

## LLM และการค้นหาราคา

```bash
# OpenAI เป็น LLM หลัก; ตั้ง backup keys ได้ แต่ไม่ควรใช้เพื่อหลบ billing quota
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_KEY_2=
OPENAI_API_KEY_3=
OPENAI_API_KEY_4=
OPENAI_LUNA_MODEL=gpt-5.6-luna
OPENAI_TERRA_MODEL=gpt-5.6-terra
OPENAI_TIMEOUT_MS=90000
OPENAI_STORE_RESPONSES=false

# ค่า fallback ของ call เก่าที่ยังไม่ได้กำหนด policy ราย task
OPENAI_LUNA_REASONING_EFFORT=low
OPENAI_TERRA_REASONING_EFFORT=low
OPENAI_NOTEBOOK_REASONING_EFFORT=low

# Optional task override; ถ้าไม่ตั้ง ระบบใช้ none/low และยกระดับหนึ่งขั้นเมื่อ quality gate ไม่ผ่าน
# OPENAI_EFFORT_CONDITION_IMAGE_PRECHECK=none
# OPENAI_EFFORT_CONDITION_SCORING=low
# OPENAI_EFFORT_NOTEBOOK_VISION_SPEC=none
# OPENAI_EFFORT_SLIP_VERIFICATION=low
# OPENAI_EFFORT_GENERIC_NORMALIZE_INPUT=none
# OPENAI_EFFORT_NOTEBOOK_NORMALIZE_INPUT=none
# OPENAI_EFFORT_GENERIC_SERPAPI_FILTER=none
# OPENAI_EFFORT_NOTEBOOK_SERPAPI_FILTER=low
# OPENAI_EFFORT_NOTEBOOK_CANONICAL_SPEC=low
# OPENAI_EFFORT_GENERIC_MARKET_EXTRACT=low
# OPENAI_EFFORT_NOTEBOOK_MARKET_EXTRACT=low

# Anthropic ใช้เป็น model fallback เมื่อ OpenAI ใช้งานไม่ได้
ANTHROPIC_API_KEY=
ANTHROPIC_API_KEY_2=
ANTHROPIC_API_KEY_3=
ANTHROPIC_API_KEY_4=
ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_VISION_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_PRICE_SEARCH_MODEL=claude-sonnet-4-6

# Web search: Parallel -> Exa -> stale Redis cache
PARALLEL_API_KEY=your_parallel_api_key
PARALLEL_SEARCH_MODE=turbo
PARALLEL_SEARCH_TIMEOUT_MS=12000
EXA_API_KEY=your_exa_api_key
EXA_SEARCH_TIMEOUT_MS=30000
MARKET_SEARCH_CACHE_TTL_SECONDS=21600
MARKET_SEARCH_STALE_TTL_SECONDS=604800
MARKET_SEARCH_MAX_EXCERPT_CHARS_PER_RESULT=2500

# SerpAPI เป็นแหล่งราคาโครงสร้างเสริม ไม่ใช่ fallback ของ Parallel
SERPAPI_ENABLED=false
SERPAPI_API_KEY=
SERPAPI_EXCHANGE_RATE_THB_PER_USD=32

# Cost/usage guardrails; ต้องมี Redis เพื่อบังคับ budget ข้าม instance
AI_USAGE_TTL_SECONDS=7776000
AI_MONTHLY_BUDGET_USD=
AI_MAX_JOB_COST_USD=1
AI_SAFETY_IDENTIFIER_SECRET=generate_a_long_random_secret
ALLOW_SYNCHRONOUS_AI_ROUTES=false
```

อย่ากำหนด effort เป็น `xhigh` หรือ `max` แบบ global ใน production โดยไม่มีผล eval รองรับ เพราะ reasoning token และเวลาเพิ่มขึ้นมาก ค่า task override จะครอบทั้งรอบแรกและ retry ของ task นั้น จึงควรใช้เฉพาะการทดลองที่วัดผลแล้ว

## Vercel Queues และ Redis

```bash
KV_REST_API_URL=https://YOUR_DATABASE.upstash.io
KV_REST_API_TOKEN=your_upstash_token
KV_REST_API_READ_ONLY_TOKEN=your_upstash_read_only_token

# Production: Vercel Queues; local next dev จะใช้ waitUntil อัตโนมัติ
JOB_DISPATCHER=vercel
JOB_CONCURRENCY_ESTIMATE_GENERIC=6
JOB_CONCURRENCY_ESTIMATE_NOTEBOOK=2
JOB_CONCURRENCY_CONDITION=8

# ใช้เฉพาะ legacy QStash fallback
QSTASH_TOKEN=
JOB_WORKER_SECRET=generate_a_long_random_secret
JOB_CALLBACK_BASE_URL=https://your-production-domain.example

# ป้องกัน cron reconciliation
CRON_SECRET=generate_a_different_long_random_secret
```

Queue topics และ consumer routes ถูกประกาศใน `vercel.json`; deployment ต้องรองรับ `queue/v2beta` ก่อนเปิด traffic จริง Vercel Queues ส่งแบบ at-least-once ดังนั้นห้ามถอด idempotency/lease/DLQ ใน application

## UpPass eKYC

```bash
# Seller และ Asset Funding ต้องมี credentials แยกกัน; ไม่มี role fallback
UPPASS_API_URL=https://app.uppass.io
UPPASS_API_KEY=your_seller_uppass_api_key
UPPASS_FORM_SLUG=your_seller_form_slug
UPPASS_API_URL_INVEST=https://app.uppass.io
UPPASS_API_KEY_INVEST=your_asset_funding_uppass_api_key
UPPASS_FORM_SLUG_INVEST=your_asset_funding_form_slug
UPPASS_REQUEST_TIMEOUT_MS=12000

# จำกัด host ป้องกัน SSRF; comma-separated
UPPASS_ALLOWED_HOSTS=app.uppass.io,api.uppass.io
UPPASS_FORM_ALLOWED_HOSTS=app.uppass.io
UPPASS_FORM_ALLOWED_HOSTS_INVEST=app.uppass.io

# UpPass documented mode: Basic Auth และ fail closed
UPPASS_WEBHOOK_AUTH_MODE=basic
UPPASS_WEBHOOK_BASIC_USERNAME=generate_a_random_username
UPPASS_WEBHOOK_BASIC_PASSWORD=generate_a_long_random_password
UPPASS_WEBHOOK_AUTH_MODE_INVEST=basic
UPPASS_WEBHOOK_BASIC_USERNAME_INVEST=generate_a_different_random_username
UPPASS_WEBHOOK_BASIC_PASSWORD_INVEST=generate_a_different_long_random_password

# เปิด legacy_hmac เฉพาะเมื่อมีข้อตกลง provider ยืนยันรูปแบบ signature แล้ว
# UPPASS_WEBHOOK_AUTH_MODE=legacy_hmac
# UPPASS_WEBHOOK_SECRET=minimum_32_character_secret
```

หลัง deploy ต้องรัน migration `database/migrations/2026_08_01_harden_ekyc.sql` ก่อนรับ webhook และตั้ง Basic Auth ชุดเดียวกันใน UpPass Dashboard ห้ามปล่อย credential ว่าง เพราะ endpoint จะตอบ `503` แบบ fail-closed

## Infrastructure หลัก

ใช้ชื่อและ placeholder จาก `.env.example` สำหรับ Supabase, MongoDB, Vercel Blob, LINE/LIFF, SlipOK และ Shop System ค่าที่มี `NEXT_PUBLIC_` เท่านั้นที่เข้าถึงได้จาก browser; ห้ามใส่ service-role key, provider key หรือ webhook secret ในตัวแปร public
