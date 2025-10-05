import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item, Customer, PawnRequest } from '@/lib/db/models';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';
import { uploadQRCodeToS3, getQRCodePresignedUrl } from '@/lib/aws/s3';
import { sendQRCodeImage } from '@/lib/line/client';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
    } = body;

    // Validation
    if (!lineId || !brand || !model || !type || condition === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection<Item>('items');
    const customersCollection = db.collection<Customer>('customers');

    // Check if customer exists
    const customer = await customersCollection.findOne({ lineId });
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found. Please register first.' },
        { status: 404 }
      );
    }

    // Create new item
    const newItem: Item = {
      lineId,
      brand,
      model,
      type,
      serialNo,
      condition,
      defects,
      note,
      accessories,
      images: images || [],
      status: 'pending',
      currentContractId: null,
      contractHistory: [],
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

    // Generate QR Code and upload to S3
    const qrData = generateQRCodeData(itemId.toString());
    const qrCodeDataURL = await generateQRCode(qrData);

    // Convert data URL to buffer for S3 upload
    const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    // Upload to S3
    const s3Url = await uploadQRCodeToS3(itemId.toString(), qrBuffer);

    // Generate presigned URL (valid for 7 days)
    const presignedUrl = await getQRCodePresignedUrl(itemId.toString(), 7 * 24 * 3600);

    // Create pawn request object
    const pawnRequest: PawnRequest = {
      _id: new ObjectId(),
      itemId: itemId,
      qrCode: s3Url, // เก็บ S3 URL ถาวร
      status: 'pending',
      createdAt: new Date(),
    };

    // Add pawn request to customer's pawnRequests array
    await customersCollection.updateOne(
      { lineId },
      {
        $push: { pawnRequests: pawnRequest as any },
        $set: { updatedAt: new Date() },
      }
    );

    // Send QR Code to LINE chat (ใช้ presigned URL)
    try {
      await sendQRCodeImage(lineId, itemId.toString(), presignedUrl);
    } catch (error) {
      console.error('Error sending QR code to LINE:', error);
      // Continue even if sending fails
    }

    return NextResponse.json({
      success: true,
      itemId: itemId,
      qrCode: presignedUrl,
      message: 'Pawn request created successfully. QR Code has been sent to your LINE chat.',
    });
  } catch (error) {
    console.error('Pawn request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
