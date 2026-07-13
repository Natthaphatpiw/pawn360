import { MS_PER_DAY } from '@/lib/utils/time';

export type InvestorContractDisplayStatus =
  | 'APPROVAL'
  | 'PENDING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'TERMINATED'
  | 'OVERDUE'
  | 'UNREDEEMED';

type InvestorContractStatusInput = {
  contract_status?: string | null;
  item_delivery_status?: string | null;
  contract_end_date?: string | null;
};

export const getInvestorContractDaysRemaining = (endDate?: string | null) => {
  if (!endDate) return null;

  const end = new Date(endDate);
  const endTime = end.getTime();
  if (!Number.isFinite(endTime)) return null;

  const now = new Date();
  return Math.ceil((endTime - now.getTime()) / MS_PER_DAY);
};

export const getInvestorContractDisplayStatus = (
  contract: InvestorContractStatusInput,
  hasPrincipalIncreaseApproval = false
): InvestorContractDisplayStatus => {
  if (hasPrincipalIncreaseApproval) {
    return 'APPROVAL';
  }

  const contractStatus = String(contract.contract_status || '').toUpperCase();
  const itemDeliveryStatus = String(contract.item_delivery_status || '').toUpperCase();

  if (contractStatus === 'COMPLETED') {
    return 'COMPLETED';
  }

  if (contractStatus === 'TERMINATED' || itemDeliveryStatus === 'RETURNED') {
    return 'TERMINATED';
  }

  const itemStored = itemDeliveryStatus === 'VERIFIED';
  const daysRemaining = getInvestorContractDaysRemaining(contract.contract_end_date);
  if (itemStored && daysRemaining !== null && daysRemaining < 0) {
    return Math.abs(daysRemaining) >= 7 ? 'UNREDEEMED' : 'OVERDUE';
  }

  if (contractStatus === 'DEFAULTED') {
    return 'OVERDUE';
  }

  if (!itemStored) {
    return 'PENDING';
  }

  return 'ACTIVE';
};

export const getInvestorContractStatusMeta = (status: InvestorContractDisplayStatus) => {
  switch (status) {
    case 'APPROVAL':
      return { label: 'รออนุมัติ', tone: 'text-warning', groupKey: 'approval' };
    case 'PENDING':
      return { label: 'กำลังดำเนินการ', tone: 'text-warning', groupKey: 'pending' };
    case 'ACTIVE':
      return { label: 'ปกติ', tone: 'text-success', groupKey: 'active' };
    case 'COMPLETED':
      return { label: 'เสร็จสิ้น', tone: 'text-foreground-subtle', groupKey: 'completed' };
    case 'TERMINATED':
      return { label: 'ยกเลิก', tone: 'text-error', groupKey: 'terminated' };
    case 'OVERDUE':
      return { label: 'เลยกำหนด', tone: 'text-[var(--orange-500)]', groupKey: 'overdue' };
    case 'UNREDEEMED':
      return { label: 'สัญญาหลุด', tone: 'text-s2', groupKey: 'unredeemed' };
  }
};

export const getInvestorContractRemainingDays = (
  contract: InvestorContractStatusInput,
  status: InvestorContractDisplayStatus
) => {
  if (status === 'PENDING' || status === 'TERMINATED' || status === 'COMPLETED') {
    return null;
  }

  const daysRemaining = getInvestorContractDaysRemaining(contract.contract_end_date);
  if (daysRemaining === null) {
    return null;
  }

  return Math.max(daysRemaining, 0);
};

export const formatInvestorContractRemainingDays = (daysRemaining: number | null) => {
  if (daysRemaining === null) {
    return null;
  }

  if (daysRemaining === 0) {
    return 'เหลือ 0 วัน';
  }

  return `เหลือ ${daysRemaining} วัน`;
};
