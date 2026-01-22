import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { INVESTOR_TIER_THRESHOLDS } from '@/lib/services/investor-tier';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lineId,
      maxInvestmentAmount,
      preferences,
      autoMatchEnabled,
      autoLiquidationEnabled,
    } = body;

    if (!lineId) {
      return NextResponse.json(
        { error: 'Line ID is required' },
        { status: 400 }
      );
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
      .select()
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
    });
  } catch (error: any) {
    console.error('Error updating credit limit:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
