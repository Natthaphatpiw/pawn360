# Pawn360 - ระบบจำนำออนไลน์ผ่าน LINE

ระบบจัดการจำนำออนไลน์ที่ทำงานผ่าน LINE และ LINE LIFF สำหรับร้านค้าจำนำ

## ⚙️ การตั้งค่าเริ่มต้น

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local` และเพิ่มค่าดังนี้:

```env
# MongoDB Configuration
MONGODB_URI=<REDACTED>
MONGODB_DB=pawn

# LINE Configuration
LINE_CHANNEL_ACCESS_TOKEN=<YOUR_CHANNEL_ACCESS_TOKEN>
LINE_CHANNEL_SECRET=<YOUR_CHANNEL_SECRET>
LINE_LIFF_ID=<YOUR_LIFF_ID>

# Rich Menu IDs
RICH_MENU_ID_NEW_USER=<RICH_MENU_ID_FOR_NEW_USERS>
RICH_MENU_ID_MEMBER=<RICH_MENU_ID_FOR_MEMBERS>

# Application URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_LIFF_ID=<YOUR_LIFF_ID>

# QR Code Storage
QR_CODE_STORAGE_PATH=/public/qrcodes
```

### 3. ตั้งค่า Rich Menu

รันคำสั่งนี้เพื่อสร้าง Rich Menu:

```bash
npm run setup-richmenu
```

คัดลอก Rich Menu IDs ที่ได้และเพิ่มลงใน `.env.local`

### 4. อัปโหลดรูปภาพ Rich Menu

ใช้คำสั่ง curl ที่แสดงจาก script หรือใช้ LINE Developers Console

## 🚀 การรันโปรเจค

### Development

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

### Production

```bash
npm run build
npm start
```

## 📁 โครงสร้างโปรเจค

```
pawnline/
├── app/
│   ├── api/
│   │   ├── webhook/          # LINE Webhook
│   │   ├── users/            # User registration APIs
│   │   ├── pawn-requests/    # Pawn request APIs
│   │   └── contracts/        # Contract management APIs
│   ├── register/             # LIFF registration page
│   ├── pawn/new/             # LIFF create pawn request page
│   └── contracts/            # LIFF contract status page
├── lib/
│   ├── db/
│   │   ├── mongodb.ts        # MongoDB connection
│   │   └── models.ts         # Database models
│   ├── line/
│   │   └── client.ts         # LINE API utilities
│   ├── liff/
│   │   └── liff-provider.tsx # LIFF context provider
│   └── utils/
│       └── qrcode.ts         # QR code generation
├── public/
│   └── qrcodes/              # Generated QR codes
└── scripts/
    └── setup-richmenu.ts     # Rich Menu setup script
```

## 🔄 Flow การทำงาน

### Flow 1: การลงทะเบียนผู้ใช้ใหม่
1. ผู้ใช้สแกน QR Code และเพิ่มเพื่อน LINE OA
2. LINE ส่ง Follow Event มายัง Webhook
3. ผู้ใช้เห็น Rich Menu แบบที่ 1 (สำหรับผู้ใช้ใหม่)
4. ผู้ใช้กดปุ่ม "สมัครสมาชิก"
5. เปิด LIFF App สำหรับลงทะเบียน (`/register`)
6. กรอกข้อมูลและส่งไปยัง API `/api/users/register`
7. ระบบบันทึกข้อมูลและเปลี่ยน Rich Menu เป็นแบบที่ 2 (สำหรับสมาชิก)

### Flow 2: การสร้างรายการจำนำใหม่
1. ผู้ใช้กดปุ่ม "จำนำ" บน Rich Menu
2. เปิด LIFF App สำหรับสร้างรายการ (`/pawn/new`)
3. กรอกข้อมูลสินค้าและอัปโหลดรูปภาพ
4. ส่งข้อมูลไปยัง API `/api/pawn-requests`
5. ระบบสร้าง QR Code และส่งกลับไปที่แชท LINE
6. ผู้ใช้นำ QR Code ไปแสดงที่ร้านค้า

### Flow 3: การตรวจสอบและยืนยันที่ร้านค้า
1. พนักงานสแกน QR Code ผ่านระบบ SaaS ของร้าน
2. ระบบ SaaS เรียก API `/api/pawn-requests/[id]` เพื่อดึงข้อมูล
3. พนักงานตรวจสอบสินค้าและข้อมูลลูกค้า
4. กดยืนยันและสร้างสัญญา
5. ระบบ SaaS เรียก API `/api/contracts/create`
6. ระบบบันทึกสัญญาและส่งแจ้งเตือนไปยัง LINE ของลูกค้า

### Flow 4: การตรวจสอบสถานะสัญญา
1. ผู้ใช้กดปุ่ม "สถานะสัญญา" บน Rich Menu
2. เปิด LIFF App สำหรับดูสัญญา (`/contracts`)
3. กรอกเลขบัตรประชาชน 4 ตัวท้ายเพื่อยืนยันตัวตน
4. เรียก API `/api/contracts/lookup` เพื่อดึงข้อมูลสัญญา
5. แสดงรายการสัญญาที่ Active
6. กดเลือกสัญญาเพื่อดูรายละเอียดเต็ม

## 🔑 API Endpoints

### Webhook
- `POST /api/webhook` - รับ Webhook events จาก LINE

### Users
- `POST /api/users/register` - ลงทะเบียนผู้ใช้ใหม่

### Pawn Requests
- `POST /api/pawn-requests` - สร้างรายการจำนำใหม่
- `GET /api/pawn-requests/[id]` - ดึงข้อมูลรายการจำนำ (สำหรับร้านค้า)

### Contracts
- `POST /api/contracts/create` - สร้างสัญญา (สำหรับร้านค้า)
- `POST /api/contracts/lookup` - ค้นหาสัญญาที่ Active
- `POST /api/contracts/history` - ดึงประวัติสัญญาทั้งหมด

## 🛠️ Technologies

- **Frontend:** Next.js 15, React 19, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** MongoDB
- **LINE:** LINE Messaging API, LIFF SDK
- **QR Code:** qrcode library
- **TypeScript:** Full type safety

## 📝 หมายเหตุ

- Rich Menu รูปภาพต้องมีขนาด 2500x1686 px
- QR Code จะถูกเก็บไว้ที่ `/public/qrcodes`
- ระบบรองรับการอัปโหลดรูปภาพสินค้าผ่าน LIFF
- storeId จะถูกเพิ่มเมื่อร้านค้าสแกน QR Code ครั้งแรก

## 🔐 Security

- การยืนยันตัวตนด้วย LINE User ID
- Webhook signature verification
- ID card verification (4 ตัวท้าย)
- HTTPS required for production
