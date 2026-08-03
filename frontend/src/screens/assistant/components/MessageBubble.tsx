import { View, Text, StyleSheet } from 'react-native';
import { ChatMessage } from '../../../types';
import RecommendationCard from './RecommendationCard';

interface Props {
  message: ChatMessage;
  onDecision: (messageId: string, decision: 'buy' | 'wait' | 'skip') => void;
  submittingDecision: boolean;
}

export default function MessageBubble({ message, onDecision, submittingDecision }: Props) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={isUser ? styles.textUser : styles.textAssistant}>{message.content}</Text>
        {!isUser && message.recommendation ? (
          <RecommendationCard
            message={message}
            onDecision={onDecision}
            submitting={submittingDecision}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 4, paddingHorizontal: 12 },
  rowUser: { alignItems: 'flex-end' },
  rowAssistant: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: { backgroundColor: '#4F46E5', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#F3F4F6', borderBottomLeftRadius: 4 },
  textUser: { color: '#FFFFFF', fontSize: 15, lineHeight: 20 },
  textAssistant: { color: '#111827', fontSize: 15, lineHeight: 20 },
});
