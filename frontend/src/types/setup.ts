export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly';

export type SavingsPriority = 'minimal' | 'balanced' | 'aggressive';

export interface RecurringExpenseInput {
  name: string;
  category: string;
  monthly_amount: number;
}

export interface PrimaryGoalInput {
  goal_type: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
}

export interface FinancialSetupPayload {
  currency: 'VND';
  monthly_income: number;
  income_frequency: IncomeFrequency;
  recurring_expenses: RecurringExpenseInput[];
  primary_goal: PrimaryGoalInput;
  savings_priority: SavingsPriority;
  focus_categories: string[];
  financial_situation_notes: string | null;
  setup_version: 1;
}

export interface FinancialSetupResponse {
  status: 'not_started' | 'completed';
  completed_at: string | null;
  data: FinancialSetupPayload | null;
}
