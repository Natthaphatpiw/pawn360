import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getS3Client } from '@/lib/aws/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    const { itemId, contractImageData, verificationPhoto } = await request.json();

    if (!itemId) {
      return NextResponse.json(
        { error: 'กรุณาระบุ itemId' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const itemsCollection = db.collection('items');
    const contractsCollection = db.collection('contracts');

    // Find the item
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    if (!item) {
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const contractFilename = `contract-${itemId}-${timestamp}.png`;
    const photoFilename = verificationPhoto ? `verification-${itemId}-${timestamp}.jpg` : null;

    const s3Client = getS3Client();

    let contractUploadResult = null;
    let photoUploadResult = null;

    // Upload contract image to S3 if provided
    if (contractImageData) {
      const contractBuffer = Buffer.from(contractImageData.replace(/^data:image\/png;base64,/, ''), 'base64');

      const contractUploadParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: `contracts/${contractFilename}`,
        Body: contractBuffer,
        ContentType: 'image/png'
      };

      await s3Client.send(new PutObjectCommand(contractUploadParams));
      contractUploadResult = contractFilename;
    }

    // Upload verification photo to S3 if provided
    if (verificationPhoto) {
      const photoBuffer = Buffer.from(verificationPhoto.replace(/^data:image\/jpeg;base64,/, '').replace(/^data:image\/jpg;base64,/, ''), 'base64');

      const photoUploadParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: `contracts/${photoFilename}`,
        Body: photoBuffer,
        ContentType: 'image/jpeg'
      };

      await s3Client.send(new PutObjectCommand(photoUploadParams));
      photoUploadResult = photoFilename;
    }

    // Update the contract document with image URLs
    const contractUpdate: any = {
      signedAt: new Date(),
      status: 'signed'
    };

    if (contractUploadResult) {
      contractUpdate.contractImageUrl = `contracts/${contractUploadResult}`;
    }

    if (photoUploadResult) {
      contractUpdate.verificationPhotoUrl = `contracts/${photoUploadResult}`;
    }

    await contractsCollection.updateOne(
      { itemId: new ObjectId(itemId) },
      { $set: contractUpdate },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      message: 'บันทึกสัญญาเรียบร้อยแล้ว',
      contractImageUrl: contractUploadResult ? `contracts/${contractUploadResult}` : null,
      verificationPhotoUrl: photoUploadResult ? `contracts/${photoUploadResult}` : null
    });

  } catch (error) {
    console.error('Error saving contract image:', error);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการบันทึกสัญญา' },
      { status: 500 }
    );
  }
}
