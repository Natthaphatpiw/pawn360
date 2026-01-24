# Environment Variables Setup

Copy these variables to your `.env.local` file:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_API_KEY_2=your_openai_api_key_backup_2
OPENAI_API_KEY_3=your_openai_api_key_backup_3
OPENAI_API_KEY_4=your_openai_api_key_backup_4

# Gemini Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_API_KEY_2=your_gemini_api_key_backup_2
GEMINI_API_KEY_3=your_gemini_api_key_backup_3
GEMINI_API_KEY_4=your_gemini_api_key_backup_4

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
# LINE Investor OA
LINE_CHANNEL_ACCESS_TOKEN_INVEST=<REDACTED>
LINE_CHANNEL_SECRET_INVEST=<REDACTED>

# Manual Estimate (Admin OA)
MANUAL_ESTIMATE_ENABLED=true
LINE_ADMIN_CHANNEL_ACCESS_TOKEN=<REDACTED>
LINE_ADMIN_CHANNEL_SECRET=<REDACTED>
# Optional: comma-separated admin LINE IDs for push/multicast (fallback uses broadcast)
LINE_ADMIN_TARGET_IDS=Uxxxxxxxxxxxx,Uyyyyyyyyyyyy
NEXT_PUBLIC_LIFF_ID_ADMIN_ESTIMATE=2008954664-Wan1WlHX

# LINE LIFF Configuration
# สำหรับ estimate page
LINE_LIFF_ID=2008216710-54P86MRY
NEXT_PUBLIC_LIFF_ID=2008216710-54P86MRY

# สำหรับ register page (ตามที่ผู้ใช้ระบุ)
NEXT_PUBLIC_LIFF_ID_REGISTER=2008216710-BEZ5XNyd

# สำหรับชำระค่าปรับ
NEXT_PUBLIC_LIFF_ID_PENALTY_PAYMENT=2008216710-Z54fuL3s

# Cron (optional)
CRON_SECRET=your_cron_secret

# Rich Menu IDs (ตามที่ตั้งค่าใน Vercel)
RICH_MENU_ID_NEW_USER=your_new_user_rich_menu_id
RICH_MENU_ID_MEMBER=your_member_rich_menu_id

# Base URL (ตามที่ตั้งค่าใน Vercel)
NEXT_PUBLIC_BASE_URL=https://pawn360.vercel.app

# QR Code Storage (ตามที่ตั้งค่าใน Vercel)
QR_CODE_STORAGE_PATH=your_qr_storage_path
```
