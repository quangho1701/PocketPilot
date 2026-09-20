import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BudgetCategory, Transaction, TransactionDashboard } from '@/types';

export type DisplayCurrency = 'USD' | 'VND' | 'EUR' | 'GBP' | 'JPY';

const COLORS = {
  parchment: '#FAF2DC',
  parchmentDeep: '#EFE5C6',
  ink: '#1E2A32',
  green: '#23392E',
  oxblood: '#6E2B32',
  brass: '#A9843F',
  rule: '#1E2A3247',
  muted: '#3A4750',
  safe: '#18864B',
  warning: '#A98400',
  danger: '#C51F1F',
};

const FONTS = {
  display: 'InstrumentSerif_400Regular',
  body: 'SpecialGothic_400Regular',
  bodyBold: 'SpecialGothic_700Bold',
  mono: 'SpecialElite_400Regular',
};

// Units of each currency per one USD. This is intentionally a local demo table;
// transaction amounts remain stored in their original currency.
const UNITS_PER_USD: Record<string, number> = {
  USD: 1,
  VND: 25000,
  EUR: 0.92,
  GBP: 0.78,
  JPY: 145,
  KRW: 1350,
  SGD: 1.35,
  THB: 35.5,
  AUD: 1.52,
  CAD: 1.36,
  HKD: 7.8,
  CNY: 7.2,
  INR: 83,
  IDR: 15800,
  MYR: 4.7,
  PHP: 58,
};

const CURRENCY_OPTIONS: DisplayCurrency[] = ['USD', 'VND', 'EUR', 'GBP', 'JPY'];
const CATEGORY_COLORS = [COLORS.green, COLORS.brass, COLORS.oxblood, COLORS.ink, '#7F8A79', '#946D50'];
const TREND_BAR_COLORS = [COLORS.ink, COLORS.brass, COLORS.ink, COLORS.oxblood];
const MONTHLY_BAR_COLORS = [COLORS.ink, COLORS.brass, COLORS.green, COLORS.oxblood, '#7F8A79', '#946D50'];
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  dining: 'restaurant-outline',
  groceries: 'cart-outline',
  transportation: 'car-outline',
  travel: 'paper-plane-outline',
  entertainment: 'play-outline',
  shopping: 'cart-outline',
  housing: 'home-outline',
  utilities: 'flash-outline',
  healthcare: 'medkit-outline',
  subscriptions: 'repeat-outline',
  personal_care: 'sparkles-outline',
};

interface Props {
  dashboard: TransactionDashboard;
  trendDashboard: TransactionDashboard;
  categories: BudgetCategory[];
  transactions: Transaction[];
  displayCurrency: DisplayCurrency;
  onDisplayCurrencyChange: (currency: DisplayCurrency) => void;
  trendPeriod: 'week' | 'month';
  onTrendPeriodChange: (period: 'week' | 'month') => void;
  selectedMonth: Date;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  canGoNext: boolean;
}

function weekPeriodsInMonth(value: Date): string[] {
  const month = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  return [1, 2, 3, 4].map((week) => `${month}-W${week}`);
}

function monthPeriodsEndingAt(value: Date): string[] {
  return Array.from({ length: 6 }, (_, index) => {
    const month = new Date(value.getFullYear(), value.getMonth() - 5 + index, 1);
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  });
}

function convertAmount(value: number, sourceCurrency: string, targetCurrency: DisplayCurrency): number {
  const sourceRate = UNITS_PER_USD[sourceCurrency.toUpperCase()];
  const targetRate = UNITS_PER_USD[targetCurrency];
  if (!sourceRate || !targetRate) return value;
  return (value / sourceRate) * targetRate;
}

export function formatDisplayMoney(value: number, sourceCurrency: string, targetCurrency: DisplayCurrency): string {
  const converted = convertAmount(value, sourceCurrency, targetCurrency);
  const fractionDigits = targetCurrency === 'VND' || targetCurrency === 'JPY' ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: targetCurrency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(converted);
}

function categorySlug(category: { category_name: string; category_id?: string; category_slug?: string | null }): string {
  return (category.category_slug || category.category_name || category.category_id || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function DonutChart({ entries, total, currency }: { entries: Array<{ name: string; amount: number; slug: string }>; total: number; currency: DisplayCurrency }) {
  const segmentCount = 96;
  const segments = Array.from({ length: segmentCount }, (_, index) => {
    const position = (index + 0.5) / segmentCount;
    let accumulated = 0;
    const categoryIndex = entries.findIndex((entry) => {
      accumulated += total ? entry.amount / total : 0;
      return position <= accumulated;
    });
    return CATEGORY_COLORS[Math.max(0, categoryIndex) % CATEGORY_COLORS.length];
  });
  return (
    <View style={styles.donutRow}>
      <View style={styles.donutWrap}>
        {segments.map((color, index) => (
          <View key={`${index}-${color}`} style={[styles.donutSegment, { transform: [{ rotate: `${(index / segmentCount) * 360}deg` }] }]}>
            <View style={[styles.donutTick, { backgroundColor: color }]} />
          </View>
        ))}
        <View style={styles.donutCenter}>
          <Text style={styles.donutLabel}>TOTAL</Text>
          <Text style={styles.donutTotal}>{formatDisplayMoney(total, currency, currency)}</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {entries.slice(0, 5).map((entry, index) => {
          const percentage = total ? Math.round((entry.amount / total) * 100) : 0;
          return (
            <View key={entry.slug} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: CATEGORY_COLORS[index] }]} />
              <Ionicons name={CATEGORY_ICONS[entry.slug] || 'ellipse-outline'} size={16} color={COLORS.ink} />
              <Text style={styles.legendName} numberOfLines={1}>{entry.name}</Text>
              <Text style={styles.legendValue}>{formatDisplayMoney(entry.amount, currency, currency)} · {percentage}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function AnalyticsDashboard({
  dashboard,
  trendDashboard,
  categories,
  transactions,
  displayCurrency,
  onDisplayCurrencyChange,
  trendPeriod,
  onTrendPeriodChange,
  selectedMonth,
  onPreviousMonth,
  onNextMonth,
  canGoNext,
}: Props) {
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const categoryTotals = new Map<string, { name: string; slug: string; amount: number }>();
  dashboard.by_category.forEach((entry) => {
    const category = categoryMap.get(entry.category_id);
    const slug = category?.slug || categorySlug(entry);
    const current = categoryTotals.get(entry.category_id) || { name: entry.category_name, slug, amount: 0 };
    current.amount += convertAmount(Number(entry.total_amount), entry.currency, displayCurrency);
    categoryTotals.set(entry.category_id, current);
  });
  const categoryEntries = [...categoryTotals.values()].sort((a, b) => b.amount - a.amount);
  const totalExpense = categoryEntries.reduce((sum, entry) => sum + entry.amount, 0);

  const trendTotals = new Map<string, number>();
  trendDashboard.spending_trend.forEach((entry) => {
    trendTotals.set(entry.period, (trendTotals.get(entry.period) || 0) + convertAmount(Number(entry.total_expense), entry.currency, displayCurrency));
  });
  const expectedPeriods = trendPeriod === 'week'
    ? weekPeriodsInMonth(selectedMonth)
    : monthPeriodsEndingAt(selectedMonth);
  const trendEntries = expectedPeriods.map((period) => ({ period, amount: trendTotals.get(period) || 0 }));
  const average = trendEntries.length ? trendEntries.reduce((sum, item) => sum + item.amount, 0) / trendEntries.length : 0;
  const trendMax = Math.max(average, ...trendEntries.map((entry) => entry.amount), 1);

  return (
    <View>
      <View style={styles.analyticsTopRow}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        <View style={styles.monthPicker}>
          <Pressable onPress={onPreviousMonth} style={styles.monthArrow} accessibilityRole="button" accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={15} color={COLORS.ink} />
          </Pressable>
          <Text style={styles.periodLabel}>{new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(selectedMonth)}</Text>
          <Pressable onPress={onNextMonth} disabled={!canGoNext} style={[styles.monthArrow, !canGoNext && styles.monthArrowDisabled]} accessibilityRole="button" accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={15} color={COLORS.ink} />
          </Pressable>
        </View>
      </View>
      <View style={styles.currencyRow}>
        <Text style={styles.currencyCaption}>DISPLAY CURRENCY</Text>
        <View style={styles.currencyPicker}>
          {CURRENCY_OPTIONS.map((currency) => (
            <Pressable key={currency} onPress={() => onDisplayCurrencyChange(currency)} style={[styles.currencyChip, displayCurrency === currency && styles.currencyChipActive]}>
              <Text style={[styles.currencyChipText, displayCurrency === currency && styles.currencyChipTextActive]}>{currency}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.chartCard}>
        {categoryEntries.length ? <DonutChart entries={categoryEntries} total={totalExpense} currency={displayCurrency} /> : <Text style={styles.emptyInsight}>No category spending yet.</Text>}
      </View>

      <View style={styles.insightCard}>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Spending Trend</Text><View style={styles.periodToggle}>{(['week', 'month'] as const).map((value) => <Pressable key={value} onPress={() => onTrendPeriodChange(value)} style={[styles.periodChip, trendPeriod === value && styles.periodChipActive]}><Text style={[styles.periodChipText, trendPeriod === value && styles.periodChipTextActive]}>{value.toUpperCase()}</Text></Pressable>)}</View></View>
        {trendEntries.length ? <><View style={styles.trendMeta}><Text style={styles.averageLabel}>{formatDisplayMoney(average, displayCurrency, displayCurrency)} avg</Text></View><View style={styles.trendChart}><View style={[styles.averageLine, { bottom: `${Math.min(94, Math.max(7, (average / trendMax) * 100))}%` }]} />{trendEntries.map((entry, index) => <View key={entry.period} style={styles.trendColumnWrap}><View style={styles.trendBarArea}><View style={[styles.trendColumn, { height: `${Math.max(8, (entry.amount / trendMax) * 100)}%`, backgroundColor: trendPeriod === 'week' ? TREND_BAR_COLORS[index] : MONTHLY_BAR_COLORS[index % MONTHLY_BAR_COLORS.length] }]} /></View><Text style={styles.trendLabel}>{entry.period.includes('-W') ? entry.period.slice(-2) : new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(`${entry.period}-01T00:00:00`))}</Text><Text style={styles.trendValue}>{formatDisplayMoney(entry.amount, displayCurrency, displayCurrency)}</Text></View>)}</View></> : <Text style={styles.emptyInsight}>No trend data yet.</Text>}
      </View>

      <View style={styles.insightCard} accessibilityLabel="Category budgets pending integration">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Category Budgets</Text>
        </View>
      </View>

      {transactions.length ? <View style={styles.recentCard}><Text style={styles.sectionEyebrow}>RECENT TRANSACTIONS</Text>{transactions.slice(0, 5).map((item) => <View key={item.id} style={styles.recentRow}><Text style={styles.recentMerchant}>{item.merchant}</Text><Text style={[styles.recentAmount, item.transaction_type === 'income' && styles.incomeValue]}>{item.transaction_type === 'income' ? '+' : '-'}{formatDisplayMoney(Number(item.amount), item.currency, displayCurrency)}</Text></View>)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  analyticsTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 10 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.ink },
  monthArrow: { paddingHorizontal: 5, paddingVertical: 4 },
  monthArrowDisabled: { opacity: 0.3 },
  currencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 14 },
  currencyCaption: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 1 },
  currencyPicker: { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.ink },
  currencyChip: { paddingHorizontal: 7, paddingVertical: 5 },
  currencyChipActive: { backgroundColor: COLORS.ink },
  currencyChipText: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 8 },
  currencyChipTextActive: { color: COLORS.parchment },
  incomeValue: { color: '#BFE4B7' },
  chartCard: { marginHorizontal: 20, marginBottom: 12 },
  insightCard: { marginHorizontal: 20, marginBottom: 12, padding: 14, borderWidth: 1, borderColor: COLORS.rule, backgroundColor: COLORS.parchmentDeep },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 22 },
  editLink: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1 },
  sectionEyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.3 },
  periodLabel: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 9 },
  periodToggle: { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.ink },
  periodChip: { paddingHorizontal: 7, paddingVertical: 4 },
  periodChipActive: { backgroundColor: COLORS.ink },
  periodChipText: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 8 },
  periodChipTextActive: { color: COLORS.parchment },
  donutRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  donutWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  donutSegment: { position: 'absolute', width: 160, height: 160, alignItems: 'center' },
  donutTick: { width: 5.2, height: 23, marginTop: 2 },
  donutCenter: { position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.parchment, alignItems: 'center', justifyContent: 'center' },
  donutLabel: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 7, letterSpacing: 1 },
  donutTotal: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 17, marginTop: 3 },
  legend: { flex: 1, marginLeft: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0, marginVertical: 4 },
  legendSwatch: { width: 9, height: 9, marginRight: 6 },
  legendName: { flex: 1, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11, marginLeft: 5 },
  legendValue: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 8 },
  emptyInsight: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginTop: 14 },
  trendChart: { height: 188, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 15, paddingTop: 26, borderBottomWidth: 1, borderBottomColor: COLORS.rule, position: 'relative' },
  trendMeta: { alignItems: 'flex-end', minHeight: 18, marginTop: 10 },
  averageLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: COLORS.brass, zIndex: 1 },
  averageLabel: { color: COLORS.brass, fontFamily: FONTS.mono, fontSize: 8 },
  trendColumnWrap: { flex: 1, alignItems: 'center', minWidth: 0 },
  trendBarArea: { width: '100%', height: 116, justifyContent: 'flex-end', alignItems: 'center' },
  trendColumn: { width: '64%', minHeight: 8, backgroundColor: COLORS.green },
  trendLabel: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 8, marginTop: 7 },
  trendValue: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 7, marginTop: 3 },
  budgetRow: { paddingVertical: 13, borderTopWidth: 1, borderTopColor: COLORS.rule },
  budgetTop: { flexDirection: 'row', alignItems: 'center' },
  budgetIcon: { width: 36, height: 36, borderWidth: 1, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  budgetName: { flex: 1, color: COLORS.ink, fontFamily: FONTS.bodyBold, fontSize: 14 },
  budgetStatus: { fontFamily: FONTS.bodyBold, fontSize: 12 },
  budgetOf: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginLeft: 3 },
  budgetTrack: { height: 9, borderWidth: 1, borderColor: COLORS.ink, marginTop: 10 },
  budgetFill: { height: '100%' },
  emptyBudget: { borderTopWidth: 1, borderTopColor: COLORS.rule, paddingTop: 12 },
  emptyBudgetButton: { marginTop: 12, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emptyBudgetButtonText: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 0.8 },
  recentCard: { marginHorizontal: 20, marginBottom: 20, padding: 14, borderTopWidth: 1, borderTopColor: COLORS.rule },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.rule },
  recentMerchant: { color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12 },
  recentAmount: { color: COLORS.oxblood, fontFamily: FONTS.bodyBold, fontSize: 12 },
});
