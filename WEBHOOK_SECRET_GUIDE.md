# คู่มือการตั้งค่า UPPASS_WEBHOOK_SECRET

## UPPASS_WEBHOOK_SECRET คืออะไร?

`UPPASS_WEBHOOK_SECRET` คือ **shared secret key** ที่ใช้สำหรับตรวจสอบว่า webhook ที่ส่งเข้ามาที่ระบบของเรานั้นมาจาก UpPass จริงๆ (ไม่ใช่คนอื่นปลอมแปลง)

## วิธีการสร้าง Secret Key

### วิธีที่ 1: ใช้ OpenSSL (แนะนำ)

```bash
openssl rand -hex 32
```

**ตัวอย่างผลลัพธ์:**
```
3f8a2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

### วิธีที่ 2: ใช้ Node.js

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### วิธีที่ 3: ใช้ Python

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### วิธีที่ 4: Online Generator (ไม่แนะนำสำหรับ Production)

ใช้เว็บไซต์ เช่น:
- https://generate-random.org/api-key-generator
- ตั้งค่า: 64 characters, lowercase + numbers

---

## วิธีการใช้งาน

### 1. สร้าง Secret Key

```bash
openssl rand -hex 32
```

คัดลอกผลลัพธ์ที่ได้ เช่น:
```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### 2. ใส่ใน Environment Variables

**Local Development (`.env.local`):**
```bash
UPPASS_WEBHOOK_SECRET=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

**Production (Vercel):**
1. ไปที่ Vercel Dashboard
2. เลือก Project
3. Settings → Environment Variables
4. เพิ่ม:
   - **Key:** `UPPASS_WEBHOOK_SECRET`
   - **Value:** `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2`
   - **Environments:** Production, Preview, Development
5. Redeploy project

### 3. ตั้งค่าใน UpPass Dashboard

**⚠️ สำคัญ:** คุณ**ไม่ต้อง**ใส่ `UPPASS_WEBHOOK_SECRET` ใน UpPass Dashboard

ใน UpPass Dashboard คุณต้องใส่เพียง:
- **Webhook URL:** `https://your-domain.com/api/ekyc/webhook`

Secret key นี้เป็น **shared secret** ที่ทั้ง 2 ฝั่ง (UpPass และระบบของคุณ) ต้องรู้เพื่อใช้ในการ verify signature

---

## วิธีการทำงานของ Webhook Signature Verification

### ฝั่ง UpPass (ผู้ส่ง)

1. UpPass สร้าง webhook payload (JSON)
2. UpPass ใช้ secret key สร้าง HMAC-SHA256 signature จาก payload
3. UpPass ส่ง HTTP Request พร้อม:
   - **Body:** JSON payload
   - **Header:** `x-uppass-signature: <signature>`

### ฝั่งระบบเรา (ผู้รับ)

1. รับ webhook request
2. อ่าน raw body และ signature จาก header
3. คำนวณ signature ใหม่จาก raw body + secret key
4. เปรียบเทียบ signature ที่คำนวณได้กับที่ได้รับมา
5. ถ้าตรงกัน = ยืนยันว่ามาจาก UpPass จริง
6. ถ้าไม่ตรงกัน = ปฏิเสธ request

**โค้ดใน [`app/api/ekyc/webhook/route.ts:6-24`](app/api/ekyc/webhook/route.ts#L6-L24):**

```typescript
function verifyWebhookSignature(payload: string, signature: string | null): boolean {
  if (!signature) return true; // Skip if no signature

  const secret = process.env.UPPASS_WEBHOOK_SECRET;
  if (!secret) return true; // Skip if no secret configured

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
```

---

## ตัวอย่างการใช้งานจริง

### Step-by-Step Setup

#### 1. Generate Secret
```bash
$ openssl rand -hex 32
3f8a2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

#### 2. เพิ่มใน `.env.local`
```bash
UPPASS_WEBHOOK_SECRET=3f8a2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

#### 3. เพิ่มใน Vercel Environment Variables
```
Key: UPPASS_WEBHOOK_SECRET
Value: 3f8a2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
Environments: ✓ Production ✓ Preview ✓ Development
```

#### 4. แชร์ Secret กับ UpPass
ติดต่อทีม UpPass Support และแจ้ง:
```
Webhook URL: https://your-domain.vercel.app/api/ekyc/webhook
Secret Key: 3f8a2b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

#### 5. Redeploy
```bash
vercel --prod
```

---

## การทดสอบ Webhook Signature

### ทดสอบด้วย cURL (มี signature)

```bash
# สร้าง payload
PAYLOAD='{"event":{"type":"submit_form"},"application":{"slug":"test-123","status":"accepted"}}'

# คำนวณ signature
SECRET="your-secret-here"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# ส่ง request
curl -X POST https://your-domain.com/api/ekyc/webhook \
  -H "Content-Type: application/json" \
  -H "x-uppass-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### ทดสอบโดยไม่มี signature (จะ skip verification)

```bash
curl -X POST https://your-domain.com/api/ekyc/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"submit_form"},"application":{"slug":"test-123","status":"accepted"}}'
```

---

## คำถามที่พบบ่อย (FAQ)

### Q1: ต้องใช้ secret เดียวกันทั้ง dev และ production ไหม?

**A:** ไม่จำเป็น แนะนำให้ใช้คนละตัว:
- **Development:** ใช้ secret หนึ่ง
- **Production:** ใช้ secret อีกตัว

### Q2: Secret key มีความยาวเท่าไหร่ดี?

**A:** แนะนำอย่างน้อย **32 bytes (64 hexadecimal characters)**

### Q3: ต้อง rotate secret บ่อยแค่ไหน?

**A:** แนะนำ:
- **ปกติ:** ทุก 6-12 เดือน
- **เมื่อมีการละเมิดความปลอดภัย:** ทันที

### Q4: ถ้าไม่ตั้ง UPPASS_WEBHOOK_SECRET จะเกิดอะไรขึ้น?

**A:** Webhook จะยังทำงานได้ แต่จะ **skip signature verification**
```typescript
if (!secret) return true; // Skip if no secret configured
```

แต่**ไม่แนะนำสำหรับ Production** เพราะไม่มีการตรวจสอบความถูกต้อง

### Q5: UpPass ส่ง signature ใน header อะไร?

**A:** `x-uppass-signature` (ตามที่กำหนดไว้ในโค้ด [`route.ts:33`](app/api/ekyc/webhook/route.ts#L33))

```typescript
const signature = request.headers.get('x-uppass-signature');
```

### Q6: ถ้า signature ไม่ตรงกันจะเกิดอะไร?

**A:** Webhook จะถูกปฏิเสธด้วย **401 Unauthorized**

```typescript
if (!verifyWebhookSignature(rawBody, signature)) {
  return NextResponse.json(
    { error: 'Invalid signature' },
    { status: 401 }
  );
}
```

---

## Security Best Practices

### ✅ ควรทำ

1. **ใช้ secret key ที่สุ่มและยาวพอ** (อย่างน้อย 32 bytes)
2. **เก็บ secret ไว้ใน environment variables** (ไม่ hardcode ในโค้ด)
3. **ไม่ commit secret ลง git repository**
4. **ใช้ secret คนละตัวระหว่าง dev และ production**
5. **Rotate secret เป็นประจำ**
6. **ใช้ HTTPS เสมอ** (ไม่ใช้ HTTP)

### ❌ ไม่ควรทำ

1. ❌ Hard-code secret ในโค้ด
2. ❌ Commit `.env.local` ลง git
3. ❌ Share secret ใน public channels (Slack, email)
4. ❌ ใช้ secret ที่เดาง่าย (เช่น "12345", "secret")
5. ❌ ใช้ secret เดียวกันหลายๆ projects
6. ❌ ปล่อยให้ webhook ทำงานโดยไม่ verify signature (ใน production)

---

## Troubleshooting

### Problem: Webhook ถูกปฏิเสธด้วย "Invalid signature"

**สาเหตุที่เป็นไปได้:**

1. **Secret key ไม่ตรงกัน** ระหว่าง UpPass และระบบของคุณ
   - แก้ไข: ตรวจสอบว่า secret ที่ส่งให้ UpPass ตรงกับที่ตั้งใน environment variables

2. **Payload ถูกแก้ไขระหว่างทาง** (middleware, proxy)
   - แก้ไข: ตรวจสอบว่าไม่มี middleware แก้ไข body

3. **Character encoding ไม่ตรงกัน**
   - แก้ไข: ตรวจสอบว่าใช้ UTF-8 ทั้งสองฝั่ง

### Problem: Webhook ทำงานใน development แต่ไม่ทำงานใน production

**แก้ไข:**
1. ตรวจสอบว่าตั้ง `UPPASS_WEBHOOK_SECRET` ใน Vercel Environment Variables
2. Redeploy project หลังจากเพิ่ม environment variable
3. ตรวจสอบ webhook URL ใน UpPass Dashboard ว่าชี้ไปที่ production domain

### Problem: ต้องการ disable signature verification ชั่วคราว

**วิธีการ:**
1. Comment out `UPPASS_WEBHOOK_SECRET` ใน environment variables
2. Webhook จะ skip verification อัตโนมัติ

**⚠️ คำเตือน:** อย่าทำใน production environment

---

## สรุป

- **UPPASS_WEBHOOK_SECRET** คือ shared secret สำหรับ verify webhook signature
- สร้างด้วย `openssl rand -hex 32`
- ตั้งค่าใน environment variables (ไม่ใส่ใน UpPass Dashboard)
- แชร์ secret กับทีม UpPass เพื่อให้เขาเซ็ตค่าในระบบของพวกเขา
- ใช้ HTTPS เสมอและ rotate secret เป็นระจำ

---

## Quick Start

```bash
# 1. Generate secret
openssl rand -hex 32

# 2. Add to .env.local
echo "UPPASS_WEBHOOK_SECRET=<your-generated-secret>" >> .env.local

# 3. Add to Vercel
vercel env add UPPASS_WEBHOOK_SECRET production

# 4. Contact UpPass support to configure webhook with your secret

# 5. Test
curl -X POST https://your-domain.com/api/ekyc/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"submit_form"},"application":{"slug":"test","status":"accepted"}}'
```

Done! 🎉
