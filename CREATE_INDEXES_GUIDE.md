# 📊 MongoDB Indexes Creation Guide

## วิธีที่ 1: MongoDB Atlas Web Interface (แนะนำ) ⭐

### ขั้นตอน:

1. **เข้า MongoDB Atlas**
   - ไปที่ https://cloud.mongodb.com
   - Login ด้วย account ของคุณ

2. **เลือก Cluster**
   - คลิกที่ Cluster ของคุณ (Cluster0)
   - คลิกปุ่ม "Browse Collections"

3. **เลือก Database และ Collection**
   - เลือก Database: `pawn`
   - เลือก Collection: `notifications` (ถ้ายังไม่มีให้สร้างก่อน)

4. **สร้าง Indexes**
   - คลิกที่แท็บ "Indexes"
   - คลิกปุ่ม "Create Index"

   **Index 1: shopNotificationId (Unique)**
   ```json
   {
     "shopNotificationId": 1
   }
   ```
   Options:
   - ✅ เลือก "Create unique index"
   - Index name: `shopNotificationId_1`
   - คลิก "Create"

   **Index 2: lineUserId + status (Compound)**
   ```json
   {
     "lineUserId": 1,
     "status": 1
   }
   ```
   Options:
   - Index name: `lineUserId_1_status_1`
   - คลิก "Create"

   **Index 3: contractId**
   ```json
   {
     "contractId": 1
   }
   ```
   Options:
   - Index name: `contractId_1`
   - คลิก "Create"

---

## วิธีที่ 2: MongoDB Compass (Desktop App)

### ขั้นตอน:

1. **ดาวน์โหลด MongoDB Compass**
   - ไปที่ https://www.mongodb.com/products/compass
   - ดาวน์โหลดและติดตั้ง

2. **เชื่อมต่อกับ MongoDB Atlas**
   - เปิด MongoDB Compass
   - วาง Connection String:
     ```
     mongodb+srv://natthapiw_db_user:afOJe2MrgMDsmm6k@cluster0.skadipr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
     ```
   - คลิก "Connect"

3. **เลือก Database และ Collection**
   - เลือก Database: `pawn`
   - เลือก Collection: `notifications`

4. **สร้าง Indexes**
   - คลิกที่แท็บ "Indexes"
   - คลิก "Create Index"

   **Index 1:**
   - Fields: `{ "shopNotificationId": 1 }`
   - Options: `{ "unique": true }`
   - คลิก "Create"

   **Index 2:**
   - Fields: `{ "lineUserId": 1, "status": 1 }`
   - คลิก "Create"

   **Index 3:**
   - Fields: `{ "contractId": 1 }`
   - คลิก "Create"

---

## วิธีที่ 3: MongoDB Shell (mongosh)

### ขั้นตอน:

1. **ติดตั้ง mongosh**
   ```bash
   # macOS (Homebrew)
   brew install mongosh

   # หรือดาวน์โหลดจาก
   # https://www.mongodb.com/try/download/shell
   ```

2. **เชื่อมต่อกับ MongoDB Atlas**
   ```bash
   mongosh "mongodb+srv://natthapiw_db_user:afOJe2MrgMDsmm6k@cluster0.skadipr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
   ```

3. **สลับไปใช้ Database `pawn`**
   ```javascript
   use pawn
   ```

4. **สร้าง Indexes**
   ```javascript
   // Index 1: shopNotificationId (unique)
   db.notifications.createIndex(
     { shopNotificationId: 1 },
     { unique: true }
   )

   // Index 2: lineUserId + status (compound)
   db.notifications.createIndex(
     { lineUserId: 1, status: 1 }
   )

   // Index 3: contractId
   db.notifications.createIndex(
     { contractId: 1 }
   )
   ```

5. **ตรวจสอบ Indexes ที่สร้าง**
   ```javascript
   db.notifications.getIndexes()
   ```

   ผลลัพธ์ควรเป็น:
   ```javascript
   [
     {
       v: 2,
       key: { _id: 1 },
       name: '_id_'
     },
     {
       v: 2,
       key: { shopNotificationId: 1 },
       name: 'shopNotificationId_1',
       unique: true
     },
     {
       v: 2,
       key: { lineUserId: 1, status: 1 },
       name: 'lineUserId_1_status_1'
     },
     {
       v: 2,
       key: { contractId: 1 },
       name: 'contractId_1'
     }
   ]
   ```

---

## วิธีที่ 4: สร้างผ่าน Node.js Script

สร้างไฟล์ `scripts/create-indexes.js`:

```javascript
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb+srv://natthapiw_db_user:afOJe2MrgMDsmm6k@cluster0.skadipr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const dbName = 'pawn';

async function createIndexes() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);
    const notificationsCollection = db.collection('notifications');

    // Create Index 1: shopNotificationId (unique)
    await notificationsCollection.createIndex(
      { shopNotificationId: 1 },
      { unique: true, name: 'shopNotificationId_1' }
    );
    console.log('✅ Index 1 created: shopNotificationId (unique)');

    // Create Index 2: lineUserId + status (compound)
    await notificationsCollection.createIndex(
      { lineUserId: 1, status: 1 },
      { name: 'lineUserId_1_status_1' }
    );
    console.log('✅ Index 2 created: lineUserId + status');

    // Create Index 3: contractId
    await notificationsCollection.createIndex(
      { contractId: 1 },
      { name: 'contractId_1' }
    );
    console.log('✅ Index 3 created: contractId');

    // Show all indexes
    const indexes = await notificationsCollection.indexes();
    console.log('\n📊 All Indexes:');
    console.log(JSON.stringify(indexes, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connection closed');
  }
}

createIndexes();
```

**รัน script:**
```bash
node scripts/create-indexes.js
```

---

## วิธีที่ 5: Auto-create on Application Startup (สำหรับ Production)

สร้างไฟล์ `lib/db/init-indexes.ts`:

```typescript
import { connectToDatabase } from './mongodb';

export async function initializeIndexes() {
  try {
    const { db } = await connectToDatabase();
    const notificationsCollection = db.collection('notifications');

    // Create indexes (will skip if already exists)
    await Promise.all([
      notificationsCollection.createIndex(
        { shopNotificationId: 1 },
        { unique: true, name: 'shopNotificationId_1' }
      ),
      notificationsCollection.createIndex(
        { lineUserId: 1, status: 1 },
        { name: 'lineUserId_1_status_1' }
      ),
      notificationsCollection.createIndex(
        { contractId: 1 },
        { name: 'contractId_1' }
      ),
    ]);

    console.log('✅ MongoDB indexes initialized');
  } catch (error) {
    console.error('❌ Failed to initialize indexes:', error);
    // Don't throw - let app continue even if indexes fail
  }
}
```

**เรียกใช้ใน `app/layout.tsx`:**
```typescript
import { initializeIndexes } from '@/lib/db/init-indexes';

// Run on server startup
if (typeof window === 'undefined') {
  initializeIndexes().catch(console.error);
}
```

---

## 🔍 ตรวจสอบว่า Indexes ทำงานหรือไม่

### วิธีที่ 1: ดู Explain Plan (MongoDB Atlas)

1. ไปที่ Collections → notifications
2. เปิดแท็บ "Explain Plan"
3. ทดสอบ query:
   ```javascript
   { "shopNotificationId": "REDEMPTION-1234567890" }
   ```
4. ดูว่าใช้ index หรือไม่ (ต้องเห็น `IXSCAN` แทน `COLLSCAN`)

### วิธีที่ 2: ใช้ explain() ใน mongosh

```javascript
db.notifications.find({ shopNotificationId: "REDEMPTION-123" }).explain("executionStats")
```

ผลลัพธ์ที่ดี:
```javascript
{
  executionStats: {
    executionSuccess: true,
    nReturned: 1,
    executionTimeMillis: 0,
    totalKeysExamined: 1,      // ต้องมากกว่า 0
    totalDocsExamined: 1,
    executionStages: {
      stage: 'FETCH',
      inputStage: {
        stage: 'IXSCAN',         // ✅ ใช้ index
        indexName: 'shopNotificationId_1'
      }
    }
  }
}
```

---

## 🚨 ข้อควรระวัง

### 1. Index ซ้ำ
ถ้าสร้าง index ซ้ำจะเกิด error:
```
Index with name 'shopNotificationId_1' already exists
```
**แก้ไข:** ลบ index เก่าก่อน:
```javascript
db.notifications.dropIndex("shopNotificationId_1")
```

### 2. Unique Index Error
ถ้ามีข้อมูลซ้ำอยู่แล้วจะสร้าง unique index ไม่ได้:
```
E11000 duplicate key error
```
**แก้ไข:** ลบข้อมูลซ้ำก่อน:
```javascript
// หาข้อมูลซ้ำ
db.notifications.aggregate([
  { $group: { _id: "$shopNotificationId", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
])

// ลบข้อมูลซ้ำ
db.notifications.deleteMany({ shopNotificationId: "DUPLICATE_ID" })
```

### 3. Performance
- Indexes ใช้ RAM และ Disk space
- Write operations จะช้าลงเล็กน้อย (ต้องอัพเดต index)
- Read operations จะเร็วขึ้นมาก ⚡

---

## ✅ Checklist

หลังจากสร้าง indexes แล้ว ตรวจสอบ:

- [ ] มี 4 indexes ใน notifications collection (รวม _id)
- [ ] `shopNotificationId_1` เป็น unique index
- [ ] Query ที่ใช้ `shopNotificationId` ใช้ index (IXSCAN)
- [ ] Query ที่ใช้ `lineUserId + status` ใช้ index
- [ ] Query ที่ใช้ `contractId` ใช้ index

---

## 📞 ต้องการความช่วยเหลือ?

ถ้าติดปัญหาสามารถ:
1. ดู MongoDB Atlas logs
2. ตรวจสอบ Connection String ว่าถูกต้อง
3. ตรวจสอบว่า user มี permission ในการสร้าง index

---

## 🎯 แนะนำ

**สำหรับผู้เริ่มต้น:** ใช้ **วิธีที่ 1** (MongoDB Atlas Web Interface)
**สำหรับผู้มีประสบการณ์:** ใช้ **วิธีที่ 3** (mongosh)
**สำหรับ Production:** ใช้ **วิธีที่ 5** (Auto-create on startup)

---

เลือกวิธีที่เหมาะกับคุณและสร้าง indexes ได้เลย! 🚀
