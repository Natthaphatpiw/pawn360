import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item } from '@/lib/db/models';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request);

    const {
      lineId,
      brand,
      model,
      type,
      serialNo,
      condition,
      defects,
      note,
      accessories,
      images,
      estimatedValue,
      desiredPrice,
    } = body;

    // Validation
    const claimedLineId = boundedText(lineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    const safeBrand = boundedText(brand, 120, true) || '';
    const safeModel = boundedText(model, 180, true) || '';
    const safeType = boundedText(type, 80, true) || '';

    if (!verifiedLineId || !safeBrand || !safeModel || !safeType) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    const safeImages = Array.isArray(images)
      ? images.slice(0, 4).map((url) => requireOwnedBlobUrl(url, ['pawn-items/']))
      : [];
    if (Array.isArray(images) && images.length > 4) {
      return NextResponse.json({ error: 'อัปโหลดรูปภาพได้สูงสุด 4 รูป' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');

    // Create temporary item
    const newItem: Item = {
      lineId: verifiedLineId,
      brand: safeBrand,
      model: safeModel,
      type: safeType,
      serialNo: boundedText(serialNo, 180) || '',
      condition: finiteNumber(condition, { min: 0, max: 100 }) ?? 0,
      defects: boundedText(defects, 2_000) || '',
      note: boundedText(note, 2_000) || '',
      accessories: boundedText(accessories, 2_000) || '',
      images: safeImages,
      status: 'temporary',
      currentContractId: undefined,
      contractHistory: [],
      desiredAmount: finiteNumber(desiredPrice ?? estimatedValue, { min: 0, max: 100_000_000 }) || 0,
      estimatedValue: finiteNumber(estimatedValue, { min: 0, max: 100_000_000 }) || 0,
      loanDays: 0,
      interestRate: 0,
      negotiationStatus: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert item into database
    const itemResult = await itemsCollection.insertOne(newItem);

    if (!itemResult.insertedId) {
      return NextResponse.json(
        { error: 'Failed to create temporary item' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      itemId: itemResult.insertedId,
      message: 'บันทึกข้อมูลชั่วคราวเรียบร้อยแล้ว',
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') {
      return liffAuthErrorResponse(error);
    }
    console.error('Temporary item error');
    return sanitizedServerError('เกิดข้อผิดพลาดในการบันทึกชั่วคราว');
  }
}
