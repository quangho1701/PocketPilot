import api, { DEMO_USER_ID } from './api';
import { ChatMessage, ChatResponse, Conversation } from '../types';

export async function sendChat(
  message: string,
  conversationId?: string
): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>(
    '/api/v1/assistant/chat',
    { message, conversation_id: conversationId ?? null },
    { params: { user_id: DEMO_USER_ID }, timeout: 30000 }
  );
  return data;
}

export async function getConversations(): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/api/v1/assistant/conversations', {
    params: { user_id: DEMO_USER_ID },
  });
  return data;
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(
    `/api/v1/assistant/conversations/${conversationId}/messages`,
    { params: { user_id: DEMO_USER_ID } }
  );
  return data;
}

export async function recordDecision(
  messageId: string,
  userDecision: 'buy' | 'wait' | 'skip'
): Promise<ChatMessage> {
  const { data } = await api.post<ChatMessage>(
    `/api/v1/assistant/messages/${messageId}/decision`,
    { user_decision: userDecision },
    { params: { user_id: DEMO_USER_ID } }
  );
  return data;
}
