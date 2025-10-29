/**
 * Utility functions for financial calculations in pawn system
 */

/**
 * Calculate due date from createdAt date and loan days
 */
export function calculateDueDate(createdAt: Date, loanDays: number): Date {
  const dueDate = new Date(createdAt);
  dueDate.setDate(dueDate.getDate() + loanDays);
  return dueDate;
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
 * Calculate total amount (principal + interest)
 */
export function calculateTotalAmount(principal: number, interest: number): number {
  return principal + interest;
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
  const daysDiff = Math.floor(
    (currentDate.getTime() - lastCutoffDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff <= 0) return 0;

  return calculateInterest(principal, interestRate, daysDiff);
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

  const daysSinceLastCutoff = Math.floor(
    (new Date().getTime() - new Date(lastCutoffDate).getTime()) / (1000 * 60 * 60 * 24)
  );

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
