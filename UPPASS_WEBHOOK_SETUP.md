# UpPass Webhook Production Setup

ระบบแยก webhook ตาม actor:

- Seller: `https://your-domain.example/api/ekyc/webhook`
- Asset Funding: `https://your-domain.example/api/webhooks/uppass-invest`

## 1. Database migration

รัน migration นี้ก่อนเปิด webhook:

```text
database/migrations/2026_08_01_harden_ekyc.sql
```

Migration เพิ่ม `ekyc_attempts` สำหรับ single-active-session/admission control และ `ekyc_webhook_events` เป็น durable normalized inbox/outbox ทั้งสองตารางเปิด RLS, revoke `anon/authenticated` และให้ service role เท่านั้น โดยไม่เก็บ raw answers, รูปบัตร หรือ biometric payload

## 2. Authentication (fail closed)

UpPass Connect ใช้ Basic Auth เป็นค่าเริ่มต้นที่รองรับใน implementation ตั้ง username/password คนละชุดต่อ actor ทั้งใน Vercel และ UpPass Dashboard:

```bash
UPPASS_WEBHOOK_AUTH_MODE=basic
UPPASS_WEBHOOK_BASIC_USERNAME=generate_a_random_username
UPPASS_WEBHOOK_BASIC_PASSWORD=generate_a_long_random_password

UPPASS_WEBHOOK_AUTH_MODE_INVEST=basic
UPPASS_WEBHOOK_BASIC_USERNAME_INVEST=generate_a_different_random_username
UPPASS_WEBHOOK_BASIC_PASSWORD_INVEST=generate_a_different_long_random_password
```

ถ้า credential หายหรือ mode ไม่ถูกต้อง endpoint ตอบ `503`; credential ไม่ตรงตอบ `401` และไม่มี unauthenticated fallback การเปรียบเทียบ credential ใช้ constant-time hash comparison

`legacy_hmac` มีไว้เฉพาะบัญชีที่ได้รับการยืนยันรูปแบบ HMAC จาก UpPass เป็นลายลักษณ์อักษร ต้องตั้ง mode และ secret ยาวอย่างน้อย 32 ตัวอักษรโดยชัดเจน ห้ามตั้งเป็น fallback ของ Basic Auth

## 3. Outbound initiation

Seller และ Asset Funding ต้องกำหนด `UPPASS_API_URL`, `UPPASS_API_KEY`, `UPPASS_FORM_SLUG` และชุด `_INVEST` แยกกัน ระบบไม่ fallback ข้าม role เพื่อป้องกันใช้ verification form ผิด policy

- LIFF ส่ง LINE ID token; server ตรวจ issuer, audience, expiry, subject และ role ก่อน lookup actor
- API base URL และ `form_url` ที่ UpPass ส่งกลับต้องเป็น HTTPS/443, ไม่มี embedded credentials และอยู่ใน allowlist
- มี timeout, response-size bound, rate limit ต่อ actor และ attempt ledger ป้องกัน session ซ้ำ
- `ekyc_url` เดิมจะ reuse เฉพาะ URL ที่ผ่าน allowlist เท่านั้น

## 4. Webhook ingress และ queue

Ingress รับเฉพาะ `application/json` ไม่เกิน 512 KiB ตรวจ Basic Auth ก่อน parse/process แล้ว normalize เหลือเฉพาะ event type, opaque slug, provider status และ timestamp จากนั้น:

1. hash event identity และ insert `ekyc_webhook_events` ด้วย unique key
2. ส่ง message `{ kind, eventId }` ไป topic `ekyc-webhook-events`
3. consumer ใช้ monotonic status transitions อัปเดต actor
4. แยก LINE notification เป็น message ที่ retry ได้เอง
5. cron `/api/ekyc/reconcile` ทุก 1 นาที re-enqueue outbox ที่ค้าง โดยต้องมี `Authorization: Bearer <CRON_SECRET>`

Delivery เป็น at-least-once; unique event key, conditional updates และ notification status ทำให้ duplicate ปลอดภัยขึ้น Durable inbox เป็น recovery source หาก Vercel Queue publish ล้ม

## 5. Events และ mapping

รองรับ `submit_form`, `update_status`, `drop_off`, `ekyc_front_card_reached_max_attempts` และ `ekyc_liveness_reached_max_attempt` ค่า eKYC `pass` เปลี่ยนเป็น `VERIFIED`, `fail` หรือ max-attempt เป็น `REJECTED`, `need_review` เป็น `PENDING`, และ `drop_off` เป็น `NOT_VERIFIED` การ transition ย้อนจาก terminal state ต้องถูกปฏิเสธตาม policy ใน processor

## 6. Deployment verification

1. รัน migration และตรวจ privileges/RLS
2. ตั้ง role-specific API credentials, form slugs, Basic Auth และ host allowlists ใน Production scope
3. ตั้ง Basic Auth ชุดเดียวกันใน UpPass Dashboard และเปิด HTTPS endpoints ทั้งสอง
4. deploy แล้วตรวจ queue trigger `ekyc-webhook-events` และ cron reconciliation ใน `vercel.json`
5. ส่ง test event ที่ signed ถูก, credential ผิด, duplicate, payload ใหญ่, event out-of-order และจำลอง queue/LINE outage
6. เฝ้าดู age/count ของ `RECEIVED`, `FAILED`, `DEAD_LETTER`, notification `FAILED`, webhook 401/413/503 และ reconciliation failure โดยห้าม log raw payload หรือ PII

## Operational cautions

- การ hardening นี้ลดความเสี่ยง แต่ไม่ใช่ security certification; ต้องทำ penetration test, rotate secrets และยืนยัน DPA/retention กับ UpPass ก่อน production launch
- Vercel WAF/rate limit เป็นชั้นเสริมเท่านั้น ห้ามใช้แทน Basic Auth
- อย่าทดสอบ production ด้วย `curl` ที่ไม่มี Authorization หรือ payload ที่มีข้อมูลบุคคลจริง
