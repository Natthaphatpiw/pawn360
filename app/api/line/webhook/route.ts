// Backward-compatible endpoint for deployments that still point LINE at
// /api/line/webhook. Keep exactly one seller webhook implementation so this
// legacy URL cannot bypass body limits, signature checks, replay protection,
// ownership validation, or sanitized error handling.
export { GET, POST } from '@/app/api/webhook/route';
