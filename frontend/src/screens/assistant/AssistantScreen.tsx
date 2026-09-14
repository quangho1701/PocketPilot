// Owner: Ngu
// Feature: Real-Time Spending Assistant + Weekly AI Insights & Alerts
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { ChatMessage } from '@/types';
import {
  sendChat,
  getConversations,
  getMessages,
  recordDecision,
} from '@/services/assistant';
import { COLORS, FONTS, SOFT_SHADOW } from '@/theme';
import MessageBubble from './components/MessageBubble';

const STARTER_PROMPTS = [
  {
    icon: 'headset-outline' as const,
    label: 'Can I afford $120 headphones?',
    prompt: 'Can I afford to spend $120 on headphones today?',
  },
  {
    icon: 'wallet-outline' as const,
    label: 'How much can I spend this week?',
    prompt: 'How much flexible spending do I have left this week?',
  },
  {
    icon: 'flag-outline' as const,
    label: 'How would spending affect a goal?',
    prompt: 'How would an additional $50 expense affect one of my goals?',
  },
  {
    icon: 'trending-up-outline' as const,
    label: 'What if I save more each month?',
    prompt: 'How would saving an additional $25 per month change one of my goals?',
  },
];

const CONTEXT_SIGNALS = [
  { icon: 'wallet-outline' as const, label: 'Budget' },
  { icon: 'calendar-clear-outline' as const, label: 'Upcoming expenses' },
  { icon: 'flag-outline' as const, label: 'Goals' },
];

type Decision = 'buy' | 'wait' | 'skip';

export default function AssistantScreen() {
  const navigation = useNavigation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historySyncError, setHistorySyncError] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState<{
    messageId: string;
    decision: Decision;
  } | null>(null);
  const [recordedDecisions, setRecordedDecisions] = useState<Record<string, Decision>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setHistorySyncError(false);
      try {
        const conversations = await getConversations();
        if (active && conversations.length > 0) {
          const latest = conversations[0];
          const latestMessages = await getMessages(latest.id);
          if (active) {
            setConversationId(latest.id);
            setMessages(latestMessages);
          }
        }
      } catch {
        if (active) setHistorySyncError(true);
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const submitMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || thinking || loadingHistory) return;

    setInput('');
    setError(null);
    setThinking(true);

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, optimistic]);

    try {
      const response = await sendChat(text, conversationId);
      setConversationId(response.conversation_id);
      setMessages((previous) => [...previous, response.message]);
    } catch {
      setError('Could not connect to the assistant. Your message has been preserved.');
      setMessages((previous) => previous.filter((message) => message.id !== optimistic.id));
      setInput(text);
    } finally {
      setThinking(false);
    }
  }, [conversationId, loadingHistory, thinking]);

  const handleSend = useCallback(() => {
    void submitMessage(input);
  }, [input, submitMessage]);

  const handleNewConversation = useCallback(() => {
    if (thinking || loadingHistory) return;
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setError(null);
    setRecordedDecisions({});
  }, [loadingHistory, thinking]);

  const handleDecision = useCallback(
    async (messageId: string, decision: Decision) => {
      if (submittingDecision) return;
      setSubmittingDecision({ messageId, decision });
      setError(null);
      try {
        const updated = await recordDecision(messageId, decision);
        setMessages((previous) =>
          previous.map((message) => (message.id === messageId ? updated : message))
        );
        setRecordedDecisions((previous) => ({ ...previous, [messageId]: decision }));
      } catch {
        setError('Could not record your decision. Please try again.');
      } finally {
        setSubmittingDecision(null);
      }
    },
    [submittingDecision]
  );

  const invertedMessages = [...messages].reverse();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <View style={styles.assistantAvatar}>
            <Ionicons name="sparkles" size={20} color={COLORS.teal} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Spending Assistant</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, historySyncError && styles.statusDotWarning]} />
              <Text style={styles.statusText} numberOfLines={1}>
                {historySyncError
                  ? 'PocketPilot · history not synced'
                  : 'PocketPilot · ready to analyze'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleNewConversation}
            disabled={thinking || loadingHistory}
            style={({ pressed }) => [
              styles.newChatButton,
              pressed && styles.newChatButtonPressed,
              (thinking || loadingHistory) && styles.newChatButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Start a new conversation"
          >
            <Ionicons name="create-outline" size={19} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        {loadingHistory ? (
          <View style={styles.historyLoading} accessibilityLiveRegion="polite">
            <View style={styles.historyLoadingAvatar}>
              <Ionicons name="sparkles" size={16} color={COLORS.teal} />
            </View>
            <View style={styles.historyLoadingBubble}>
              <ActivityIndicator size="small" color={COLORS.teal} />
              <Text style={styles.historyLoadingText}>Opening conversation…</Text>
            </View>
          </View>
        ) : messages.length === 0 && !thinking ? (
          <ScrollView
            contentContainerStyle={styles.emptyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.dateDivider}>
              <View style={styles.dateDividerLine} />
              <Text style={styles.dateDividerText}>Today</Text>
              <View style={styles.dateDividerLine} />
            </View>

            <View style={styles.welcomeRow}>
              <View style={styles.welcomeAvatar}>
                <Ionicons name="sparkles" size={16} color={COLORS.teal} />
              </View>
              <View style={styles.welcomeColumn}>
                <View style={styles.senderRow}>
                  <Text style={styles.senderName}>PocketPilot</Text>
                  <Text style={styles.senderTime}>Now</Text>
                </View>
                <View style={styles.welcomeBubble}>
                  <Text style={styles.welcomeTitle}>Hello 👋</Text>
                  <Text style={styles.welcomeText}>
                    What purchase or goal are you considering? Share the situation and amount,
                    and I’ll help you understand the impact before you decide.
                  </Text>
                  <View style={styles.signalList}>
                    {CONTEXT_SIGNALS.map((signal) => (
                      <View key={signal.label} style={styles.signalPill}>
                        <Ionicons name={signal.icon} size={13} color={COLORS.teal} />
                        <Text style={styles.signalText}>{signal.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.memoryNote}>
                  <Ionicons name="shield-checkmark" size={17} color={COLORS.teal} />
                  <View style={styles.memoryCopy}>
                    <Text style={styles.memoryTitle}>Advice based on your profile</Text>
                    <Text style={styles.memoryText} numberOfLines={2}>
                      I’ll compare your budget, upcoming expenses, and saved goals.
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.quickReplyBlock}>
              <View style={styles.quickReplyHeader}>
                <Text style={styles.quickReplyTitle}>Try asking</Text>
                <Text style={styles.quickReplyMeta}>Tap to send</Text>
              </View>
              {STARTER_PROMPTS.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => void submitMessage(item.prompt)}
                  style={({ pressed }) => [
                    styles.quickReply,
                    pressed && styles.quickReplyPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Send question: ${item.label}`}
                >
                  <View style={styles.quickReplyIcon}>
                    <Ionicons name={item.icon} size={16} color={COLORS.teal} />
                  </View>
                  <Text style={styles.quickReplyText}>{item.label}</Text>
                  <Ionicons name="arrow-up" size={15} color={COLORS.teal} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            inverted
            data={invertedMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onDecision={handleDecision}
                submittingDecision={
                  submittingDecision?.messageId === item.id
                    ? submittingDecision.decision
                    : null
                }
                recordedDecision={recordedDecisions[item.id] ?? null}
              />
            )}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              thinking ? (
                <View style={styles.thinkingRow} accessibilityLiveRegion="polite">
                  <View style={styles.thinkingBubble}>
                    <ActivityIndicator size="small" color={COLORS.teal} />
                    <Text style={styles.thinkingText}>
                      Comparing your budget and goals…
                    </Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {error ? (
          <Pressable
            onPress={() => setError(null)}
            style={styles.errorBanner}
            accessibilityRole="button"
            accessibilityLabel={`${error}. Tap to dismiss.`}
            accessibilityLiveRegion="assertive"
          >
            <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Ionicons name="close" size={18} color={COLORS.error} />
          </Pressable>
        ) : null}

        <View style={styles.composerShell}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about spending or a goal…"
              placeholderTextColor={COLORS.textMuted}
              selectionColor={COLORS.teal}
              multiline
              maxLength={1000}
              editable={!thinking && !loadingHistory}
              accessibilityLabel="Question for the financial assistant"
              accessibilityHint="For example: How would spending $50 affect my goal?"
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                (!input.trim() || thinking || loadingHistory) && styles.sendDisabled,
                pressed &&
                  Boolean(input.trim()) &&
                  !thinking &&
                  !loadingHistory &&
                  styles.sendPressed,
              ]}
              onPress={handleSend}
              disabled={!input.trim() || thinking || loadingHistory}
              accessibilityRole="button"
              accessibilityLabel="Send question"
            >
              {thinking ? (
                <ActivityIndicator size="small" color={COLORS.surface} />
              ) : (
                <Ionicons name="arrow-up" size={21} color={COLORS.surface} />
              )}
            </Pressable>
          </View>
          <Text style={styles.composerHint}>
            {loadingHistory
              ? 'Syncing conversation…'
              : 'AI can make mistakes — verify before major decisions.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.parchment },
  container: { flex: 1, backgroundColor: COLORS.parchment },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.parchment,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderStrong,
  },
  assistantAvatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    borderWidth: 1,
    borderColor: COLORS.greenDeep,
  },
  headerCopy: { flex: 1, marginLeft: 11 },
  headerTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 23 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  statusDotWarning: { backgroundColor: COLORS.amber },
  statusText: { flex: 1, color: COLORS.textSecondary, fontSize: 11 },
  newChatButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  newChatButtonPressed: { backgroundColor: COLORS.mintSoft, borderColor: COLORS.teal },
  newChatButtonDisabled: { opacity: 0.48 },
  historyLoading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  historyLoadingAvatar: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: COLORS.mint,
  },
  historyLoadingBubble: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginLeft: 8,
  },
  historyLoadingText: { color: COLORS.textSecondary, fontSize: 12, marginLeft: 8 },
  emptyContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  dateDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },
  dateDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  dateDividerText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  welcomeAvatar: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    borderWidth: 1,
    borderColor: '#CDEBE2',
    marginTop: 18,
  },
  welcomeColumn: { flex: 1, minWidth: 0, marginLeft: 8 },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    marginLeft: 3,
  },
  senderName: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '800' },
  senderTime: { color: COLORS.textMuted, fontSize: 9, marginLeft: 7 },
  welcomeBubble: {
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    ...SOFT_SHADOW,
  },
  welcomeTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 21, marginBottom: 6 },
  welcomeText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  signalList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 13,
  },
  signalPill: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.greenDeep,
    backgroundColor: COLORS.parchment,
    paddingHorizontal: 9,
  },
  signalText: { color: COLORS.tealDark, fontSize: 9.5, fontWeight: '700', marginLeft: 4 },
  memoryNote: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.greenDeep,
    backgroundColor: COLORS.parchmentDeep,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 8,
  },
  memoryCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  memoryTitle: { color: COLORS.tealDark, fontSize: 10.5, fontWeight: '800' },
  memoryText: {
    color: COLORS.textSecondary,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 2,
  },
  quickReplyBlock: { marginLeft: 42, marginTop: 18, gap: 8 },
  quickReplyHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 1,
    paddingHorizontal: 2,
  },
  quickReplyTitle: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  quickReplyMeta: { color: COLORS.textMuted, fontSize: 9.5 },
  quickReply: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.parchment,
    paddingHorizontal: 9,
  },
  quickReplyPressed: { borderColor: COLORS.teal, backgroundColor: COLORS.mintSoft },
  quickReplyIcon: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
  },
  quickReplyText: { flex: 1, color: COLORS.text, fontSize: 11.5, fontWeight: '700', marginHorizontal: 9 },
  messageList: { paddingVertical: 14 },
  thinkingRow: { alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 5 },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    paddingHorizontal: 13,
    paddingVertical: 10,
    ...SOFT_SHADOW,
  },
  thinkingText: { color: COLORS.textSecondary, fontSize: 12, marginLeft: 8 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.errorSoft,
    borderTopWidth: 1,
    borderTopColor: '#F3C8C4',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: 8,
  },
  composerShell: {
    backgroundColor: COLORS.parchment,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderStrong,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  inputRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 104,
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 10,
    paddingBottom: 8,
    paddingRight: 8,
  },
  sendButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.greenDeep,
  },
  sendPressed: { backgroundColor: COLORS.tealDark },
  sendDisabled: { backgroundColor: COLORS.borderStrong },
  composerHint: {
    color: COLORS.textMuted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 5,
  },
  pressed: { opacity: 0.72 },
});
