# ระบบคิวประเมินราคา (Estimate Job Queue)

การประเมินราคาสด (โดยเฉพาะโน้ตบุ๊ก) ใช้เวลา ~1–2 นาที (web search + LLM หลายตัว)
การถือ HTTP request เดียวค้างไว้นานขนาดนั้นเสี่ยงโดน timeout บน Vercel และ mobile network
ระบบคิวนี้เปลี่ยน flow เป็น **enqueue → ตอบ jobId ทันที → client poll จนเสร็จ**
โดย UX ฝั่งผู้ใช้เหมือนเดิมทุกประการ (ป๊อปอัพหมุนรอ + ยกเลิกได้)

## สถาปัตยกรรม

```
UI (estimate/page.tsx)
  └─ runEstimateJob()                     lib/estimate-job-client.ts
       ├─ POST /api/estimate/jobs         → 202 { jobId }   (ตอบใน ~ms)
       ├─ GET  /api/estimate/jobs/[id]    poll ครั้งแรกที่ 2s แล้วทุก 5s
       │        status: QUEUED | PROCESSING | COMPLETED | FAILED | CANCELLED
       ├─ POST /api/estimate/jobs/[id]/cancel   (เมื่อผู้ใช้กดยกเลิก)
       └─ fallback: ถ้าคิวไม่พร้อม (503) → POST /api/estimate แบบ sync เดิม

งานจริงรันโดย processEstimateJob()  →  runEstimatePipeline()
                                        (lib/services/estimate-pipeline.ts —
                                         pipeline เดิมทั้งก้อน ย้ายออกจาก route)
```

- **Job store**: Upstash Redis (env `KV_REST_API_URL`/`KV_REST_API_TOKEN` ที่มีอยู่แล้ว)
  key `estimate:job:v1:<uuid>` TTL 2 ชม. — ไม่ต้องมี migration/cron เก็บกวาด
- **Cache hit เร็วเหมือนเดิม**: pipeline เช็ค Redis cache ภายใน งาน cache-hit จบใน ~1–2 วิ
  client poll ครั้งแรกที่ 2 วิจึงได้ผลแทบทันที
- **ยกเลิก**: mark `CANCELLED` — งาน LLM ที่กำลังวิ่งจะวิ่งจนจบแต่ผลถูกทิ้ง
  (cache ภายในถูก warm ไว้ ทำให้กดประเมินซ้ำได้ผลเร็ว)
- **งานค้าง (function ตายกลางทาง)**: `PROCESSING` เกิน 6 นาที → ผู้ poll เห็นเป็น
  `FAILED (job_timeout)` และ (โหมด QStash) retry สามารถ claim งานซ้ำได้

## Dispatcher 2 โหมด (สลับด้วย env)

| โหมด | วิธีทำงาน | เหมาะกับ |
|---|---|---|
| `waituntil` (ค่าเริ่มต้น) | ตอบ 202 แล้วประมวลผลต่อใน background ของ function เดิมผ่าน `after()` ของ Next (`maxDuration = 300`) | เริ่มใช้ได้ทันที ไม่ต้องตั้งอะไรเพิ่ม |
| `qstash` | publish ไป **Upstash QStash** → QStash ยิง `POST /api/estimate/jobs/process` พร้อม retry อัตโนมัติ (รอด crash/redeploy กลางคัน) | production ที่ต้องการ delivery guarantee |

### Env ทั้งหมด

```bash
# โหมด (ไม่ตั้ง = waituntil)
ESTIMATE_JOB_DISPATCHER=qstash

# จำเป็นเมื่อใช้ qstash:
QSTASH_TOKEN=...                          # จาก Upstash console (บัญชีเดียวกับ Redis)
ESTIMATE_JOB_WORKER_SECRET=<random-32ch>  # กุญแจกัน endpoint /process ถูกยิงมั่ว
# URL ปลายทางที่ QStash จะเรียกกลับ (มีอยู่แล้ว): NEXT_PUBLIC_BASE_URL
# หรือ override เฉพาะทางด้วย ESTIMATE_JOB_CALLBACK_BASE_URL
```

QStash ฟรี 500 ข้อความ/วัน — พอสำหรับปริมาณประเมินช่วงแรกสบายๆ
ถ้า publish ล้มเหลว ระบบ fallback เป็น `waituntil` อัตโนมัติ (งานไม่หาย)

## ตัวเลือกอื่นที่สำรวจแล้ว (เผื่ออนาคต)

- **Vercel Queues** (`@vercel/queue`) — เข้า public beta ก.พ. 2026 ทุก plan;
  topic/consumer + retry ในตัว เป็นทางเลือก native เมื่อ GA — dispatcher ของเรา
  เป็น strategy pattern เพิ่มโหมดที่สามได้ไม่กระทบส่วนอื่น
- **Inngest / Trigger.dev** — แพลตฟอร์ม workflow เต็มรูป (step retry, observability,
  งานยาวหลายชั่วโมง) — เกินความจำเป็นของงานเดียว 2 นาที แต่ควรพิจารณาเมื่อมี
  background workflow หลายตัว (เช่น ticket queue, KYC follow-up) รวมกัน
- **BullMQ / pg-boss** — ต้องมี worker process ค้างยาว ไม่เข้ากับ Vercel serverless

## หมายเหตุ deployment

- Route ที่ประกาศ `maxDuration = 300`: `/api/estimate`, `/api/estimate/jobs`,
  `/api/estimate/jobs/process` — Hobby plan จำกัด max duration ต่ำกว่านี้
  (Fluid Compute default ~300s บน Pro) ตรวจ plan ก่อน deploy
- ต้องตั้ง env ทุกตัวข้างต้นใน **Vercel dashboard** ด้วย (ไม่ใช่แค่ .env local)
- Endpoint `/api/estimate/jobs/process` ถูกปิด (503) เมื่อไม่ตั้ง `ESTIMATE_JOB_WORKER_SECRET`
