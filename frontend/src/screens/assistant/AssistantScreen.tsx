// Owner: Ngu
// Feature: Real-Time Spending Assistant + Weekly AI Insights & Alerts
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ChatMessage } from '../../types';
import {
  sendChat,
  getConversations,
  getMessages,
  recordDecision,
} from '../../services/assistant';
import MessageBubble from './components/MessageBubble';

export default function AssistantScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const conversations = await getConversations();
        if (conversations.length > 0) {
          const latest = conversations[0];
          setConversationId(latest.id);
          setMessages(await getMessages(latest.id));
        }
      } catch {
        // No history yet (or backend offline) — start fresh, errors surface on send.
      }
    })();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;

    setInput('');
    setError(null);
    setThinking(true);

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const response = await sendChat(text, conversationId);
      setConversationId(response.conversation_id);
      setMessages((prev) => [...prev, response.message]);
    } catch {
      setError('Could not reach the assistant. Tap to retry.');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, conversationId]);

  const handleDecision = useCallback(
    async (messageId: string, decision: 'buy' | 'wait' | 'skip') => {
      setSubmittingDecision(true);
      try {
        const updated = await recordDecision(messageId, decision);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      } catch {
        setError('Could not record your decision. Please try again.');
      } finally {
        setSubmittingDecision(false);
      }
    },
    []
  );

  const inverted = [...messages].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {messages.length === 0 && !thinking ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Spending Assistant</Text>
          <Text style={styles.subtitle}>
            Ask me before you buy — "Should I buy a $120 pair of sneakers?"
          </Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={inverted}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onDecision={handleDecision}
              submittingDecision={submittingDecision}
            />
          )}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            thinking ? (
              <View style={styles.thinkingRow}>
                <ActivityIndicator size="small" color="#4F46E5" />
                <Text style={styles.thinkingText}>Thinking…</Text>
              </View>
            ) : null
          }
        />
      )}

      {error ? (
        <Pressable onPress={handleSend} style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Should I buy…?"
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={1000}
          editable={!thinking}
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || thinking) && styles.sendDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || thinking}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  list: { paddingVertical: 12 },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  thinkingText: { fontSize: 13, color: '#6B7280' },
  errorBanner: { backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 10 },
  errorText: { color: '#DC2626', fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111827',
  },
  sendButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
