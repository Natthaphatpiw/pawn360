import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { INVESTOR_TIER_THRESHOLDS } from '@/lib/services/investor-tier';
import { liffAuthErrorResponse, requireLiffOwner } from '@/lib/security/request-auth';

const MAX_JSON_BYTES = 64 * 1024;

export async function PUT(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_JSON_BYTES) {
      return NextResponse.json(
        { error: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }

    const body = await request.json();
    const {
      lineId: claimedLineId,
      maxInvestmentAmount,
      preferences,
      autoMatchEnabled,
      autoLiquidationEnabled,
    } = body;

    if (typeof claimedLineId !== 'string' || !claimedLineId.trim() || claimedLineId.length > 80) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
    }

    if (preferences && JSON.stringify(preferences).length > 16_384) {
      return NextResponse.json(
        { error: 'Investment preferences are too large', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    let lineId: string;
    try {
      lineId = await requireLiffOwner(request, 'INVESTOR', claimedLineId);
    } catch (error) {
      return liffAuthErrorResponse(error);
    }

    const supabase = supabaseAdmin();

    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('investor_id, investor_tier, total_active_principal')
      .eq('line_id', lineId)
      .single();

    if (investorError || !investor) {
      return NextResponse.json(
        { error: 'Investor not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (maxInvestmentAmount !== undefined) {
      const parsedAmount = Number(maxInvestmentAmount);
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        return NextResponse.json(
          { error: 'Invalid credit limit amount' },
          { status: 400 }
        );
      }
      updateData.max_investment_amount = parsedAmount;
    }

    if (preferences && typeof preferences === 'object') {
      updateData.investment_preferences = preferences;
    }

    if (autoLiquidationEnabled !== undefined) {
      updateData.auto_liquidation_enabled = !!autoLiquidationEnabled;
    }

    if (autoMatchEnabled !== undefined) {
      const tier = investor.investor_tier || 'SILVER';
      const allowed = tier === 'GOLD' || tier === 'PLATINUM';
      if (!allowed && autoMatchEnabled) {
        const total = Number(investor.total_active_principal || 0);
        const target = tier === 'SILVER'
          ? INVESTOR_TIER_THRESHOLDS.GOLD
          : INVESTOR_TIER_THRESHOLDS.PLATINUM;
        const remaining = Math.max(0, target - total);
        return NextResponse.json(
          {
            error: 'Auto matching is available for Gold/Platinum investors',
            requiredTier: tier === 'SILVER' ? 'GOLD' : 'PLATINUM',
            remainingAmount: remaining,
          },
          { status: 403 }
        );
      }
      updateData.auto_invest_enabled = !!autoMatchEnabled;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json(
        { error: 'No changes to update' },
        { status: 400 }
      );
    }

    const { data: updatedInvestor, error: updateError } = await supabase
      .from('investors')
      .update(updateData)
      .eq('line_id', lineId)
      .select('investor_id, investor_tier, total_active_principal, max_investment_amount, investment_preferences, auto_invest_enabled, auto_liquidation_enabled')
      .single();

    if (updateError) {
      console.error('Error updating credit limit:', updateError);
      return NextResponse.json(
        { error: 'Failed to update credit limit' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      investor: updatedInvestor,
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('[investors:credit-limit] failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'ไม่สามารถบันทึกการตั้งค่าการลงทุนได้ชั่วคราว', code: 'CREDIT_LIMIT_UPDATE_FAILED' },
      { status: 500 }
    );
  }
}
