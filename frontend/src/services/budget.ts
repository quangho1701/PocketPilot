import axios from 'axios';
import api, { DEMO_USER_ID } from './api';
import type {
  Budget,
  BudgetCategory,
  BudgetGenerationRequest,
  BudgetProgress,
  BudgetProposalUpdateRequest,
  CategoryDetail,
  PlanGoal,
  PlanGoalDraft,
  PlanGoalDraftState,
  PlanGoalInput,
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

export async function getBudgetMonth(month: number, year: number): Promise<Budget | null> {
  try { return (await api.get<Budget>(`${BUDGET_ENDPOINT}/month`, { params: { user_id: DEMO_USER_ID, month, year } })).data; }
  catch (error) { if (axios.isAxiosError(error) && error.response?.status === 404) return null; throw error; }
}
export async function listBudgetMonths(): Promise<Budget[]> {
  return (await api.get<Budget[]>(`${BUDGET_ENDPOINT}/months`, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function getCategoryDetail(budgetId: string, categoryId: string): Promise<CategoryDetail> {
  return (await api.get<CategoryDetail>(`${BUDGET_ENDPOINT}/details/${budgetId}/categories/${categoryId}`, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function saveCategoryAllocation(budgetId: string, categoryId: string, amount: number, applyToFuture: boolean): Promise<Budget> {
  return (await api.patch<Budget>(`${BUDGET_ENDPOINT}/details/${budgetId}/categories/${categoryId}`, { amount, apply_to_future: applyToFuture }, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function getDraftGoals(): Promise<PlanGoalDraftState> {
  return (await api.get<PlanGoalDraftState>(`${BUDGET_ENDPOINT}/plan-goals/draft`, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function confirmDraftGoals(goals: PlanGoalDraft[]): Promise<PlanGoal[]> {
  return (await api.post<PlanGoal[]>(`${BUDGET_ENDPOINT}/plan-goals/confirm`, goals, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function listPlanGoals(): Promise<PlanGoal[]> {
  return (await api.get<PlanGoal[]>(`${BUDGET_ENDPOINT}/plan-goals`, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function createPlanGoal(goal: PlanGoalInput): Promise<PlanGoal> {
  return (await api.post<PlanGoal>(`${BUDGET_ENDPOINT}/plan-goals`, goal, { params: { user_id: DEMO_USER_ID } })).data;
}
export async function updatePlanGoal(id: string, goal: Partial<PlanGoalInput>): Promise<PlanGoal> {
  return (await api.patch<PlanGoal>(`${BUDGET_ENDPOINT}/plan-goals/${id}`, goal, { params: { user_id: DEMO_USER_ID } })).data;
}
