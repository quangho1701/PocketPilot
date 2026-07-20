import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MemoryScreen from '@/screens/memory/MemoryScreen';
import AssistantScreen from '@/screens/assistant/AssistantScreen';
import BudgetScreen from '@/screens/budget/BudgetScreen';
import TransactionsScreen from '@/screens/transactions/TransactionsScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Assistant"
        component={AssistantScreen}
        options={{ title: 'Assistant' }}
      />
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{ title: 'Budget' }}
      />
      <Tab.Screen
        name="Memory"
        component={MemoryScreen}
        options={{ title: 'Insights' }}
      />
    </Tab.Navigator>
  );
}
