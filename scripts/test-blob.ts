import dotenv from 'dotenv';
import { testBlobConnection } from '../lib/storage/blob';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  console.log('🚀 Testing Vercel Blob connection...');
  console.log('📋 Blob configuration:');
  console.log(`Read/write token: ${process.env.BLOB_READ_WRITE_TOKEN ? 'configured' : 'missing'}`);
  console.log(`Store ID: ${process.env.BLOB_STORE_ID ? 'configured' : 'not set (optional with a read/write token)'}`);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ BLOB_READ_WRITE_TOKEN is not configured in .env.local');
    process.exit(1);
  }

  const connected = await testBlobConnection();
  if (!connected) {
    console.error('❌ Vercel Blob connection failed. Check the token and private-store access.');
    process.exit(1);
  }

  console.log('✅ Vercel Blob is ready to use.');
}

main();
