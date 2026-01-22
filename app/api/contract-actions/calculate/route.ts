import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

// คำนวณรายละเอียดสำหรับ action ต่างๆ
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, actionType, amount, reductionAmount, increaseAmount } = body;

    if (!contractId || !actionType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        *,
        items:item_id (*),
        pawners:customer_id (*),
        investors:investor_id (*)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      );
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const msPerDay = 1000 * 60 * 60 * 24;

    // Calculate dates (count start date as day 1)
    const startDate = new Date(contract.contract_start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(contract.contract_end_date);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rawDaysInContract = Number(contract.contract_duration_days || 0)
      || Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay);
    const daysInContract = Math.max(1, rawDaysInContract);
    const rawDaysElapsed = Math.floor((today.getTime() - startDate.getTime()) / msPerDay) + 1;
    const daysElapsed = Math.min(daysInContract, Math.max(1, rawDaysElapsed));
    const daysRemaining = Math.max(0, daysInContract - daysElapsed);

    // Rates: interest (2%) and platform fee (1%) are separate
    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = Number(contract.platform_fee_rate ?? 0.01);
    const dailyInterestRate = monthlyInterestRate / 30;

    // Current principal
    const currentPrincipal = contract.current_principal_amount || contract.loan_principal_amount;
    const feeBase = contract.original_principal_amount || contract.loan_principal_amount || currentPrincipal;

    // Calculate accrued interest until today (interest only) + fixed fee
    const interestAccrued = round2(currentPrincipal * dailyInterestRate * daysElapsed);
    const feeAmount = round2(feeBase * feeRate * (daysInContract / 30));
    const interestAccruedWithFee = round2(interestAccrued + feeAmount);

    let calculation: any = {
      contractId,
      actionType,
      currentPrincipal,
      interestRate: monthlyInterestRate,
      dailyInterestRate,
      daysInContract,
      daysElapsed,
      daysRemaining,
      interestAccrued,
      feeAmount,
      interestAccruedWithFee,
      contractStartDate: contract.contract_start_date,
      contractEndDate: contract.contract_end_date,
    };

    switch (actionType) {
      case 'INTEREST_PAYMENT': {
        // ต่อดอกเบี้ย: จ่ายดอกเบี้ยเต็มงวดแล้วขยายสัญญา
        // interest_rate is stored as DECIMAL (e.g., 0.03 for 3%)
        // Full period interest = principal * monthly rate * (contract days / 30)
        const interestToPay = interestAccruedWithFee;

        // New end date = current end date + contract duration days
        const newEndDate = new Date(today);
        newEndDate.setDate(newEndDate.getDate() + daysInContract);

        calculation = {
          ...calculation,
          interestToPay,
          totalToPay: interestToPay,
          newEndDate: newEndDate.toISOString().split('T')[0],
          extensionDays: daysInContract,
          description: `ต่อดอกเบี้ยจำนวน ${interestToPay.toLocaleString()} บาท ขยายสัญญาไปถึงวันที่ ${newEndDate.toLocaleDateString('th-TH')}`,
        };
        break;
      }

      case 'PRINCIPAL_REDUCTION': {
        // ลดเงินต้น: จ่ายจำนวนที่ขอลด + ดอกเบี้ยสะสมถึงวันนี้
        const reductionAmountValue = Number(reductionAmount ?? amount ?? 0);

        if (reductionAmountValue <= 0 || reductionAmountValue > currentPrincipal) {
          return NextResponse.json(
            { error: 'Invalid reduction amount' },
            { status: 400 }
          );
        }

        const interestForPeriod = interestAccruedWithFee;
        const principalAfterReduction = currentPrincipal - reductionAmountValue;

        // Calculate new interest for remaining period
        const newInterestForRemaining = round2(
          principalAfterReduction * dailyInterestRate * daysInContract + feeAmount
        );
        const interestTotalIfPayLater = round2(interestForPeriod + newInterestForRemaining);
        const totalToPayNow = reductionAmountValue + interestForPeriod;

        // Calculate interest difference (savings) vs original full-period interest
        const originalTotalInterest = round2(currentPrincipal * dailyInterestRate * daysInContract + feeAmount);
        const interestSavings = round2(originalTotalInterest - newInterestForRemaining);

        calculation = {
          ...calculation,
          reductionAmount: reductionAmountValue,
          interestForPeriod,
          interestFirstPart: interestForPeriod,
          interestRemaining: newInterestForRemaining,
          interestTotalIfPayLater,
          totalToPay: totalToPayNow,
          totalToPayNow,
          principalAfterReduction,
          newInterestForRemaining,
          interestSavings,
          description: `ลดเงินต้น ${reductionAmountValue.toLocaleString()} บาท\nดอกเบี้ยช่วงแรก ${interestForPeriod.toLocaleString()} บาท\nดอกเบี้ยช่วงที่เหลือ ${newInterestForRemaining.toLocaleString()} บาท`,
        };
        break;
      }

      case 'PRINCIPAL_INCREASE': {
        // เพิ่มเงินต้น: รับเงินเพิ่มจาก investor
        const increaseAmountValue = Number(increaseAmount ?? amount ?? 0);

        // Check max increase (based on item value)
        const rawItemValue = Number(contract.items?.estimated_value ?? 0);
        const fallbackItemValue = currentPrincipal > 0 ? currentPrincipal * 1.5 : 0;
        const itemValue = Number.isFinite(rawItemValue) && rawItemValue > 0 ? rawItemValue : fallbackItemValue;
        const maxIncrease = Math.max(0, itemValue - currentPrincipal);

        if (increaseAmountValue <= 0 || increaseAmountValue > maxIncrease) {
          return NextResponse.json(
            { error: `Invalid increase amount. Maximum allowed: ${maxIncrease.toLocaleString()} บาท` },
            { status: 400 }
          );
        }

        const interestForPeriod = interestAccruedWithFee;
        const principalAfterIncrease = currentPrincipal + increaseAmountValue;

        // Calculate monthly interest (for UI display)
        // interest_rate is already a decimal (e.g., 0.03 for 3%)
        const currentMonthlyInterest = round2(currentPrincipal * monthlyInterestRate);
        const newMonthlyInterest = round2(principalAfterIncrease * monthlyInterestRate);
        const additionalMonthlyInterest = round2(newMonthlyInterest - currentMonthlyInterest);

        // Calculate new interest for remaining period
        const newInterestForRemaining = round2(
          principalAfterIncrease * dailyInterestRate * daysInContract + feeAmount
        );
        const interestTotalIfPayLater = round2(interestForPeriod + newInterestForRemaining);

        // Calculate interest increase vs original full-period interest
        const originalTotalInterest = round2(currentPrincipal * dailyInterestRate * daysInContract + feeAmount);
        const interestIncrease = round2(newInterestForRemaining - originalTotalInterest);

        calculation = {
          ...calculation,
          increaseAmount: increaseAmountValue,
          interestForPeriod,
          interestFirstPart: interestForPeriod,
          interestRemaining: newInterestForRemaining,
          interestTotalIfPayLater,
          principalAfterIncrease,
          newPrincipal: principalAfterIncrease,
          newMonthlyInterest,
          additionalMonthlyInterest,
          newInterestForRemaining,
          interestIncrease,
          maxIncrease,
          amountToReceive: increaseAmountValue, // จำนวนที่ pawner จะได้รับจาก investor
          description: `เพิ่มเงินต้น ${increaseAmountValue.toLocaleString()} บาท\nดอกเบี้ยช่วงแรก ${interestForPeriod.toLocaleString()} บาท\nดอกเบี้ยช่วงที่เหลือ ${newInterestForRemaining.toLocaleString()} บาท`,
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      calculation,
      contract: {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item: contract.items,
        pawner: contract.pawners,
        investor: contract.investors,
      },
    });

  } catch (error: any) {
    console.error('Error calculating action:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
