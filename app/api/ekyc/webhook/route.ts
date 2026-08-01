import { NextRequest } from 'next/server';
import { ingestUpPassWebhook } from '@/lib/ekyc/webhook-ingress';

export async function POST(request: NextRequest) {
  return ingestUpPassWebhook(request, 'PAWNER');
}
