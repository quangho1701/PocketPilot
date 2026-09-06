import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/types';
import { COLORS, FONTS } from '@/theme';
import { formatVnd } from '@/utils/finance';

type Verdict = 'buy' | 'wait' | 'skip';
type IconName = keyof typeof Ionicons.glyphMap;


const VERDICT_STYLES: Record<
  Verdict,
  { color: string; background: string; label: string; summary: string; icon: IconName }
> = {
  buy: {
    color: COLORS.greenDeep,
    background: COLORS.mintSoft,
    label: 'CÓ THỂ MUA',
    summary: 'Phù hợp với kế hoạch hiện tại',
    icon: 'checkmark-circle',
  },
  wait: {
    color: COLORS.brass,
    background: COLORS.amberSoft,
    label: 'NÊN CHỜ',
    summary: 'Hoãn lại sẽ an toàn hơn',
    icon: 'time',
  },
  skip: {
    color: COLORS.oxblood,
    background: COLORS.errorSoft,
    label: 'NÊN BỎ QUA',
    summary: 'Ưu tiên ngân sách và mục tiêu',
    icon: 'close-circle',
  },
};

const DECISION_ACTIONS: { decision: Verdict; label: string; icon: IconName }[] = [
  { decision: 'buy', label: 'Mình sẽ mua', icon: 'bag-check-outline' },
  { decision: 'wait', label: 'Mình sẽ chờ', icon: 'time-outline' },
  { decision: 'skip', label: 'Mình bỏ qua', icon: 'close-outline' },
];

const ANALYSIS_SOURCES: { label: string; icon: IconName }[] = [
  { label: 'Ngân sách', icon: 'wallet-outline' },
  { label: 'Khoản sắp tới', icon: 'calendar-clear-outline' },
  { label: 'Mục tiêu', icon: 'flag-outline' },
];

interface Props {
  message: ChatMessage;
  onDecision: (messageId: string, decision: Verdict) => void;
  submitting: Verdict | null;
  recordedDecision: Verdict | null;
}

export default function RecommendationCard({
  message,
  onDecision,
  submitting,
  recordedDecision,
}: Props) {
  if (!message.recommendation) return null;

  const verdict = VERDICT_STYLES[message.recommendation];
  const decided = Boolean(message.decision_id);
  const recordedLabel = recordedDecision
    ? DECISION_ACTIONS.find((action) => action.decision === recordedDecision)?.label
    : null;

  return (
    <View style={styles.card}>
      <View style={[styles.verdictPanel, { backgroundColor: verdict.background }]}>
        <View style={[styles.verdictIcon, { backgroundColor: verdict.color }]}>
          <Ionicons name={verdict.icon} size={19} color={COLORS.surface} />
        </View>
        <View style={styles.verdictCopy}>
          <Text style={[styles.verdictLabel, { color: verdict.color }]}>{verdict.label}</Text>
          <Text style={styles.verdictSummary}>{verdict.summary}</Text>
        </View>
      </View>

      {decided ? (
        <View style={styles.recordedBadge}>
          <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
          <Text style={styles.recordedText}>
            {recordedLabel ? `Đã ghi nhớ: ${recordedLabel}` : 'Đã ghi nhớ quyết định của bạn'}
          </Text>
        </View>
      ) : null}

      {message.item_description || message.amount != null ? (
        <View style={styles.purchaseRow}>
          <View style={styles.purchaseIcon}>
            <Ionicons name="receipt-outline" size={18} color={COLORS.teal} />
          </View>
          <View style={styles.purchaseCopy}>
            <Text style={styles.purchaseLabel}>Khoản đang cân nhắc</Text>
            <Text style={styles.item} numberOfLines={2}>
              {message.item_description ?? 'Khoản mua này'}
            </Text>
          </View>
          {message.amount != null ? (
            <Text
              style={styles.amount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {formatVnd(message.amount)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {message.reasoning ? (
        <View style={styles.reasoningBox}>
          <View style={styles.reasoningHeader}>
            <Ionicons name="analytics-outline" size={15} color={COLORS.teal} />
            <Text style={styles.reasoningLabel}>Vì sao PocketPilot gợi ý vậy?</Text>
          </View>
          <Text style={styles.reasoning}>{message.reasoning}</Text>
          <View style={styles.sourceList}>
            {ANALYSIS_SOURCES.map((source) => (
              <View key={source.label} style={styles.sourcePill}>
                <Ionicons name={source.icon} size={11} color={COLORS.textSecondary} />
                <Text style={styles.sourceText}>{source.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!decided ? (
        <>
          <View style={styles.decisionPrompt}>
            <Text style={styles.prompt}>Bạn sẽ làm gì?</Text>
            <Text style={styles.promptHint}>Mình sẽ ghi nhớ cho lần tư vấn sau</Text>
          </View>
          <View style={styles.actions}>
            {DECISION_ACTIONS.map(({ decision, label, icon }) => {
              const recommended = decision === message.recommendation;
              return (
                <Pressable
                  key={decision}
                  style={({ pressed }) => [
                    styles.actionButton,
                    recommended && {
                      backgroundColor: verdict.color,
                      borderColor: verdict.color,
                    },
                    Boolean(submitting) && styles.actionDisabled,
                    pressed && !submitting && !recommended && styles.actionPressed,
                    pressed && !submitting && recommended && styles.actionRecommendedPressed,
                  ]}
                  disabled={Boolean(submitting)}
                  onPress={() => onDecision(message.id, decision)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}${recommended ? ', theo gợi ý của PocketPilot' : ''}`}
                >
                  {submitting === decision ? (
                    <ActivityIndicator
                      size="small"
                      color={recommended ? COLORS.surface : COLORS.teal}
                    />
                  ) : (
                    <>
                      <Ionicons
                        name={icon}
                        size={14}
                        color={recommended ? COLORS.surface : COLORS.tealDark}
                      />
                      <Text
                        style={[
                          styles.actionText,
                          recommended && styles.actionTextRecommended,
                        ]}
                      >
                        {label}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  verdictPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    padding: 10,
    marginBottom: 10,
  },
  verdictIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  verdictCopy: { flex: 1, minWidth: 0, marginLeft: 9 },
  verdictLabel: { fontFamily: FONTS.mono, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  verdictSummary: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 16, marginTop: 2 },
  recordedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.greenDeep,
    backgroundColor: COLORS.mintSoft,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 10,
  },
  recordedText: { flex: 1, color: COLORS.success, fontSize: 10, fontWeight: '700', marginLeft: 5 },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    padding: 10,
    marginBottom: 10,
  },
  purchaseIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    backgroundColor: COLORS.mint,
  },
  purchaseCopy: { flex: 1, minWidth: 0, marginHorizontal: 9 },
  purchaseLabel: { color: COLORS.textMuted, fontSize: 9, marginBottom: 2 },
  item: { color: COLORS.text, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  amount: {
    maxWidth: '38%',
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 6,
  },
  reasoningBox: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.teal,
    borderRadius: 11,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 11,
  },
  reasoningHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  reasoningLabel: {
    color: COLORS.teal,
    fontSize: 9.5,
    fontWeight: '800',
    marginLeft: 5,
  },
  reasoning: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  sourceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  sourceText: { color: COLORS.textSecondary, fontSize: 8.5, fontWeight: '700', marginLeft: 3 },
  decisionPrompt: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 7,
  },
  prompt: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  promptHint: { flex: 1, color: COLORS.textMuted, fontSize: 8.5, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 6 },
  actionButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 5,
  },
  actionPressed: { borderColor: COLORS.teal, backgroundColor: COLORS.mintSoft },
  actionRecommendedPressed: { opacity: 0.78 },
  actionDisabled: { opacity: 0.55 },
  actionText: { color: COLORS.tealDark, fontSize: 9, fontWeight: '800', marginTop: 3, textAlign: 'center' },
  actionTextRecommended: { color: COLORS.surface },
});
