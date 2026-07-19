import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { putPrivateBlob } from '@/lib/storage/blob';

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
    const blob = await putPrivateBlob(`cont360/${fileName}`, buffer, 'image/png');

    // Update contract with contract_file_url
    const supabase = supabaseAdmin();
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ contract_file_url: blob.signedUrl })
      .eq('contract_id', contractId);

    if (updateError) {
      console.error('Error updating contract:', updateError);
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      url: blob.signedUrl,
      message: 'Pawn ticket uploaded successfully'
    });

  } catch (error: any) {
    console.error('Error uploading loan contract:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload loan contract' },
      { status: 500 }
    );
  }
}
