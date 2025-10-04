import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { Item, Customer, PawnRequest } from '@/lib/db/models';
import { generateQRCode, generateQRCodeData } from '@/lib/utils/qrcode';
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

    // Generate QR Code as data URL
    const qrData = generateQRCodeData(itemId.toString());
    const qrCodeDataURL = await generateQRCode(qrData);

    // Create pawn request object
    const pawnRequest: PawnRequest = {
      _id: new ObjectId(),
      itemId: itemId,
      qrCode: qrCodeDataURL, // เก็บ data URL แทน path
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

    // Send QR Code to LINE chat
    try {
      // qrData คือ LIFF URL สำหรับร้านค้า
      await sendQRCodeImage(lineId, qrCodeDataURL, qrData);
    } catch (error) {
      console.error('Error sending QR code to LINE:', error);
      // Continue even if sending fails
    }

    return NextResponse.json({
      success: true,
      itemId: itemId,
      qrCode: qrCodeDataURL,
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
