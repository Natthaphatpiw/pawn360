# 🔧 LIFF Configuration Guide

## ⚠️ ปัญหาที่เกิด

1. **Application error** - เกิดจากใช้ URL ผิด
2. **Internal server error** - เกิดจาก LIFF Endpoint URL ตั้งค่าผิด

---

## ✅ วิธีแก้ไข: ตั้งค่า LIFF Endpoint URL

ไปที่ **LINE Developers Console** → **LIFF tab** → แก้ไขแต่ละ LIFF:

### 1. ระบบสมาชิก Pawn360
- **LIFF ID:** `2008216710-BEZ5XNyd`
- **Endpoint URL:** `https://pawn360.vercel.app/register`
- ❌ **อย่าใช้:** `https://pawn360.vercel.app` (หน้า root)

### 2. จำนำ
- **LIFF ID:** `2008216710-54P86MRY`
- **Endpoint URL:** `https://pawn360.vercel.app/pawn/new`
- ❌ **อย่าใช้:** `https://pawn360.vercel.app`

### 3. สถานะสัญญา
- **LIFF ID:** `2008216710-WJXR6xOM`
- **Endpoint URL:** `https://pawn360.vercel.app/contracts`
- ❌ **อย่าใช้:** `https://pawn360.vercel.app`

### 4. ระบบร้านค้ารับจำนำ
- **LIFF ID:** `2008216710-de1ovYZL`
- **Endpoint URL:** `https://pawn360.vercel.app/store/verify-pawn`
- ❌ **อย่าใช้:** `https://pawn360.vercel.app`

---

## 📱 Rich Menu Configuration

### ✅ URLs ที่ถูกต้อง (ใช้ LIFF URL ทั้งหมด)

| ปุ่ม | Action Type | URL |
|------|-------------|-----|
| สถานะสัญญา | Link | `https://liff.line.me/2008216710-WJXR6xOM/contracts` |
| ลงทะเบียน | Link | `https://liff.line.me/2008216710-BEZ5XNyd/register` |
| จำนำ | Link | `https://liff.line.me/2008216710-54P86MRY/pawn/new` |
| รายการสัญญา | Link | `https://liff.line.me/2008216710-WJXR6xOM/contracts` |
| QR Code | No action | - |
| โทร | Text | `Phone: 062-6092941` |

### ❌ URLs ที่ผิด (อย่าใช้)

| ❌ ผิด | ✅ ถูก |
|--------|---------|
| `https://pawn360.vercel.app/register` | `https://liff.line.me/2008216710-BEZ5XNyd/register` |
| `https://pawn360.vercel.app/pawn/new` | `https://liff.line.me/2008216710-54P86MRY/pawn/new` |
| `https://pawn360.vercel.app/contracts` | `https://liff.line.me/2008216710-WJXR6xOM/contracts` |

---

## 🔍 ทำไมต้องใช้ LIFF URL?

### LIFF URL Format:
```
https://liff.line.me/{LIFF_ID}/{path}
```

เมื่อผู้ใช้คลิก LIFF URL:
1. LINE app จะเปิด in-app browser
2. Initialize LIFF SDK โดยอัตโนมัติ
3. โหลดหน้า `https://pawn360.vercel.app/{path}` ผ่าน LIFF context
4. ได้ข้อมูล LINE profile (userId, displayName, etc.)

### Direct URL (ไม่ผ่าน LIFF):
```
https://pawn360.vercel.app/pawn/new  ❌ Error!
```

เมื่อผู้ใช้เปิด Direct URL:
1. เปิดใน browser ปกติ
2. ❌ ไม่มี LIFF SDK initialization
3. ❌ ไม่มี LINE profile
4. ❌ เกิด error: "LINE profile not found"

---

## 🎯 การทำงานของ LIFF Endpoint URL

### ตัวอย่าง:

**LIFF URL:**
```
https://liff.line.me/2008216710-54P86MRY/pawn/new
```

**LINE จะ:**
1. เช็คว่า LIFF ID `2008216710-54P86MRY` มี Endpoint URL = `https://pawn360.vercel.app/pawn/new`
2. Initialize LIFF SDK
3. Redirect ไป `https://pawn360.vercel.app/pawn/new`
4. Pass LIFF context (userId, etc.)

---

## ⚙️ Vercel Environment Variables

ตรวจสอบว่ามีครบทุกตัว:

```env
# Backend LIFF IDs
LIFF_ID_REGISTER=2008216710-BEZ5XNyd
LIFF_ID_PAWN=2008216710-54P86MRY
LIFF_ID_CONTRACTS=2008216710-WJXR6xOM
LIFF_ID_STORE=2008216710-de1ovYZL

# Frontend LIFF IDs (NEXT_PUBLIC_*)
NEXT_PUBLIC_LIFF_ID_REGISTER=2008216710-BEZ5XNyd
NEXT_PUBLIC_LIFF_ID_PAWN=2008216710-54P86MRY
NEXT_PUBLIC_LIFF_ID_CONTRACTS=2008216710-WJXR6xOM
NEXT_PUBLIC_LIFF_ID_STORE=2008216710-de1ovYZL

# LINE Configuration
LINE_CHANNEL_ACCESS_TOKEN=UeHWta6KPHXAUZCZFxJsgpVpF04yulZP+z3w7F/PO4Uzd2U0Rxl1VhuC4wSFIcPGZGNeYXkr6xSq1Ziz36RIgaM0O8xSk8+gJcYlmPBa1ONycwtKnkXk3UTohvHUgTvvA58l/1G9SiPerwDSZs3rewdB04t89/1O/w1cDnyilFU=
LINE_CHANNEL_SECRET=9469acf57221ec18b48b04f82096cb2b

# MongoDB
MONGODB_URI=mongodb+srv://natthapiw_db_user:afOJe2MrgMDsmm6k@cluster0.skadipr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB=pawn

# Rich Menu
RICH_MENU_ID_NEW_USER=richmenu-cd730e69b15a075c3bbe729a1c88f76e
RICH_MENU_ID_MEMBER=richmenu-d58a81249cf5f525da5ba9594cd8e111
```

---

## 📋 Checklist

- [ ] ตั้งค่า LIFF Endpoint URL ทั้ง 4 LIFF ใน LINE Developers Console
- [ ] แก้ Rich Menu URLs ให้เป็น LIFF URL ทั้งหมด
- [ ] ตรวจสอบ Environment Variables ใน Vercel
- [ ] Redeploy Vercel (ถ้าเพิ่ม env vars ใหม่)
- [ ] ทดสอบกดปุ่ม Rich Menu ทุกปุ่ม

---

## 🐛 Troubleshooting

### Error: "Application error: a client-side exception has occurred"
**สาเหตุ:** ใช้ Direct URL แทน LIFF URL ใน Rich Menu
**แก้:** เปลี่ยนเป็น `https://liff.line.me/{LIFF_ID}/{path}`

### Error: "Internal server error"
**สาเหตุ:** LIFF Endpoint URL ตั้งค่าผิด
**แก้:** ตรวจสอบ Endpoint URL ใน LINE Developers Console

### Error: "LINE profile not found"
**สาเหตุ:** LIFF ไม่ได้ initialize
**แก้:** ใช้ LIFF URL แทน Direct URL

### หน้าแสดง home page แทนที่หน้าที่ต้องการ
**สาเหตุ:** LIFF Endpoint URL = `https://pawn360.vercel.app` (root)
**แก้:** เปลี่ยนเป็น specific path เช่น `https://pawn360.vercel.app/contracts`
