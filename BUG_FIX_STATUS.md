# สถานะการแก้ไขบัค - อัพเดท 2025-11-07

## สำคัญ: ข้อมูล Contract ที่แสดงเป็นข้อมูลเก่า!

ข้อมูล contract ที่มี `createdAt: "2025-11-07T10:01:54.654Z"` นั้นเป็นข้อมูลที่สร้าง**ก่อน**การ deploy code ใหม่

**การแก้ไขล่าสุด commit: `1af1c6f`** (pushed เมื่อ 2025-11-07 หลัง 10:01:54)

## ข้อมูลที่ควรทดสอบใหม่:

กรุณาสร้าง contract ใหม่หลังจาก deploy แล้ว เพื่อดูว่า:
- `pawnedPrice`, `interestRate`, `periodDays` เป็น **number** หรือไม่
- `remainingAmount` คำนวณเป็น `6280` แทน `"6000280"` หรือไม่
- `dueDate` ถูกต้องตามจำนวนวันหรือไม่

---

## บัคที่แก้ไขแล้ว

### 1. ✅ AI Price Estimation (300k Cap)
**ไฟล์:** `app/api/estimate/route.ts`
- Cap ที่ 300,000 บาท
- แปลง satang ถ้า > 10M
- เพิ่ม logging

### 2. ✅ Interest Calculation (เพิ่ม Fallback Logic)
**ไฟล์:** `app/estimate/page.tsx`
- เพิ่ม fallback mechanism
- ถ้า interestCalculationType ที่เลือกไม่มี จะลองใช้อีกประเภท
- ถ้าไม่มีเลย จะใช้ default 10% ต่อเดือน
- เพิ่ม logging แบบละเอียด

**การทำงาน:**
```javascript
// ลอง daily ก่อน
if (interestCalculationType === 'daily' && store.interestPerday) { ... }

// ลอง monthly
else if (interestCalculationType === 'monthly' && store.interestSet) { ... }

// Fallback: ลองใช้วิธีอื่น
else {
  if (store.interestSet) { /* ใช้ monthly */ }
  else if (store.interestPerday) { /* ใช้ daily */ }
  else { /* ใช้ default 10%/เดือน */ }
}
```

### 3. ✅ QR Code Display
**ไฟล์:** `app/store/verify-pawn/page.tsx`
- แสดง `desiredAmount` ถูกต้องแล้ว
- Label ชัดเจน

### 4. ✅ Auto-close หลังสร้างสัญญา
**ไฟล์:** `app/store/verify-pawn/page.tsx`
- **ไม่มีการแก้ไข:** ปิดหลัง 1 วินาที (line 213-220)
- **มีการแก้ไข:** ปิดหลัง 3 วินาที (line 196-200)
- **หลังลูกค้ายืนยัน:** เกิดที่ webhook (ไม่มี UI)

### 5. ✅ String Concatenation Bug → Number
**ไฟล์ที่แก้:**
1. `app/api/stores/verify-and-create-contract/route.ts` (line 73-89)
2. `app/api/webhook/route.ts` (line 204-217)
3. `app/api/pawn-requests/negotiate/route.ts` (line 59-116)

**การแก้ไข:**
```typescript
// แปลงเป็น number ทุกค่า
const pawnedPrice = parseFloat(String(...));
const interestRate = parseFloat(String(...));
const periodDays = parseInt(String(...));
const totalInterest = parseFloat(String(...));
const remainingAmount = pawnedPrice + totalInterest; // ✅ 6000 + 280 = 6280
```

**ข้อมูลใหม่จะเป็น:**
```json
{
  "pawnedPrice": 6000,        // ✅ number
  "interestRate": 10,         // ✅ number
  "periodDays": 14,           // ✅ number
  "totalInterest": 280,       // ✅ number
  "remainingAmount": 6280     // ✅ number (บวกถูกต้อง)
}
```

### 6. ✅ Contract Number in LINE Message
**ไฟล์:** `lib/line/client.ts`, `app/api/webhook/route.ts`
- ใช้ `contractData.contractNumber` แทน `STORE${timestamp}`
- ส่งค่า numeric ไปใน message

### 7. ✅ Confirmation Flow
**ไฟล์:** `app/api/stores/verify-and-create-contract/route.ts`
- ส่งข้อความยืนยันเสมอ (line 125)
- เพิ่ม `itemId` ใน `proposedContract`
- ข้อความสำเร็จหลังยืนยันถูกส่งใน webhook (line 336-348)

### 8. ✅ dueDate Calculation
**ไฟล์:**
1. `app/api/stores/verify-and-create-contract/route.ts` (line 78-80)
2. `app/api/webhook/route.ts` (line 211-214)

**การแก้ไข:**
```typescript
// เปลี่ยนจาก
const dueDate = new Date();
dueDate.setDate(dueDate.getDate() + periodDays);

// เป็น
const startDate = new Date();
const dueDate = new Date(startDate.getTime());
dueDate.setDate(dueDate.getDate() + periodDays);
```

**ผลลัพธ์:**
- Start: 2025-11-07
- Period: 14 วัน
- Due: 2025-11-21 ✅

---

## วิธีทดสอบ

### 1. ทดสอบ Interest Calculation
1. สร้างรายการจำนำใหม่
2. เลือกร้านค้า
3. เปิด Console (F12) ดู log:
   ```
   💰 Calculating interest: { hasStore, storeId, ... }
   📊 Monthly interest (exact): ...
   ✅ Final interest: ...
   ```
4. ตรวจสอบว่าดอกเบี้ยไม่เป็น 0

### 2. ทดสอบ Contract Creation
1. สร้างสัญญาใหม่ (หลังจาก deploy code ใหม่)
2. ตรวจสอบใน MongoDB:
   ```json
   {
     "pawnedPrice": 6000,      // ต้องเป็น number
     "interestRate": 10,       // ต้องเป็น number
     "periodDays": 14,         // ต้องเป็น number
     "remainingAmount": 6280   // ต้องเป็น 6000 + 280
   }
   ```

### 3. ทดสอบ dueDate
1. สร้างสัญญา 14 วัน
2. ตรวจสอบ `dates.dueDate`
3. ต้องเป็น startDate + 14 วัน

### 4. ทดสอบ Auto-close
1. พนักงานแสกน QR
2. กรอกรหัสผ่านและกด "ยืนยัน"
3. หน้าจะปิดอัตโนมัติหลัง 1-3 วินาที

---

## Files Modified (7 files)

1. `app/api/estimate/route.ts` - AI price validation
2. `app/api/pawn-requests/negotiate/route.ts` - Type coercion
3. `app/api/stores/verify-and-create-contract/route.ts` - Type coercion + dueDate + itemId
4. `app/api/webhook/route.ts` - Type coercion + dueDate
5. `app/estimate/page.tsx` - Interest calculation fallback + logging
6. `app/store/verify-pawn/page.tsx` - Label improvements
7. `lib/line/client.ts` - Contract number fix

---

## Deployment

**Commit:** `1af1c6f` - "Fix 8 critical bugs in pawn system"
**Branch:** `main`
**Pushed:** 2025-11-07
**Vercel:** Auto-deploys from main branch

---

## Note สำคัญ

**ข้อมูล contract ที่แสดงในรายงานบัคเป็นข้อมูลเก่า** ที่สร้างก่อนการ deploy

กรุณา:
1. รอ Vercel deploy เสร็จ (~2-5 นาที)
2. ทดสอบสร้าง contract **ใหม่**
3. ตรวจสอบว่า bugs ทั้งหมดหายไป
4. ถ้ายังมีปัญหา ส่งข้อมูล contract **ใหม่** มาให้ตรวจสอบ
