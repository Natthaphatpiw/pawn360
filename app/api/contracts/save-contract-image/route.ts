import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getS3Client } from '@/lib/aws/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    console.log('Received save contract image request');

    const body = await request.json();
    console.log('Request body keys:', Object.keys(body));

    const { itemId, contractImageData, verificationPhoto } = body;

    console.log('Parsed data:', {
      itemId: itemId?.substring(0, 10) + '...',
      hasContractImageData: !!contractImageData,
      hasVerificationPhoto: !!verificationPhoto,
      verificationPhotoLength: verificationPhoto?.length
    });

    if (!itemId) {
      console.error('Missing itemId');
      return NextResponse.json(
        { error: 'กรุณาระบุ itemId' },
        { status: 400 }
      );
    }

    console.log('Connecting to database...');
    const { db } = await connectToDatabase();
    console.log('Database connected successfully');

    const itemsCollection = db.collection('items');
    const contractsCollection = db.collection('contracts');

    // Find the item
    console.log('Looking for item with id:', itemId);
    const item = await itemsCollection.findOne({ _id: new ObjectId(itemId) });
    console.log('Item found:', !!item);

    if (!item) {
      console.error('Item not found for id:', itemId);
      return NextResponse.json(
        { error: 'ไม่พบรายการจำนำ' },
        { status: 404 }
      );
    }

    console.log('Item found, proceeding with S3 upload');

    // Generate unique filename
    const timestamp = Date.now();
    const contractFilename = `contract-${itemId}-${timestamp}.png`;
    const photoFilename = verificationPhoto ? `verification-${itemId}-${timestamp}.jpg` : null;

    console.log('Generated filenames:', { contractFilename, photoFilename });

    // Check S3 configuration
    if (!process.env.AWS_S3_BUCKET_NAME) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
    }

    const s3Client = getS3Client();
    console.log('S3 client initialized, bucket:', process.env.AWS_S3_BUCKET_NAME);

    let contractUploadResult = null;
    let photoUploadResult = null;

    // Upload contract image to S3 if provided
    if (contractImageData) {
      console.log('Uploading contract image...');
      try {
        const contractBuffer = Buffer.from(contractImageData.replace(/^data:image\/png;base64,/, ''), 'base64');

        const contractUploadParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: `contracts/${contractFilename}`,
          Body: contractBuffer,
          ContentType: 'image/png'
        };

        await s3Client.send(new PutObjectCommand(contractUploadParams));
        contractUploadResult = contractFilename;
        console.log('Contract image uploaded successfully');
      } catch (error) {
        console.error('Error uploading contract image:', error);
        throw error;
      }
    }

    // Upload verification photo to S3 if provided
    if (verificationPhoto) {
      console.log('Uploading verification photo...');
      try {
        // Clean base64 string and validate
        let cleanBase64 = verificationPhoto;
        if (verificationPhoto.startsWith('data:image/jpeg;base64,')) {
          cleanBase64 = verificationPhoto.replace(/^data:image\/jpeg;base64,/, '');
        } else if (verificationPhoto.startsWith('data:image/jpg;base64,')) {
          cleanBase64 = verificationPhoto.replace(/^data:image\/jpg;base64,/, '');
        }

        console.log('Clean base64 length:', cleanBase64.length);

        // Validate base64 format
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
          throw new Error('Invalid base64 format for verification photo');
        }

        const photoBuffer = Buffer.from(cleanBase64, 'base64');
        console.log('Photo buffer created, size:', photoBuffer.length);

        if (photoBuffer.length === 0) {
          throw new Error('Empty photo buffer');
        }

        const photoUploadParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: `contracts/${photoFilename}`,
          Body: photoBuffer,
          ContentType: 'image/jpeg'
        };

        await s3Client.send(new PutObjectCommand(photoUploadParams));
        photoUploadResult = photoFilename;
        console.log('Verification photo uploaded successfully');
      } catch (error) {
        console.error('Error uploading verification photo:', error);
        console.error('Photo data preview:', verificationPhoto?.substring(0, 100));
        throw new Error(`Verification photo upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Update the contract document with image URLs
    console.log('Updating contract document...');
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

    console.log('Contract update data:', contractUpdate);

    await contractsCollection.updateOne(
      { itemId: new ObjectId(itemId) },
      { $set: contractUpdate },
      { upsert: true }
    );

    console.log('Contract document updated successfully');

    return NextResponse.json({
      success: true,
      message: 'บันทึกสัญญาเรียบร้อยแล้ว',
      contractImageUrl: contractUploadResult ? `contracts/${contractUploadResult}` : null,
      verificationPhotoUrl: photoUploadResult ? `contracts/${photoUploadResult}` : null
    });

  } catch (error) {
    console.error('Error saving contract image:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดในการบันทึกสัญญา' },
      { status: 500 }
    );
  }
}
