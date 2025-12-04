# UpPass Webhook Configuration Guide

## 📍 Webhook URL ที่ต้องตั้งค่าใน UpPass Dashboard

```
https://your-domain.com/api/ekyc/webhook
```

### สำหรับ Development (Local Testing with ngrok):
```bash
# 1. Install ngrok
npm install -g ngrok

# 2. Start your Next.js app
npm run dev

# 3. In another terminal, start ngrok
ngrok http 3000

# 4. Use the ngrok URL in UpPass Dashboard
https://abc123.ngrok.io/api/ekyc/webhook
```

---

## 🔐 Environment Variables Required

Add these to your `.env.local`:

```bash
# UpPass eKYC Configuration
UPPASS_API_KEY=your-uppass-api-key-here
UPPASS_FORM_SLUG=your-uppass-form-slug-here
UPPASS_API_URL=https://api.uppass.io
UPPASS_WEBHOOK_SECRET=your-webhook-secret-here

# Your Application URL
NEXT_PUBLIC_BASE_URL=https://your-domain.com

# LINE Configuration (for notifications)
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token
LINE_CHANNEL_SECRET=your-line-channel-secret

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 📨 Webhook Events ที่รองรับ

| Event Type | Description | Status Update |
|------------|-------------|---------------|
| `submit_form` | เมื่อ user submit การยืนยันตัวตน | ✅ อัพเดท KYC status |
| `update_status` | เมื่อ admin เปลี่ยนสถานะใน UpPass Portal | ✅ อัพเดท KYC status |
| `drop_off` | เมื่อฟอร์มยืนยันตัวตนหมดอายุ | ⚠️ รีเซ็ตสถานะ |
| `ekyc_front_card_reached_max_attempts` | เมื่อการสแกนบัตรครบจำนวนครั้งสูงสุด | ❌ ปฏิเสธ |
| `ekyc_liveness_reached_max_attempt` | เมื่อการตรวจสอบใบหน้าครบจำนวนครั้งสูงสุด | ❌ ปฏิเสธ |

---

## 🔄 Webhook Payload Structure

```json
{
  "event": {
    "type": "submit_form",
    "nounce": "string",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "application": {
    "id": 12345,
    "no": "APP-2024-001",
    "form": "form-slug",
    "slug": "unique-session-slug",
    "status": "accepted",
    "other_status": {
      "ekyc": "verified"
    },
    "submitted_at": "2024-01-01T00:00:00Z"
  },
  "extra": {
    "ekyc": {
      "liveness": {...},
      "face_compare": {...},
      "identity_document": {...}
    }
  },
  "answers": {
    "th_first_name": {
      "value": "สมชาย",
      "created_at": "2024-01-01T00:00:00Z"
    }
  }
}
```

---

## 🎯 Status Mapping

| UpPass Status | Database Status | Description |
|---------------|-----------------|-------------|
| `accepted` | `VERIFIED` | ✅ ยืนยันตัวตนสำเร็จ |
| `rejected` | `REJECTED` | ❌ ยืนยันตัวตนไม่สำเร็จ |
| `review_needed` | `PENDING` | ⏳ รอการตรวจสอบ |

---

## 📱 LINE Notifications

Webhook จะส่งการแจ้งเตือนผ่าน LINE อัตโนมัติตามสถานะ:

### ✅ Verified
```
🎉 ยืนยันตัวตนสำเร็จ!

คุณ[ชื่อ] [นามสกุล]
สามารถเริ่มใช้งานระบบจำนำ P2P ได้แล้ว

กดที่นี่เพื่อเริ่มจำนำสินค้า
```

### ❌ Rejected
```
❌ การยืนยันตัวตนไม่สำเร็จ

เหตุผล: [rejection_reason]

กรุณาลองใหม่อีกครั้ง
```

### ⏳ Pending
```
⏳ รอการตรวจสอบ

ข้อมูลการยืนยันตัวตนของคุณอยู่ระหว่างการตรวจสอบ
เราจะแจ้งให้ทราบเมื่อเสร็จสิ้น
```

---

## 🔒 Security Features

### 1. Webhook Signature Verification
Webhook จะตรวจสอบ signature ด้วย HMAC-SHA256:

```typescript
// Header: x-uppass-signature
const signature = crypto
  .createHmac('sha256', UPPASS_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');
```

### 2. HTTPS Only
Webhook endpoint ต้องใช้ HTTPS เสมอใน production

### 3. Idempotency
Webhook สามารถถูกเรียกซ้ำได้โดยไม่เกิดปัญหา (ใช้ `slug` เป็น unique key)

---

## 🧪 Testing Webhook Locally

### 1. ใช้ ngrok
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# Use: https://abc123.ngrok.io/api/ekyc/webhook
```

### 2. ทดสอบด้วย cURL
```bash
curl -X POST https://your-domain.com/api/ekyc/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": {"type": "submit_form", "created_at": "2024-01-01T00:00:00Z"},
    "application": {
      "slug": "test-slug-123",
      "status": "accepted"
    }
  }'
```

### 3. ดู Logs
```bash
# Check webhook logs
tail -f .next/server.log

# Or check Vercel logs if deployed
vercel logs --follow
```

---

## 🚀 Deployment Checklist

- [ ] ตั้งค่า environment variables ใน production
- [ ] อัพเดท webhook URL ใน UpPass Dashboard เป็น production URL
- [ ] ทดสอบ webhook ด้วย test event จาก UpPass
- [ ] ตรวจสอบ LINE notification ทำงานถูกต้อง
- [ ] ตรวจสอบ database updates
- [ ] Setup monitoring/alerts สำหรับ webhook failures

---

## 📊 Monitoring

### Database Checks
```sql
-- Check KYC status distribution
SELECT kyc_status, COUNT(*) 
FROM pawners 
GROUP BY kyc_status;

-- Check recent KYC verifications
SELECT customer_id, firstname, lastname, kyc_status, kyc_verified_at
FROM pawners
WHERE kyc_verified_at > NOW() - INTERVAL '7 days'
ORDER BY kyc_verified_at DESC;

-- Check failed verifications
SELECT customer_id, firstname, lastname, kyc_rejection_reason
FROM pawners
WHERE kyc_status = 'REJECTED'
ORDER BY updated_at DESC;
```

### API Logs
```bash
# Check webhook success rate
grep "eKYC Webhook" logs/*.log | wc -l

# Check errors
grep "Webhook Handler Error" logs/*.log
```

---

## ❓ Troubleshooting

### Webhook ไม่ทำงาน
1. ✅ ตรวจสอบ URL ใน UpPass Dashboard
2. ✅ ตรวจสอบ HTTPS certificate
3. ✅ ตรวจสอบ environment variables
4. ✅ ดู error logs

### LINE notification ไม่ส่ง
1. ✅ ตรวจสอบ LINE_CHANNEL_ACCESS_TOKEN
2. ✅ ตรวจสอบว่า user เป็นเพื่อนกับ LINE OA
3. ✅ ตรวจสอบ quota ของ LINE Messaging API

### Database ไม่อัพเดท
1. ✅ ตรวจสอบ `uppass_slug` mapping
2. ✅ ตรวจสอบ Supabase connection
3. ✅ ตรวจสอบ RLS policies

---

## 📞 Support

- UpPass Documentation: https://docs.uppass.io
- LINE Messaging API: https://developers.line.biz
- Supabase Docs: https://supabase.com/docs

