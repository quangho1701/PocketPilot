export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
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
  role: 'user' | 'assistant';
  content: string;
  decision?: 'buy' | 'wait' | 'skip';
}

export interface ApiResponse<T> {
  data: T;
  status: string;
}
