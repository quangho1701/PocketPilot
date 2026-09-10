import api from './api';
import type {
  CategoryPrediction,
  ReceiptOCRResponse,
  Transaction,
  TransactionDashboard,
  TransactionListResponse,
} from '@/types';

export interface TransactionCreatePayload {
  amount: number;
  transaction_type: 'income' | 'expense';
  merchant: string;
  category_id: string;
  transaction_date: string;
  currency: string;
  payment_method?: string;
  receipt_reference?: string;
  suggested_category_id?: string;
  category_suggestion_source?: 'llm' | 'rules';
  category_suggestion_confidence?: number;
  category_suggestion_accepted?: boolean;
  description?: string;
  source?: 'manual' | 'ocr';
}

export type TransactionUpdatePayload = Partial<TransactionCreatePayload>;

export interface TransactionListParams {
  transaction_type?: 'income' | 'expense';
  category_id?: string;
  source?: 'manual' | 'ocr';
  merchant?: string;
  payment_method?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: 'transaction_date' | 'amount' | 'merchant';
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export async function listTransactions(
  params: TransactionListParams = {},
): Promise<TransactionListResponse> {
  const { data } = await api.get<TransactionListResponse>('/api/v1/transactions/', { params });
  return data;
}

export async function createTransaction(
  payload: TransactionCreatePayload
): Promise<Transaction> {
  const { data } = await api.post<Transaction>('/api/v1/transactions/', payload);
  return data;
}

export async function updateTransaction(
  id: string,
  payload: TransactionUpdatePayload
): Promise<Transaction> {
  const { data } = await api.patch<Transaction>(
    `/api/v1/transactions/${encodeURIComponent(id)}`,
    payload,
  );
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/api/v1/transactions/${encodeURIComponent(id)}`);
}

export async function getTransactionDashboard(params: {
  date_from?: string;
  date_to?: string;
  trend_period?: 'week' | 'month';
} = {}): Promise<TransactionDashboard> {
  const { data } = await api.get<TransactionDashboard>('/api/v1/transactions/dashboard', { params });
  return data;
}

export async function categorizeTransaction(input: {
  merchant: string;
  description?: string;
  transaction_type?: 'income' | 'expense';
  items?: Array<{ description: string; amount?: number | null }>;
}): Promise<CategoryPrediction> {
  const { data } = await api.post<CategoryPrediction>(
    '/api/v1/transactions/categorize',
    input
  );
  return data;
}

export async function scanReceipt(
  file: { uri: string; name: string; type: string }
): Promise<ReceiptOCRResponse> {
  const formData = new FormData();
  // React Native's multipart adapter expects the native file descriptor rather
  // than a browser Blob.
  formData.append('file', file as unknown as Blob);
  const { data } = await api.post<ReceiptOCRResponse>('/api/v1/transactions/ocr', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
