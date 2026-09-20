import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { PlanStackParamList } from '@/navigation/types';
import BudgetScreen from './BudgetScreen';
import DraftPlanScreen from './DraftPlanScreen';
import BudgetEditScreen from './BudgetEditScreen';

const Stack = createNativeStackNavigator<PlanStackParamList>();

export default function PlanNavigator() {
  return <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="PlanMain" component={BudgetScreen} />
    <Stack.Screen name="DraftPlan" component={DraftPlanScreen} options={{ presentation: 'transparentModal', animation: 'fade' }} />
    <Stack.Screen name="BudgetEdit" component={BudgetEditScreen} />
  </Stack.Navigator>;
}
