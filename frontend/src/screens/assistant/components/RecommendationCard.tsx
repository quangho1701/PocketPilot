import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChatMessage } from '../../../types';

type Verdict = 'buy' | 'wait' | 'skip';

const VERDICT_STYLES: Record<Verdict, { color: string; label: string }> = {
  buy: { color: '#16A34A', label: 'BUY' },
  wait: { color: '#D97706', label: 'WAIT' },
  skip: { color: '#DC2626', label: 'SKIP' },
};

const DECISION_ACTIONS: { decision: Verdict; label: string }[] = [
  { decision: 'buy', label: 'I bought it' },
  { decision: 'wait', label: "I'll wait" },
  { decision: 'skip', label: 'I skipped' },
];

interface Props {
  message: ChatMessage;
  onDecision: (messageId: string, decision: Verdict) => void;
  submitting: boolean;
}

export default function RecommendationCard({ message, onDecision, submitting }: Props) {
  if (!message.recommendation) return null;

  const verdict = VERDICT_STYLES[message.recommendation];
  const decided = !!message.decision_id;

  return (
    <View style={styles.card}>
      <View style={[styles.badge, { backgroundColor: verdict.color }]}>
        <Text style={styles.badgeText}>{verdict.label}</Text>
      </View>

      {(message.item_description || message.amount != null) && (
        <Text style={styles.item}>
          {message.item_description ?? 'This purchase'}
          {message.amount != null ? ` — $${message.amount.toFixed(2)}` : ''}
        </Text>
      )}

      {message.reasoning ? <Text style={styles.reasoning}>{message.reasoning}</Text> : null}

      <Text style={styles.prompt}>
        {decided ? 'Decision recorded ✓' : 'What did you decide?'}
      </Text>
      <View style={styles.actions}>
        {DECISION_ACTIONS.map(({ decision, label }) => (
          <Pressable
            key={decision}
            style={[styles.actionButton, (decided || submitting) && styles.actionDisabled]}
            disabled={decided || submitting}
            onPress={() => onDecision(message.id, decision)}
          >
            <Text style={styles.actionText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  item: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  reasoning: { fontSize: 13, color: '#4B5563', lineHeight: 18 },
  prompt: { fontSize: 12, color: '#6B7280', marginTop: 8, marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontSize: 12, color: '#4F46E5', fontWeight: '600' },
});
