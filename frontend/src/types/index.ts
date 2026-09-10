export interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface BudgetCategory {
  id: string;
  slug: string;
  name: string;
  mapping_group: string;
  is_default: boolean;
  user_id?: string | null;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: 'income' | 'expense';
  merchant: string;
  category_id: string;
  transaction_date: string;
  currency: string;
  payment_method?: string | null;
  description?: string | null;
  source: 'manual' | 'ocr';
  receipt_reference?: string | null;
  suggested_category_id?: string | null;
  category_suggestion_source?: 'llm' | 'rules' | null;
  category_suggestion_confidence?: number | null;
  category_suggestion_accepted?: boolean | null;
}

export interface TransactionListResponse {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TransactionDashboard {
  date_from: string | null;
  date_to: string | null;
  total_income: number;
  total_expense: number;
  net_balance: number;
  transaction_count: number;
  category_suggestion_count?: number;
  category_suggestion_acceptance_rate?: number | null;
  by_category: Array<{
    category_id: string;
    category_name: string;
    currency: string;
    total_amount: number;
    transaction_count: number;
  }>;
  by_currency: Array<{
    currency: string;
    total_income: number;
    total_expense: number;
    net_balance: number;
    transaction_count: number;
  }>;
  spending_trend: Array<{
    period: string;
    currency: string;
    total_income: number;
    total_expense: number;
  }>;
  recent_transactions: Transaction[];
}

export interface BudgetCategoryProgress {
  category_id: string;
  category_slug?: string | null;
  allocated_amount: number;
  spent_amount: number;
  remaining_amount: number;
  percentage_used: number;
  near_limit: boolean;
}

export interface BudgetProgress {
  budget: {
    id: string;
    month: number;
    year: number;
    total_income: number;
    planned_savings: number;
    allocations: Array<{
      category_id: string;
      category_slug?: string | null;
      allocated_amount: number;
    }>;
  };
  total_allocated: number;
  total_spent: number;
  total_remaining: number;
  budget_utilization_percent: number;
  savings_progress: number;
  categories: BudgetCategoryProgress[];
}

export interface CategoryPrediction {
  status: 'preview';
  category_id: string;
  category_slug: string;
  category_name: string;
  confidence: number;
  source: 'llm' | 'rules';
  rationale: string;
  normalized_merchant?: string | null;
  alternatives: Array<{
    category_id: string;
    category_slug: string;
    category_name: string;
    confidence: number;
    rationale?: string | null;
  }>;
  requires_review: boolean;
}

export interface ReceiptOCRResponse {
  status: 'preview';
  filename: string;
  content_type: string;
  receipt_reference?: string | null;
  merchant?: string | null;
  amount?: number | null;
  transaction_date?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  items: Array<{ description: string; amount?: number | null }>;
  raw_text: string;
  confidence?: number | null;
  source: 'ocr';
  requires_confirmation: boolean;
  suggested_category?: CategoryPrediction | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category: string;
  limit: number;
  spent: number;
  period: 'weekly' | 'monthly';
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendation?: 'buy' | 'wait' | 'skip' | null;
  reasoning?: string | null;
  item_description?: string | null;
  amount?: number | null;
  category?: string | null;
  decision_id?: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  conversation_id: string;
  message: ChatMessage;
}

export interface ApiResponse<T> {
  data: T;
  status: string;
}

export * from './setup';
