import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Transactions: { showSetupBanner?: boolean } | undefined;
  Assistant: undefined;
  Budget: undefined;
  Memory: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FinancialSetup: { mode: 'initial' | 'edit' };
};
