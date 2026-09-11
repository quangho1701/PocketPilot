// Owner: Quang
// Feature: Persistent Financial Memory + Adaptive Learning Engine
import { useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import { getFinancialSetup } from '@/services/setup';
import { CARD_SHADOW, COLORS, RADII, SOFT_SHADOW } from '@/theme';
import type { FinancialSetupPayload, SavingsPriority } from '@/types/setup';
import { getPrimaryGoal } from '@/types/setup';
import {
  CATEGORY_LABELS,
  GOAL_LABELS,
  SAVINGS_LABELS,
  formatCompactVnd,
  formatVnd,
  recurringTotal,
} from '@/utils/finance';

type Props = BottomTabScreenProps<MainTabParamList, 'Memory'>;
type ScreenPhase = 'loading' | 'ready' | 'error' | 'empty';
type IconName = ComponentProps<typeof Ionicons>['name'];
type SignalTone = 'positive' | 'warning' | 'critical';

const CATEGORY_ICONS: Record<string, IconName> = {
  housing: 'home-outline',
  utilities: 'flash-outline',
  transportation: 'car-outline',
  debt_payment: 'card-outline',
  subscriptions: 'repeat-outline',
  groceries: 'basket-outline',
  dining: 'restaurant-outline',
  shopping: 'bag-handle-outline',
  entertainment: 'game-controller-outline',
  other: 'receipt-outline',
};

const SAVINGS_DESCRIPTIONS: Record<SavingsPriority, string> = {
  minimal: 'Ưu tiên sự linh hoạt và giữ kế hoạch vừa sức với dòng tiền hiện tại.',
  balanced: 'Cân bằng giữa chi tiêu hôm nay và tiến độ cho mục tiêu dài hạn.',
  aggressive: 'Ưu tiên bảo vệ phần tiết kiệm trước các khoản chi linh hoạt.',
};

const SIGNAL_COLORS: Record<
  SignalTone,
  { accent: string; soft: string; icon: IconName }
> = {
  positive: {
    accent: COLORS.success,
    soft: COLORS.mintSoft,
    icon: 'checkmark-circle-outline',
  },
  warning: {
    accent: COLORS.amber,
    soft: COLORS.amberSoft,
    icon: 'alert-circle-outline',
  },
  critical: {
    accent: COLORS.error,
    soft: COLORS.errorSoft,
    icon: 'warning-outline',
  },
};

function getCashFlowSignal(income: number, fixedCosts: number) {
  const ratio = income > 0 ? (fixedCosts / income) * 100 : 0;
  const remaining = income - fixedCosts;

  if (ratio >= 100) {
    return {
      tone: 'critical' as const,
      title: 'Chi cố định đang vượt thu nhập',
      description: `Các khoản cố định đang cao hơn thu nhập ${formatCompactVnd(
        Math.abs(remaining)
      )} mỗi tháng.`,
    };
  }

  if (ratio >= 75) {
    return {
      tone: 'warning' as const,
      title: 'Khoảng thở tài chính đang mỏng',
      description: `${Math.round(
        ratio
      )}% thu nhập đã dành cho chi phí cố định trước các khoản chi hằng ngày.`,
    };
  }

  if (ratio >= 50) {
    return {
      tone: 'warning' as const,
      title: 'Dòng tiền cần được theo dõi',
      description: `Chi phí cố định đang dùng ${Math.round(
        ratio
      )}% thu nhập mỗi tháng.`,
    };
  }

  return {
    tone: 'positive' as const,
    title: 'Nền tảng dòng tiền khá linh hoạt',
    description:
      fixedCosts > 0
        ? `${Math.round(ratio)}% thu nhập hiện dành cho các khoản chi cố định.`
        : 'Bạn chưa ghi nhận khoản chi cố định nào trong hồ sơ.',
  };
}

function formatProfileDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatGoalDate(value: string | null): string {
  if (!value) return 'Chưa đặt thời hạn';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function ScreenHeader({
  completedAt,
  onEdit,
}: {
  completedAt: string | null;
  onEdit: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerIdentity}>
          <View style={styles.headerMark}>
            <Ionicons name="analytics" size={20} color={COLORS.mint} />
          </View>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerEyebrow}>PHÂN TÍCH POCKETPILOT</Text>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Hiểu tiền của bạn
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.editHeaderButton,
            pressed && styles.editHeaderButtonPressed,
          ]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Cập nhật hồ sơ tài chính"
          accessibilityHint="Mở lại năm bước thiết lập với dữ liệu hiện tại"
        >
          <Ionicons name="pencil-outline" size={17} color={COLORS.surface} />
          <Text style={styles.editHeaderButtonText}>Cập nhật</Text>
        </Pressable>
      </View>

      <Text style={styles.headerSubtitle}>
        Tín hiệu được tổng hợp từ hồ sơ tài chính bạn đã chia sẻ.
      </Text>
      <View style={styles.headerMetaRow}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#A7DCCF" />
        <Text style={styles.headerMetaText}>
          {completedAt ? `Hồ sơ cập nhật ${completedAt}` : 'Đồng bộ từ hồ sơ tài chính'}
        </Text>
      </View>
    </View>
  );
}

function StatePanel({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  loading = false,
}: {
  icon: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.statePanel} accessibilityLiveRegion="polite">
      <View style={styles.stateIcon}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.teal} />
        ) : (
          <Ionicons name={icon} size={28} color={COLORS.teal} />
        )}
      </View>
      <Text style={styles.stateTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.stateDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable
          style={({ pressed }) => [styles.stateButton, pressed && styles.stateButtonPressed]}
          onPress={onAction}
          accessibilityRole="button"
        >
          <Text style={styles.stateButtonText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={17} color={COLORS.surface} />
        </Pressable>
      ) : null}
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  supporting,
}: {
  icon: IconName;
  label: string;
  value: string;
  supporting: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Ionicons name={icon} size={18} color={COLORS.teal} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricSupporting}>{supporting}</Text>
    </View>
  );
}

export default function MemoryScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<ScreenPhase>('loading');
  const [setup, setSetup] = useState<FinancialSetupPayload | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const openFinancialSetup = useCallback(() => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('FinancialSetup', { mode: 'edit' });
  }, [navigation]);

  const loadSetup = useCallback(async (asRefresh = false) => {
    const activeRequest = ++requestId.current;
    if (asRefresh) {
      setRefreshing(true);
    } else {
      setPhase('loading');
    }

    try {
      const response = await getFinancialSetup();
      if (activeRequest !== requestId.current) return;

      if (response.status !== 'completed' || !response.data) {
        setSetup(null);
        setCompletedAt(null);
        setPhase('empty');
        return;
      }

      setSetup(response.data);
      setCompletedAt(formatProfileDate(response.completed_at));
      setPhase('ready');
    } catch {
      if (activeRequest === requestId.current) setPhase('error');
    } finally {
      if (activeRequest === requestId.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSetup();
      return () => {
        requestId.current += 1;
      };
    }, [loadSetup])
  );

  const fixedCosts = useMemo(() => recurringTotal(setup), [setup]);
  const remainingCash = setup ? setup.monthly_income - fixedCosts : 0;
  const fixedCostRatio =
    setup && setup.monthly_income > 0 ? (fixedCosts / setup.monthly_income) * 100 : 0;
  const cashFlowSignal = setup
    ? getCashFlowSignal(setup.monthly_income, fixedCosts)
    : null;
  const signalStyle = cashFlowSignal ? SIGNAL_COLORS[cashFlowSignal.tone] : null;

  const goal = getPrimaryGoal(setup);
  const goalProgress = goal
    ? Math.min(Math.max((goal.current_amount / goal.target_amount) * 100, 0), 100)
    : 0;
  const goalRemaining = goal ? Math.max(goal.target_amount - goal.current_amount, 0) : 0;
  const sortedExpenses = useMemo(
    () =>
      [...(setup?.recurring_expenses ?? [])].sort(
        (a, b) => b.monthly_amount - a.monthly_amount
      ),
    [setup]
  );
  const visibleExpenses = sortedExpenses.slice(0, 3);
  const additionalExpenseCount = Math.max(sortedExpenses.length - visibleExpenses.length, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader completedAt={completedAt} onEdit={openFinancialSetup} />

      {phase === 'loading' ? (
        <StatePanel
          icon="sync-outline"
          title="Đang đọc hồ sơ tài chính…"
          description="PocketPilot đang tổng hợp các tín hiệu từ dữ liệu bạn đã thiết lập."
          loading
        />
      ) : null}

      {phase === 'error' ? (
        <StatePanel
          icon="cloud-offline-outline"
          title="Chưa thể tải insights"
          description="Không thể đồng bộ hồ sơ tài chính lúc này. Kiểm tra kết nối rồi thử lại."
          actionLabel="Thử lại"
          onAction={() => void loadSetup()}
        />
      ) : null}

      {phase === 'empty' ? (
        <StatePanel
          icon="document-text-outline"
          title="Chưa có hồ sơ tài chính"
          description="Hoàn tất thiết lập để PocketPilot có thể phân tích dòng tiền và mục tiêu của bạn."
          actionLabel="Cập nhật hồ sơ"
          onAction={openFinancialSetup}
        />
      ) : null}

      {phase === 'ready' && setup && goal && cashFlowSignal && signalStyle ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadSetup(true)}
              tintColor={COLORS.teal}
              colors={[COLORS.teal]}
            />
          }
        >
          <View style={styles.signalCard}>
            <View style={styles.signalTopRow}>
              <View style={styles.signalTitleGroup}>
                <Text style={styles.cardEyebrow}>CÒN LẠI SAU CHI CỐ ĐỊNH</Text>
                <Text
                  style={[styles.cashValue, remainingCash < 0 && styles.cashValueNegative]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCompactVnd(remainingCash)}
                </Text>
                <Text style={styles.cashSupporting}>mỗi tháng trước chi tiêu linh hoạt</Text>
              </View>
              <View style={[styles.ratioBadge, { backgroundColor: signalStyle.soft }]}>
                <Text style={[styles.ratioBadgeValue, { color: signalStyle.accent }]}>
                  {Math.round(fixedCostRatio)}%
                </Text>
                <Text style={styles.ratioBadgeLabel}>chi cố định</Text>
              </View>
            </View>

            <View style={[styles.signalInsight, { backgroundColor: signalStyle.soft }]}>
              <Ionicons name={signalStyle.icon} size={21} color={signalStyle.accent} />
              <View style={styles.signalInsightCopy}>
                <Text style={[styles.signalInsightTitle, { color: signalStyle.accent }]}>
                  {cashFlowSignal.title}
                </Text>
                <Text style={styles.signalInsightDescription}>
                  {cashFlowSignal.description}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.metricRow}>
            <MetricCard
              icon="wallet-outline"
              label="Thu nhập"
              value={formatCompactVnd(setup.monthly_income)}
              supporting="trung bình / tháng"
            />
            <MetricCard
              icon="receipt-outline"
              label="Chi cố định"
              value={formatCompactVnd(fixedCosts)}
              supporting={`${setup.recurring_expenses.length} khoản đã ghi nhớ`}
            />
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>MỤC TIÊU CHÍNH</Text>
              <Text style={styles.sectionTitle}>Tiến độ bạn đang hướng tới</Text>
            </View>
            <View style={styles.sectionIcon}>
              <Ionicons name="flag-outline" size={20} color={COLORS.teal} />
            </View>
          </View>

          <View style={styles.goalCard}>
            <View style={styles.goalHeaderRow}>
              <View style={styles.goalCopy}>
                <Text style={styles.goalType}>
                  {GOAL_LABELS[goal.goal_type] ?? goal.goal_type}
                </Text>
                <Text style={styles.goalName}>{goal.name}</Text>
              </View>
              <Text style={styles.goalPercent}>{Math.round(goalProgress)}%</Text>
            </View>

            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={`Tiến độ mục tiêu ${goal.name}`}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(goalProgress) }}
            >
              <View style={[styles.progressFill, { width: `${goalProgress}%` }]} />
            </View>

            <View style={styles.goalAmountsRow}>
              <View>
                <Text style={styles.detailLabel}>ĐÃ CÓ</Text>
                <Text style={styles.detailValue}>{formatVnd(goal.current_amount)}</Text>
              </View>
              <View style={styles.goalAmountRight}>
                <Text style={styles.detailLabel}>MỤC TIÊU</Text>
                <Text style={styles.detailValue}>{formatVnd(goal.target_amount)}</Text>
              </View>
            </View>

            <View style={styles.goalFooter}>
              <View style={styles.goalFooterItem}>
                <Ionicons name="navigate-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.goalFooterText}>
                  {goalRemaining > 0
                    ? `Còn ${formatCompactVnd(goalRemaining)}`
                    : 'Đã đạt số tiền mục tiêu'}
                </Text>
              </View>
              <View style={styles.goalFooterItem}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={16}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.goalFooterText}>{formatGoalDate(goal.target_date)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>BỘ NHỚ DÒNG TIỀN</Text>
              <Text style={styles.sectionTitle}>Các khoản chi cố định</Text>
            </View>
            <View style={styles.sectionIcon}>
              <Ionicons name="layers-outline" size={20} color={COLORS.teal} />
            </View>
          </View>

          <View style={styles.breakdownCard}>
            {visibleExpenses.length > 0 ? (
              visibleExpenses.map((expense, index) => {
                const share = fixedCosts > 0 ? (expense.monthly_amount / fixedCosts) * 100 : 0;
                return (
                  <View
                    key={`${expense.name}-${expense.category}-${index}`}
                    style={[
                      styles.expenseRow,
                      index < visibleExpenses.length - 1 && styles.expenseRowBorder,
                    ]}
                  >
                    <View style={styles.expenseIcon}>
                      <Ionicons
                        name={CATEGORY_ICONS[expense.category] ?? 'receipt-outline'}
                        size={19}
                        color={COLORS.teal}
                      />
                    </View>
                    <View style={styles.expenseCopy}>
                      <View style={styles.expenseTitleRow}>
                        <View style={styles.expenseNameGroup}>
                          <Text style={styles.expenseName} numberOfLines={1}>
                            {expense.name}
                          </Text>
                          <Text style={styles.expenseCategory} numberOfLines={1}>
                            {CATEGORY_LABELS[expense.category] ?? expense.category}
                          </Text>
                        </View>
                        <Text style={styles.expenseAmount}>
                          {formatCompactVnd(expense.monthly_amount)}
                        </Text>
                      </View>
                      <View style={styles.expenseBarTrack}>
                        <View
                          style={[
                            styles.expenseBarFill,
                            { width: `${Math.min(Math.max(share, 0), 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyBreakdown}>
                <Ionicons name="receipt-outline" size={24} color={COLORS.textMuted} />
                <View style={styles.emptyBreakdownCopy}>
                  <Text style={styles.emptyBreakdownTitle}>Chưa có khoản chi cố định</Text>
                  <Text style={styles.emptyBreakdownText}>
                    Hồ sơ hiện chưa ghi nhận chi phí lặp lại hằng tháng.
                  </Text>
                </View>
              </View>
            )}
            {additionalExpenseCount > 0 ? (
              <Text style={styles.moreExpensesText}>
                + {additionalExpenseCount} khoản khác đã được ghi nhớ
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>CÁCH POCKETPILOT ĐỒNG HÀNH</Text>
              <Text style={styles.sectionTitle}>Ưu tiên của bạn</Text>
            </View>
            <View style={styles.sectionIcon}>
              <Ionicons name="options-outline" size={20} color={COLORS.teal} />
            </View>
          </View>

          <View style={styles.coachingCard}>
            <View style={styles.priorityRow}>
              <View style={styles.priorityIcon}>
                <Ionicons name="compass-outline" size={22} color={COLORS.teal} />
              </View>
              <View style={styles.priorityCopy}>
                <Text style={styles.priorityEyebrow}>NHỊP TIẾT KIỆM</Text>
                <Text style={styles.priorityTitle}>{SAVINGS_LABELS[setup.savings_priority]}</Text>
                <Text style={styles.priorityDescription}>
                  {SAVINGS_DESCRIPTIONS[setup.savings_priority]}
                </Text>
              </View>
            </View>

            <View style={styles.coachingDivider} />
            <Text style={styles.focusTitle}>Nhóm muốn kiểm soát</Text>
            {setup.focus_categories.length > 0 ? (
              <View style={styles.focusChips}>
                {setup.focus_categories.map((category) => (
                  <View style={styles.focusChip} key={category}>
                    <Ionicons
                      name={CATEGORY_ICONS[category] ?? 'bookmark-outline'}
                      size={15}
                      color={COLORS.tealDark}
                    />
                    <Text style={styles.focusChipText}>
                      {CATEGORY_LABELS[category] ?? category}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.focusEmptyText}>
                Bạn chưa chọn nhóm chi tiêu cần PocketPilot chú ý riêng.
              </Text>
            )}

            {setup.financial_situation_notes?.trim() ? (
              <View style={styles.notesBox}>
                <Ionicons name="chatbox-ellipses-outline" size={18} color={COLORS.teal} />
                <View style={styles.notesCopy}>
                  <Text style={styles.notesLabel}>Điều bạn muốn PocketPilot ghi nhớ</Text>
                  <Text style={styles.notesText}>{setup.financial_situation_notes.trim()}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.sourceNote}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.sourceNoteText}>
              Insights này chỉ dựa trên hồ sơ nền tảng của bạn, không sử dụng giao dịch giả lập.
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 22,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: 'rgba(221, 245, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(221, 245, 237, 0.2)',
  },
  headerTitleGroup: { flex: 1 },
  headerEyebrow: {
    color: '#91CDBE',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  headerTitle: {
    color: COLORS.surface,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  editHeaderButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADII.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 13,
  },
  editHeaderButtonPressed: { backgroundColor: 'rgba(255,255,255,0.18)' },
  editHeaderButtonText: { color: COLORS.surface, fontSize: 12, fontWeight: '700' },
  headerSubtitle: {
    maxWidth: 360,
    color: '#C5D5DD',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 17,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  headerMetaText: { color: '#AFC5CE', fontSize: 11, fontWeight: '600' },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 112,
  },
  statePanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: 48,
  },
  stateIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: COLORS.mint,
    marginBottom: 18,
  },
  stateTitle: {
    color: COLORS.inkStrong,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateDescription: {
    maxWidth: 330,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  stateButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.teal,
    paddingHorizontal: 22,
    marginTop: 20,
  },
  stateButtonPressed: { backgroundColor: COLORS.tealDark },
  stateButtonText: { color: COLORS.surface, fontSize: 14, fontWeight: '800' },
  signalCard: {
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 18,
    ...CARD_SHADOW,
  },
  signalTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  signalTitleGroup: { flex: 1 },
  cardEyebrow: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cashValue: {
    color: COLORS.inkStrong,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 6,
  },
  cashValueNegative: { color: COLORS.error },
  cashSupporting: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  ratioBadge: {
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.medium,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  ratioBadgeValue: { fontSize: 17, fontWeight: '800' },
  ratioBadgeLabel: { color: COLORS.textSecondary, fontSize: 9, fontWeight: '700' },
  signalInsight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: RADII.medium,
    padding: 13,
    marginTop: 17,
  },
  signalInsightCopy: { flex: 1 },
  signalInsightTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3 },
  signalInsightDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 11,
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.surface,
    padding: 14,
    ...SOFT_SHADOW,
  },
  metricIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: COLORS.mintSoft,
    marginBottom: 12,
  },
  metricLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  metricValue: {
    color: COLORS.inkStrong,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  metricSupporting: {
    color: COLORS.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 27,
    marginBottom: 11,
    paddingHorizontal: 2,
  },
  sectionEyebrow: {
    color: COLORS.teal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  sectionTitle: { color: COLORS.inkStrong, fontSize: 18, fontWeight: '800' },
  sectionIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.mintSoft,
  },
  goalCard: {
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 17,
    ...SOFT_SHADOW,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  goalCopy: { flex: 1 },
  goalType: { color: COLORS.teal, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  goalName: { color: COLORS.inkStrong, fontSize: 19, fontWeight: '800', lineHeight: 24 },
  goalPercent: { color: COLORS.teal, fontSize: 22, fontWeight: '800' },
  progressTrack: {
    height: 9,
    overflow: 'hidden',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
    marginTop: 17,
  },
  progressFill: {
    height: '100%',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.teal,
  },
  goalAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  goalAmountRight: { alignItems: 'flex-end' },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  detailValue: { color: COLORS.text, fontSize: 13, fontWeight: '700', marginTop: 3 },
  goalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 13,
    marginTop: 15,
  },
  goalFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  goalFooterText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  breakdownCard: {
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    ...SOFT_SHADOW,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },
  expenseRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  expenseIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.mintSoft,
  },
  expenseCopy: { flex: 1 },
  expenseTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  expenseNameGroup: { flex: 1 },
  expenseName: { color: COLORS.inkStrong, fontSize: 13, fontWeight: '700' },
  expenseCategory: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  expenseAmount: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  expenseBarTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
    marginTop: 8,
  },
  expenseBarFill: {
    height: '100%',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.teal,
  },
  moreExpensesText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
  },
  emptyBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  emptyBreakdownCopy: { flex: 1 },
  emptyBreakdownTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  emptyBreakdownText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  coachingCard: {
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 17,
    ...SOFT_SHADOW,
  },
  priorityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  priorityIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.mint,
  },
  priorityCopy: { flex: 1 },
  priorityEyebrow: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  priorityTitle: { color: COLORS.inkStrong, fontSize: 16, fontWeight: '800', marginTop: 3 },
  priorityDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  coachingDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 16 },
  focusTitle: { color: COLORS.text, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  focusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.mintSoft,
    borderWidth: 1,
    borderColor: '#CEE8DF',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  focusChipText: { color: COLORS.tealDark, fontSize: 11, fontWeight: '700' },
  focusEmptyText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.sky,
    padding: 13,
    marginTop: 15,
  },
  notesCopy: { flex: 1 },
  notesLabel: { color: COLORS.tealDark, fontSize: 10, fontWeight: '800' },
  notesText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3 },
  sourceNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 5,
    marginTop: 17,
  },
  sourceNoteText: { flex: 1, color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
});
