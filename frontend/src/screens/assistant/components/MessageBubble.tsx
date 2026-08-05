import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/types';
import { COLORS, SOFT_SHADOW } from '@/theme';
import RecommendationCard from './RecommendationCard';

interface Props {
  message: ChatMessage;
  onDecision: (messageId: string, decision: 'buy' | 'wait' | 'skip') => void;
  submittingDecision: 'buy' | 'wait' | 'skip' | null;
  recordedDecision: 'buy' | 'wait' | 'skip' | null;
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function MessageBubble({
  message,
  onDecision,
  submittingDecision,
  recordedDecision,
}: Props) {
  const isUser = message.role === 'user';

  return (
    <View
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
      accessibilityLiveRegion={isUser ? 'none' : 'polite'}
    >
      {!isUser ? (
        <View style={styles.avatar}>
          <Ionicons name="sparkles" size={15} color={COLORS.teal} />
        </View>
      ) : null}
      <View style={styles.messageColumn}>
        {!isUser ? <Text style={styles.senderName}>PocketPilot</Text> : null}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={isUser ? styles.textUser : styles.textAssistant}>
            {message.content}
          </Text>
          {!isUser && message.recommendation ? (
            <RecommendationCard
              message={message}
              onDecision={onDecision}
              submitting={submittingDecision}
              recordedDecision={recordedDecision}
            />
          ) : null}
        </View>
        <Text style={[styles.time, isUser && styles.timeUser]}>
          {formatMessageTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 6,
    paddingHorizontal: 14,
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  avatar: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.mint,
    marginRight: 7,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#CDEBE2',
  },
  messageColumn: { maxWidth: '88%' },
  senderName: {
    color: COLORS.textSecondary,
    fontSize: 9.5,
    fontWeight: '800',
    marginBottom: 4,
    marginLeft: 3,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleUser: {
    backgroundColor: COLORS.teal,
    borderBottomRightRadius: 5,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SOFT_SHADOW,
  },
  textUser: { color: COLORS.surface, fontSize: 14, lineHeight: 20 },
  textAssistant: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  time: { color: COLORS.textMuted, fontSize: 9, marginTop: 4, marginLeft: 3 },
  timeUser: { textAlign: 'right', marginLeft: 0, marginRight: 3 },
});
