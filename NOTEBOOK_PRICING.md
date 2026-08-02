# วิธีคำนวณราคาประเมินโน้ตบุ๊ก (Notebook Pricing v2)

เอกสารนี้อธิบายวิธีคำนวณ **ราคากลาง (market price)** ของโน้ตบุ๊ก (`itemType === 'โน้ตบุค'`)
ที่ใช้ใน `POST /api/estimate` แทน pipeline เดิม โดยขั้นตอนหลังจากได้ราคากลางแล้ว
(LTV 60% → blend condition → snap 500) **ยังเหมือนสินค้าประเภทอื่นทุกประการ**

โค้ดที่เกี่ยวข้อง:

| ไฟล์ | หน้าที่ |
|---|---|
| [`lib/services/notebook-spec.ts`](lib/services/notebook-spec.ts) | แปลง input เป็น `NotebookSpec` + lookup คะแนน CPU/GPU |
| [`lib/data/notebook-benchmarks.json`](lib/data/notebook-benchmarks.json) | ตารางคะแนน benchmark CPU/GPU (~PassMark scale) |
| [`lib/services/notebook-pricing.ts`](lib/services/notebook-pricing.ts) | เครื่องคิดราคา: classify → adjust → ladder → confidence (pure function) |
| [`lib/services/price-observations.ts`](lib/services/price-observations.ts) | อ่าน/เขียน comps DB (`price_observations`) |
| [`app/api/estimate/route.ts`](app/api/estimate/route.ts) | orchestration: harvest listings จาก web search / SerpAPI แล้วเรียกเครื่องคิดราคา |
| [`database/migrations/2026_07_09_add_price_observations.sql`](database/migrations/2026_07_09_add_price_observations.sql) | สคีมาตาราง comps DB |

---

## 1. ทำไมต้องมี pipeline แยกสำหรับโน้ตบุ๊ก

ปัญหาของ pipeline เดิมกับโน้ตบุ๊ก:

1. **Config กระจาย** — family เดียวกัน (เช่น IdeaPad 3 15) มีตั้งแต่ i3/8GB ถึง i7/16GB+dGPU
   ราคาต่างกันได้ ~2 เท่า แต่เดิมทุก listing ถูกโยนเข้า median รวมกันโดยไม่ตรวจ config
2. **บางรุ่นไม่มีราคามือสองให้ค้นเลย** — เดิมถ้าได้ 0 listing ระบบ fallback เป็นราคากลาง
   ฿100 เงียบ ๆ แล้ว cache ไว้ 30 วัน
3. **สเปคไม่ถูกใช้คำนวณ** — CPU/RAM/GPU ถูกใช้แค่ต่อท้าย search query

หลักการของ v2: **"comps + adjustments"** แบบงานประเมินทรัพย์มาตรฐาน —
หา listing ที่เกี่ยวข้องให้กว้างที่สุด (ตรงรุ่น → รุ่นพี่น้อง → แบรนด์เดียวกัน → ข้ามแบรนด์ →
ราคาของใหม่) แล้ว **ปรับราคาของแต่ละ listing เข้าหาสเปคเป้าหมายด้วยตัวคูณ**
ก่อนส่งเข้าตัวหาค่ากลาง (`computeRepresentativeUsedPriceTHB`) ตัวเดิม

> **ทำไมไม่ใช้ spec score รวมตัวเดียวแล้ว interpolate?**
> การรวม CPU benchmark (สเกล ~หมื่น) กับตัวคูณ RAM/SSD (สเกล ~1.0) ใน weighted sum
> ทำให้น้ำหนักจริงของ CPU ≈ 98% — RAM/Storage/GPU/จอแทบไม่มีผลต่อราคา
> การปรับราคา "รายตัว comp" แบบคูณให้ทุกปัจจัยออกฤทธิ์ตามสัดส่วนจริง และอธิบายได้เป็นข้อ ๆ

---

## 2. ขั้นที่ 1 — สกัดสเปคเป้าหมาย (`NotebookSpec`)

`extractNotebookSpec(input)` ใน `notebook-spec.ts`:

1. **LLM canonicalization** (OpenAI Terra เป็นหลัก; Claude ผ่าน `anthropicStructured` เป็น fallback): รับ brand/model/cpu/ram/storage/gpu/
   note จากฟอร์ม → ตอบ JSON: `family` (ชื่อตระกูลไม่รวม SKU เช่น "IdeaPad 3 15"), `variant`,
   `cpuModel` แบบ canonical ("Intel Core i5-12450H"), `ramGb`, `storageGb`, `storageType`
   (`nvme|sata|hdd`), `gpuModel`, `screenSizeIn`, `panel` (`tn|ips|oled`), `releaseYear`,
   `segment` (`office|ultrabook|gaming|workstation`)
2. **Benchmark lookup** (local, ไม่มี network): จับคู่ `cpuModel`/`gpuModel` กับ
   `notebook-benchmarks.json` ด้วย alias matching (normalize เป็น lowercase alphanumeric
   แล้วเทียบ substring) → ได้ `cpuScore`, `gpuScore`, `cpuYear`
   - ถ้าไม่เจอในตาราง → heuristic ประมาณจาก family/gen (เช่น "i7 gen 12 H-series")
     และ mark `cpuScoreSource: 'heuristic'` (ไปหักคะแนน confidence)
3. `releaseYear` fallback = ปีของ CPU จากตาราง benchmark
4. ถ้าไม่มีทั้ง OpenAI และ Anthropic key → ใช้ heuristic parser ล้วน (regex จับ i5-12450H, Ryzen 5 5500U,
   ขนาด RAM/SSD ฯลฯ)

---

## 3. ขั้นที่ 2 — เก็บเกี่ยว listing (harvest)

`fetchNotebookListings()` ใน `lib/services/estimate-pipeline.ts` ยิง **market search 1 ครั้ง**
ผ่าน fresh Redis cache → Parallel Search → Exa fallback → stale cache แล้วใช้ OpenAI Terra
สกัด structured evidence (Claude เป็น LLM fallback) โดยค้นหลายมุมภายใน request เดียว:

1. ราคามือสองไทยของ **รุ่นตรง** (Kaidee, Facebook Marketplace ฯลฯ)
2. ถ้าตรงรุ่นได้ไม่ถึง 4 รายการ → ราคามือสองของ **รุ่นพี่น้องใน family เดียวกัน** (config ต่างได้)
3. **ราคาของใหม่ปัจจุบัน / ราคาเปิดตัว** ของรุ่นนั้น 1–3 รายการ (JIB / Banana / Advice /
   ราคาเปิดตัวจากรีวิว) — เป็น anchor สำหรับ Level 5

ทุก listing ต้อง label:

```jsonc
{
  "title": "...", "price_thb": 12900, "source": "kaidee", "url": "...",
  "listing_kind": "used" | "new_current" | "launch_msrp",
  "match": "exact" | "family" | "same_brand" | "cross_brand",
  "cpu": "i5-1135G7", "ram_gb": 8, "storage_gb": 512,
  "storage_type": "nvme", "gpu": "Iris Xe", "condition_note": "..."
}
```

**SerpAPI** (ถ้าเปิด `SERPAPI_ENABLED`): ใช้ตัวกรองเดิม (คัดเฉพาะรุ่นตรง) แต่ผลลัพธ์ของ
Google Shopping ส่วนใหญ่เป็น **ราคาของใหม่** → ระบบ map เป็น `new_current` anchor
(ไม่ปนเข้า pool ราคามือสอง) — นี่คือการใช้ SerpAPI "ให้เป็นประโยชน์" กับโน้ตบุ๊ก:
มันหาราคามือสองไทยไม่เก่ง แต่เป็นแหล่ง MSRP/ราคาของใหม่ที่ดี

**comps DB (L0)**: ก่อน harvest ระบบอ่าน `price_observations` ย้อนหลัง 90 วัน
ที่ `brand`+`family` ตรงกัน แล้วเติมเข้า pool เหมือน listing ปกติ (origin `observation`)
ยิ่งระบบถูกใช้มาก pool ยิ่งหนา — และผล manual estimate ของแอดมินก็ถูกเก็บเข้าตารางนี้
เป็น anchor คุณภาพสูง

หลัง harvest เสร็จ ทุก listing + ผลประเมินสุดท้ายถูกเขียนกลับลง `price_observations`
แบบ fire-and-forget (พังเงียบได้ ไม่กระทบ response)

---

## 4. ขั้นที่ 3 — จัดชั้น listing (classification)

`classifyListings(target, listings)` ใน `notebook-pricing.ts` — **ไม่เชื่อ label จาก LLM
เพียงอย่างเดียว** แต่ตรวจซ้ำด้วยข้อมูล config ที่สกัดได้:

- lookup คะแนน CPU/GPU ของ listing จากตาราง benchmark เดียวกัน
- **exact** = CPU ตรง (id เดียวกัน หรือคะแนนต่างกัน ≤ 12%) และ RAM/Storage เท่ากัน
  (หรือไม่ระบุ) และ GPU class เดียวกัน
- ถ้า config ขัดกับ label ที่ LLM ให้มา → ปรับลงชั้นที่ต่ำกว่าเสมอ (conservative)
- listing ที่ราคา ≤ 500 บาท หรือมีคำต้องห้าม (อะไหล่, จอแตก, เครื่องเสีย) → ทิ้ง

ผลลัพธ์: 5 กอง — `exact[]`, `family[]`, `sameBrand[]`, `crossBrand[]`, `newAnchors[]`

---

## 5. ขั้นที่ 4 — ปรับราคารายตัว comp (multiplicative adjustment)

หัวใจของระบบ — `adjustCompPrice(target, comp, cfg)`:

```
adjustedPrice = compPrice × F_cpu × F_gpu × F_ram × F_storage × F_screen × F_year × F_brand
```

| ตัวคูณ | สูตร | clamp |
|---|---|---|
| `F_cpu` | `(cpuScore_target / cpuScore_comp) ^ 0.35` | [0.70, 1.45] |
| `F_gpu` | dGPU↔dGPU: `(gpuScore_t / gpuScore_c) ^ 0.40` · อื่น ๆ: `classMult_t / classMult_c` | [0.65, 1.55] |
| `F_ram` | `ramFactor(t) / ramFactor(c)` — piecewise-linear บน log₂(GB): 4→0.90, 8→1.00, 16→1.15, 32→1.30, 64→1.40 | — |
| `F_storage` | `(typeF·sizeF)_t / (typeF·sizeF)_c` — type: HDD 0.92, SATA 1.00, NVMe 1.03 · size (log₂): 128→0.95, 256→1.00, 512→1.06, 1024→1.14, 2048→1.22 | — |
| `F_screen` | panel: TN 0.98, IPS 1.00, OLED 1.06 · refresh ≥120Hz ×1.03 — **ข้ามเมื่อ comp เป็น exact** (เครื่องเดียวกัน จอย่อมเหมือนกัน) | — |
| `F_year` | `1.04 ^ (cpuYear_t − cpuYear_c)` — เทียบ**ปีเปิดตัว CPU ทั้งสองฝั่ง** (ฐานเดียวกัน) | ±3 ปี → [0.88, 1.12] |
| `F_brand` | `brandTier_t / brandTier_c` (ใช้เฉพาะ cross-brand): apple 1.15, microsoft 1.05, กลุ่ม mainstream 1.00, ไม่รู้จัก 0.95 | — |

GPU class multiplier (เมื่อไม่มีคะแนน dGPU ทั้งคู่): `integrated 1.00, entry 1.08, mid 1.22,
high 1.38, ultra 1.55`

กติกาสำคัญ:

- ปัจจัยที่ **ไม่รู้ค่าฝั่งใดฝั่งหนึ่ง → ตัวคูณ = 1.0** แต่บวก "ความไม่รู้" เข้า
  `unknownPenalty` (ไปหัก confidence)
- **Total cap**: ถ้า `∏F ∉ [0.62, 1.60]` → **ทิ้ง comp นั้น** (ต่าง class เกินกว่าจะปรับ)
  ไม่ฝืนปรับ
- เหตุผลที่ใช้เลขชี้กำลัง < 1 กับ CPU/GPU: ราคามือสองไม่วิ่งตาม benchmark แบบ 1:1
  (benchmark ×2 ≠ ราคา ×2) — exponent 0.35/0.40 เป็น elasticity ตั้งต้น รอ calibrate
  จากข้อมูลจริงใน comps DB

---

## 6. ขั้นที่ 5 — Ladder เลือกระดับ + ค่ากลาง

จากกองที่ classify แล้ว (นับเฉพาะ comp ที่รอด adjustment cap):

| Level | เงื่อนไข | วิธีคิด | weight ใน estimator |
|---|---|---|---|
| **L1 exact** | exact ≥ 3 | ราคา exact ตรง ๆ เข้า `computeRepresentativeUsedPriceTHB` | — |
| **L2 family** | exact+family ≥ 3 | exact + family ที่ adjust แล้ว | exact 2 : family 1 |
| **L3 brand** | exact+family+sameBrand ≥ 3 | เพิ่ม sameBrand ที่ adjust แล้ว | 3 : 2 : 1 |
| **L4 cross** | used comps รวม ≥ 2 | เพิ่ม crossBrand (× `F_brand`) | 3 : 2 : 1.5 : 1 |
| **L5 anchor** | newAnchors ≥ 1 | สูตร depreciation (ข้อ 7) | — |
| **ไม่ผ่านสักชั้น** | — | **HTTP 422** `insufficient_data` — ไม่มีการเดาราคา ฿100 อีกต่อไป | — |

ตัวหาค่ากลางคือ `computeRepresentativeUsedPriceTHB` ตัวเดิม (winsorize p10/p90 →
dispersion regime → percentile window) โดยส่ง `weights` ตามตาราง

**Guardrail ไขว้ระดับ**: ถ้าได้ผลจาก L1–L4 และมี `newAnchors` อยู่ด้วย → ตรวจว่าผลอยู่ใน
`[0.55, 1.20] × L5value` ไหม ถ้าหลุดช่วง → clamp เข้าขอบ + หัก confidence 15%
(กันเคส comp ปนเปื้อน เช่น listing ของใหม่แอบติดมาในกองมือสอง)

---

## 7. Level 5 — MSRP / ราคาของใหม่ + depreciation

ใช้เมื่อไม่มีราคามือสองที่ใช้ได้เลย (โจทย์ "รุ่นที่หาราคามือสองไม่ได้"):

- `age = ปีปัจจุบัน − releaseYear` (จากสเปค หรือปีของ CPU)
- anchor 2 แบบ คิดต่างกัน:
  - **`new_current`** (ราคาของใหม่ที่ยังขายอยู่ — มันสะท้อนส่วนลดตามอายุแล้ว):
    `usedValue = newPrice × (0.78 − 0.03 × min(age, 4))` → age 0: ×0.78 … age 4+: ×0.66
  - **`launch_msrp`** (ราคาเปิดตัว): `usedValue = msrp × retention(age) × segmentAdj`
    โดย `retention = [0.82, 0.65, 0.52, 0.42, 0.34, 0.28, 0.23]` (ปี 0–6) แล้วลด 15%/ปี
    ต่อ floor ที่ 0.15 · `segmentAdj`: office 0.95, workstation 0.90, อื่น ๆ 1.00
- หลาย anchor → median ของ `usedValue` ทุกตัว
- anchor แต่ละตัวถูก adjust config ด้วยตัวคูณข้อ 5 ก่อนถ้ารู้ config ของมัน (เช่น
  ราคาของใหม่เป็นรุ่น 16GB แต่ลูกค้าถือ 8GB)

ตัวเลข retention มาจากพฤติกรรมตลาดโน้ตบุ๊กมือสองทั่วไป (ตกแรงปีแรก ~30–35%,
หลังจากนั้น ~15–20%/ปี) — เป็น**ค่าตั้งต้นที่ต้อง calibrate** เมื่อ comps DB มีข้อมูลจับคู่
"ราคามือสองจริง vs MSRP" มากพอ

---

## 8. Confidence (แทนค่าตายตัว 0.85)

```
confidence = base(level) × f(n) × g(D) × h(adjustment) × k(unknowns)   → clamp [0.20, 0.95]
```

- `base`: L1 0.88 · L2 0.78 · L3 0.65 · L4 0.55 · L5 0.45
- `f(n)` จำนวน comp: `min(1, 0.5 + n/8)` (n ≥ 4 → 1.0)
- `g(D)` dispersion จาก estimator: `D ≤ 0.45 → 1.0` ไม่งั้น `max(0.75, 1 − (D − 0.45))`
- `h` ขนาดการปรับเฉลี่ย: `1 − min(0.3, mean(|ln ∏F|) × 0.5)`
- `k` ปัจจัยที่ไม่รู้ (cpu score เป็น heuristic, ไม่รู้ RAM ฯลฯ): `0.95 ^ unknownCount`

confidence ถูกส่งใน response จริง และตั้งใจให้ฝั่ง business ใช้ตัดสิน:
ต่ำกว่า ~0.5 ควรบังคับผ่าน manual estimate ก่อนทำสัญญา (ยังไม่ enforce ใน v2 —
รอ business ตัดสิน LTV haircut ต่อ level)

---

## 9. การต่อเข้ากับ flow เดิม

- เฉพาะ `itemType === 'โน้ตบุค'` เท่านั้นที่เข้า path นี้ — Apple/MacBook ผ่านหมวด Apple
  ยังใช้ pipeline เดิม (แม่นอยู่แล้ว)
- ราคากลางที่ได้ → `pawnPrice = round(market × 0.6)` → blend condition → snap 500
  เหมือนเดิมทุกประการ
- `calculation.marketPrice` (ข้อความไทยใน response) ระบุระดับที่ใช้ เช่น
  `"ราคาตัวแทนจากรุ่นเดียวกัน 5 รายการ (ปรับสเปคแล้ว) [L2]"`
- **Cache**: payload key เพิ่ม field `notebookPipeline: 'v2'` **เฉพาะเมื่อเป็นโน้ตบุ๊ก** —
  ทำให้ cache โน้ตบุ๊กเก่าทั้งหมด (รวมเคส ฿100) invalidated ทันที โดย cache ของ
  Apple/มือถือ/กล้อง **ไม่โดนล้าง**
- เคสข้อมูลไม่พอ: HTTP 422 พร้อมข้อความไทย → UI แสดง error แทนที่จะได้ราคาผิด ๆ

---

## 10. ค่า config ทั้งหมด

ทุกตัวเลขในเอกสารนี้อยู่ใน `DEFAULT_NOTEBOOK_PRICING_CONFIG` (`notebook-pricing.ts`)
override ได้เป็นราย field แบบเดียวกับ `RepresentativePriceConfig` — ไม่มี magic number
ฝังในสูตร จุดที่ควร calibrate เรียงตามผลกระทบ:

1. `cpuElasticity` (0.35) / `gpuElasticity` (0.40)
2. `retentionByAge` + `newCurrentFactor` (L5)
3. ตาราง `ramFactors` / `storageSizeFactors` / `gpuClassMults`
4. `totalAdjustmentCap` [0.62, 1.60]
5. `brandTiers`

วิธี calibrate: เมื่อ `price_observations` มีคู่ (exact listing, family listing) ของ family
เดียวกันมากพอ → fit log-linear regression `ln(price) ~ ln(cpuScore) + ln(ramFactor) + …`
แล้วแทน elasticity ที่ fit ได้ (มี `scripts/notebook-pricing-test.ts` เป็นโครง harness)

---

## 11. ข้อจำกัดที่รู้ + งานต่อ

- คะแนนใน `notebook-benchmarks.json` เป็นค่าประมาณ (±15%) จาก curation หลายชั้น —
  ผลต่อราคาถูก damp ด้วย elasticity แล้ว (คลาดคะแนน 15% → คลาดราคา ~5%)
  ตารางควร refresh เมื่อมีชิปรุ่นใหม่ (เพิ่ม entry ใน JSON ได้ตรง ๆ)
- ยังไม่มี golden dataset วัด MAPE ต่อ level — ควรเก็บ 50–100 เครื่องพร้อมราคาที่ถูกต้อง
  แล้ว backtest ผ่าน `scripts/system-benchmark.js` (ต้องเพิ่ม ground-truth ให้ fixtures)
- `battery cycle / ประกันเหลือ` ยังไม่อยู่ในโมเดล — ปล่อยให้ condition score ดูดซับ
- Level 3/4 ยังใช้ weight คงที่ ไม่ใช่ kNN ระยะทางจริงบน spec space — อัปเกรดได้เมื่อ
  comps DB หนาพอ

---

## 12. ชั้น anchor สำหรับหมวดอื่น (generic path) + นโยบายความเสี่ยง

L5 ข้างบนเป็น anchor ของ *โน้ตบุ๊ก* เท่านั้น หมวดอื่น (มือถือ, แท็บเล็ต, กล้อง,
อุปกรณ์เสริม ฯลฯ) เดินคนละ code path และเดิมไม่มี fallback — หาลิสต์มือสองไม่เจอ
= จบเลย `lib/services/anchor-pricing.ts` เติมชั้นเดียวกันนี้ให้ทุกหมวด: หาราคา
**ของใหม่ในไทย** (หาง่ายกว่าราคามือสองมาก) แล้วหักค่าเสื่อมตามอายุ

### ห้ามตีราคาสูงกว่าความจริง

ความผิดพลาดสองทางไม่เท่ากัน — ตีต่ำไปแค่ทำให้ผู้จำนำกู้ได้น้อยลง แต่ตีสูงไป
แปลว่านักลงทุนถือของที่มีมูลค่าน้อยกว่าเงินที่ปล่อยไป โมเดลชั้นนี้จึง**ไม่ได้ถูก
ออกแบบให้ unbiased** แต่ตั้งใจให้เอียงต่ำ

เส้น retention ถูก calibrate ให้ลงตรงเป้าหมายราคาพอดี ลำพังค่าเสื่อมจึงยังไม่พอ —
วัดจาก 15 observation แล้วเกินเป้า 6 ครั้ง จึงมี **safety haircut** ทับอีกชั้น
โดยมีเพดานตายตัวที่ `SAFETY_MAX = 0.88` ไม่ว่าหลักฐานจะดีแค่ไหนก็ไม่มีทางเกิน

ใต้เพดานนั้น haircut ยังผันตามจำนวนหลักฐาน (anchor เดียว ~0.73) ดังนั้นการมี
หลักฐานเพิ่มซื้อความแม่นยำกลับมาได้ แต่ซื้อการรับประกันคืนไม่ได้:

| จำนวน anchor | เกินความจริง | bias เฉลี่ย |
|---|---|---|
| 1 | 0/8 | −25.4% |
| 3 | 0/8 | −15.2% |
| 10 | 0/8 | −10.1% |

(ถ้าใช้ haircut คงที่ให้ครอบคลุมเคสแย่สุดเท่ากัน ต้องตั้งที่ ~0.70 = เสีย 34%
กับของทุกชิ้นเพื่อกัน outlier ตัวเดียว)

### ไม่มั่นใจพอ → ปฏิเสธ ไม่ใช่เดา

`MIN_ESTIMATE_CONFIDENCE_TO_QUOTE = 0.25` — ต่ำกว่านี้ระบบ**ไม่เสนอราคาเลย**
แทนที่จะประกาศตัวเลขที่ยืนยันไม่ได้ ผู้ใช้ได้ข้อความว่า
"สินค้าไม่สามารถประเมินราคาได้ กรุณารอเจ้าหน้าที่ติดต่อกลับทาง LINE ครับ"
แล้วงานเด้งเข้า `escalateToManualEstimate`

| anchor | รู้ปีวางจำหน่าย | confidence | ผล |
|---|---|---|---|
| 1 | ไม่รู้ | 0.24 | **ปฏิเสธ** |
| 1 | รู้ | 0.29 | เสนอ + เจ้าหน้าที่ตรวจ |
| 4+ | รู้ | 0.42 | เสนอ + เจ้าหน้าที่ตรวจ |

เพดาน confidence ของชั้น anchor คือ 0.42 ซึ่งต่ำกว่า
`MIN_ESTIMATE_CONFIDENCE_FOR_SUBMISSION = 0.5` เสมอ **ราคาจาก anchor จึงไม่มีทาง
ปล่อยกู้อัตโนมัติได้เลย** ต้องผ่านเจ้าหน้าที่ทุกครั้ง

เส้นนี้จับเฉพาะชั้น anchor — งานที่หาลิสต์มือสองเจอจริงยังได้ confidence ตาม
ปกติ (0.85) ไม่ได้รับผลกระทบ

### ที่ยังไม่ได้พิสูจน์

เส้น retention มี observation จริงรองรับหมวดละ 1–2 จุดเท่านั้น ถือเป็น
*calibrated prior* ไม่ใช่ curve ที่ fit มา — หมวด `hardware` กับ `default`
ยังไม่มี observation เลย (interpolate จากหมวดข้างเคียง) ทุกผลจากชั้นนี้ถูก mark
ไว้เพื่อติดตามความแม่นแยกจากชั้นอื่นเมื่อมีผลจริงสะสมมากพอ ปรับได้ราย env
(`ANCHOR_RETENTION_<CATEGORY>`, `ANCHOR_SAFETY_MAX`)
