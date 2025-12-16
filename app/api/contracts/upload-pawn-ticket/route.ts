import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase/client';

// Configure AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, imageBase64 } = body;

    if (!contractId || !imageBase64) {
      return NextResponse.json(
        { error: 'Contract ID and image are required' },
        { status: 400 }
      );
    }

    // Remove data URL prefix if exists
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `pawn-ticket-${contractId}-${timestamp}.png`;
    const s3Key = `${process.env.AWS_S3_FOLDER || 'cont360/'}${fileName}`;

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'piwp360',
      Key: s3Key,
      Body: buffer,
      ContentType: 'image/png',
      ACL: 'public-read'
    });

    await s3Client.send(uploadCommand);

    // Construct S3 URL
    const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // Update contract with contract_file_url
    const supabase = supabaseAdmin();
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ contract_file_url: s3Url })
      .eq('contract_id', contractId);

    if (updateError) {
      console.error('Error updating contract:', updateError);
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      url: s3Url,
      message: 'Pawn ticket uploaded successfully'
    });

  } catch (error: any) {
    console.error('Error uploading pawn ticket:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload pawn ticket' },
      { status: 500 }
    );
  }
}
