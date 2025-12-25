# Environment Variables Setup

Copy these variables to your `.env.local` file:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-southeast-2

# MongoDB Configuration
MONGODB_URI=<REDACTED>
MONGODB_DB=pawn

# LINE Channel Configuration (ตามที่ตั้งค่าใน Vercel)
LINE_CHANNEL_ACCESS_TOKEN=<REDACTED>
LINE_CHANNEL_SECRET=<REDACTED>

# LINE LIFF Configuration
# สำหรับ estimate page
LINE_LIFF_ID=2008216710-54P86MRY
NEXT_PUBLIC_LIFF_ID=2008216710-54P86MRY

# สำหรับ register page (ตามที่ผู้ใช้ระบุ)
NEXT_PUBLIC_LIFF_ID_REGISTER=2008216710-BEZ5XNyd

# Rich Menu IDs (ตามที่ตั้งค่าใน Vercel)
RICH_MENU_ID_NEW_USER=your_new_user_rich_menu_id
RICH_MENU_ID_MEMBER=your_member_rich_menu_id

# Base URL (ตามที่ตั้งค่าใน Vercel)
NEXT_PUBLIC_BASE_URL=https://pawn360.vercel.app

# QR Code Storage (ตามที่ตั้งค่าใน Vercel)
QR_CODE_STORAGE_PATH=your_qr_storage_path
```
