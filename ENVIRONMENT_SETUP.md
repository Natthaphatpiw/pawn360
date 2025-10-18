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
MONGODB_URI=mongodb+srv://natthapiw_db_user:afOJe2MrgMDsmm6k@cluster0.skadipr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB=pawn

# LINE Channel Configuration (ตามที่ตั้งค่าใน Vercel)
LINE_CHANNEL_ACCESS_TOKEN=UeHWta6KPHXAUZCZFxJsgpVpF04yulZP+z3w7F/PO4Uzd2U0Rxl1VhuC4wSFIcPGZGNeYXkr6xSq1Ziz36RIgaM0O8xSk8+gJcYlmPBa1ONycwtKnkXk3UTohvHUgTvvA58l/1G9SiPerwDSZs3rewdB04t89/1O/w1cDnyilFU=
LINE_CHANNEL_SECRET=75202717b1787be1869ecb8ed12abef7

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
