# ระบบคิวงาน AI (Vercel Queues)

งานประเมินราคาและวิเคราะห์สภาพตอบ `202 { jobId }` แล้วหน้า LIFF poll สถานะ แทนการผูกผู้ใช้ไว้กับ request ที่อาจ timeout งาน production ใช้ Vercel Queues; `waitUntil` ใช้เฉพาะ local development และ QStash เป็น legacy fallback เท่านั้น

## Topics และ consumers

| งาน | Topic | Consumer | Provider concurrency เริ่มต้น |
|---|---|---|---:|
| ราคาสินค้าทั่วไป | `pawnline-estimate-generic-v1` | `/api/queues/estimate-generic` | 6 |
| ราคาโน้ตบุ๊ก | `pawnline-estimate-notebook-v1` | `/api/queues/estimate-notebook` | 2 |
| วิเคราะห์สภาพ | `pawnline-condition-v1` | `/api/queues/analyze-condition` | 8 |
| UpPass webhook/LINE notification | `ekyc-webhook-events` | `/api/queues/process-ekyc-webhook` | ควบคุมด้วย consumer + provider retry |

Queue triggers และ `maxDuration` อยู่ใน `vercel.json` ตัว consumer path จะถูก Vercel ผูกเป็น private queue trigger เมื่อ deploy สำเร็จ ไม่ควรเปิดเป็น public worker endpoint

## ลำดับงาน

```text
LIFF + LINE ID token
  -> POST /api/{estimate|analyze-condition}/jobs + Idempotency-Key
  -> Redis job record / private Blob payload (เมื่อ payload ใหญ่)
  -> Vercel Queue message { jobId, schemaVersion } เท่านั้น
  -> consumer claim ด้วย Redis NX lease
  -> pipeline (OpenAI/Parallel; fallback ตาม policy)
  -> Redis status: QUEUED | PROCESSING | RETRYING | COMPLETED | FAILED | CANCELLED
  -> LIFF poll แล้วแสดงสถานะภาษาไทย
```

- ผู้ใช้ดู/ยกเลิกได้เฉพาะ job ที่ `lineId` ตรงกับ LINE ID token
- รูปต้องเป็น private Vercel Blob HTTPS URL สูงสุด 4 รูป; queue message ไม่บรรจุ PII, URL หรือ image bytes
- Client สร้าง `Idempotency-Key`; Redis dedupe และ Vercel idempotency key ป้องกัน enqueue ซ้ำ
- Distributed lease ป้องกัน delivery ซ้ำทำงานพร้อมกัน และ heartbeat ต่ออายุ lease ระหว่างงานยาว
- Provider semaphore ใน Redis จำกัด concurrent jobs แยก generic/notebook/condition ปรับได้ด้วย `JOB_CONCURRENCY_*`
- Cache hit ยังคงจบเร็วและมี cost ใกล้ศูนย์

## Retry, rate limit และ DLQ

Vercel Queues เป็น at-least-once delivery จึงต้องถือว่า message ซ้ำเป็นเหตุการณ์ปกติ Consumer retry สูงสุด 8 deliveries โดยใช้ exponential backoff + jitter และเคารพ `Retry-After` จาก provider สถานะ `RETRYING` แจ้งผู้ใช้ว่าระบบกำลังรอและจะลองใหม่อัตโนมัติ

งานที่หมด retry จะเป็น `FAILED` พร้อม `job_retry_exhausted` และถูกเก็บใน Redis application DLQ เป็นเวลา 7 วัน Vercel Queues ยังไม่มี built-in DLQ จึงห้ามถอด application DLQ การ replay ต้องผ่านเครื่องมือ operations ที่ตรวจ idempotency และ payload retention ก่อนเสมอ

## Dispatch modes

| ค่า | การใช้งาน |
|---|---|
| `JOB_DISPATCHER=vercel` | production ที่แนะนำ |
| ไม่ตั้งบน Vercel | เลือก Vercel Queues อัตโนมัติ |
| `waituntil` | local `next dev` เท่านั้น; production จะบังคับกลับ Vercel Queue |
| `qstash` | compatibility path ที่ต้องมี `QSTASH_TOKEN`, callback URL และ worker secret |

หาก queue publish ล้ม production จะตอบ error ที่ retry ได้ ไม่ fallback ไป synchronous route โดยปริยาย เพราะจะทำลาย backpressure และเพิ่มโอกาสชน TPM ส่วน sync routes ถูกปิดด้วย `ALLOW_SYNCHRONOUS_AI_ROUTES=false`

## Deployment checklist

1. เชื่อม Vercel Queues integration และยืนยันว่า project รองรับ `queue/v2beta` (บริการยังเป็น beta จึงต้องทดสอบ preview/load test)
2. ตั้ง Redis, queue concurrency, `AI_MAX_JOB_COST_USD` และ `AI_MONTHLY_BUDGET_USD`
3. ตรวจว่า 4 triggers ใน `vercel.json` ถูกสร้างหลัง deploy
4. ทดสอบ duplicate delivery, 429 + `Retry-After`, function crash, cancel, payload ใหญ่ และ DLQ
5. ตั้ง alert จากอัตรา `RETRYING`, DLQ depth, queue age, latency, provider 429/5xx และ Redis failure
6. อย่าอ้างว่า queue ทำให้ระบบ exactly-once; correctness มาจาก idempotency + lease + monotonic state transitions
