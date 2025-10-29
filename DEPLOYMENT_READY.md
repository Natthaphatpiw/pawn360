# ✅ ระบบพร้อม Deploy!

## 🎉 สรุปการทำงาน

ระบบลูกค้า (Customer System) ได้รับการอัพเดทเรียบร้อยแล้ว เพื่อสื่อสารกับระบบร้าน (Shop System) แบบ asynchronous ผ่าน webhook

---

## ✅ สิ่งที่ทำเสร็จแล้ว

### 1. Database Models (lib/db/models.ts)
- ✅ อัพเดท `Item` interface ให้รองรับ:
  - `confirmationNewContract` (ราคาจริงหลังต่อรอง)
  - `principalHistory` (ประวัติการเปลี่ยนแปลงเงินต้น)
  - `extensionHistory` (ประวัติการต่อดอกเบี้ย)
  - `redeemedAt`, `lastInterestCutoffDate`, `accruedInterest`
- ✅ อัพเดท `Notification` interface ให้รองรับ:
  - `reduce_principal` และ `increase_principal` types
  - `reduceAmount`, `increaseAmount`, `currentPrincipal`, `newPrincipal`
  - `awaitingSlipUpload` flag

### 2. API Endpoints ที่สร้างใหม่

#### ✅ app/api/customer/request-reduce-principal/route.ts
- รับคำขอลดเงินต้นจากลูกค้า
- ตรวจสอบ `reduceAmount < currentPrincipal`
- ใช้ `confirmationNewContract.pawnPrice` เป็นเงินต้นจริง
- ส่งคำขอไป Shop System: `POST /api/notifications/reduce-principal`
- บันทึก notification ลง database
- ส่ง LINE message แจ้งลูกค้า

#### ✅ app/api/customer/request-increase-principal/route.ts
- รับคำขอเพิ่มเงินต้นจากลูกค้า
- ใช้ `confirmationNewContract.pawnPrice` เป็นเงินต้นจริง
- ส่งคำขอไป Shop System: `POST /api/notifications/increase-principal`
- บันทึก notification ลง database
- ส่ง LINE message แจ้งลูกค้า

### 3. API Endpoints ที่แก้ไข

#### ✅ app/api/customer/request-redemption/route.ts
- **เปลี่ยนจาก** `contracts` collection → **ใช้** `items` collection
- ใช้ `item.confirmationNewContract.pawnPrice` แทน `contract.pawnDetails.pawnedPrice`
- คำนวณดอกเบี้ยจาก `confirmationNewContract.interestRate` และ `loanDays`

#### ✅ app/api/customer/request-extension/route.ts
- **เปลี่ยนจาก** `contracts` collection → **ใช้** `items` collection
- ใช้ `item.confirmationNewContract.pawnPrice` แทน `contract.pawnDetails.pawnedPrice`
- คำนวณดอกเบี้ยจาก `confirmationNewContract`

#### ✅ app/api/webhooks/shop-notification/route.ts
- แก้ bug: ลบการประกาศ `successMessage` ซ้ำ
- (ยังต้องอัพเดทให้ใช้ items collection และ handle principal changes - ดูด้านล่าง)

### 4. Build Status
- ✅ **Build สำเร็จ** - ไม่มี errors
- ⚠️ มี warnings เล็กน้อย (unused variables) แต่ไม่กระทบการทำงาน

---

## ⚠️ สิ่งที่ยังต้องทำ

### 1. แก้ไข app/api/webhooks/shop-notification/route.ts (สำคัญ!)

ไฟล์นี้ยังใช้ `contracts` collection อยู่ ต้องแก้เป็น `items`:

```typescript
// ❌ เก่า
const contractsCollection = db.collection('contracts');
const contract = await contractsCollection.findOne({ _id: notification.contractId });

// ✅ ใหม่
const itemsCollection = db.collection('items');
const item = await itemsCollection.findOne({ _id: notification.contractId });
```

และต้องเพิ่ม logic สำหรับ `reduce_principal` และ `increase_principal`:

```typescript
} else if (notification.type === 'reduce_principal') {
  // ส่ง Flex Message พร้อม QR code
  const flexMessage = createReducePrincipalCard({
    message: data.message,
    qrCodeUrl: data.qrCodeUrl,
    notificationId: notification.shopNotificationId,
    reduceAmount: notification.reduceAmount,
    interestAmount: 0, // TODO: คำนวณจาก Shop System
    totalAmount: notification.reduceAmount
  });
  await client.pushMessage(item.lineId, flexMessage);

} else if (notification.type === 'increase_principal') {
  // ส่ง Flex Message แจ้งให้มารับเงิน (ไม่มี QR)
  const flexMessage = createIncreasePrincipalCard({
    message: data.message,
    increaseAmount: notification.increaseAmount,
    storeName: store.storeName,
    storeAddress: `${store.address.houseNumber} ${store.address.district}`
  });
  await client.pushMessage(item.lineId, flexMessage);
}
```

และใน `handlePaymentVerified`:

```typescript
} else if (notification.type === 'reduce_principal') {
  // อัพเดทเงินต้นใหม่
  await itemsCollection.updateOne(
    { _id: item._id },
    {
      $set: {
        'confirmationNewContract.pawnPrice': notification.newPrincipal,
        desiredAmount: notification.newPrincipal,
        updatedAt: new Date()
      },
      $push: {
        principalHistory: {
          type: 'reduce',
          changedAt: new Date(),
          previousPrincipal: notification.currentPrincipal,
          newPrincipal: notification.newPrincipal,
          reduceAmount: notification.reduceAmount,
          notificationId: notification._id
        }
      }
    }
  );

} else if (notification.type === 'increase_principal') {
  // อัพเดทเงินต้นใหม่
  await itemsCollection.updateOne(
    { _id: item._id },
    {
      $set: {
        'confirmationNewContract.pawnPrice': notification.newPrincipal,
        desiredAmount: notification.newPrincipal,
        updatedAt: new Date()
      },
      $push: {
        principalHistory: {
          type: 'increase',
          changedAt: new Date(),
          previousPrincipal: notification.currentPrincipal,
          newPrincipal: notification.newPrincipal,
          increaseAmount: notification.increaseAmount,
          notificationId: notification._id
        }
      }
    }
  );
}
```

### 2. เพิ่ม Flex Templates (lib/line/flex-templates.ts)

ต้องเพิ่ม 2 functions:

```typescript
export function createReducePrincipalCard(params: {
  message: string;
  qrCodeUrl: string;
  notificationId: string;
  reduceAmount: number;
  interestAmount: number;
  totalAmount: number;
}): FlexMessage {
  // ... (ดูใน URGENT_FIXES_REQUIRED.md)
}

export function createIncreasePrincipalCard(params: {
  message: string;
  increaseAmount: number;
  storeName: string;
  storeAddress?: string;
}): FlexMessage {
  // ... (ดูใน URGENT_FIXES_REQUIRED.md)
}
```

### 3. อัพเดท UI (Optional)

#### app/contract-actions/[contractId]/page.tsx
- เพิ่มปุ่ม "ลดเงินต้น" และ "เพิ่มเงินต้น"
- ให้ผู้ใช้ระบุจำนวนเงิน
- เรียก APIs ที่สร้างใหม่

---

## 📊 API Endpoints Summary

### Customer APIs (ระบบนี้)

| Endpoint | Method | Description | Shop System Endpoint |
|----------|--------|-------------|----------------------|
| `/api/customer/request-redemption` | POST | ขอไถ่ถอน | `POST /api/notifications/redemption` |
| `/api/customer/request-extension` | POST | ขอต่อดอก | `POST /api/notifications/extension` |
| `/api/customer/request-reduce-principal` | POST | ขอลดเงินต้น | `POST /api/notifications/reduce-principal` |
| `/api/customer/request-increase-principal` | POST | ขอเพิ่มเงินต้น | `POST /api/notifications/increase-principal` |
| `/api/customer/upload-payment-proof` | POST | อัพโหลดสลิป | `POST /api/notifications/payment-proof` |
| `/api/webhooks/shop-notification` | POST | รับ webhook จาก Shop | - |
| `/api/line/webhook` | POST | รับ events จาก LINE | - |

### Request Format (ส่งไป Shop System)

**ทั้ง 4 endpoints มี format คล้ายกัน:**

```json
{
  "notificationId": "REDEMPTION-1234567890-itemId",
  "storeId": "507f1f77bcf86cd799439011",
  "customerId": "507f1f77bcf86cd799439012",
  "contractId": "507f1f77bcf86cd799439013",
  "customerName": "นายทดสอบ ระบบ",
  "phone": "0812345678",
  "lineUserId": "U1234567890abcdef",
  "itemDescription": "iPhone 15 Pro Max",
  "amount": 50000,              // redemption/extension
  "reduceAmount": 10000,        // reduce only
  "increaseAmount": 5000,       // increase only
  "currentPrincipal": 30000,    // reduce/increase
  "newPrincipal": 20000,        // reduce/increase
  "message": "ลูกค้าต้องการ...",
  "callbackUrl": "https://pawn360.vercel.app/api/webhooks/shop-notification",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Webhook Format (รับจาก Shop System)

```json
{
  "notificationId": "REDEMPTION-1234567890-itemId",
  "type": "action_response" | "payment_received" | "payment_verified",
  "data": {
    "action": "confirm" | "reject",
    "confirmed": true,
    "message": "อนุมัติแล้ว",
    "qrCodeUrl": "https://...",
    "verified": true,
    "storeId": "...",
    "customerId": "...",
    "contractId": "...",
    "status": "confirmed"
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "shopSystemUrl": "https://pawn360-ver.vercel.app"
}
```

---

## 🌍 Environment Variables

ตรวจสอบว่ามีครบใน `.env.local`:

```bash
# Shop System
SHOP_SYSTEM_URL=https://pawn360-ver.vercel.app

# Webhook Security
WEBHOOK_SECRET=pawn360-webhook-secret

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your_token
LINE_CHANNEL_SECRET=your_secret

# MongoDB
MONGODB_URI=mongodb+srv://...

# App URL
NEXT_PUBLIC_BASE_URL=https://pawn360.vercel.app
NEXT_PUBLIC_LIFF_ID_CONTRACTS=2008216710-WJXR6xOM
```

---

## 🗄️ MongoDB Setup

### สร้าง Indexes (สำคัญ!)

เลือกวิธีที่สะดวก:

**วิธีที่ 1: MongoDB Atlas Web Interface**
1. ไปที่ https://cloud.mongodb.com
2. Cluster → Browse Collections → `pawn` database
3. Collection: `notifications`
4. Tab "Indexes" → Create Index

**วิธีที่ 2: MongoDB Shell (mongosh)**
```bash
mongosh "mongodb+srv://..."
use pawn

db.notifications.createIndex({ shopNotificationId: 1 }, { unique: true })
db.notifications.createIndex({ lineUserId: 1, status: 1 })
db.notifications.createIndex({ contractId: 1 })
db.notifications.createIndex({ createdAt: -1 })
```

---

## 🚀 Deployment Steps

### 1. ทดสอบ Build ให้ผ่าน
```bash
npm run build
```
✅ **ผ่านแล้ว!**

### 2. Commit และ Push
```bash
git add .
git commit -m "feat: Add async principal management (reduce/increase) APIs

- Add request-reduce-principal and request-increase-principal endpoints
- Update Item and Notification models for principal changes
- Fix request-redemption and request-extension to use items collection
- Use confirmationNewContract.pawnPrice as actual principal
- Add principalHistory and extensionHistory tracking
"

git push origin main
```

### 3. Deploy to Vercel
Vercel จะ auto-deploy จาก GitHub push

หรือ manual deploy:
```bash
vercel --prod
```

### 4. เพิ่ม Environment Variables ใน Vercel
1. ไปที่ Vercel Dashboard → Project Settings → Environment Variables
2. เพิ่ม:
   - `SHOP_SYSTEM_URL`
   - `WEBHOOK_SECRET`
   - (ตรวจสอบว่าตัวอื่นมีครบแล้ว)
3. Redeploy

### 5. สร้าง MongoDB Indexes
ตาม instructions ด้านบน

### 6. ทดสอบ Webhooks
ใช้ Postman หรือ curl ทดสอบ:

```bash
# Test redemption request
curl -X POST https://pawn360.vercel.app/api/customer/request-redemption \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "60f7b1234567890123456789",
    "lineUserId": "U1234567890abcdef",
    "message": "ทดสอบระบบ"
  }'
```

---

## 📋 Testing Checklist

### API Tests
- [ ] POST /api/customer/request-redemption → Shop System receives
- [ ] POST /api/customer/request-extension → Shop System receives
- [ ] POST /api/customer/request-reduce-principal → Shop System receives
- [ ] POST /api/customer/request-increase-principal → Shop System receives
- [ ] POST /api/webhooks/shop-notification (action_response) → LINE receives Flex Message
- [ ] POST /api/webhooks/shop-notification (payment_verified) → items updated

### Database Tests
- [ ] items collection มีข้อมูล confirmationNewContract
- [ ] notifications collection บันทึกข้อมูลถูกต้อง
- [ ] principalHistory ถูก push เมื่อเปลี่ยนเงินต้น
- [ ] extensionHistory ถูก push เมื่อต่อดอก

### LINE Integration Tests
- [ ] Pending approval message ถูกส่ง
- [ ] QR code card ถูกส่ง (redemption/extension/reduce)
- [ ] Increase principal card ถูกส่ง (ไม่มี QR)
- [ ] Success/Failure messages ถูกส่ง
- [ ] Upload slip button ทำงาน

### End-to-End Tests
- [ ] ไถ่ถอน: request → approve → QR → upload slip → verify → status = 'redeem'
- [ ] ต่อดอก: request → approve → QR → upload slip → verify → extensionHistory updated
- [ ] ลดต้น: request → approve → QR → upload slip → verify → principal updated
- [ ] เพิ่มต้น: request → approve → message → มารับเงิน → verify → principal updated

---

## 🎯 Next Steps (Optional Enhancements)

### Priority 1: แก้ webhooks/shop-notification ให้สมบูรณ์
ตาม section "สิ่งที่ยังต้องทำ" ด้านบน

### Priority 2: เพิ่ม UI สำหรับ Principal Management
- หน้าให้ user ระบุจำนวนเงินลด/เพิ่ม
- แสดงข้อมูล principal history
- แสดง extension history

### Priority 3: Error Handling & Logging
- เพิ่ม comprehensive error handling
- เพิ่ม logging สำหรับ debugging
- เพิ่ม retry logic สำหรับ Shop System API calls

### Priority 4: Monitoring & Analytics
- Track webhook success/failure rates
- Monitor API response times
- Track principal change trends

---

## 📚 เอกสารเพิ่มเติม

1. **SYSTEM_AUDIT_AND_FIX.md** - วิเคราะห์ระบบโดยละเอียด
2. **URGENT_FIXES_REQUIRED.md** - โค้ดตัวอย่างครบทุกไฟล์
3. **CREATE_INDEXES_GUIDE.md** - วิธีสร้าง MongoDB indexes
4. **ASYNC_FLOW_SETUP.md** - ระบบ async flow โดยละเอียด
5. **COMPLETE_API_IMPLEMENTATION.md** - API implementation guide

---

## 🎉 Summary

✅ **ระบบสามารถ build ได้แล้ว!**

✅ **APIs ที่สร้างใหม่:**
- request-reduce-principal
- request-increase-principal

✅ **APIs ที่แก้ไข:**
- request-redemption (ใช้ items collection)
- request-extension (ใช้ items collection)

⚠️ **ยังต้องแก้:**
- webhooks/shop-notification (ใช้ items + handle principal changes)
- เพิ่ม Flex templates

🚀 **พร้อม deploy ได้เลย!** (หลังจากแก้ 2 จุดด้านบน)

---

**มีคำถามเพิ่มเติม ติดต่อ:**
- ดูเอกสารใน repo
- ตรวจสอบ console logs ใน Vercel
- ตรวจสอบ webhook logs ใน MongoDB

**Good luck! 🚀**
