# ระบบคิวงานหนัก (Async Job Queue)

งาน AI ที่กินเวลานานเกิน budget ของ serverless request เดียว ใช้ระบบคิวร่วมกัน 2 งาน:

| งาน | endpoint คิว | pipeline | เวลาโดยประมาณ |
|---|---|---|---|
| **ประเมินราคา** | `/api/estimate/jobs` | [`estimate-pipeline.ts`](lib/services/estimate-pipeline.ts) | ~1–2 นาที (web search + LLM) |
| **ประเมินสภาพสินค้า** | `/api/analyze-condition/jobs` | [`analyze-condition-pipeline.ts`](lib/services/analyze-condition-pipeline.ts) | ~30–60 วิ (precheck + vision) |

ทั้งคู่ตอบทันที (jobId) แล้ว client poll จนเสร็จ — UX ฝั่งผู้ใช้เหมือนเดิม (ป๊อปอัพหมุนรอ + ยกเลิกได้)
แก้ปัญหา Vercel timeout (analyze-condition เดิม `maxDuration=60` แต่ precheck+scoring+fallback เกิน 60 วิ → 504)

## เครื่องยนต์ร่วม

- [`lib/services/job-queue.ts`](lib/services/job-queue.ts) — `JobQueue<Req,Res>` generic (Redis-backed) create/get/cancel/process + dispatcher
- [`lib/services/estimate-jobs.ts`](lib/services/estimate-jobs.ts) / [`analyze-condition-jobs.ts`](lib/services/analyze-condition-jobs.ts) — instance บาง ๆ ของ `JobQueue` ต่อ pipeline
- [`lib/job-poll-client.ts`](lib/job-poll-client.ts) — `runJob()` ฝั่ง client (enqueue+poll+sync fallback) ใช้ร่วมกัน
- job อยู่ใน Upstash Redis (`KV_REST_API_URL`/`KV_REST_API_TOKEN`) key `<namespace>:<uuid>` TTL 2 ชม. — ไม่มี migration/cron

```
UI → runJob()                         lib/job-poll-client.ts
      ├─ POST .../jobs                → 202 { jobId }   (~ms)
      ├─ GET  .../jobs/[id]           poll 2s แล้วทุก 5s → QUEUED|PROCESSING|COMPLETED|FAILED|CANCELLED
      ├─ POST .../jobs/[id]/cancel    (ผู้ใช้กดยกเลิก)
      └─ fallback: คิวไม่พร้อม (503)  → POST endpoint sync เดิม
งานจริง: JobQueue.process() → pipeline.run() → เก็บผลกลับ job (Redis)
```

- **Cache hit เร็วเหมือนเดิม**: pipeline เช็ค cache ภายใน งาน cache-hit จบใน ~1–2 วิ (poll แรกที่ 2 วิ)
- **ยกเลิก**: mark `CANCELLED` — งาน AI ที่วิ่งอยู่จะวิ่งจนจบแต่ผลถูกทิ้ง (cache ภายในถูก warm)
- **งานค้าง (function ตาย)**: งานที่วิ่งอยู่จะ "เต้นหัวใจ" (heartbeat) ทุก 15 วิ — ถ้า crash จะหยุดเต้น แล้ว **โหมด QStash retry claim งานกลับมาทำใหม่ได้ภายใน ~60 วิ**; ถ้าไม่มี retry มาเลย (โหมด waituntil) poller จะเห็นเป็น `FAILED (job_timeout)` หลังหยุดเต้น ~3 นาที (งานที่วิ่งช้าแต่ยังไม่ตายจะเต้นต่อ ไม่ถูกตัดทิ้ง)

## Dispatcher 2 โหมด (ใช้ร่วมทั้งสองคิว)

| โหมด | วิธีทำงาน | เหมาะกับ |
|---|---|---|
| `waituntil` (ค่าเริ่มต้น) | ตอบ 202 แล้วประมวลผลต่อใน background ผ่าน `after()` (`maxDuration=300`) | ใช้ได้ทันที ไม่ต้องตั้งอะไร |
| `qstash` | publish ไป Upstash QStash → ยิง `.../jobs/process` พร้อม retry (รอด crash/redeploy) | production |

### Env (ตั้งใน Vercel dashboard)

```bash
# เปิดโหมด QStash (ไม่ตั้ง = waituntil ใช้ได้เลย) — ใช้ค่าเดียวคุมทั้งสองคิว
JOB_DISPATCHER=qstash
QSTASH_TOKEN=...                     # จาก Upstash (กด Connect to Project จะ inject ให้)
JOB_WORKER_SECRET=<openssl rand -hex 32>   # กุญแจกัน .../jobs/process ถูกยิงมั่ว
# base URL ที่ QStash เรียกกลับ: ใช้ NEXT_PUBLIC_BASE_URL (มีอยู่แล้ว) หรือ JOB_CALLBACK_BASE_URL
```

**back-compat**: ถ้าเคยตั้ง `ESTIMATE_JOB_DISPATCHER` / `ESTIMATE_JOB_WORKER_SECRET` ไว้ ระบบยังอ่านเป็น fallback ของคิว estimate — แต่ค่าใหม่ `JOB_*` คุมได้ทั้งสองคิวในตัวเดียว แนะนำใช้ `JOB_*`

QStash ฟรี 500 ข้อความ/วัน; publish ล้มเหลว → fallback `waituntil` อัตโนมัติ (งานไม่หาย); localhost ใช้ QStash ไม่ได้ (ต้อง URL สาธารณะ) → dev fallback เป็น waituntil เอง

## โมเดล AI ของแต่ละ pipeline

- **ประเมินสภาพ** ([`analyze-condition-pipeline.ts`](lib/services/analyze-condition-pipeline.ts)):
  - precheck รูป (ตรงประเภท/สินค้าเดียวกัน) = Claude vision
  - ให้คะแนนสภาพ = **OpenAI `gpt-5.6-luna`** (Responses API, `getOpenAIVisionModel()` — override ด้วย `OPENAI_VISION_MODEL`) → fallback **Claude vision** ถ้า OpenAI ล้ม
  - **เลิกใช้ Gemini แล้ว** (เดิม `gemini-3-flash-preview` 503 บ่อย + key ตัวแรกใช้ไม่ได้)
  - reasoning effort คุมด้วย `OPENAI_VISION_REASONING_EFFORT` (default `low` — เน้นเร็ว)
- **ประเมินราคา**: ตามเดิม (`PRICE_SEARCH_PROVIDER`, notebook ladder ฯลฯ)

## ตัวเลือกอื่นที่สำรวจแล้ว (เผื่ออนาคต)

- **Vercel Queues** (`@vercel/queue`) — public beta ก.พ. 2026; ทางเลือก native เมื่อ GA (เพิ่ม dispatcher โหมดที่ 3 ได้ไม่กระทบส่วนอื่น)
- **Inngest / Trigger.dev** — workflow เต็มรูป (step retry, งานยาวหลายชั่วโมง) — เกินความจำเป็นของงาน ~1–2 นาที
- **BullMQ / pg-boss** — ต้องมี worker process ค้างยาว ไม่เข้ากับ Vercel serverless

## deployment checklist

- route ที่ `maxDuration=300`: `/api/estimate(/jobs, /jobs/process)`, `/api/analyze-condition(/jobs, /jobs/process)` — ต้องเปิด Fluid Compute
- ตั้ง env ทุกตัวใน Vercel dashboard (ไม่ใช่แค่ .env)
- `.../jobs/process` ปิด (503) เมื่อไม่ตั้ง `JOB_WORKER_SECRET`
