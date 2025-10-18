# Estimate Page Implementation

## Overview
The estimate page is a LINE LIFF application that allows users to input item details, upload images, and get AI-powered price estimates for pawn shop services.

## Features Implemented

### 1. Item Input Form
- **Image Upload**: Upload up to 6 images with camera/gallery options
- **Item Type**: Dropdown selection (โทรศัพท์, โน้ตบุค, อุปกรณ์โทรศัพท์, อุปภรณ์คอมพิวเตอร์, กล้อง)
- **Brand**: Dynamic dropdown based on item type
- **Model**: Text input
- **Serial Number**: Required text input
- **Accessories**: Text input
- **Condition**: Slider (0-100%)
- **Defects**: Text area
- **Note**: Text area

### 2. AI Price Estimation
Uses OpenAI GPT-4o-mini with three-agent system:
- **Agent 1**: Normalizes and cleans input data
- **Agent 2**: Estimates market price based on Thai market data
- **Agent 3**: Analyzes condition from images (0-1 scale)
- **Final Price**: Market price × condition score

### 3. Store Selection & Calculation
- Fetches available stores from database
- Calculates interest based on store rates (default 10%)
- Supports pawn durations: 7, 14, 30, 60, 90 days

### 4. Customer Integration
- Checks if user exists in customers collection
- Updates customer records with new items and store relationships
- Supports both registered and guest flows

### 5. QR Code Generation
- Creates pawn requests with QR codes
- Stores QR codes in AWS S3
- Sends QR codes to LINE chat

## Database Models Updated

### Customer Model
```typescript
interface Customer {
  // ... existing fields
  storeId?: ObjectId[]; // Array of store IDs
  itemIds?: ObjectId[]; // Array of item IDs
}
```

### New Store Model
```typescript
interface Store {
  _id?: ObjectId;
  storeName: string;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  taxId?: string;
  address: Address;
  interestRate?: number;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## API Routes

### `/api/estimate` (POST)
AI-powered price estimation
- Input: Item details + images
- Output: Estimated price, condition score, confidence

### `/api/upload/image` (POST)
Image upload to AWS S3
- Input: Image file
- Output: S3 URL

### `/api/stores` (GET)
Fetch available stores
- Output: Store list with interest rates

### `/api/pawn-requests` (POST) - Updated
Create pawn requests with QR codes
- Creates items, QR codes, updates customer records

## Environment Variables Required

```bash
# OpenAI
OPENAI_API_KEY=your_openai_api_key

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-southeast-2

# MongoDB
MONGODB_URI=mongodb+srv://...

# LINE LIFF
NEXT_PUBLIC_LIFF_ID_PAWN=2008216710-54P86MRY
```

## File Structure

```
app/
  estimate/
    layout.tsx      # LIFF provider
    page.tsx        # Main estimate page
  api/
    estimate/
      route.ts      # AI estimation API
    upload/
      image/
        route.ts    # Image upload API
```

## Usage Flow

1. **Item Input**: User fills item details and uploads images
2. **AI Estimation**: System processes data and returns price estimate
3. **Store Selection**: User selects pawn shop and duration
4. **Customer Check**: System verifies user registration status
5. **Pawn Request**: Creates QR code and updates database
6. **QR Display**: Shows QR code for in-store scanning

## LINE LIFF Configuration

- **Domain**: https://pawn360.vercel.app/
- **Channel ID**: 2008216712
- **LIFF ID**: 2008216710-54P86MRY

## Next Steps

1. Set up environment variables
2. Deploy to production
3. Test LINE LIFF integration
4. Add stores to database
5. Configure AWS S3 bucket permissions
