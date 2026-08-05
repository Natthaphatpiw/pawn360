/**
 * Utility functions for financial calculations in pawn system
 */

import { MS_PER_DAY } from '@/lib/utils/time';

const atMidnight = (value: Date) => {
  const date = new Date(value.getTime());
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Whole days elapsed, counting the first day.
 *
 * Interest runs from day one: a pawn taken and redeemed on the same calendar
 * day still costs one day. Both ends are normalised to midnight first, so the
 * subtraction is an exact multiple of a day and the count changes when the
 * calendar date does - not 24 hours later. The raw wall-clock subtraction this
 * replaces returned 0 for a full 24 hours after the cutoff, which billed
 * nothing at all for an action taken the evening a pawn was created.
 *
 * The Supabase-side handlers already do exactly this
 * (`Math.min(daysInContract, Math.max(1, Math.floor(...) + 1))`); these
 * MongoDB-era helpers were the one family that did not.
 */
export function elapsedDaysInclusive(from: Date, to: Date = new Date()): number {
  const days = Math.floor(
    (atMidnight(to).getTime() - atMidnight(from).getTime()) / MS_PER_DAY,
  ) + 1;
  return Math.max(1, days);
}

/**
 * Calculate interest amount based on principal, interest rate, and days
 */
export function calculateInterest(
  principal: number,
  interestRate: number,
  days: number
): number {
  // Interest per month = principal * (interestRate / 100)
  // Interest per day = monthly interest / 30
  const monthlyInterest = principal * (interestRate / 100);
  const dailyInterest = monthlyInterest / 30;
  return Math.round(dailyInterest * days);
}

/**
 * Calculate accrued interest from last cutoff date to current date
 */
export function calculateAccruedInterest(
  principal: number,
  interestRate: number,
  lastCutoffDate: Date,
  currentDate: Date = new Date()
): number {
  return calculateInterest(
    principal,
    interestRate,
    elapsedDaysInclusive(lastCutoffDate, currentDate),
  );
}

/**
 * Get the correct principal amount from item data
 * Priority: confirmationNewContract.pawnPrice > desiredAmount > 0
 */
export function getPrincipalAmount(item: any): number {
  return item.confirmationNewContract?.pawnPrice ||
         item.desiredAmount ||
         0;
}

/**
 * Get the correct interest rate from item data
 * Priority: confirmationNewContract.interestRate > interestRate > 0
 */
export function getInterestRate(item: any): number {
  return item.confirmationNewContract?.interestRate ||
         item.interestRate ||
         0;
}

/**
 * Get loan days from item data
 * Priority: confirmationNewContract.loanDays > loanDays > 0
 */
export function getLoanDays(item: any): number {
  return item.confirmationNewContract?.loanDays ||
         item.loanDays ||
         0;
}

/**
 * Calculate redemption amount for an item
 * Includes principal + accrued interest from last cutoff
 */
export function calculateRedemptionAmount(item: any): {
  principal: number;
  interest: number;
  total: number;
  daysSinceLastCutoff: number;
} {
  const principal = getPrincipalAmount(item);
  const interestRate = getInterestRate(item);

  const lastCutoffDate = item.lastInterestCutoffDate || item.createdAt;
  const accruedInterest = calculateAccruedInterest(
    principal,
    interestRate,
    new Date(lastCutoffDate)
  );

  // Must agree with the day count the interest above was billed on, or the
  // screen shows "0 วัน" beside a non-zero charge.
  const daysSinceLastCutoff = elapsedDaysInclusive(new Date(lastCutoffDate));

  return {
    principal,
    interest: accruedInterest,
    total: principal + accruedInterest,
    daysSinceLastCutoff
  };
}

/**
 * Calculate reduce principal payment details
 */
export function calculateReducePrincipalPayment(
  item: any,
  reduceAmount: number
): {
  principal: number;
  reduceAmount: number;
  interest: number;
  total: number;
  newPrincipal: number;
} {
  const principal = getPrincipalAmount(item);
  const interestRate = getInterestRate(item);

  // Calculate accrued interest
  const lastCutoffDate = item.lastInterestCutoffDate || item.createdAt;
  const accruedInterest = calculateAccruedInterest(
    principal,
    interestRate,
    new Date(lastCutoffDate)
  );

  const total = reduceAmount + accruedInterest;
  const newPrincipal = principal - reduceAmount;

  return {
    principal,
    reduceAmount,
    interest: accruedInterest,
    total,
    newPrincipal
  };
}
