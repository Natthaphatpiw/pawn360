import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

// คำนวณรายละเอียดสำหรับ action ต่างๆ
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, actionType, amount } = body;

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

    // Calculate dates
    const startDate = new Date(contract.contract_start_date);
    const endDate = new Date(contract.contract_end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysInContract = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, daysInContract - daysElapsed);

    // Get interest rate and calculate daily rate
    const monthlyInterestRate = contract.interest_rate; // e.g., 0.03 for 3%
    const dailyInterestRate = monthlyInterestRate / 30;

    // Current principal
    const currentPrincipal = contract.current_principal_amount || contract.loan_principal_amount;

    // Calculate accrued interest until today
    const interestAccrued = currentPrincipal * dailyInterestRate * daysElapsed;

    let calculation: any = {
      contractId,
      actionType,
      currentPrincipal,
      interestRate: monthlyInterestRate,
      dailyInterestRate,
      daysInContract,
      daysElapsed,
      daysRemaining,
      interestAccrued: Math.round(interestAccrued * 100) / 100,
      contractStartDate: contract.contract_start_date,
      contractEndDate: contract.contract_end_date,
    };

    switch (actionType) {
      case 'INTEREST_PAYMENT': {
        // ต่อดอกเบี้ย: จ่ายดอกเบี้ยสะสมแล้วขยายสัญญา
        const interestToPay = Math.round(interestAccrued * 100) / 100;

        // New end date = current end date + contract duration days
        const newEndDate = new Date(endDate);
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
        const reductionAmount = amount || 0;

        if (reductionAmount <= 0 || reductionAmount > currentPrincipal) {
          return NextResponse.json(
            { error: 'Invalid reduction amount' },
            { status: 400 }
          );
        }

        const interestForPeriod = Math.round(interestAccrued * 100) / 100;
        const totalToPay = reductionAmount + interestForPeriod;
        const principalAfterReduction = currentPrincipal - reductionAmount;

        // Calculate new interest for remaining period
        const newInterestForRemaining = Math.round(principalAfterReduction * dailyInterestRate * daysRemaining * 100) / 100;

        // Calculate interest difference (savings)
        const originalRemainingInterest = currentPrincipal * dailyInterestRate * daysRemaining;
        const interestSavings = Math.round((originalRemainingInterest - newInterestForRemaining) * 100) / 100;

        calculation = {
          ...calculation,
          reductionAmount,
          interestForPeriod,
          totalToPay,
          principalAfterReduction,
          newInterestForRemaining,
          interestSavings,
          description: `ลดเงินต้น ${reductionAmount.toLocaleString()} บาท + ดอกเบี้ย ${interestForPeriod.toLocaleString()} บาท = ${totalToPay.toLocaleString()} บาท\nเงินต้นใหม่: ${principalAfterReduction.toLocaleString()} บาท\nดอกเบี้ยที่ประหยัดได้: ${interestSavings.toLocaleString()} บาท`,
        };
        break;
      }

      case 'PRINCIPAL_INCREASE': {
        // เพิ่มเงินต้น: รับเงินเพิ่มจาก investor
        const increaseAmount = amount || 0;

        // Check max increase (based on item value)
        const itemValue = contract.items?.estimated_value || 0;
        const maxIncrease = itemValue - currentPrincipal;

        if (increaseAmount <= 0 || increaseAmount > maxIncrease) {
          return NextResponse.json(
            { error: `Invalid increase amount. Maximum allowed: ${maxIncrease.toLocaleString()} บาท` },
            { status: 400 }
          );
        }

        const interestForPeriod = Math.round(interestAccrued * 100) / 100;
        const principalAfterIncrease = currentPrincipal + increaseAmount;

        // Calculate new interest for remaining period
        const newInterestForRemaining = Math.round(principalAfterIncrease * dailyInterestRate * daysRemaining * 100) / 100;

        // Calculate interest increase
        const originalRemainingInterest = currentPrincipal * dailyInterestRate * daysRemaining;
        const interestIncrease = Math.round((newInterestForRemaining - originalRemainingInterest) * 100) / 100;

        calculation = {
          ...calculation,
          increaseAmount,
          interestForPeriod,
          principalAfterIncrease,
          newInterestForRemaining,
          interestIncrease,
          maxIncrease,
          amountToReceive: increaseAmount, // จำนวนที่ pawner จะได้รับจาก investor
          description: `เพิ่มเงินต้น ${increaseAmount.toLocaleString()} บาท\nเงินต้นใหม่: ${principalAfterIncrease.toLocaleString()} บาท\nดอกเบี้ยที่เพิ่มขึ้น: ${interestIncrease.toLocaleString()} บาท`,
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
