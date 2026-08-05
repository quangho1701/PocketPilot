import api, { DEMO_USER_ID } from './api';
import { FinancialSetupPayload, FinancialSetupResponse } from '../types/setup';

const SETUP_ENDPOINT = '/api/v1/setup';

export async function getFinancialSetup(): Promise<FinancialSetupResponse> {
  const { data } = await api.get<FinancialSetupResponse>(SETUP_ENDPOINT, {
    params: { user_id: DEMO_USER_ID },
  });
  return data;
}

export async function saveFinancialSetup(
  payload: FinancialSetupPayload
): Promise<FinancialSetupResponse> {
  const { data } = await api.put<FinancialSetupResponse>(SETUP_ENDPOINT, payload, {
    params: { user_id: DEMO_USER_ID },
  });
  return data;
}
