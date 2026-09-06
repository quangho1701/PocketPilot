import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/types';
import { COLORS, FONTS } from '@/theme';
import GoalSimulationCard from './GoalSimulationCard';
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
          {!isUser && message.simulation_result ? (
            <GoalSimulationCard result={message.simulation_result} />
          ) : null}
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
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.parchmentDeep,
    marginRight: 7,
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.greenDeep,
  },
  messageColumn: { maxWidth: '88%' },
  senderName: {
    color: COLORS.oxblood,
    fontFamily: FONTS.mono,
    fontSize: 9,
    marginBottom: 4,
    marginLeft: 3,
  },
  bubble: {
    borderRadius: 2,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  bubbleUser: {
    backgroundColor: COLORS.greenDeep,
    borderBottomRightRadius: 0,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.parchmentDeep,
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  textUser: { color: COLORS.parchment, fontSize: 14, lineHeight: 20 },
  textAssistant: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  time: { color: COLORS.textMuted, fontFamily: FONTS.mono, fontSize: 8, marginTop: 4, marginLeft: 3 },
  timeUser: { textAlign: 'right', marginLeft: 0, marginRight: 3 },
});
