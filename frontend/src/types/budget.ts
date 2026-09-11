export type BudgetStatus = 'draft' | 'active' | 'archived';

export type BudgetingMode = '50_30_20' | 'zero_based' | 'custom' | 'ai_personalized';

export interface BudgetAllocation {
  id: string;
  budget_id: string;
  category_id: string;
  category_slug: string | null;
  allocated_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  month: number;
  year: number;
  total_income: number;
  planned_savings: number;
  status: BudgetStatus;
  budgeting_mode: string;
  strategy_source: string;
  approved_at: string | null;
  allocations: BudgetAllocation[];
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  slug: string;
  name: string;
  mapping_group: 'needs' | 'wants' | 'savings';
  is_default: boolean;
  user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategoryProgress {
  category_id: string;
  category_slug: string | null;
  allocated_amount: number;
  spent_amount: number;
  remaining_amount: number;
  percentage_used: number;
  near_limit: boolean;
}

export interface BudgetProgress {
  budget: Budget;
  total_allocated: number;
  total_spent: number;
  total_remaining: number;
  budget_utilization_percent: number;
  savings_progress: number;
  categories: BudgetCategoryProgress[];
}

export interface BudgetGenerationRequest {
  month: number;
  year: number;
  budgeting_mode: BudgetingMode;
  custom_allocations?: BudgetAllocationUpdate[];
}

export interface BudgetAllocationUpdate {
  category_id: string;
  amount: number;
}

export interface BudgetProposalUpdateRequest {
  planned_savings?: number;
  allocations?: BudgetAllocationUpdate[];
}