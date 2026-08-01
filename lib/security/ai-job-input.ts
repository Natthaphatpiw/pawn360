import type { AnalyzeConditionRequest } from '@/lib/services/analyze-condition-pipeline';
import type { EstimateRequest } from '@/lib/services/estimate-pipeline';

export const AI_JOB_ITEM_TYPES = [
  'Apple',
  'โทรศัพท์มือถือ',
  'อุปกรณ์เสริมโทรศัพท์',
  'กล้อง',
  'โน้ตบุค',
  'อุปกรณ์คอมพิวเตอร์',
] as const;

const APPLE_CATEGORIES = [
  'iPhone',
  'iPad',
  'MacBook',
  'Apple Watch',
  'AirPods',
  'iMac',
  'Mac mini',
  'Mac Studio',
  'Mac Pro',
] as const;

type ValidationFailure = {
  ok: false;
  status: 400;
  error: string;
  code: string;
};

type ValidationSuccess<T> = { ok: true; value: T };
export type AIJobInputValidation<T> = ValidationSuccess<T> | ValidationFailure;

const failure = (code = 'invalid_ai_job_input'): ValidationFailure => ({
  ok: false,
  status: 400,
  error: 'ข้อมูลที่ส่งเพื่อประเมินไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่',
  code,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function cleanString(value: unknown, maxLength: number, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('REQUIRED');
    return undefined;
  }
  if (typeof value !== 'string') throw new Error('TYPE');
  const normalized = value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if ((required && !normalized) || normalized.length > maxLength) throw new Error('LENGTH');
  return normalized || undefined;
}

function finiteRange(value: unknown, min: number, max: number, required = false): number | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('REQUIRED');
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error('NUMBER');
  }
  return value;
}

function cleanItemType(value: unknown): string {
  const itemType = cleanString(value, 40, true) || '';
  if (!(AI_JOB_ITEM_TYPES as readonly string[]).includes(itemType)) throw new Error('ITEM_TYPE');
  return itemType;
}

function cleanAppleCategory(value: unknown, itemType: string): string | undefined {
  const category = cleanString(value, 40);
  if (!category) return undefined;
  if (itemType !== 'Apple' || !(APPLE_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error('APPLE_CATEGORY');
  }
  return category;
}

const CONDITION_KEYS = new Set([
  'images', 'itemType', 'lineId', 'brand', 'model', 'appleCategory',
]);

export function validateConditionJobInput(value: unknown): AIJobInputValidation<AnalyzeConditionRequest> {
  try {
    if (!isRecord(value) || !hasOnlyKeys(value, CONDITION_KEYS)) return failure('unsupported_ai_job_field');
    if (!Array.isArray(value.images)) return failure();
    const itemType = cleanItemType(value.itemType);
    const lineId = cleanString(value.lineId, 128);
    return {
      ok: true,
      value: {
        images: value.images as string[],
        itemType,
        ...(lineId ? { lineId } : {}),
        ...(cleanString(value.brand, 120) ? { brand: cleanString(value.brand, 120) } : {}),
        ...(cleanString(value.model, 240) ? { model: cleanString(value.model, 240) } : {}),
        ...(cleanAppleCategory(value.appleCategory, itemType)
          ? { appleCategory: cleanAppleCategory(value.appleCategory, itemType) }
          : {}),
      },
    };
  } catch {
    return failure();
  }
}

const ESTIMATE_KEYS = new Set([
  'itemType', 'brand', 'model', 'capacity', 'serialNo', 'accessories',
  'condition', 'pawnerCondition', 'aiCondition', 'defects', 'note',
  'images', 'imageHashes', 'lineId', 'appleCategory', 'appleSpecs',
  'color', 'screenSize', 'watchSize', 'watchConnectivity', 'cpu', 'ram',
  'storage', 'gpu', 'lenses', 'conditionJobId',
]);

export function validateEstimateJobInput(value: unknown): AIJobInputValidation<EstimateRequest> {
  try {
    if (!isRecord(value) || !hasOnlyKeys(value, ESTIMATE_KEYS)) return failure('unsupported_ai_job_field');
    if (!Array.isArray(value.images)) return failure();
    const itemType = cleanItemType(value.itemType);
    const lineId = cleanString(value.lineId, 128, true) || '';
    const conditionJobId = cleanString(value.conditionJobId, 64);
    if (conditionJobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conditionJobId)) {
      return failure('invalid_condition_job_id');
    }

    let imageHashes: string[] | undefined;
    if (value.imageHashes !== undefined) {
      if (
        !Array.isArray(value.imageHashes)
        || value.imageHashes.length > 4
        || !value.imageHashes.every((hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash))
      ) return failure('invalid_image_hashes');
      imageHashes = value.imageHashes.map((hash) => hash.toLowerCase());
    }

    let lenses: string[] | undefined;
    if (value.lenses !== undefined) {
      if (!Array.isArray(value.lenses) || value.lenses.length > 10) return failure();
      lenses = value.lenses.map((lens) => cleanString(lens, 160, true) || '');
    }

    const optionalText = (key: keyof EstimateRequest, maxLength: number) => {
      const cleaned = cleanString(value[key], maxLength);
      return cleaned ? { [key]: cleaned } : {};
    };

    return {
      ok: true,
      value: {
        itemType,
        brand: cleanString(value.brand, 120, true) || '',
        model: cleanString(value.model, 240, true) || '',
        condition: finiteRange(value.condition, 0, 100, true) as number,
        lineId,
        images: value.images as string[],
        ...optionalText('capacity', 120),
        ...optionalText('serialNo', 120),
        ...optionalText('accessories', 1_000),
        ...optionalText('defects', 2_000),
        ...optionalText('note', 2_000),
        ...optionalText('appleSpecs', 1_000),
        ...optionalText('color', 80),
        ...optionalText('screenSize', 80),
        ...optionalText('watchSize', 80),
        ...optionalText('watchConnectivity', 120),
        ...optionalText('cpu', 200),
        ...optionalText('ram', 80),
        ...optionalText('storage', 120),
        ...optionalText('gpu', 200),
        ...(cleanAppleCategory(value.appleCategory, itemType)
          ? { appleCategory: cleanAppleCategory(value.appleCategory, itemType) }
          : {}),
        ...(finiteRange(value.pawnerCondition, 0, 100) !== undefined
          ? { pawnerCondition: finiteRange(value.pawnerCondition, 0, 100) }
          : {}),
        ...(finiteRange(value.aiCondition, 0, 100) !== undefined
          ? { aiCondition: finiteRange(value.aiCondition, 0, 100) }
          : {}),
        ...(imageHashes ? { imageHashes } : {}),
        ...(lenses ? { lenses } : {}),
        ...(conditionJobId ? { conditionJobId } : {}),
      },
    };
  } catch {
    return failure();
  }
}
