import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Transactions: { showSetupBanner?: boolean } | undefined;
  Assistant: undefined;
  Budget: undefined;
  Analytics: undefined;
  // Kept in the type map for the existing MemoryScreen implementation;
  // the main tab now exposes Analytics instead.
  Memory: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FinancialSetup: { mode: 'initial' | 'edit' };
  TransactionLedger: { mode?: 'create' | 'scan' } | undefined;
};
