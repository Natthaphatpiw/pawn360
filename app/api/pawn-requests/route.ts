import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item, Customer, PawnRequest } from '@/lib/db/models';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';
import { uploadQRCodeToBlob } from '@/lib/storage/blob';
import { sendQRCodeImage } from '@/lib/line/client';
import { ObjectId } from 'mongodb';
import {
  internalAuthErrorResponse,
  liffAuthErrorResponse,
  requireInternalRequest,
  requireLiffOwner,
} from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  requireOwnedBlobUrl,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

export async function GET(request: NextRequest) {
  try {
    requireInternalRequest(request, ['INTERNAL_API_SECRET']);
    const { db } = await connectToDatabase();
    const customersCollection = db.collection<Customer>('customers');

    // Get all pawn requests from all customers
    const customers = await customersCollection.find({}).toArray();

    const allPawnRequests: PawnRequest[] = [];
    customers.forEach(customer => {
      if (customer.pawnRequests) {
        allPawnRequests.push(...customer.pawnRequests);
      }
    });

    return NextResponse.json({
      success: true,
      pawnRequests: allPawnRequests
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'InternalAuthError') return internalAuthErrorResponse(error);
    console.error('Error fetching pawn requests');
    return sanitizedServerError('เกิดข้อผิดพลาดในการดึงข้อมูล');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request) as any;

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
      pawnedPrice,
      interestRate,
      periodDays,
      storeId,
    } = body;

    // Validation
    const claimedLineId = boundedText(lineId, 128, true) || '';
    const verifiedLineId = await requireLiffOwner(request, 'PAWNER', claimedLineId);
    const safeBrand = boundedText(brand, 120, true) || '';
    const safeModel = boundedText(model, 180, true) || '';
    const safeType = boundedText(type, 80, true) || '';
    const safeCondition = finiteNumber(condition, { min: 0, max: 100, required: true }) || 0;
    const safeDesiredAmount = finiteNumber(
      pawnedPrice ?? estimatedValue,
      { min: 1, max: 100_000_000, required: true },
    ) || 0;

    if (!verifiedLineId || !safeBrand || !safeModel || !safeType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');
    const customersCollection = db.collection<Customer>('customers');

    if (!Array.isArray(images) || images.length === 0 || images.length > 4) {
      return NextResponse.json({ error: 'กรุณาอัปโหลดรูปภาพ 1-4 รูป' }, { status: 400 });
    }
    const safeImages = images.map((url: unknown) => requireOwnedBlobUrl(url, ['pawn-items/']));

    let storeObjectId: ObjectId | undefined;
    if (storeId) {
      if (typeof storeId !== 'string' || !ObjectId.isValid(storeId)) {
        return NextResponse.json({ error: 'ร้านค้าที่เลือกไม่ถูกต้อง' }, { status: 400 });
      }
      storeObjectId = new ObjectId(storeId);
      const activeStore = await db.collection('stores').findOne({
        _id: storeObjectId,
        isActive: { $ne: false },
      });
      if (!activeStore) {
        return NextResponse.json({ error: 'ไม่พบร้านค้าที่เลือก' }, { status: 404 });
      }
    }

    // Check if customer exists
    const customer = await customersCollection.findOne({ lineId: verifiedLineId });
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found. Please register first.' },
        { status: 404 }
      );
    }

    // Create new item
    const newItem: Item = {
      lineId: verifiedLineId,
      brand: safeBrand,
      model: safeModel,
      type: safeType,
      serialNo: boundedText(serialNo, 180) || '',
      condition: safeCondition,
      defects: boundedText(defects, 2_000) || '',
      note: boundedText(note, 2_000) || '',
      accessories: boundedText(accessories, 2_000) || '',
      images: safeImages,
      status: 'pending',
      currentContractId: undefined,
      contractHistory: [],
      desiredAmount: safeDesiredAmount,
      estimatedValue: finiteNumber(estimatedValue, { min: 0, max: 100_000_000 }) || 0,
      loanDays: finiteNumber(periodDays, { min: 1, max: 365 }) || 30,
      interestRate: finiteNumber(interestRate, { min: 0, max: 100 }) || 10,
      storeId: storeObjectId,
      negotiationStatus: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert item into database
    const itemResult = await itemsCollection.insertOne(newItem);

    if (!itemResult.insertedId) {
      return NextResponse.json(
        { error: 'Failed to create item' },
        { status: 500 }
      );
    }

    const itemId = itemResult.insertedId;

    // Generate QR Code and upload to Vercel Blob
    const qrData = generateQRCodeData(itemId.toString());
    const qrCodeDataURL = await generateQRCode(qrData);

    // Convert data URL to a buffer for the Blob upload
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    const signedUrl = await uploadQRCodeToBlob(itemId.toString(), qrBuffer);

    // Create pawn request object
    const pawnRequest: PawnRequest = {
      _id: new ObjectId(),
      itemId: itemId,
      qrCode: signedUrl,
      status: 'pending',
      createdAt: new Date(),
    };

    // Update customer with pawn request, item ID, and store ID
    const updateData: any = {
      $push: {
        pawnRequests: pawnRequest as any,
        itemIds: itemId
      },
      $set: { updatedAt: new Date() },
    };

    // Update customer document
    await customersCollection.updateOne(
      { lineId: verifiedLineId },
      updateData
    );

    // Add storeId to storeId field if provided
    if (storeId) {
      const customer = await customersCollection.findOne({ lineId: verifiedLineId });

      if (customer) {
        const storeIdObj = new ObjectId(storeId);

        if (Array.isArray(customer.storeId)) {
          // If storeId is already an array, add to set
          if (!customer.storeId.some(id => id.toString() === storeIdObj.toString())) {
            await customersCollection.updateOne(
              { lineId: verifiedLineId },
              { $push: { storeId: storeIdObj } }
            );
          }
        } else if (customer.storeId) {
          // If storeId is single value, convert to array
          await customersCollection.updateOne(
              { lineId: verifiedLineId },
            { $set: { storeId: [customer.storeId, storeIdObj] } }
          );
        } else {
          // If storeId doesn't exist, set as array with single value
          await customersCollection.updateOne(
              { lineId: verifiedLineId },
            { $set: { storeId: [storeIdObj] } }
          );
        }
      }
    }

    // Send QR Code to LINE chat using the time-limited signed Blob URL
    try {
      await sendQRCodeImage(verifiedLineId, itemId.toString(), signedUrl);
    } catch {
      console.error('Error sending QR code to LINE');
      // Continue even if sending fails
    }

    return NextResponse.json({
      success: true,
      itemId: itemId,
      qrCode: signedUrl,
      message: 'Pawn request created successfully. QR Code has been sent to your LINE chat.',
    });
  } catch (error) {
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    if ((error as { name?: string })?.name === 'LiffAuthError') return liffAuthErrorResponse(error);
    console.error('Pawn request error');
    return sanitizedServerError('ไม่สามารถสร้างรายการได้ กรุณาลองใหม่');
  }
}
