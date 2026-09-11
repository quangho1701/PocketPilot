export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly';

export type SavingsPriority = 'minimal' | 'balanced' | 'aggressive';

export interface RecurringExpenseInput {
  name: string;
  category: string;
  monthly_amount: number;
}

export interface PrimaryGoalInput {
  id: string;
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
  goals: PrimaryGoalInput[];
  primary_goal_id: string | null;
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

export function getPrimaryGoal(setup: FinancialSetupPayload | null | undefined): PrimaryGoalInput | null {
  if (!setup?.goals.length) return null;
  return setup.goals.find((goal) => goal.id === setup.primary_goal_id) ?? setup.goals[0];
}
