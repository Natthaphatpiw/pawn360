import dotenv from 'dotenv';
import { testS3Connection, uploadQRCodeToS3 } from '../lib/aws/s3';
import QRCode from 'qrcode';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  console.log('🚀 Testing AWS S3 Connection...\n');

  // Check credentials
  console.log('📋 AWS Configuration:');
  console.log(`Region: ${process.env.AWS_REGION}`);
  console.log(`Bucket: ${process.env.AWS_S3_BUCKET}`);
  console.log(`Folder: ${process.env.AWS_S3_FOLDER}`);
  console.log(`Access Key: ${process.env.AWS_ACCESS_KEY_ID?.substring(0, 10)}...`);
  console.log('');

  if (!process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID === 'YOUR_ACCESS_KEY_HERE') {
    console.error('❌ AWS_ACCESS_KEY_ID not configured in .env.local');
    console.error('Please add your AWS credentials to .env.local');
    process.exit(1);
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY === 'YOUR_SECRET_KEY_HERE') {
    console.error('❌ AWS_SECRET_ACCESS_KEY not configured in .env.local');
    console.error('Please add your AWS credentials to .env.local');
    process.exit(1);
  }

  // Test connection
  console.log('1️⃣  Testing S3 connection...');
  const connected = await testS3Connection();

  if (!connected) {
    console.error('\n❌ S3 connection failed. Please check your credentials and bucket permissions.');
    process.exit(1);
  }

  // Test QR Code upload
  console.log('\n2️⃣  Testing QR Code upload...');
  try {
    const testItemId = 'test-' + Date.now();
    const testUrl = `https://liff.line.me/2008216710-de1ovYZL/store/verify-pawn?itemId=${testItemId}`;

    // Generate QR Code
    const qrDataUrl = await QRCode.toDataURL(testUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 2,
    });

    // Convert data URL to buffer
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(base64Data, 'base64');

    // Upload to S3
    const s3Url = await uploadQRCodeToS3(testItemId, qrBuffer);

    console.log('✅ QR Code uploaded successfully!');
    console.log(`📷 S3 URL: ${s3Url}`);
    console.log('\nYou can test the image by opening this URL in your browser.');

  } catch (error: any) {
    console.error('❌ QR Code upload failed:', error.message);
    process.exit(1);
  }

  console.log('\n✅ All tests passed! AWS S3 is ready to use.');
}

main();
