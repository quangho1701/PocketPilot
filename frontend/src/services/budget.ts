import axios from 'axios';
import api, { DEMO_USER_ID } from './api';
import type {
  Budget,
  BudgetCategory,
  BudgetGenerationRequest,
  BudgetProgress,
  BudgetProposalUpdateRequest,
} from '@/types/budget';

const BUDGET_ENDPOINT = '/api/v1/budget';

export async function getLatestBudget(): Promise<Budget | null> {
  try {
    const { data } = await api.get<Budget>(`${BUDGET_ENDPOINT}/`, {
      params: { user_id: DEMO_USER_ID },
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

export async function generateBudgetProposal(
  payload: BudgetGenerationRequest
): Promise<Budget> {
  const { data } = await api.post<Budget>(`${BUDGET_ENDPOINT}/proposals/generate`, payload, {
    params: { user_id: DEMO_USER_ID },
  });
  return data;
}

export async function updateBudgetProposal(
  budgetId: string,
  payload: BudgetProposalUpdateRequest
): Promise<Budget> {
  const { data } = await api.patch<Budget>(
    `${BUDGET_ENDPOINT}/proposals/${encodeURIComponent(budgetId)}`,
    payload,
    { params: { user_id: DEMO_USER_ID } }
  );
  return data;
}

export async function approveBudgetProposal(budgetId: string): Promise<Budget> {
  const { data } = await api.post<Budget>(
    `${BUDGET_ENDPOINT}/proposals/${encodeURIComponent(budgetId)}/approve`,
    undefined,
    { params: { user_id: DEMO_USER_ID } }
  );
  return data;
}

export async function getBudgetProgress(month: number, year: number): Promise<BudgetProgress> {
  const { data } = await api.get<BudgetProgress>(`${BUDGET_ENDPOINT}/progress`, {
    params: { user_id: DEMO_USER_ID, month, year },
  });
  return data;
}

export async function listBudgetCategories(): Promise<BudgetCategory[]> {
  const { data } = await api.get<BudgetCategory[]>(`${BUDGET_ENDPOINT}/categories`, {
    params: { user_id: DEMO_USER_ID },
  });
  return data;
}