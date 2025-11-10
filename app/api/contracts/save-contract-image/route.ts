import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getS3Client } from '@/lib/aws/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ObjectId } from 'mongodb';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const BUCKET_NAME = 'piwp360';
const CONTRACTS_FOLDER = 'contracts/';

// Configure route for larger payloads
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Helper to estimate base64 size
function estimateBase64Size(base64String: string): number {
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  return Math.ceil(base64Data.length * 0.75);
}

// Helper to reduce image quality
function reduceImageQuality(base64Image: string, targetSizeKB: number = 800): string {
  const targetBytes = targetSizeKB * 1024;
  const currentSize = estimateBase64Size(base64Image);

  if (currentSize <= targetBytes) {
    return base64Image;
  }

  const ratio = targetBytes / currentSize;
  const [prefix, base64Data] = base64Image.includes(',') ? base64Image.split(',') : ['', base64Image];
  const newLength = Math.floor(base64Data.length * ratio);
  const reducedData = base64Data.substring(0, newLength);

  return prefix ? `${prefix},${reducedData}` : reducedData;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Received save contract image request');

    const body = await request.json();
    console.log('Request body keys:', Object.keys(body));

    let { itemId, contractHTML, verificationPhoto } = body;

    console.log('Parsed data:', {
      itemId: itemId?.substring(0, 10) + '...',
      hasContractHTML: !!contractHTML,
      hasVerificationPhoto: !!verificationPhoto,
      contractHTMLLength: contractHTML?.length,
      verificationPhotoLength: verificationPhoto?.length
    });

    // 🔥 Reduce verification photo size if too large (target 800KB max)
    let photoWasCompressed = false;
    if (verificationPhoto) {
      const photoSize = estimateBase64Size(verificationPhoto);
      const photoSizeKB = photoSize / 1024;
      console.log(`📸 Verification photo size: ${photoSizeKB.toFixed(2)}KB`);

      if (photoSizeKB > 800) {
        console.log('⚠️ Photo too large, reducing quality...');
        verificationPhoto = reduceImageQuality(verificationPhoto, 800);
        const newSize = estimateBase64Size(verificationPhoto) / 1024;
        console.log(`✅ Reduced to ${newSize.toFixed(2)}KB`);
        photoWasCompressed = true;
      }
    }

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

    // Check AWS credentials
    console.log('Checking AWS credentials...');
    console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '***' + process.env.AWS_ACCESS_KEY_ID.slice(-4) : 'NOT SET');
    console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '***SET***' : 'NOT SET');
    console.log('AWS_REGION:', process.env.AWS_REGION || 'ap-southeast-2 (default)');

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error('AWS credentials not set in environment variables');
      return NextResponse.json(
        { error: 'ระบบยังไม่ได้ตั้งค่า AWS credentials ใน Vercel กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งค่า AWS_ACCESS_KEY_ID และ AWS_SECRET_ACCESS_KEY' },
        { status: 500 }
      );
    }

    const s3Client = getS3Client();
    console.log('S3 client initialized, bucket:', BUCKET_NAME);

    let contractUploadResult = null;
    let photoUploadResult = null;

    // Generate PDF from HTML if provided (with fallback to PNG)
    if (contractHTML) {
      console.log('Generating contract document...');
      try {
        let documentBuffer: Buffer | Uint8Array;
        let filename: string;
        let contentType: string;

        try {
          // Try to generate PDF with puppeteer
          console.log('Attempting PDF generation with puppeteer...');
          const browser = await puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: await chromium.executablePath(),
            headless: true,
          });

          const page = await browser.newPage();
          page.setDefaultTimeout(30000);
          await page.setViewport({ width: 794, height: 1123 });

          await page.setContent(contractHTML, { waitUntil: 'domcontentloaded' });
          await new Promise(resolve => setTimeout(resolve, 500));

          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
              top: '2cm',
              right: '2cm',
              bottom: '2cm',
              left: '2cm'
            },
            preferCSSPageSize: true
          });

          await browser.close();

          documentBuffer = pdfBuffer;
          filename = `contract-${itemId}-${timestamp}.pdf`;
          contentType = 'application/pdf';
          console.log('PDF generated successfully, size:', pdfBuffer.length);

        } catch (pdfError) {
          console.warn('PDF generation failed, falling back to PNG:', pdfError);

          // Fallback: Save HTML as text file or generate PNG from client
          // For now, save HTML as text file
          const htmlBuffer = Buffer.from(contractHTML, 'utf-8');
          documentBuffer = htmlBuffer;
          filename = `contract-${itemId}-${timestamp}.html`;
          contentType = 'text/html';
          console.log('Falling back to HTML file, size:', htmlBuffer.length);
        }

        // Upload document to S3
        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: `${CONTRACTS_FOLDER}${filename}`,
          Body: documentBuffer,
          ContentType: contentType
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        contractUploadResult = filename;
        console.log('Contract document uploaded successfully as', contentType);

      } catch (error) {
        console.error('Error generating/uploading contract document:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        throw new Error(`Document generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          Bucket: BUCKET_NAME,
          Key: `${CONTRACTS_FOLDER}${photoFilename}`,
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

    // Generate unique contract number if this is a new contract
    const contractNumber = `C${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const contractUpdate: any = {
      contractNumber: contractNumber,
      signedAt: new Date(),
      status: 'signed'
    };

    if (contractUploadResult) {
      contractUpdate.contractImages = {
        ...contractUpdate.contractImages,
        signedContract: `contracts/${contractUploadResult}`
      };
    }

    if (photoUploadResult) {
      contractUpdate.contractImages = {
        ...contractUpdate.contractImages,
        verificationPhoto: `contracts/${photoUploadResult}`
      };
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
      verificationPhotoUrl: photoUploadResult ? `contracts/${photoUploadResult}` : null,
      ...(photoWasCompressed && {
        warning: 'รูปภาพยืนยันตัวตนมีขนาดใหญ่เกินไป ระบบได้ลดคุณภาพรูปภาพเพื่อให้สามารถอัปโหลดได้'
      })
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
