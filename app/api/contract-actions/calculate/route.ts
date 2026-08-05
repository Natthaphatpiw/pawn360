import { NextRequest, NextResponse } from 'next/server';
import { getRenewedContractWindow } from '@/lib/utils/renewal-window';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getPenaltyRequirement, serializePenaltyRequirement } from '@/lib/services/penalty';
import { requireContractParty } from '@/lib/security/contract-access';
import { LiffAuthError } from '@/lib/security/liff-auth';
import { liffAuthErrorResponse } from '@/lib/security/request-auth';
import {
  boundedText,
  finiteNumber,
  readBoundedJsonObject,
  requireUuid,
  sanitizedServerError,
  transactionRequestErrorResponse,
} from '@/lib/security/transaction-request';

// คำนวณรายละเอียดสำหรับ action ต่างๆ
export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const contractId = requireUuid(body.contractId);
    const actionType = boundedText(body.actionType, 32, true) || '';
    const amount = finiteNumber(body.amount, { min: 0, max: 100_000_000 });
    const reductionAmount = finiteNumber(body.reductionAmount, { min: 0, max: 100_000_000 });
    const increaseAmount = finiteNumber(body.increaseAmount, { min: 0, max: 100_000_000 });

    if (!['INTEREST_PAYMENT', 'PRINCIPAL_REDUCTION', 'PRINCIPAL_INCREASE'].includes(actionType)) {
      return NextResponse.json(
        { error: 'ประเภทรายการไม่ถูกต้อง', code: 'INVALID_ACTION_TYPE' },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        contract_id, contract_number, customer_id, investor_id,
        contract_status, funding_status, payment_status,
        contract_start_date, contract_end_date, contract_duration_days,
        loan_principal_amount, current_principal_amount, original_principal_amount,
        interest_rate, platform_fee_rate,
        items:item_id (item_id, brand, model, estimated_value),
        pawners:customer_id (line_id)
      `)
      .eq('contract_id', contractId)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: 'ไม่พบสัญญา', code: 'CONTRACT_NOT_FOUND' },
        { status: 404 }
      );
    }

    await requireContractParty(request, contract, 'PAWNER');

    if (!['CONFIRMED', 'EXTENDED'].includes(String(contract.contract_status || ''))) {
      return NextResponse.json(
        { error: 'สัญญานี้ยังไม่อยู่ในสถานะที่ทำรายการได้', code: 'CONTRACT_NOT_ACTIONABLE' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const penaltyRequirement = await getPenaltyRequirement(supabase, contract);
    const penalty = serializePenaltyRequirement(contract, penaltyRequirement);
    const penaltyAmount = penaltyRequirement.required ? penaltyRequirement.penaltyAmount : 0;
    const overdueInterestAmount = penaltyRequirement.required ? penaltyRequirement.overdueInterestAmount : 0;
    const lateChargeAmount = penaltyRequirement.required ? penaltyRequirement.totalLateChargeAmount : 0;
    const contractItem = Array.isArray(contract.items) ? contract.items[0] || null : contract.items;

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

    // Rates: interest (1.5%) and platform fee (1.5%) are separate
    const rawRate = Number(contract.interest_rate || 0);
    const monthlyInterestRate = rawRate > 1 ? rawRate / 100 : rawRate;
    const feeRate = Number(contract.platform_fee_rate ?? 0.015);
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
      penaltyRequired: penaltyRequirement.required,
      penalty,
      penaltyAmount,
      overdueInterestAmount,
      lateChargeAmount,
    };

    switch (actionType) {
      case 'INTEREST_PAYMENT': {
        // ต่อดอกเบี้ย: จ่ายดอกเบี้ยเต็มงวดแล้วขยายสัญญา
        // interest_rate is stored as DECIMAL (e.g., 0.03 for 3%)
        // Full period interest = principal * monthly rate * (contract days / 30)
        const interestToPay = interestAccruedWithFee;

        const renewedWindow = getRenewedContractWindow(daysInContract, contract.contract_end_date);

        calculation = {
          ...calculation,
          interestToPay,
          baseTotalToPay: interestToPay,
          totalToPay: round2(interestToPay + lateChargeAmount),
          newStartDate: renewedWindow.contractStartDate.toISOString().split('T')[0],
          newEndDate: renewedWindow.contractEndDate.toISOString().split('T')[0],
          extensionDays: daysInContract,
          description: `ต่อดอกเบี้ยจำนวน ${interestToPay.toLocaleString()} บาท สัญญาใหม่เริ่มวันที่ ${renewedWindow.contractStartDate.toLocaleDateString('th-TH')} และครบกำหนดวันที่ ${renewedWindow.contractEndDate.toLocaleDateString('th-TH')}`,
        };
        break;
      }

      case 'PRINCIPAL_REDUCTION': {
        // ลดเงินต้น: จ่ายจำนวนที่ขอลด + ดอกเบี้ยสะสมถึงวันนี้
        const reductionAmountValue = Number(reductionAmount ?? amount ?? 0);

        // Mirrors the guard in /create: a full payoff is ไถ่ถอน, and quoting
        // it here would let the pawner reach a request that can never complete.
        if (reductionAmountValue >= currentPrincipal) {
          return NextResponse.json(
            {
              error: 'การชำระเงินต้นทั้งหมดคือการไถ่ถอน กรุณาใช้เมนูไถ่ถอนแทน',
              code: 'REDUCTION_EQUALS_FULL_PRINCIPAL',
            },
            { status: 400 }
          );
        }
        if (reductionAmountValue <= 0 || reductionAmountValue > currentPrincipal) {
          return NextResponse.json(
            { error: 'จำนวนเงินที่ต้องการลดไม่ถูกต้อง', code: 'INVALID_REDUCTION_AMOUNT' },
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
          baseTotalToPay: totalToPayNow,
          totalToPay: round2(totalToPayNow + lateChargeAmount),
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
        const rawItemValue = Number(contractItem?.estimated_value ?? 0);
        const fallbackItemValue = currentPrincipal > 0 ? currentPrincipal * 1.5 : 0;
        const itemValue = Number.isFinite(rawItemValue) && rawItemValue > 0 ? rawItemValue : fallbackItemValue;
        const maxIncrease = Math.max(0, itemValue - currentPrincipal);

        if (increaseAmountValue <= 0 || increaseAmountValue > maxIncrease) {
          return NextResponse.json(
            {
              error: `จำนวนเงินที่ต้องการเพิ่มไม่ถูกต้อง เพิ่มได้สูงสุด ${maxIncrease.toLocaleString()} บาท`,
              code: 'INVALID_INCREASE_AMOUNT',
            },
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
          baseTotalToPay: interestForPeriod,
          totalToPay: round2(interestForPeriod + lateChargeAmount),
          amountToReceive: increaseAmountValue, // จำนวนที่ pawner จะได้รับจาก investor
          description: `เพิ่มเงินต้น ${increaseAmountValue.toLocaleString()} บาท\nดอกเบี้ยช่วงแรก ${interestForPeriod.toLocaleString()} บาท\nดอกเบี้ยช่วงที่เหลือ ${newInterestForRemaining.toLocaleString()} บาท`,
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: 'ประเภทรายการไม่ถูกต้อง', code: 'INVALID_ACTION_TYPE' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      calculation,
      penaltyRequired: penaltyRequirement.required,
      penalty,
      contract: {
        contract_id: contract.contract_id,
        contract_number: contract.contract_number,
        item: contractItem,
      },
    });

  } catch (error: unknown) {
    if (error instanceof LiffAuthError) return liffAuthErrorResponse(error);
    const requestError = transactionRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error('[contract-action:calculate] failed');
    return sanitizedServerError('ไม่สามารถคำนวณยอดได้ชั่วคราว กรุณาลองใหม่');
  }
}
