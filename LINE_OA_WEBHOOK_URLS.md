# LINE OA Webhook URLs Configuration

## Overview
ระบบมี 3 LINE Official Accounts ที่ใช้ LIFF และ Webhooks แยกกัน

---

## 1. LINE OA: Pawner (ผู้จำนำ)

### Channel Information
- **Channel Access Token**: `<REDACTED>`
- **Channel Secret**: `<REDACTED>`

### LIFF IDs
- Register: `2008216710-BEZ5XNyd`
- Pawn: `2008216710-54P86MRY`
- Contracts: `2008216710-WJXR6xOM`
- Store: `2008216710-de1ovYZL`

### Webhook URL
```
https://pawn360.vercel.app/api/webhook
```

### Endpoint Path
```
/api/webhook
```

---

## 2. LINE OA: Investor (ผู้ลงทุน)

### Channel Information
- **Channel Access Token**: `<REDACTED>`
- **LINE Login Channel ID**: `2008641671`
- **LINE Login Channel Secret**: `6f79e8ce87f74bfd2bd6b772a1f651f5`
- **LINE Channel ID**: `2008641309`

### LIFF IDs
- **Investor Offers**: `2008641671-nPVX9OM2`
  - Environment Variable: `NEXT_PUBLIC_LIFF_ID_INVESTOR_OFFERS`
  - Endpoint URL: `https://pawn360.vercel.app/investor-offers`

### Webhook URL
```
https://pawn360.vercel.app/api/webhooks/line-invest
```

### Endpoint Path
```
/api/webhooks/line-invest
```

---

## 3. LINE OA: Drop Point (จุดรับฝาก)

### Channel Information
- **Channel Access Token**: `LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT` (ใส่ค่าใน env)
- **Channel Secret**: `LINE_CHANNEL_SECRET_DROPPOINT` (ใส่ค่าใน env)

### LIFF IDs
- Register: `NEXT_PUBLIC_LIFF_ID_DROPPOINT_REGISTER` (ใส่ค่าใน env)
- Verify: `NEXT_PUBLIC_LIFF_ID_DROPPOINT_VERIFY` (ใส่ค่าใน env)

### Webhook URL
```
https://pawn360.vercel.app/api/webhook-droppoint
```

### Endpoint Path
```
/api/webhook-droppoint
```

---

## สรุป Webhook URLs สำหรับตั้งค่าใน LINE Developers Console

| LINE OA | Webhook URL | Endpoint Path |
|---------|------------|---------------|
| **Pawner** | `https://pawn360.vercel.app/api/webhook` | `/api/webhook` |
| **Investor** | `https://pawn360.vercel.app/api/webhooks/line-invest` | `/api/webhooks/line-invest` |
| **Drop Point** | `https://pawn360.vercel.app/api/webhook-droppoint` | `/api/webhook-droppoint` |

---

## LIFF Endpoint URLs สำหรับตั้งค่าใน LINE Developers Console

### Investor - Offers Page
- **LIFF ID**: `2008641671-nPVX9OM2`
- **Endpoint URL**: `https://pawn360.vercel.app/investor-offers`
- **Description**: หน้าแสดงข้อเสนอใหม่สำหรับนักลงทุน

---

## วิธีตั้งค่าใน LINE Developers Console

### 1. ตั้งค่า Webhook
1. ไปที่ [LINE Developers Console](https://developers.line.biz/console/)
2. เลือก Provider และ Channel ที่ต้องการ
3. ไปที่แท็บ "Messaging API"
4. ในส่วน "Webhook settings":
   - Webhook URL: ใส่ URL ตามตารางด้านบน
   - Use webhook: เปิดใช้งาน
   - Verify: กดปุ่ม Verify เพื่อตรวจสอบ

### 2. ตั้งค่า LIFF
1. ไปที่แท็บ "LIFF"
2. เลือก LIFF app ที่ต้องการแก้ไข (หรือสร้างใหม่)
3. Endpoint URL: ใส่ URL ตามตารางด้านบน
4. Size: Full (แนะนำ)
5. Scope: profile, openid
6. Bot link feature: On (ถ้าต้องการ)

---

## Auto-Generate Pawn Ticket System

### วิธีการทำงาน
1. เมื่อ `contract_status` เปลี่ยนเป็น `CONFIRMED`
2. Database trigger จะเพิ่ม contract ลงใน `pawn_ticket_generation_queue`
3. Vercel Cron Job (ทุก 5 นาที) จะ:
   - ดึง contracts ที่รออยู่ใน queue
   - ส่ง LINE message พร้อม link ไปยัง Pawner และ Investor
   - Pawner/Investor คลิก link เพื่อดูและบันทึกตั๋วจำนำ
   - เมื่อบันทึก รูปจะถูกอัปโหลดไป AWS S3 อัตโนมัติ

### API Endpoints
- **Process Queue**: `POST /api/contracts/process-ticket-queue`
- **Check Queue Status**: `GET /api/contracts/process-ticket-queue`
- **Manual Trigger**: `POST /api/contracts/auto-generate-ticket`

---

## Environment Variables ที่ต้องตั้งค่าใน Vercel

```env
# Pawner LINE OA
LINE_CHANNEL_ACCESS_TOKEN=<REDACTED>
LINE_CHANNEL_SECRET=<REDACTED>

# Investor LINE OA
LINE_CHANNEL_ACCESS_TOKEN_INVEST=<REDACTED>
LINE_LOGIN_CHANNEL_ID_INVEST=2008641671
LINE_LOGIN_CHANNEL_SECRET_INVEST=<REDACTED>
LINE_CHANNEL_ID_INVEST=2008641309

# Drop Point LINE OA
LINE_CHANNEL_ACCESS_TOKEN_DROPPOINT=your-token-here
LINE_CHANNEL_SECRET_DROPPOINT=your-secret-here

# LIFF IDs
NEXT_PUBLIC_LIFF_ID_INVESTOR_OFFERS=2008641671-nPVX9OM2

# AWS S3
AWS_ACCESS_KEY_ID=your-aws-access-key-id-here
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key-here
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=piwp360
AWS_S3_FOLDER=cont360/

# Base URL
NEXT_PUBLIC_BASE_URL=https://pawn360.vercel.app
```

---

## การทดสอบ Webhook

### 1. ทดสอบ Webhook Pawner
```bash
curl -X POST https://pawn360.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"events": []}'
```

### 2. ทดสอบ Webhook Investor
```bash
curl -X POST https://pawn360.vercel.app/api/webhooks/line-invest \
  -H "Content-Type: application/json" \
  -d '{"events": []}'
```

### 3. ทดสอบ Auto-Generate
```bash
curl -X POST https://pawn360.vercel.app/api/contracts/auto-generate-ticket \
  -H "Content-Type: application/json" \
  -d '{"contractId": "your-contract-id-here"}'
```

### 4. ตรวจสอบ Queue Status
```bash
curl https://pawn360.vercel.app/api/contracts/process-ticket-queue
```

---

## Notes
- Webhook URLs ต้องเป็น HTTPS เท่านั้น
- LINE จะ verify webhook โดยส่ง POST request มาที่ URL
- ตรวจสอบให้แน่ใจว่า API routes ทั้งหมดมีอยู่และทำงานได้
- Cron job จะรันทุก 5 นาที (ปรับได้ใน `vercel.json`)
