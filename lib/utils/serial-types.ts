// Item types for which a Serial No. is optional during estimate / pawn entry.
// Shared by app/estimate/page.tsx and app/estimate/pawn-summary.tsx.

export const SERIAL_OPTIONAL_TYPES = new Set([
  'อุปกรณ์เสริมโทรศัพท์',
  'กล้อง',
  'อุปกรณ์คอมพิวเตอร์',
]);

export const isSerialRequiredForType = (itemType?: string) => {
  if (!itemType) return false;
  return !SERIAL_OPTIONAL_TYPES.has(itemType);
};
