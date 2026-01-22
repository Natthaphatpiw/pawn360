import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * API to trigger automatic pawn ticket generation when contract status becomes CONFIRMED
 * This will be called by Supabase webhook or database trigger
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, type } = body;

    console.log('[Auto-Generate] Received request:', { contractId, type });

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('contract_id, contract_status, contract_file_url')
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      console.error('[Auto-Generate] Contract not found:', contractError);
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    // Check if contract is CONFIRMED
    if (contract.contract_status !== 'CONFIRMED') {
      console.log('[Auto-Generate] Contract not CONFIRMED yet:', contract.contract_status);
      return NextResponse.json({
        success: false,
        message: 'Contract is not CONFIRMED yet',
        status: contract.contract_status
      });
    }

    // Check if pawn ticket already exists
    if (contract.contract_file_url) {
      console.log('[Auto-Generate] Pawn ticket already exists:', contract.contract_file_url);
      return NextResponse.json({
        success: true,
        message: 'Pawn ticket already generated',
        url: contract.contract_file_url,
        skipped: true
      });
    }

    // Generate pawn ticket URL for frontend to access
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pawnly.io';
    const ticketUrl = `${baseUrl}/pawn-ticket/${contractId}`;

    console.log('[Auto-Generate] Generated ticket URL:', ticketUrl);

    // Return instruction for manual generation (since we can't use Puppeteer on Vercel)
    // The frontend will need to access this URL to generate and upload the image
    return NextResponse.json({
      success: true,
      message: 'Contract confirmed. Pawn ticket can be generated.',
      contractId,
      ticketUrl,
      instruction: 'Frontend should access ticket URL and trigger save to generate image'
    });

  } catch (error: any) {
    console.error('[Auto-Generate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to auto-generate pawn ticket' },
      { status: 500 }
    );
  }
}
