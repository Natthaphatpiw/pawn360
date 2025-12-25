# 🚀 Async Redemption & Extension Flow - Setup Guide

## 📋 Overview

ระบบใหม่นี้เปลี่ยนแปลง flow การไถ่ถอนและต่อดอกเบี้ยจาก **synchronous** (ลูกค้าส่งสลิปทันที) เป็น **asynchronous** (ลูกค้าส่งคำขอ → พนักงานอนุมัติ → ส่ง QR code → ลูกค้าจ่ายเงิน → ส่งสลิป)

---

## 🔄 New Flow

### ไถ่ถอนสัญญา (Redemption)

```
1. ลูกค้ากดปุ่ม "ไถ่ถอนสินค้า" ใน LIFF
   ↓
2. Customer System ส่งคำขอไปที่ Shop System
   API: POST /api/notifications/redemption
   ↓
3. พนักงานร้านเห็นคำขอใน Monitor
   ↓
4. พนักงานยืนยัน/ปฏิเสธ
   ↓
5. Shop System ส่ง webhook กลับมาที่ Customer System
   Endpoint: POST /api/webhooks/shop-notification
   Type: action_response
   ↓
6. Customer System ส่ง LINE Flex Message Card พร้อม QR code
   ↓
7. ลูกค้าสแกน QR → โอนเงิน
   ↓
8. ลูกค้ากดปุ่ม "อัพโหลดสลิป" ใน LINE
   ↓
9. ลูกค้าส่งรูปสลิปใน LINE Chat
   ↓
10. Customer System รับรูป → อัพโหลดไป S3 → ส่งไป Shop System
    API: POST /api/notifications/payment-proof
    ↓
11. พนักงานตรวจสอบสลิป
    ↓
12. Shop System ส่ง webhook แจ้งผลการตรวจสอบ
    Type: payment_verified
    ↓
13. Customer System ส่ง LINE message แจ้งสำเร็จ/ไม่สำเร็จ
```

### ต่อดอกเบี้ย (Extension)

Flow เหมือนกับไถ่ถอน แต่เปลี่ยน API endpoint และ message content

---

## 📦 Files Created

### 1. Database Models
- [lib/db/models.ts](lib/db/models.ts) - เพิ่ม `Notification` interface

### 2. Security Utilities
- [lib/security/webhook.ts](lib/security/webhook.ts) - Webhook signature verification

### 3. LINE Templates
- [lib/line/flex-templates.ts](lib/line/flex-templates.ts) - Flex Message templates สำหรับ:
  - QR code card
  - Rejection message
  - Payment success
  - Payment failure
  - Pending approval

### 4. API Endpoints

#### Customer APIs
- [app/api/customer/request-redemption/route.ts](app/api/customer/request-redemption/route.ts)
  - รับคำขอไถ่ถอนจากลูกค้า
  - ส่งไปที่ Shop System
  - บันทึก notification ลง database
  - ส่ง LINE message แจ้งรอการอนุมัติ

- [app/api/customer/request-extension/route.ts](app/api/customer/request-extension/route.ts)
  - รับคำขอต่อดอกเบี้ยจากลูกค้า
  - ส่งไปที่ Shop System
  - บันทึก notification ลง database
  - ส่ง LINE message แจ้งรอการอนุมัติ

- [app/api/customer/upload-payment-proof/route.ts](app/api/customer/upload-payment-proof/route.ts)
  - รับสลิปจาก LINE (image message ID) หรือ web (file upload)
  - ดาวน์โหลดรูปจาก LINE API
  - อัพโหลดไป S3
  - ส่งสลิปไป Shop System
  - ส่ง LINE message แจ้งอัพโหลดสำเร็จ

#### Webhook Receiver
- [app/api/webhooks/shop-notification/route.ts](app/api/webhooks/shop-notification/route.ts)
  - รับ webhook จาก Shop System
  - Verify signature และ timestamp
  - ตรวจสอบ idempotency (ไม่ประมวลผล webhook ซ้ำ)
  - จัดการตาม type:
    - `action_response` → ส่ง QR code หรือ rejection message
    - `payment_received` → อัพเดตสถานะ
    - `payment_verified` → ส่ง success/failure message

### 5. Updated Files
- [app/api/webhook/route.ts](app/api/webhook/route.ts)
  - เพิ่ม handler สำหรับ `message` event (รับรูปสลิป)
  - เพิ่ม handler สำหรับ `upload_slip` postback action

- [app/contract-actions/[contractId]/page.tsx](app/contract-actions/[contractId]/page.tsx)
  - แก้ `handleAction('redeem')` ให้เรียก API ใหม่
  - แก้ `handleAction('renew')` ให้เรียก API ใหม่
  - เพิ่ม LIFF initialization เพื่อดึง LINE User ID

---

## 🔧 Environment Variables Required

เพิ่ม environment variables เหล่านี้ใน Vercel:

```bash
# Shop System URL (Production)
SHOP_SYSTEM_URL=https://pawn360-ver.vercel.app

# Webhook Security Secret (ต้องตรงกับ Shop System)
WEBHOOK_SECRET=pawn360-webhook-secret

# Existing variables (ตรวจสอบว่ามีอยู่แล้ว)
NEXT_PUBLIC_BASE_URL=https://pawn360.vercel.app
LINE_CHANNEL_ACCESS_TOKEN=<REDACTED>
LINE_CHANNEL_SECRET=<REDACTED>
NEXT_PUBLIC_LIFF_ID_CONTRACTS=2008216710-WJXR6xOM
```

---

## 🗄️ Database Collections

### `notifications` Collection

ใช้เก็บข้อมูลการร้องขอและสถานะการดำเนินการ

```typescript
{
  _id: ObjectId,
  shopNotificationId: "REDEMPTION-1234567890-contractId",
  contractId: ObjectId,
  customerId: ObjectId,
  lineUserId: "U1234567890abcdef",
  type: "redemption" | "extension",
  status: "pending" | "confirmed" | "rejected" | "payment_pending" | "payment_uploaded" | "completed" | "failed",
  amount: 50000,
  message: "ลูกค้าต้องการไถ่ถอนสัญญา",
  qrCodeUrl: "https://...",
  paymentProofUrl: "https://...",
  callbackUrl: "https://pawn360.vercel.app/api/webhooks/shop-notification",
  shopResponse: {
    action: "confirm",
    confirmed: true,
    message: "อนุมัติแล้ว",
    qrCodeUrl: "https://...",
    timestamp: ISODate("2024-01-01T00:00:00Z")
  },
  paymentVerification: {
    verified: true,
    message: "ชำระเงินสำเร็จ",
    timestamp: ISODate("2024-01-01T00:00:00Z")
  },
  awaitingSlipUpload: true,  // temporary flag
  lastWebhookAt: ISODate("2024-01-01T00:00:00Z"),
  createdAt: ISODate("2024-01-01T00:00:00Z"),
  updatedAt: ISODate("2024-01-01T00:00:00Z")
}
```

**Indexes:**
```javascript
db.notifications.createIndex({ shopNotificationId: 1 }, { unique: true });
db.notifications.createIndex({ lineUserId: 1, status: 1 });
db.notifications.createIndex({ contractId: 1 });
db.notifications.createIndex({ createdAt: -1 });
```

---

## 🧪 Testing

### Test Redemption Flow

1. **ลูกค้าส่งคำขอ:**
   ```bash
   curl -X POST https://pawn360.vercel.app/api/customer/request-redemption \
     -H "Content-Type: application/json" \
     -d '{
       "contractId": "60f7b1234567890123456789",
       "lineUserId": "U1234567890abcdef",
       "message": "ลูกค้าต้องการไถ่ถอนสัญญา"
     }'
   ```

2. **Shop System ส่ง webhook (Confirm):**
   ```bash
   curl -X POST https://pawn360.vercel.app/api/webhooks/shop-notification \
     -H "Content-Type: application/json" \
     -H "X-Webhook-Signature: <signature>" \
     -d '{
       "notificationId": "REDEMPTION-1234567890-contractId",
       "type": "action_response",
       "data": {
         "action": "confirm",
         "confirmed": true,
         "message": "อนุมัติแล้ว กรุณาชำระเงิน",
         "qrCodeUrl": "https://piwp360.s3.ap-southeast-2.amazonaws.com/bank/QRCode.png",
         "storeId": "...",
         "customerId": "...",
         "contractId": "...",
         "status": "confirmed"
       },
       "timestamp": "2024-01-01T00:00:00.000Z",
       "shopSystemUrl": "https://pawn360-ver.vercel.app"
     }'
   ```

3. **ลูกค้าอัพโหลดสลิป:**
   - กดปุ่ม "อัพโหลดสลิป" ใน LINE Flex Message
   - ส่งรูปภาพใน LINE Chat

4. **Shop System ส่ง webhook (Payment Verified):**
   ```bash
   curl -X POST https://pawn360.vercel.app/api/webhooks/shop-notification \
     -H "Content-Type: application/json" \
     -H "X-Webhook-Signature: <signature>" \
     -d '{
       "notificationId": "REDEMPTION-1234567890-contractId",
       "type": "payment_verified",
       "data": {
         "verified": true,
         "message": "การชำระเงินสำเร็จ สามารถมารับสินค้าได้ที่ร้าน",
         "storeId": "...",
         "customerId": "...",
         "contractId": "...",
         "status": "completed"
       },
       "timestamp": "2024-01-01T00:00:00.000Z",
       "shopSystemUrl": "https://pawn360-ver.vercel.app"
     }'
   ```

### Generate Webhook Signature

```javascript
const crypto = require('crypto');

const secret = 'pawn360-webhook-secret';
const notificationId = 'REDEMPTION-1234567890-contractId';
const timestamp = '2024-01-01T00:00:00.000Z';

const signature = crypto
  .createHmac('sha256', secret)
  .update(`${notificationId}-${timestamp}`)
  .digest('hex');

console.log('X-Webhook-Signature:', signature);
```

---

## 📊 Monitoring

### Logs to Watch

Customer System จะ log ข้อมูลสำคัญ:

```
✓ Received webhook: { notificationId, type, timestamp }
✓ Sent QR code to customer: U1234567890abcdef
✓ Sent rejection to customer: U1234567890abcdef
✓ Payment verified successfully for customer: U1234567890abcdef
✓ Slip uploaded successfully for notification: REDEMPTION-...
```

### Webhook Errors

```
✗ Invalid webhook signature
✗ Webhook timestamp too old
✗ Notification not found: REDEMPTION-...
✗ Contract not found: 60f7b1234567890123456789
```

---

## 🔒 Security

### 1. Webhook Signature Verification

ทุก webhook จาก Shop System จะถูกตรวจสอบ signature:

```typescript
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(`${notificationId}-${timestamp}`)
  .digest('hex');
```

### 2. Timestamp Validation

Webhook ที่เก่ากว่า 5 นาทีจะถูกปฏิเสธ (ป้องกัน replay attack)

### 3. Idempotency

Webhook ที่ซ้ำจะถูก skip (ไม่ประมวลผลซ้ำ)

---

## 🚨 Error Handling

### Customer APIs
- ✅ ตรวจสอบข้อมูลครบถ้วน
- ✅ ตรวจสอบสถานะสัญญา
- ✅ Retry logic เมื่อเชื่อมต่อ Shop System ไม่ได้
- ✅ ส่ง LINE message แม้ว่า Shop System fail

### Webhook Receiver
- ✅ Validate signature
- ✅ Validate timestamp
- ✅ Check idempotency
- ✅ ส่ง LINE message แม้ว่าบางส่วน fail
- ✅ Log errors สำหรับ debugging

### LINE Integration
- ✅ Handle ส่ง message fail
- ✅ Handle ดาวน์โหลดรูปจาก LINE fail
- ✅ แสดง error message ให้ user

---

## 🎯 Next Steps

1. **Deploy to Vercel:**
   ```bash
   git add .
   git commit -m "Add async redemption and extension flow"
   git push origin main
   ```

2. **Add Environment Variables** in Vercel Dashboard

3. **Create MongoDB Indexes:**
   ```javascript
   db.notifications.createIndex({ shopNotificationId: 1 }, { unique: true });
   db.notifications.createIndex({ lineUserId: 1, status: 1 });
   db.notifications.createIndex({ contractId: 1 });
   ```

4. **Test End-to-End:**
   - Test redemption flow
   - Test extension flow
   - Test rejection flow
   - Test payment verification flow

5. **Monitor Logs** in Vercel Dashboard

---

## 📚 API Documentation

### POST /api/customer/request-redemption

**Request:**
```json
{
  "contractId": "60f7b1234567890123456789",
  "lineUserId": "U1234567890abcdef",
  "message": "ลูกค้าต้องการไถ่ถอนสัญญา"
}
```

**Response:**
```json
{
  "success": true,
  "message": "ส่งคำขอไถ่ถอนเรียบร้อยแล้ว รอพนักงานดำเนินการ",
  "notificationId": "REDEMPTION-1234567890-contractId",
  "amount": 50000
}
```

### POST /api/customer/request-extension

เหมือนกับ `/request-redemption` แต่ type เป็น `extension`

### POST /api/customer/upload-payment-proof

**Request (JSON):**
```json
{
  "notificationId": "REDEMPTION-1234567890-contractId",
  "lineUserId": "U1234567890abcdef",
  "imageId": "1234567890"
}
```

**Request (FormData):**
```
notificationId: "REDEMPTION-1234567890-contractId"
lineUserId: "U1234567890abcdef"
file: <File>
```

**Response:**
```json
{
  "success": true,
  "message": "อัพโหลดสลิปสำเร็จ กำลังรอพนักงานตรวจสอบ",
  "slipUrl": "https://piwp360.s3.ap-southeast-2.amazonaws.com/slips/slip-..."
}
```

### POST /api/webhooks/shop-notification

**Headers:**
```
X-Webhook-Signature: <hmac-sha256-signature>
```

**Request:**
```json
{
  "notificationId": "REDEMPTION-1234567890-contractId",
  "type": "action_response" | "payment_received" | "payment_verified",
  "data": {
    "action": "confirm" | "reject",
    "confirmed": true | false,
    "message": "string",
    "qrCodeUrl": "string",
    "verified": true | false,
    "storeId": "string",
    "customerId": "string",
    "contractId": "string",
    "status": "string"
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "shopSystemUrl": "https://pawn360-ver.vercel.app"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully"
}
```

---

## 🎉 Summary

ระบบใหม่นี้ทำให้:
- ✅ ลูกค้าไม่ต้องส่งสลิปก่อนพนักงานอนุมัติ
- ✅ พนักงานมีเวลาตรวจสอบคำขอก่อนสร้าง QR code
- ✅ ลูกค้าได้รับ QR code แบบ real-time ผ่าน LINE
- ✅ Asynchronous workflow ที่ทนต่อ timeout
- ✅ Webhook-based communication ระหว่างสองระบบ
- ✅ Idempotency และ security features

**Flow ใหม่นี้จะทำให้ประสบการณ์การใช้งานของลูกค้าและพนักงานดีขึ้นอย่างมาก!** 🚀
