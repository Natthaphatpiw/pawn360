import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { connectToDatabase } from '@/lib/db/mongodb';
import { putPrivateBlob } from '@/lib/storage/blob';
import { requireStoreMembership } from '@/lib/security/contract-access';
import { acquireFinancialLock, financialLockErrorResponse } from '@/lib/security/financial-lock';
import { LiffAuthError, requireLiffIdentity } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  readBoundedJsonObject,
  sanitizedServerError,
  TransactionRequestError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

const CONTRACTS_FOLDER = 'contracts/';
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_CONTRACT_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_CONTRACT_HTML_CHARS = 512 * 1024;

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type DecodedImage = { buffer: Buffer; contentType: string; extension: string };

function decodeImageDataUrl(value: unknown, maxBytes: number, pngOnly = false): DecodedImage | null {
  if (value === null || value === undefined || value === '') return null;
  const maxChars = Math.ceil(maxBytes * 4 / 3) + 128;
  const dataUrl = boundedText(value, maxChars, true) || '';
  const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || (pngOnly && match[1] !== 'png')) {
    throw new TransactionRequestError('INVALID_IMAGE', 400, 'ไฟล์รูปไม่ถูกต้อง');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new TransactionRequestError('IMAGE_TOO_LARGE', 413, 'รูปภาพมีขนาดใหญ่เกินไป');
  }

  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const webp = buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if ((match[1] === 'jpeg' && !jpeg) || (match[1] === 'png' && !png) || (match[1] === 'webp' && !webp)) {
    throw new TransactionRequestError('INVALID_IMAGE', 400, 'ไฟล์รูปไม่ถูกต้อง');
  }

  if (match[1] === 'jpeg') return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
  if (match[1] === 'webp') return { buffer, contentType: 'image/webp', extension: 'webp' };
  return { buffer, contentType: 'image/png', extension: 'png' };
}

function validateContractHtml(value: unknown): string | null {
  const html = boundedText(value, MAX_CONTRACT_HTML_CHARS);
  if (!html) return null;
  if (
    /<(script|iframe|object|embed|link|base)\b/i.test(html)
    || /<meta\b[^>]*http-equiv/i.test(html)
    || /(?:src|href)\s*=\s*["']?\s*(?:https?:|file:|ftp:|\/\/)/i.test(html)
    || /(?:url\s*\(|@import)[^)]*(?:https?:|file:|ftp:|\/\/)/i.test(html)
  ) {
    throw new TransactionRequestError(
      'UNSAFE_CONTRACT_HTML',
      400,
      'เอกสารมีทรัพยากรภายนอกที่ไม่อนุญาต',
    );
  }
  return html;
}

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (resourceRequest) => {
      const resourceUrl = resourceRequest.url();
      if (resourceUrl.startsWith('data:') || resourceUrl === 'about:blank') {
        void resourceRequest.continue();
      } else {
        void resourceRequest.abort();
      }
    });
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  let releaseLock: (() => Promise<void>) | null = null;
  try {
    // Reject unauthenticated callers before buffering and decoding a large
    // document body. Membership is checked after the item identifies a store.
    await requireLiffIdentity(request, 'STORE');
    const body = await readBoundedJsonObject(request, 8 * 1024 * 1024);
    const itemId = String(body.itemId || '').trim();
    if (!ObjectId.isValid(itemId)) {
      return NextResponse.json({ error: 'รหัสรายการไม่ถูกต้อง', code: 'INVALID_ITEM_ID' }, { status: 400 });
    }

    const contractHtml = validateContractHtml(body.contractHTML);
    const contractImage = decodeImageDataUrl(body.contractImageData, MAX_CONTRACT_IMAGE_BYTES, true);
    const verificationPhoto = decodeImageDataUrl(body.verificationPhoto, MAX_PHOTO_BYTES);
    if (!contractHtml && !contractImage) {
      return NextResponse.json({ error: 'ไม่พบเอกสารสัญญา', code: 'CONTRACT_DOCUMENT_REQUIRED' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const contractsCollection = db.collection('contracts');
    const item = await itemsCollection.findOne(
      { _id: new ObjectId(itemId) },
      { projection: { _id: 1, storeId: 1 } },
    );
    if (!item || !item.storeId) {
      return NextResponse.json({ error: 'ไม่พบรายการขอสินเชื่อ', code: 'ITEM_NOT_FOUND' }, { status: 404 });
    }

    await requireStoreMembership(request, db, item.storeId);
    releaseLock = await acquireFinancialLock(`mongo-contract:save-document:${itemId}`, 180);

    const uniqueId = crypto.randomUUID();
    let contractPath: string;
    if (contractHtml) {
      const pdfBuffer = await renderPdf(contractHtml);
      contractPath = `${CONTRACTS_FOLDER}contract-${itemId}-${uniqueId}.pdf`;
      await putPrivateBlob(contractPath, pdfBuffer, 'application/pdf');
    } else {
      contractPath = `${CONTRACTS_FOLDER}contract-${itemId}-${uniqueId}.png`;
      await putPrivateBlob(contractPath, contractImage!.buffer, 'image/png');
    }

    let verificationPhotoPath: string | null = null;
    if (verificationPhoto) {
      verificationPhotoPath = `${CONTRACTS_FOLDER}verification-${itemId}-${uniqueId}.${verificationPhoto.extension}`;
      await putPrivateBlob(verificationPhotoPath, verificationPhoto.buffer, verificationPhoto.contentType);
    }

    const existingContract = await contractsCollection.findOne(
      { itemId: item._id },
      { projection: { contractNumber: 1 } },
    );
    const contractNumber = typeof existingContract?.contractNumber === 'string'
      ? existingContract.contractNumber
      : `C${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const contractImages: Record<string, string> = { signedContract: contractPath };
    if (verificationPhotoPath) contractImages.verificationPhoto = verificationPhotoPath;

    await contractsCollection.updateOne(
      { itemId: item._id },
      {
        $set: {
          contractNumber,
          signedAt: new Date(),
          status: 'signed',
          contractImages,
          updatedAt: new Date(),
        },
        $setOnInsert: { itemId: item._id, createdAt: new Date() },
      },
      { upsert: true },
    );

    return NextResponse.json({
      success: true,
      message: 'บันทึกสัญญาเรียบร้อยแล้ว',
      contractNumber,
      contractImageUrl: contractPath,
      verificationPhotoUrl: verificationPhotoPath,
    });
  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    const lockError = financialLockErrorResponse(error);
    if (lockError) return lockError;
    console.error('[contract:save-document] failed');
    return sanitizedServerError('เกิดข้อผิดพลาดในการบันทึกสัญญา กรุณาลองใหม่');
  } finally {
    await releaseLock?.();
  }
}
