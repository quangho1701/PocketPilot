import type { FinancialSetupPayload } from '@/types/setup';

const compactVndFormatter = new Intl.NumberFormat('vi-VN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
});

const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});

export function formatVnd(value: number): string {
  return `${vndFormatter.format(Math.round(value))} ₫`;
}

export function formatCompactVnd(value: number): string {
  if (Math.abs(value) < 1_000_000) return formatVnd(value);
  return `${compactVndFormatter.format(value)} ₫`;
}

export function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

export function formatCompactUsd(value: number): string {
  return compactUsdFormatter.format(value);
}

export function formatMonthYear(value: string | null): string | null {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  );
}

export function recurringTotal(setup: FinancialSetupPayload | null): number {
  return (
    setup?.recurring_expenses.reduce(
      (total, expense) => total + expense.monthly_amount,
      0
    ) ?? 0
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  housing: 'Nhà ở',
  utilities: 'Điện nước',
  transportation: 'Đi lại',
  debt_payment: 'Trả góp',
  subscriptions: 'Đăng ký',
  other: 'Khác',
  groceries: 'Ăn uống thiết yếu',
  dining: 'Ăn ngoài',
  shopping: 'Mua sắm',
  entertainment: 'Giải trí',
};

export const GOAL_LABELS: Record<string, string> = {
  emergency_fund: 'Quỹ khẩn cấp',
  travel: 'Du lịch',
  education: 'Học tập',
  debt_payoff: 'Trả nợ',
  major_purchase: 'Mua sắm lớn',
  other: 'Mục tiêu khác',
};

export const SAVINGS_LABELS = {
  minimal: 'Linh hoạt',
  balanced: 'Cân bằng',
  aggressive: 'Ưu tiên tiết kiệm',
} as const;
