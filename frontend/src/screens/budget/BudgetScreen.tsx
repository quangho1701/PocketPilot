// Owner: Ha
// Feature: Personalized Budget Planning + Goal Simulation
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import type { FinancialSetupPayload } from '@/types/setup';
import { getFinancialSetup } from '@/services/setup';
import { CARD_SHADOW, COLORS } from '@/theme';
import {
  formatCompactVnd,
  formatVnd,
  recurringTotal,
  SAVINGS_LABELS,
} from '@/utils/finance';

type Props = BottomTabScreenProps<MainTabParamList, 'Budget'>;

const SAVINGS_RATES = {
  minimal: 0.1,
  balanced: 0.2,
  aggressive: 0.3,
} as const;

const SIMULATION_AMOUNTS = [0, 500_000, 1_000_000, 2_000_000];

function clampPercent(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

export default function BudgetScreen({ navigation }: Props) {
  const [setup, setSetup] = useState<FinancialSetupPayload | null>(null);
  const [setupStatus, setSetupStatus] = useState<'not_started' | 'completed'>('completed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [extraSaving, setExtraSaving] = useState(0);
  const hasSetup = useRef(false);
  const requestId = useRef(0);

  const loadSetup = useCallback(async () => {
    const activeRequest = ++requestId.current;
    if (!hasSetup.current) setLoading(true);
    setError(false);
    try {
      const response = await getFinancialSetup();
      if (activeRequest !== requestId.current) return;
      setSetupStatus(response.status);
      setSetup(response.data);
      hasSetup.current = Boolean(response.data);
      setExtraSaving(0);
    } catch {
      if (activeRequest === requestId.current) setError(true);
    } finally {
      if (activeRequest === requestId.current) setLoading(false);
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

  const openFinancialSetup = () => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('FinancialSetup', {
        mode: setupStatus === 'not_started' ? 'initial' : 'edit',
      });
  };

  const plan = useMemo(() => {
    if (!setup) return null;
    const fixed = recurringTotal(setup);
    const afterFixed = Math.max(setup.monthly_income - fixed, 0);
    const rate = SAVINGS_RATES[setup.savings_priority];
    const baseSaving = Math.round(afterFixed * rate);
    const flexible = Math.max(afterFixed - baseSaving, 0);
    const goalRemaining = Math.max(
      setup.primary_goal.target_amount - setup.primary_goal.current_amount,
      0
    );
    const usableExtraSaving = Math.min(extraSaving, flexible);
    const simulatedMonthlySaving = baseSaving + usableExtraSaving;
    const months =
      goalRemaining === 0
        ? 0
        : simulatedMonthlySaving > 0
          ? Math.ceil(goalRemaining / simulatedMonthlySaving)
          : null;
    return {
      fixed,
      afterFixed,
      baseSaving,
      flexible,
      rate,
      goalRemaining,
      months,
      simulatedMonthlySaving,
      fixedRatio: setup.monthly_income > 0 ? fixed / setup.monthly_income : 0,
      goalProgress:
        setup.primary_goal.target_amount > 0
          ? setup.primary_goal.current_amount / setup.primary_goal.target_amount
          : 0,
    };
  }, [extraSaving, setup]);

  if (loading) {
    return (
      <SafeAreaView style={styles.stateScreen} edges={['top']}>
        <View style={styles.stateIcon}>
          <ActivityIndicator color={COLORS.teal} />
        </View>
        <Text style={styles.stateTitle}>Đang dựng kế hoạch tháng…</Text>
        <Text style={styles.stateText}>Tính toán từ hồ sơ tài chính mới nhất của bạn.</Text>
      </SafeAreaView>
    );
  }

  if (error && !setup) {
    return (
      <SafeAreaView style={styles.stateScreen} edges={['top']}>
        <View style={[styles.stateIcon, styles.errorStateIcon]}>
          <Ionicons name="cloud-offline-outline" size={27} color={COLORS.error} />
        </View>
        <Text style={styles.stateTitle}>Chưa tải được kế hoạch</Text>
        <Text style={styles.stateText}>Hồ sơ của bạn không bị thay đổi. Hãy thử kết nối lại.</Text>
        <Pressable style={styles.stateButton} onPress={() => void loadSetup()}>
          <Text style={styles.stateButtonText}>Thử lại</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!setup || !plan) {
    return (
      <SafeAreaView style={styles.stateScreen} edges={['top']}>
        <View style={styles.stateIcon}>
          <Ionicons name="pie-chart-outline" size={27} color={COLORS.teal} />
        </View>
        <Text style={styles.stateTitle}>Cần hồ sơ để lập kế hoạch</Text>
        <Text style={styles.stateText}>
          Thêm thu nhập, chi phí cố định và mục tiêu để PocketPilot tính một khung phù hợp.
        </Text>
        <Pressable style={styles.stateButton} onPress={openFinancialSetup}>
          <Text style={styles.stateButtonText}>Thiết lập ngay</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const oversubscribed = plan.fixed > setup.monthly_income;
  const goalComplete = plan.goalRemaining === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>KẾ HOẠCH CÁ NHÂN</Text>
            <Text style={styles.title}>Phân bổ tháng này</Text>
            <Text style={styles.subtitle}>
              Khung gợi ý từ thu nhập và ưu tiên hiện tại
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            onPress={openFinancialSetup}
            accessibilityRole="button"
            accessibilityLabel="Chỉnh sửa hồ sơ tài chính"
          >
            <Ionicons name="options-outline" size={21} color={COLORS.text} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.syncWarning} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={18} color={COLORS.amber} />
            <Text style={styles.syncWarningText}>
              Chưa đồng bộ được thay đổi mới nhất. Kế hoạch đang dùng dữ liệu lần trước.
            </Text>
            <Pressable
              onPress={() => void loadSetup()}
              style={styles.syncRetry}
              accessibilityRole="button"
              accessibilityLabel="Thử đồng bộ lại kế hoạch"
            >
              <Ionicons name="refresh" size={18} color={COLORS.teal} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.allocationCard}>
          <View style={styles.decorativeCircleLarge} />
          <View style={styles.decorativeCircleSmall} />
          <View style={styles.allocationTopRow}>
            <View style={styles.incomeCopy}>
              <Text style={styles.darkCardLabel}>THU NHẬP ĐỂ PHÂN BỔ</Text>
              <Text
                style={styles.incomeValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {formatVnd(setup.monthly_income)}
              </Text>
            </View>
            <View style={styles.planBadge}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.mint} />
              <Text style={styles.planBadgeText}>
                {SAVINGS_LABELS[setup.savings_priority]}
              </Text>
            </View>
          </View>

          <View style={styles.stackBar}>
            <View
              style={[
                styles.stackFixed,
                { width: `${clampPercent(plan.fixedRatio * 100)}%` },
              ]}
            />
            <View
              style={[
                styles.stackSaving,
                {
                  width: `${clampPercent(
                    setup.monthly_income > 0
                      ? (plan.baseSaving / setup.monthly_income) * 100
                      : 0
                  )}%`,
                },
              ]}
            />
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.fixedDot]} />
              <Text style={styles.legendText}>Cố định</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.savingDot]} />
              <Text style={styles.legendText}>Tiết kiệm</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.flexibleDot]} />
              <Text style={styles.legendText}>Linh hoạt</Text>
            </View>
          </View>
        </View>

        {oversubscribed ? (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={21} color={COLORS.amber} />
            <View style={styles.warningCopy}>
              <Text style={styles.warningTitle}>Chi cố định đang vượt thu nhập</Text>
              <Text style={styles.warningText}>
                Cần giảm ít nhất {formatVnd(plan.fixed - setup.monthly_income)} để kế hoạch cân bằng.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Ba ngăn tiền chính</Text>
          <Text style={styles.sectionCaption}>Gợi ý, chưa tự động trừ tiền</Text>
        </View>

        <View style={styles.bucketList}>
          <View style={styles.bucketCard}>
            <View style={[styles.bucketIcon, styles.fixedIcon]}>
              <Ionicons name="calendar-outline" size={21} color={COLORS.amber} />
            </View>
            <View style={styles.bucketCopy}>
              <View style={styles.bucketHeader}>
                <Text style={styles.bucketTitle}>Chi phí cố định</Text>
                <Text style={styles.bucketAmount}>{formatCompactVnd(plan.fixed)}</Text>
              </View>
              <Text style={styles.bucketMeta}>
                {setup.recurring_expenses.length} khoản đã cam kết ·{' '}
                {Math.round(plan.fixedRatio * 100)}% thu nhập
              </Text>
            </View>
          </View>

          <View style={styles.bucketCard}>
            <View style={[styles.bucketIcon, styles.savingIcon]}>
              <Ionicons name="trending-up-outline" size={21} color={COLORS.success} />
            </View>
            <View style={styles.bucketCopy}>
              <View style={styles.bucketHeader}>
                <Text style={styles.bucketTitle}>Để dành cho mục tiêu</Text>
                <Text style={styles.bucketAmount}>{formatCompactVnd(plan.baseSaving)}</Text>
              </View>
              <Text style={styles.bucketMeta}>
                {Math.round(plan.rate * 100)}% phần còn lại sau chi cố định
              </Text>
            </View>
          </View>

          <View style={styles.bucketCard}>
            <View style={[styles.bucketIcon, styles.flexibleIcon]}>
              <Ionicons name="card-outline" size={21} color={COLORS.teal} />
            </View>
            <View style={styles.bucketCopy}>
              <View style={styles.bucketHeader}>
                <Text style={styles.bucketTitle}>Chi tiêu linh hoạt</Text>
                <Text style={styles.bucketAmount}>{formatCompactVnd(plan.flexible)}</Text>
              </View>
              <Text style={styles.bucketMeta}>Ăn uống, mua sắm và các nhu cầu thay đổi</Text>
            </View>
          </View>
        </View>

        <View style={styles.goalCard}>
          <View style={styles.goalTopRow}>
            <View style={styles.goalIcon}>
              <Ionicons name="flag" size={20} color={COLORS.teal} />
            </View>
            <View style={styles.goalHeadingCopy}>
              <Text style={styles.goalLabel}>MỤC TIÊU ĐANG ƯU TIÊN</Text>
              <Text style={styles.goalName} numberOfLines={1}>
                {setup.primary_goal.name}
              </Text>
            </View>
            <Text style={styles.goalPercent}>
              {Math.round(clampPercent(plan.goalProgress * 100))}%
            </Text>
          </View>
          <View style={styles.goalProgressTrack}>
            <View
              style={[
                styles.goalProgressFill,
                { width: `${clampPercent(plan.goalProgress * 100)}%` },
              ]}
            />
          </View>
          <View style={styles.goalAmounts}>
            <Text style={styles.goalCurrent}>
              Đã có {formatCompactVnd(setup.primary_goal.current_amount)}
            </Text>
            <Text style={styles.goalTarget}>
              Đích {formatCompactVnd(setup.primary_goal.target_amount)}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Mô phỏng mục tiêu</Text>
          <View style={styles.labBadge}>
            <Ionicons name="flask-outline" size={13} color={COLORS.teal} />
            <Text style={styles.labBadgeText}>THỬ NGHIỆM</Text>
          </View>
        </View>
        <View style={styles.simulationCard}>
          <Text style={styles.simulationQuestion}>
            Nếu mỗi tháng bạn để dành thêm…
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.simulationOptions}
          >
            {SIMULATION_AMOUNTS.map((amount) => {
              const selected = extraSaving === amount;
              const disabled = amount > plan.flexible;
              return (
                <Pressable
                  key={amount}
                  onPress={() => setExtraSaving(amount)}
                  disabled={disabled}
                  style={[
                    styles.simulationChip,
                    selected && styles.simulationChipSelected,
                    disabled && styles.simulationChipDisabled,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  accessibilityLabel={amount === 0 ? 'Giữ kế hoạch gợi ý' : `Thêm ${formatVnd(amount)}`}
                >
                  <Text
                    style={[
                      styles.simulationChipText,
                      selected && styles.simulationChipTextSelected,
                    ]}
                  >
                    {amount === 0 ? 'Theo gợi ý' : `+${formatCompactVnd(amount)}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.simulationResult}>
            <View style={styles.simulationResultIcon}>
              <Ionicons
                name={goalComplete ? 'checkmark-circle' : 'speedometer-outline'}
                size={24}
                color={COLORS.success}
              />
            </View>
            <View style={styles.simulationResultCopy}>
              <Text style={styles.simulationResultLabel}>
                {goalComplete ? 'Mục tiêu đã hoàn thành' : 'Thời gian ước tính'}
              </Text>
              <Text style={styles.simulationResultValue}>
                {goalComplete
                  ? 'Tuyệt vời — hãy đặt một cột mốc mới.'
                  : plan.months === null
                    ? 'Cần dành một khoản hàng tháng'
                    : `Khoảng ${plan.months} tháng để chạm mục tiêu`}
              </Text>
              {!goalComplete ? (
                <Text style={styles.simulationResultMeta}>
                  Dành {formatVnd(plan.simulatedMonthlySaving)}/tháng · chưa tính lãi suất
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Đây là khung tham khảo từ hồ sơ đã lưu, không phải tư vấn đầu tư.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  eyebrow: {
    color: COLORS.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  title: { color: COLORS.text, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  subtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  syncWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1D39A',
    borderRadius: 14,
    backgroundColor: COLORS.amberSoft,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 8,
    marginBottom: 12,
  },
  syncWarningText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 10,
    lineHeight: 15,
    marginLeft: 8,
  },
  syncRetry: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  allocationCard: {
    overflow: 'hidden',
    borderRadius: 23,
    backgroundColor: COLORS.navy,
    padding: 19,
    ...CARD_SHADOW,
  },
  decorativeCircleLarge: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -70,
    top: -88,
    backgroundColor: '#17485A',
    opacity: 0.85,
  },
  decorativeCircleSmall: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    right: 22,
    bottom: -55,
    backgroundColor: COLORS.teal,
    opacity: 0.28,
  },
  allocationTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  incomeCopy: { flex: 1, minWidth: 0 },
  darkCardLabel: {
    color: '#9DB5BF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  incomeValue: {
    color: COLORS.surface,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginTop: 5,
  },
  planBadge: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  planBadgeText: { color: COLORS.mint, fontSize: 9, fontWeight: '800', marginLeft: 5 },
  stackBar: {
    height: 9,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.19)',
    marginTop: 22,
  },
  stackFixed: { height: '100%', backgroundColor: '#F3B963' },
  stackSaving: { height: '100%', backgroundColor: '#55C9A8' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 11 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  fixedDot: { backgroundColor: '#F3B963' },
  savingDot: { backgroundColor: '#55C9A8' },
  flexibleDot: { backgroundColor: 'rgba(255,255,255,0.45)' },
  legendText: { color: '#B9CBD2', fontSize: 10 },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#F1D39A',
    borderRadius: 16,
    backgroundColor: COLORS.amberSoft,
    padding: 13,
    marginTop: 12,
  },
  warningCopy: { flex: 1, marginLeft: 9 },
  warningTitle: { color: '#8A4F05', fontSize: 12, fontWeight: '800' },
  warningText: { color: '#936313', fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  sectionCaption: { color: COLORS.textMuted, fontSize: 10 },
  bucketList: { gap: 9 },
  bucketCard: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    padding: 12,
  },
  bucketIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  fixedIcon: { backgroundColor: COLORS.amberSoft },
  savingIcon: { backgroundColor: COLORS.mintSoft },
  flexibleIcon: { backgroundColor: COLORS.sky },
  bucketCopy: { flex: 1, marginLeft: 11 },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  bucketTitle: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '800' },
  bucketAmount: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  bucketMeta: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 4 },
  goalCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    padding: 15,
    marginTop: 22,
    ...CARD_SHADOW,
  },
  goalTopRow: { flexDirection: 'row', alignItems: 'center' },
  goalIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.mint,
  },
  goalHeadingCopy: { flex: 1, marginHorizontal: 10 },
  goalLabel: { color: COLORS.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  goalName: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginTop: 3 },
  goalPercent: { color: COLORS.teal, fontSize: 17, fontWeight: '900' },
  goalProgressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginTop: 15,
  },
  goalProgressFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.teal },
  goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  goalCurrent: { color: COLORS.textSecondary, fontSize: 10 },
  goalTarget: { color: COLORS.textMuted, fontSize: 10 },
  labBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.mintSoft,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  labBadgeText: { color: COLORS.teal, fontSize: 8, fontWeight: '900', marginLeft: 4 },
  simulationCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    padding: 15,
  },
  simulationQuestion: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  simulationOptions: { gap: 7, paddingVertical: 12 },
  simulationChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 12,
  },
  simulationChipSelected: { borderColor: COLORS.teal, backgroundColor: COLORS.mint },
  simulationChipDisabled: { opacity: 0.38 },
  simulationChipText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  simulationChipTextSelected: { color: COLORS.tealDark },
  simulationResult: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.mintSoft,
    padding: 12,
  },
  simulationResultIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  simulationResultCopy: { flex: 1, marginLeft: 10 },
  simulationResultLabel: { color: COLORS.textSecondary, fontSize: 9, marginBottom: 2 },
  simulationResultValue: { color: COLORS.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  simulationResultMeta: { color: COLORS.textSecondary, fontSize: 9, marginTop: 3 },
  disclaimer: {
    color: COLORS.textMuted,
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
  },
  stateScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 28,
  },
  stateIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: COLORS.mint,
    marginBottom: 16,
  },
  errorStateIcon: { backgroundColor: COLORS.errorSoft },
  stateTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  stateText: {
    maxWidth: 340,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
  },
  stateButton: {
    minWidth: 160,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    marginTop: 18,
  },
  stateButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
