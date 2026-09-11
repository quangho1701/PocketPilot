// Owner: Hoang Anh
// Feature: OCR Expense Categorization + Transaction Management & Dashboard UI
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import type { FinancialSetupPayload, RecurringExpenseInput } from '@/types/setup';
import { getPrimaryGoal } from '@/types/setup';
import {
  CATEGORY_LABELS,
  GOAL_LABELS,
  formatCompactVnd,
  formatVnd,
  recurringTotal,
} from '@/utils/finance';

type Props = BottomTabScreenProps<MainTabParamList, 'Transactions'>;
type IconName = ComponentProps<typeof Ionicons>['name'];

interface FeatureNotice {
  icon: IconName;
  title: string;
  description: string;
}

const CATEGORY_ICONS: Record<string, IconName> = {
  housing: 'home-outline',
  utilities: 'flash-outline',
  transportation: 'car-outline',
  debt_payment: 'card-outline',
  subscriptions: 'repeat-outline',
  other: 'ellipsis-horizontal',
};

const OCR_NOTICE: FeatureNotice = {
  icon: 'scan-outline',
  title: 'Quét hóa đơn đang được hoàn thiện',
  description: 'Backend OCR chưa sẵn sàng. PocketPilot chưa tải lên hoặc lưu ảnh nào.',
};

const ADD_TRANSACTION_NOTICE: FeatureNotice = {
  icon: 'receipt-outline',
  title: 'Thêm giao dịch sắp ra mắt',
  description: 'API giao dịch chưa được kết nối nên chưa có dữ liệu nào được tạo.',
};

function formatTargetDate(value: string | null): string {
  if (!value) return 'Chưa đặt thời hạn';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function QuickAction({
  icon,
  title,
  description,
  featured = false,
  onPress,
}: {
  icon: IconName;
  title: string;
  description: string;
  featured?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        featured && styles.quickActionFeatured,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
    >
      <View style={[styles.quickActionIcon, featured && styles.quickActionIconFeatured]}>
        <Ionicons
          name={icon}
          size={21}
          color={featured ? COLORS.surface : COLORS.teal}
        />
      </View>
      <Text style={[styles.quickActionTitle, featured && styles.quickActionTitleFeatured]}>
        {title}
      </Text>
      <Text style={[styles.quickActionDescription, featured && styles.quickActionDescriptionFeatured]}>
        {description}
      </Text>
    </Pressable>
  );
}

function RecurringExpenseRow({ expense }: { expense: RecurringExpenseInput }) {
  const icon = CATEGORY_ICONS[expense.category] ?? 'wallet-outline';
  return (
    <View style={styles.expenseRow}>
      <View style={styles.expenseIcon}>
        <Ionicons name={icon} size={20} color={COLORS.teal} />
      </View>
      <View style={styles.expenseCopy}>
        <Text style={styles.expenseName} numberOfLines={1}>
          {expense.name}
        </Text>
        <Text style={styles.expenseCategory}>
          {CATEGORY_LABELS[expense.category] ?? expense.category}
        </Text>
      </View>
      <Text
        style={styles.expenseAmount}
        accessibilityLabel={`${expense.name}, ${formatVnd(expense.monthly_amount)} mỗi tháng`}
      >
        {formatCompactVnd(expense.monthly_amount)}
      </Text>
    </View>
  );
}

export default function TransactionsScreen({ navigation, route }: Props) {
  const [showSetupBanner, setShowSetupBanner] = useState(
    route.params?.showSetupBanner === true
  );
  const [setup, setSetup] = useState<FinancialSetupPayload | null>(null);
  const [setupStatus, setSetupStatus] = useState<'unknown' | 'not_started' | 'completed'>(
    'unknown'
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [featureNotice, setFeatureNotice] = useState<FeatureNotice | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setLoadError(null);

      void getFinancialSetup()
        .then((response) => {
          if (!active) return;
          setSetupStatus(response.status);
          setSetup(response.status === 'completed' ? response.data : null);
        })
        .catch(() => {
          if (!active) return;
          setLoadError('Chưa thể đồng bộ hồ sơ tài chính.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [reloadKey])
  );

  const totalRecurring = useMemo(() => recurringTotal(setup), [setup]);
  const monthlyIncome = setup?.monthly_income ?? 0;
  const available = monthlyIncome - totalRecurring;
  const goal = getPrimaryGoal(setup);
  const goalProgress = goal?.target_amount
    ? Math.min(100, Math.max(0, Math.round((goal.current_amount / goal.target_amount) * 100)))
    : 0;

  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();

  const openSetup = () => {
    rootNavigation?.navigate('FinancialSetup', {
      mode: setupStatus === 'not_started' ? 'initial' : 'edit',
    });
  };

  const dismissSetupBanner = () => {
    setShowSetupBanner(false);
    navigation.setParams({ showSetupBanner: false });
  };

  const contentState = () => {
    if (loading && !setup) {
      return (
        <View style={styles.loadingCard} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={COLORS.teal} />
          <View style={styles.loadingCopy}>
            <Text style={styles.loadingTitle}>Đang đồng bộ dòng tiền…</Text>
            <Text style={styles.loadingText}>PocketPilot đang tải hồ sơ tài chính của bạn.</Text>
          </View>
        </View>
      );
    }

    if (!setup) {
      return (
        <View style={styles.emptySetupCard}>
          <View style={styles.emptySetupIcon}>
            <Ionicons name="wallet-outline" size={28} color={COLORS.teal} />
          </View>
          <Text style={styles.emptySetupTitle}>Chưa có nền tảng tài chính</Text>
          <Text style={styles.emptySetupText}>
            Hoàn tất hồ sơ để xem dòng tiền, mục tiêu và các khoản chi định kỳ tại đây.
          </Text>
          {loadError ? (
            <Text style={styles.emptySetupError}>{loadError} Hãy kiểm tra kết nối và thử lại.</Text>
          ) : null}
          <View style={styles.emptySetupActions}>
            {loadError ? (
              <Pressable
                onPress={() => setReloadKey((current) => current + 1)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Ionicons name="refresh" size={17} color={COLORS.teal} />
                <Text style={styles.secondaryButtonText}>Thử lại</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={openSetup}
              style={({ pressed }) => [styles.primarySmallButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.primarySmallButtonText}>
                {setupStatus === 'not_started' ? 'Thiết lập ngay' : 'Mở hồ sơ'}
              </Text>
              <Ionicons name="arrow-forward" size={17} color={COLORS.surface} />
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <>
        <View style={styles.heroCard}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />
          <View style={styles.heroTopRow}>
            <View style={styles.heroTopCopy}>
              <Text style={styles.heroEyebrow} numberOfLines={1}>
                CÒN LẠI SAU CHI CỐ ĐỊNH
              </Text>
              <Text style={styles.heroContext}>Dựa trên hồ sơ tháng này</Text>
            </View>
            <View style={[styles.cashflowBadge, available < 0 && styles.cashflowBadgeWarning]}>
              <Ionicons
                name={available < 0 ? 'alert-circle-outline' : 'trending-up-outline'}
                size={14}
                color={available < 0 ? COLORS.coral : COLORS.mint}
              />
              <Text
                style={[
                  styles.cashflowBadgeText,
                  available < 0 && styles.cashflowBadgeTextWarning,
                ]}
              >
                {available < 0 ? 'Cần cân đối' : 'Dòng tiền dương'}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.heroAmount, available < 0 && styles.heroAmountNegative]}
            accessibilityLabel={`Còn lại ${formatVnd(available)}`}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
          >
            {formatVnd(available)}
          </Text>
          <View style={styles.heroDivider} />
          <View style={styles.heroMetrics}>
            <View style={styles.heroMetric}>
              <View style={styles.heroMetricLabelRow}>
                <Ionicons name="arrow-down-circle-outline" size={15} color={COLORS.mint} />
                <Text style={styles.heroMetricLabel}>Thu nhập</Text>
              </View>
              <Text style={styles.heroMetricValue}>{formatCompactVnd(monthlyIncome)}</Text>
            </View>
            <View style={styles.heroMetricDivider} />
            <View style={styles.heroMetric}>
              <View style={styles.heroMetricLabelRow}>
                <Ionicons name="repeat-outline" size={15} color={COLORS.mint} />
                <Text style={styles.heroMetricLabel}>Chi định kỳ</Text>
              </View>
              <Text style={styles.heroMetricValue}>{formatCompactVnd(totalRecurring)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Tác vụ nhanh</Text>
            <Text style={styles.sectionSubtitle}>Chọn việc bạn muốn làm tiếp theo</Text>
          </View>
        </View>
        <View style={styles.quickActions}>
          <QuickAction
            icon="chatbubble-ellipses-outline"
            title="Hỏi trợ lý"
            description="Quyết định trước khi chi"
            featured
            onPress={() => navigation.navigate('Assistant')}
          />
          <QuickAction
            icon="scan-outline"
            title="Quét hóa đơn"
            description="Chưa kết nối OCR"
            onPress={() => setFeatureNotice(OCR_NOTICE)}
          />
          <QuickAction
            icon="add-outline"
            title="Thêm giao dịch"
            description="API đang hoàn thiện"
            onPress={() => setFeatureNotice(ADD_TRANSACTION_NOTICE)}
          />
        </View>

        {featureNotice ? (
          <View style={styles.featureNotice} accessibilityLiveRegion="polite">
            <View style={styles.featureNoticeIcon}>
              <Ionicons name={featureNotice.icon} size={19} color={COLORS.amber} />
            </View>
            <View style={styles.featureNoticeCopy}>
              <Text style={styles.featureNoticeTitle}>{featureNotice.title}</Text>
              <Text style={styles.featureNoticeText}>{featureNotice.description}</Text>
            </View>
            <Pressable
              onPress={() => setFeatureNotice(null)}
              style={styles.noticeCloseButton}
              accessibilityRole="button"
              accessibilityLabel="Đóng thông báo"
              hitSlop={8}
            >
              <Ionicons name="close" size={19} color={COLORS.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {goal ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Mục tiêu chính</Text>
                <Text style={styles.sectionSubtitle}>Tiến độ từ hồ sơ tài chính</Text>
              </View>
              <View style={styles.goalPercentBadge}>
                <Text style={styles.goalPercentText}>{goalProgress}%</Text>
              </View>
            </View>
            <View style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View style={styles.goalIcon}>
                  <Ionicons name="flag-outline" size={22} color={COLORS.teal} />
                </View>
                <View style={styles.goalCopy}>
                  <Text style={styles.goalName}>{goal.name}</Text>
                  <Text style={styles.goalType}>
                    {GOAL_LABELS[goal.goal_type] ?? goal.goal_type} ·{' '}
                    {formatTargetDate(goal.target_date)}
                  </Text>
                </View>
              </View>
              <View style={styles.goalProgressTrack}>
                <View style={[styles.goalProgressFill, { width: `${goalProgress}%` }]} />
              </View>
              <View style={styles.goalAmounts}>
                <View>
                  <Text style={styles.goalAmountLabel}>Đã tích lũy</Text>
                  <Text
                    style={styles.goalCurrentAmount}
                    accessibilityLabel={`Đã tích lũy ${formatVnd(goal.current_amount)}`}
                  >
                    {formatCompactVnd(goal.current_amount)}
                  </Text>
                </View>
                <View style={styles.goalTargetWrap}>
                  <Text style={styles.goalAmountLabel}>Mục tiêu</Text>
                  <Text
                    style={styles.goalTargetAmount}
                    accessibilityLabel={`Mục tiêu ${formatVnd(goal.target_amount)}`}
                  >
                    {formatCompactVnd(goal.target_amount)}
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text style={styles.sectionTitle}>Khoản chi định kỳ</Text>
            <Text style={styles.sectionSubtitle}>
              {setup.recurring_expenses.length
                ? `${setup.recurring_expenses.length} khoản đã khai báo trong hồ sơ`
                : 'Chưa có khoản chi nào được khai báo'}
            </Text>
          </View>
          <Pressable
            onPress={openSetup}
            style={({ pressed }) => [styles.editSetupButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Chỉnh sửa các khoản chi định kỳ"
          >
            <Text style={styles.editSetupText}>Chỉnh sửa</Text>
          </Pressable>
        </View>

        {setup.recurring_expenses.length ? (
          <View style={styles.expenseListCard}>
            {setup.recurring_expenses.map((expense, index) => (
              <View key={`${expense.name}-${expense.category}-${index}`}>
                <RecurringExpenseRow expense={expense} />
                {index < setup.recurring_expenses.length - 1 ? (
                  <View style={styles.expenseDivider} />
                ) : null}
              </View>
            ))}
            <View style={styles.expenseTotalRow}>
              <Text style={styles.expenseTotalLabel}>Tổng mỗi tháng</Text>
              <Text style={styles.expenseTotalValue}>{formatVnd(totalRecurring)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyExpensesCard}>
            <View style={styles.emptyExpensesTop}>
              <View style={styles.emptyExpensesIcon}>
                <Ionicons name="calendar-outline" size={24} color={COLORS.teal} />
              </View>
              <View style={styles.emptyExpensesCopy}>
                <Text style={styles.emptyExpensesTitle}>Dòng tiền chưa đủ rõ</Text>
                <Text style={styles.emptyExpensesText}>
                  Thêm tiền nhà, điện nước hoặc các khoản trả đều đặn để PocketPilot tư vấn
                  sát hơn.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={openSetup}
              style={({ pressed }) => [styles.emptyExpensesButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={COLORS.teal} />
              <Text style={styles.emptyExpensesButtonText}>Thêm khoản chi</Text>
            </Pressable>
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Ionicons name="wallet" size={22} color={COLORS.surface} />
        </View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>PocketPilot</Text>
          <Text style={styles.screenName}>Tổng quan tài chính</Text>
        </View>
        <View style={styles.monthBadge}>
          {loading && setup ? (
            <ActivityIndicator size="small" color={COLORS.teal} />
          ) : (
            <Ionicons name="calendar-clear-outline" size={15} color={COLORS.teal} />
          )}
          <Text style={styles.monthBadgeText}>Tháng {new Date().getMonth() + 1}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {showSetupBanner ? (
          <View style={styles.readyBanner} accessibilityLiveRegion="polite">
            <View style={styles.readyBannerIcon}>
              <Ionicons name="checkmark" size={19} color={COLORS.surface} />
            </View>
            <View style={styles.readyBannerCopy}>
              <Text style={styles.readyBannerTitle}>Hồ sơ tài chính đã sẵn sàng</Text>
              <Text style={styles.readyBannerText}>
                PocketPilot đã có nền tảng để cá nhân hóa các gợi ý cho bạn.
              </Text>
            </View>
            <Pressable
              style={styles.dismissButton}
              onPress={dismissSetupBanner}
              accessibilityRole="button"
              accessibilityLabel="Đóng thông báo hồ sơ đã sẵn sàng"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={COLORS.tealDark} />
            </Pressable>
          </View>
        ) : null}

        {loadError && setup ? (
          <View style={styles.syncError} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={18} color={COLORS.coral} />
            <Text style={styles.syncErrorText}>
              {loadError} Dashboard vẫn hiển thị dữ liệu lần tải gần nhất.
            </Text>
            <Pressable
              onPress={() => setReloadKey((current) => current + 1)}
              style={styles.syncRetryButton}
              accessibilityRole="button"
              accessibilityLabel="Thử đồng bộ lại"
            >
              <Ionicons name="refresh" size={18} color={COLORS.teal} />
            </Pressable>
          </View>
        ) : null}

        {contentState()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  brandMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    marginRight: 11,
  },
  brandCopy: { flex: 1 },
  brandName: { color: COLORS.inkStrong, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  screenName: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  monthBadge: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.mintSoft,
    paddingHorizontal: 11,
  },
  monthBadgeText: { color: COLORS.tealDark, fontSize: 12, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 36 },
  readyBanner: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#B8E3D5',
    borderRadius: RADII.medium,
    backgroundColor: COLORS.mintSoft,
    paddingLeft: 13,
    paddingRight: 5,
    paddingVertical: 11,
    marginBottom: 14,
  },
  readyBannerIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.teal,
    marginRight: 11,
  },
  readyBannerCopy: { flex: 1, paddingRight: 6 },
  readyBannerTitle: { color: COLORS.tealDark, fontSize: 14, fontWeight: '900', marginBottom: 3 },
  readyBannerText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  dismissButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  syncError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: RADII.small,
    backgroundColor: COLORS.coralSoft,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 8,
    marginBottom: 12,
  },
  syncErrorText: { flex: 1, color: COLORS.textSecondary, fontSize: 12, lineHeight: 17 },
  syncRetryButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  loadingCard: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 22,
    ...CARD_SHADOW,
  },
  loadingCopy: { flex: 1, marginLeft: 14 },
  loadingTitle: { color: COLORS.inkStrong, fontSize: 16, fontWeight: '800' },
  loadingText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  emptySetupCard: {
    alignItems: 'center',
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 26,
    ...CARD_SHADOW,
  },
  emptySetupIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: COLORS.mintSoft,
    marginBottom: 14,
  },
  emptySetupTitle: { color: COLORS.inkStrong, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  emptySetupText: {
    maxWidth: 330,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
  },
  emptySetupError: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
  },
  emptySetupActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.small,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: COLORS.tealDark, fontSize: 13, fontWeight: '800' },
  primarySmallButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: RADII.small,
    backgroundColor: COLORS.teal,
    paddingHorizontal: 16,
  },
  primarySmallButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '800' },
  heroCard: {
    minHeight: 256,
    overflow: 'hidden',
    borderRadius: RADII.large,
    backgroundColor: COLORS.navy,
    padding: 20,
    ...CARD_SHADOW,
  },
  heroGlowLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    top: -105,
    right: -75,
    borderRadius: 110,
    backgroundColor: 'rgba(34, 197, 166, 0.12)',
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 110,
    height: 110,
    right: 30,
    bottom: -62,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroTopCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  heroEyebrow: { color: '#A8D8CC', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  heroContext: { color: '#8FA9B8', fontSize: 11, marginTop: 4 },
  cashflowBadge: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADII.pill,
    backgroundColor: 'rgba(221, 245, 237, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  cashflowBadgeWarning: { backgroundColor: 'rgba(217, 93, 79, 0.16)' },
  cashflowBadgeText: { color: COLORS.mint, fontSize: 10, fontWeight: '800' },
  cashflowBadgeTextWarning: { color: '#FFB7AE' },
  heroAmount: {
    color: COLORS.surface,
    fontSize: 34,
    lineHeight: 43,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: 17,
  },
  heroAmountNegative: { color: '#FFB7AE' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)', marginVertical: 18 },
  heroMetrics: { flexDirection: 'row', alignItems: 'stretch' },
  heroMetric: { flex: 1 },
  heroMetricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetricLabel: { color: '#A9BDC8', fontSize: 11, fontWeight: '600' },
  heroMetricValue: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 7,
  },
  heroMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginHorizontal: 17,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 12,
  },
  sectionHeaderCopy: { flex: 1, paddingRight: 12 },
  sectionTitle: { color: COLORS.inkStrong, fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  sectionSubtitle: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  quickActions: { flexDirection: 'row', gap: 9 },
  quickAction: {
    flex: 1,
    minHeight: 128,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.surface,
    padding: 12,
    ...SOFT_SHADOW,
  },
  quickActionFeatured: { borderColor: COLORS.teal, backgroundColor: COLORS.teal },
  quickActionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.mintSoft,
    marginBottom: 11,
  },
  quickActionIconFeatured: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  quickActionTitle: { color: COLORS.inkStrong, fontSize: 13, fontWeight: '900', lineHeight: 17 },
  quickActionTitleFeatured: { color: COLORS.surface },
  quickActionDescription: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 4 },
  quickActionDescriptionFeatured: { color: '#D9F3EC' },
  featureNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#F2D9A5',
    borderRadius: RADII.medium,
    backgroundColor: COLORS.amberSoft,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 11,
    marginTop: 12,
  },
  featureNoticeIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#FFE9B8',
    marginRight: 10,
  },
  featureNoticeCopy: { flex: 1 },
  featureNoticeTitle: { color: '#8C5200', fontSize: 13, fontWeight: '900' },
  featureNoticeText: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  noticeCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  goalPercentBadge: {
    minWidth: 48,
    alignItems: 'center',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.mint,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  goalPercentText: { color: COLORS.tealDark, fontSize: 12, fontWeight: '900' },
  goalCard: {
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 17,
    ...SOFT_SHADOW,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center' },
  goalIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.mintSoft,
    marginRight: 12,
  },
  goalCopy: { flex: 1 },
  goalName: { color: COLORS.inkStrong, fontSize: 16, fontWeight: '900' },
  goalType: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  goalProgressTrack: {
    height: 9,
    overflow: 'hidden',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
    marginTop: 17,
  },
  goalProgressFill: { height: '100%', borderRadius: RADII.pill, backgroundColor: COLORS.teal },
  goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  goalAmountLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 3 },
  goalCurrentAmount: { color: COLORS.tealDark, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  goalTargetWrap: { alignItems: 'flex-end' },
  goalTargetAmount: { color: COLORS.inkStrong, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  editSetupButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  editSetupText: { color: COLORS.teal, fontSize: 12, fontWeight: '900' },
  expenseListCard: {
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 15,
    paddingTop: 5,
    overflow: 'hidden',
    ...SOFT_SHADOW,
  },
  expenseRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center' },
  expenseIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.mintSoft,
    marginRight: 11,
  },
  expenseCopy: { flex: 1, paddingRight: 10 },
  expenseName: { color: COLORS.inkStrong, fontSize: 14, fontWeight: '800' },
  expenseCategory: { color: COLORS.textSecondary, fontSize: 11, marginTop: 3 },
  expenseAmount: {
    color: COLORS.inkStrong,
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  expenseDivider: { height: 1, backgroundColor: COLORS.border, marginLeft: 51 },
  expenseTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 15,
  },
  expenseTotalLabel: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  expenseTotalValue: { color: COLORS.tealDark, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  emptyExpensesCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.large,
    backgroundColor: COLORS.surface,
    padding: 15,
  },
  emptyExpensesTop: { flexDirection: 'row', alignItems: 'center' },
  emptyExpensesIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.mintSoft,
    marginRight: 12,
  },
  emptyExpensesCopy: { flex: 1 },
  emptyExpensesTitle: { color: COLORS.inkStrong, fontSize: 14, fontWeight: '900' },
  emptyExpensesText: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  emptyExpensesButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADII.small,
    backgroundColor: COLORS.mintSoft,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 13,
  },
  emptyExpensesButtonText: { color: COLORS.tealDark, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});
