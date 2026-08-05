import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MemoryScreen from '@/screens/memory/MemoryScreen';
import AssistantScreen from '@/screens/assistant/AssistantScreen';
import BudgetScreen from '@/screens/budget/BudgetScreen';
import TransactionsScreen from '@/screens/transactions/TransactionsScreen';
import FinancialSetupScreen from '@/screens/setup/FinancialSetupScreen';
import { getFinancialSetup } from '@/services/setup';
import { COLORS, SOFT_SHADOW } from '@/theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type BootstrapState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; setupStatus: 'not_started' | 'completed' };

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Transactions"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: COLORS.teal,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: -2,
        },
        tabBarIcon: ({ color, focused, size }) => {
          const icons: Record<keyof MainTabParamList, {
            active: keyof typeof Ionicons.glyphMap;
            inactive: keyof typeof Ionicons.glyphMap;
          }> = {
            Transactions: { active: 'grid', inactive: 'grid-outline' },
            Assistant: { active: 'sparkles', inactive: 'sparkles-outline' },
            Budget: { active: 'pie-chart', inactive: 'pie-chart-outline' },
            Memory: { active: 'analytics', inactive: 'analytics-outline' },
          };
          const icon = icons[route.name];
          return (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <Ionicons
                name={focused ? icon.active : icon.inactive}
                size={focused ? size - 1 : size}
                color={color}
              />
            </View>
          );
        },
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ title: 'Tổng quan' }}
      />
      <Tab.Screen
        name="Assistant"
        component={AssistantScreen}
        options={{ title: 'Cố vấn' }}
      />
      <Tab.Screen name="Budget" component={BudgetScreen} options={{ title: 'Kế hoạch' }} />
      <Tab.Screen name="Memory" component={MemoryScreen} options={{ title: 'Phân tích' }} />
    </Tab.Navigator>
  );
}

function BootstrapLoading() {
  return (
    <SafeAreaView style={styles.bootstrapContainer}>
      <View style={styles.brandMark}>
        <Ionicons name="navigate" size={28} color={COLORS.surface} />
      </View>
      <Text style={styles.brandName}>POCKETPILOT</Text>
      <ActivityIndicator size="small" color={COLORS.teal} style={styles.loader} />
      <Text style={styles.bootstrapTitle}>Đang chuẩn bị buồng lái tài chính</Text>
      <Text style={styles.bootstrapText}>Đồng bộ hồ sơ để cá nhân hóa tổng quan của bạn.</Text>
    </SafeAreaView>
  );
}

function BootstrapError({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.bootstrapContainer}>
      <View style={styles.errorIcon}>
        <Ionicons name="cloud-offline-outline" size={29} color={COLORS.error} />
      </View>
      <Text style={styles.bootstrapTitle} accessibilityRole="header">
        Chưa thể mở PocketPilot
      </Text>
      <Text style={styles.bootstrapText}>
        Không thể kiểm tra trạng thái hồ sơ. Hãy kiểm tra kết nối và thử lại.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Thử kiểm tra lại hồ sơ tài chính"
      >
        <Text style={styles.retryButtonText}>Thử lại</Text>
      </Pressable>
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ phase: 'loading' });

  const loadSetupStatus = useCallback(async () => {
    setBootstrap({ phase: 'loading' });
    try {
      const response = await getFinancialSetup();
      setBootstrap({ phase: 'ready', setupStatus: response.status });
    } catch {
      setBootstrap({ phase: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadSetupStatus();
  }, [loadSetupStatus]);

  if (bootstrap.phase === 'loading') return <BootstrapLoading />;
  if (bootstrap.phase === 'error') return <BootstrapError onRetry={loadSetupStatus} />;

  return (
    <Stack.Navigator
      initialRouteName={
        bootstrap.setupStatus === 'completed' ? 'MainTabs' : 'FinancialSetup'
      }
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen
        name="FinancialSetup"
        component={FinancialSetupScreen}
        initialParams={{ mode: 'initial' }}
        options={({ route }) => ({ gestureEnabled: route.params.mode === 'edit' })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: 68,
    paddingTop: 7,
    paddingBottom: 8,
    borderTopWidth: 0,
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  tabItem: { paddingVertical: 1 },
  tabIcon: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  tabIconActive: { backgroundColor: COLORS.mint },
  bootstrapContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.background,
  },
  brandMark: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: COLORS.navy,
    transform: [{ rotate: '-8deg' }],
  },
  brandName: {
    color: COLORS.navy,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.1,
    marginTop: 14,
  },
  loader: { marginTop: 32 },
  bootstrapTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 14,
  },
  bootstrapText: {
    maxWidth: 340,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 7,
  },
  errorIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: COLORS.errorSoft,
  },
  retryButton: {
    minWidth: 180,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.navy,
    marginTop: 20,
  },
  retryButtonPressed: { backgroundColor: COLORS.navySoft },
  retryButtonText: { color: COLORS.surface, fontSize: 15, fontWeight: '800' },
});
