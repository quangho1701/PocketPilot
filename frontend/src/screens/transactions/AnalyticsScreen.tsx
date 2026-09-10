import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite';
import { SpecialGothic_400Regular, SpecialGothic_700Bold } from '@expo-google-fonts/special-gothic';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api, { DEMO_USER_ID } from '@/services/api';
import { getTransactionDashboard } from '@/services/transactions';
import type { BudgetCategory, Transaction, TransactionDashboard } from '@/types';
import type { MainTabParamList } from '@/navigation/types';
import AnalyticsDashboard, { type DisplayCurrency } from './AnalyticsDashboard';

type Props = BottomTabScreenProps<MainTabParamList, 'Analytics'>;

const COLORS = {
  parchment: '#FAF2DC',
  ink: '#1E2A32',
  green: '#23392E',
  oxblood: '#6E2B32',
  muted: '#3A4750',
  rule: '#1E2A3247',
};

const FONTS = {
  display: 'InstrumentSerif_400Regular',
  body: 'SpecialGothic_400Regular',
  bodyBold: 'SpecialGothic_700Bold',
  mono: 'SpecialElite_400Regular',
};

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthRange(value: Date) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1);
  const last = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  const now = new Date();
  const isCurrentMonth = first.getFullYear() === now.getFullYear() && first.getMonth() === now.getMonth();
  return {
    dateFrom: formatDate(first),
    dateTo: formatDate(isCurrentMonth ? now : last),
  };
}

function shiftMonth(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

export default function AnalyticsScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    SpecialGothic_400Regular,
    SpecialGothic_700Bold,
    SpecialElite_400Regular,
  });
  const [dashboard, setDashboard] = useState<TransactionDashboard | null>(null);
  const [trendDashboard, setTrendDashboard] = useState<TransactionDashboard | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('USD');
  const [trendPeriod, setTrendPeriod] = useState<'week' | 'month'>('week');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async (isRefresh = false) => {
    const range = monthRange(selectedMonth);
    const historyStart = monthRange(shiftMonth(selectedMonth, -5)).dateFrom;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, categoryResponse, trendResponse] = await Promise.all([
        getTransactionDashboard({ date_from: range.dateFrom, date_to: range.dateTo, trend_period: 'week' }),
        api
          .get<BudgetCategory[]>('/api/v1/budget/categories', {
            params: { user_id: DEMO_USER_ID },
          })
          .then((response) => response.data),
        trendPeriod === 'month'
          ? getTransactionDashboard({ date_from: historyStart, date_to: range.dateTo, trend_period: 'month' })
          : Promise.resolve(null),
      ]);
      setDashboard(dashboardResponse);
      setTrendDashboard(trendResponse ?? dashboardResponse);
      setCategories(categoryResponse);
      setTransactions(dashboardResponse.recent_transactions);
    } catch {
      setError('Could not load analytics. Check the backend connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth, trendPeriod]);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      void load();
    }, [load])
  );

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}><ActivityIndicator color={COLORS.green} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !dashboard ? (
          <View style={styles.center}><ActivityIndicator color={COLORS.green} /></View>
        ) : dashboard ? (
          <>
            <AnalyticsDashboard
              dashboard={dashboard}
              trendDashboard={trendDashboard ?? dashboard}
              categories={categories}
              transactions={transactions}
              displayCurrency={displayCurrency}
              onDisplayCurrencyChange={setDisplayCurrency}
              trendPeriod={trendPeriod}
              onTrendPeriodChange={setTrendPeriod}
              selectedMonth={selectedMonth}
              onPreviousMonth={() => setSelectedMonth((value) => shiftMonth(value, -1))}
              onNextMonth={() => setSelectedMonth((value) => shiftMonth(value, 1))}
              canGoNext={shiftMonth(selectedMonth, 1) <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
            />
            <Pressable
              onPress={() => navigation.navigate('Assistant')}
              style={({ pressed }) => [styles.assistantPrompt, pressed && styles.assistantPromptPressed]}
              accessibilityRole="button"
              accessibilityLabel="Ask spending assistant"
            >
              <Ionicons name="sparkles-outline" size={20} color={COLORS.ink} />
              <Text style={styles.assistantPromptText}>Ask spending assistant...</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.parchment },
  scroll: { flex: 1 },
  content: { paddingTop: 24 },
  error: { color: COLORS.oxblood, fontFamily: FONTS.body, fontSize: 13, marginHorizontal: 20, marginBottom: 12 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  assistantPrompt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 2, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.ink, backgroundColor: COLORS.parchment },
  assistantPromptPressed: { backgroundColor: '#EFE5C6' },
  assistantPromptText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 15 },
});
