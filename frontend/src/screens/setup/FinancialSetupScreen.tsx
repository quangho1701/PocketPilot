import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getFinancialSetup, saveFinancialSetup } from '@/services/setup';
import type { RootStackParamList } from '@/navigation/types';
import {
  CARD_SHADOW,
  COLORS as THEME_COLORS,
  RADII,
  SOFT_SHADOW,
} from '@/theme';
import type {
  FinancialSetupPayload,
  IncomeFrequency,
  PrimaryGoalInput,
  RecurringExpenseInput,
  SavingsPriority,
} from '@/types/setup';

type Props = NativeStackScreenProps<RootStackParamList, 'FinancialSetup'>;
type IconName = ComponentProps<typeof Ionicons>['name'];

type DraftAction =
  | { type: 'replace'; payload: FinancialSetupPayload }
  | { type: 'patch'; patch: Partial<FinancialSetupPayload> }
  | { type: 'patch_goal'; patch: Partial<PrimaryGoalInput> }
  | { type: 'upsert_expense'; index: number | null; expense: RecurringExpenseInput }
  | { type: 'remove_expense'; index: number };

const COLORS = {
  indigo: THEME_COLORS.teal,
  indigoDark: THEME_COLORS.tealDark,
  indigoLight: THEME_COLORS.mintSoft,
  background: THEME_COLORS.background,
  surface: THEME_COLORS.surface,
  text: THEME_COLORS.text,
  secondary: THEME_COLORS.textSecondary,
  muted: THEME_COLORS.textMuted,
  border: THEME_COLORS.border,
  borderStrong: THEME_COLORS.borderStrong,
  error: THEME_COLORS.error,
  errorBackground: THEME_COLORS.errorSoft,
  success: THEME_COLORS.success,
  successBackground: THEME_COLORS.mintSoft,
  navy: THEME_COLORS.navy,
  navySoft: THEME_COLORS.navySoft,
  mint: THEME_COLORS.mint,
  amber: THEME_COLORS.amber,
  amberSoft: THEME_COLORS.amberSoft,
};

const STEP_META: Array<{ label: string; icon: IconName }> = [
  { label: 'Thu nhập', icon: 'cash-outline' },
  { label: 'Chi phí định kỳ', icon: 'repeat-outline' },
  { label: 'Mục tiêu', icon: 'flag-outline' },
  { label: 'Phong cách hỗ trợ', icon: 'options-outline' },
  { label: 'Xác nhận', icon: 'shield-checkmark-outline' },
];

const INCOME_FREQUENCIES: Array<{
  value: IncomeFrequency;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    value: 'weekly',
    label: 'Hàng tuần',
    description: 'Nhận lương mỗi tuần',
    icon: 'calendar-outline',
  },
  {
    value: 'biweekly',
    label: 'Hai tuần/lần',
    description: 'Nhận lương mỗi 2 tuần',
    icon: 'calendar-number-outline',
  },
  {
    value: 'monthly',
    label: 'Hàng tháng',
    description: 'Nhận lương mỗi tháng',
    icon: 'calendar-clear-outline',
  },
];

const EXPENSE_CATEGORIES: Array<{
  value: string;
  label: string;
  defaultName: string;
  icon: IconName;
}> = [
  { value: 'housing', label: 'Nhà ở', defaultName: 'Tiền thuê nhà', icon: 'home-outline' },
  {
    value: 'utilities',
    label: 'Điện nước',
    defaultName: 'Tiền điện nước',
    icon: 'flash-outline',
  },
  {
    value: 'transportation',
    label: 'Đi lại',
    defaultName: 'Chi phí đi lại',
    icon: 'car-outline',
  },
  {
    value: 'debt_payment',
    label: 'Trả góp',
    defaultName: 'Khoản trả góp',
    icon: 'card-outline',
  },
  {
    value: 'subscriptions',
    label: 'Đăng ký',
    defaultName: 'Phí đăng ký định kỳ',
    icon: 'albums-outline',
  },
  {
    value: 'other',
    label: 'Khác',
    defaultName: 'Khoản chi khác',
    icon: 'ellipsis-horizontal',
  },
];

const GOAL_TYPES: Array<{ value: string; label: string; icon: IconName }> = [
  { value: 'emergency_fund', label: 'Quỹ khẩn cấp', icon: 'shield-checkmark-outline' },
  { value: 'travel', label: 'Du lịch', icon: 'airplane-outline' },
  { value: 'education', label: 'Học tập', icon: 'school-outline' },
  { value: 'debt_payoff', label: 'Trả nợ', icon: 'card-outline' },
  { value: 'major_purchase', label: 'Mua sắm lớn', icon: 'bag-handle-outline' },
  { value: 'other', label: 'Khác', icon: 'sparkles-outline' },
];

const SAVINGS_PRIORITIES: Array<{
  value: SavingsPriority;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    value: 'minimal',
    label: 'Linh hoạt',
    description: 'Ưu tiên sự thoải mái, tiết kiệm khi có thể.',
    icon: 'leaf-outline',
  },
  {
    value: 'balanced',
    label: 'Cân bằng',
    description: 'Cân đối giữa chi tiêu hiện tại và mục tiêu.',
    icon: 'git-compare-outline',
  },
  {
    value: 'aggressive',
    label: 'Ưu tiên tiết kiệm',
    description: 'Tập trung đạt mục tiêu sớm hơn.',
    icon: 'rocket-outline',
  },
];

const FOCUS_CATEGORIES: Array<{ value: string; label: string; icon: IconName }> = [
  { value: 'groceries', label: 'Ăn uống thiết yếu', icon: 'basket-outline' },
  { value: 'dining', label: 'Ăn ngoài', icon: 'restaurant-outline' },
  { value: 'shopping', label: 'Mua sắm', icon: 'bag-outline' },
  { value: 'transportation', label: 'Đi lại', icon: 'car-outline' },
  { value: 'entertainment', label: 'Giải trí', icon: 'game-controller-outline' },
  { value: 'subscriptions', label: 'Đăng ký định kỳ', icon: 'albums-outline' },
];

const DEFAULT_DRAFT: FinancialSetupPayload = {
  currency: 'VND',
  monthly_income: 0,
  income_frequency: 'monthly',
  recurring_expenses: [],
  primary_goal: {
    goal_type: '',
    name: '',
    target_amount: 0,
    current_amount: 0,
    target_date: null,
  },
  savings_priority: 'balanced',
  focus_categories: [],
  financial_situation_notes: null,
  setup_version: 1,
};

function setupReducer(
  state: FinancialSetupPayload,
  action: DraftAction
): FinancialSetupPayload {
  switch (action.type) {
    case 'replace':
      return action.payload;
    case 'patch':
      return { ...state, ...action.patch };
    case 'patch_goal':
      return {
        ...state,
        primary_goal: { ...state.primary_goal, ...action.patch },
      };
    case 'upsert_expense': {
      if (action.index === null) {
        return {
          ...state,
          recurring_expenses: [...state.recurring_expenses, action.expense],
        };
      }
      return {
        ...state,
        recurring_expenses: state.recurring_expenses.map((expense, index) =>
          index === action.index ? action.expense : expense
        ),
      };
    }
    case 'remove_expense':
      return {
        ...state,
        recurring_expenses: state.recurring_expenses.filter(
          (_, index) => index !== action.index
        ),
      };
    default:
      return state;
  }
}

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return vndFormatter.format(value);
}

function formatMoneyInput(value: number): string {
  return value > 0 ? Math.trunc(value).toLocaleString('vi-VN') : '';
}

function parseMoneyInput(value: string): number {
  const digits = value.replace(/\D/g, '').slice(0, 15);
  return digits ? Number(digits) : 0;
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizePayload(draft: FinancialSetupPayload): FinancialSetupPayload {
  const notes = draft.financial_situation_notes?.trim();
  return {
    ...draft,
    recurring_expenses: draft.recurring_expenses.map((expense) => ({
      ...expense,
      name: expense.name.trim(),
    })),
    primary_goal: {
      ...draft.primary_goal,
      name: draft.primary_goal.name.trim(),
    },
    financial_situation_notes: notes ? notes : null,
  };
}

function labelForValue(
  values: Array<{ value: string; label: string }>,
  value: string
): string {
  return values.find((item) => item.value === value)?.label ?? value;
}

interface MoneyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  helper?: string;
  error?: boolean;
}

function MoneyInput({
  label,
  value,
  onChange,
  accessibilityLabel,
  helper,
  error = false,
}: MoneyInputProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.moneyInputShell, error && styles.inputError]}>
        <View style={styles.moneyInputIcon}>
          <Ionicons name="cash-outline" size={19} color={COLORS.indigo} />
        </View>
        <TextInput
          style={styles.moneyInput}
          value={formatMoneyInput(value)}
          onChangeText={(text) => onChange(parseMoneyInput(text))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={COLORS.muted}
          accessibilityLabel={accessibilityLabel}
          returnKeyType="done"
        />
        <View style={styles.currencyBadge}>
          <Text style={styles.currencySuffix}>VND</Text>
        </View>
      </View>
      {helper ? <Text style={styles.helperText}>{helper}</Text> : null}
    </View>
  );
}

interface OptionCardProps<T extends string> {
  value: T;
  selected: boolean;
  label: string;
  description?: string;
  icon: IconName;
  onSelect: (value: T) => void;
  compact?: boolean;
}

function OptionCard<T extends string>({
  value,
  selected,
  label,
  description,
  icon,
  onSelect,
  compact = false,
}: OptionCardProps<T>) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.optionCard,
        compact && styles.optionCardCompact,
        selected && styles.optionCardSelected,
        pressed && styles.pressed,
      ]}
      onPress={() => onSelect(value)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
    >
      <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
        <Ionicons
          name={icon}
          size={20}
          color={selected ? COLORS.surface : COLORS.indigo}
        />
      </View>
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
          {label}
        </Text>
        {description ? <Text style={styles.optionDescription}>{description}</Text> : null}
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <Ionicons name="checkmark" size={14} color={COLORS.surface} /> : null}
      </View>
    </Pressable>
  );
}

function StepHeading({ eyebrow, title, description, icon }: {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
}) {
  return (
    <View style={styles.headingWrap}>
      <View style={styles.headingMeta}>
        <View style={styles.headingIcon}>
          <Ionicons name={icon} size={21} color={COLORS.indigo} />
        </View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.stepDescription}>{description}</Text>
    </View>
  );
}

function ProgressHeader({
  step,
  onBack,
  backDisabled,
}: {
  step: number;
  onBack: () => void;
  backDisabled: boolean;
}) {
  const currentStep = STEP_META[step];
  return (
    <View style={styles.progressHeader}>
      <View style={styles.progressTopRow}>
        <Pressable
          onPress={onBack}
          disabled={backDisabled}
          style={({ pressed }) => [
            styles.backButton,
            backDisabled && styles.backButtonDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Quay lại bước trước"
          accessibilityState={{ disabled: backDisabled }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={23} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerBrand}>
          <View style={styles.headerBrandMark}>
            <Ionicons name="wallet" size={17} color={COLORS.surface} />
          </View>
          <Text style={styles.headerBrandText}>PocketPilot</Text>
        </View>
        <View style={styles.stepCounter}>
          <Text style={styles.stepCounterText}>{step + 1}/5</Text>
        </View>
      </View>
      <View style={styles.progressInfoRow}>
        <View style={styles.progressNameRow}>
          <Ionicons name={currentStep.icon} size={15} color={COLORS.indigo} />
          <Text style={styles.progressName}>{currentStep.label}</Text>
        </View>
        <Text style={styles.progressLabel}>Bước {step + 1} trong 5</Text>
      </View>
      <View
        style={styles.progressSegments}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: 5, now: step + 1 }}
      >
        {STEP_META.map((item, index) => (
          <View
            key={item.label}
            style={[styles.progressSegment, index <= step && styles.progressSegmentActive]}
          />
        ))}
      </View>
    </View>
  );
}

function IncomeStep({
  draft,
  dispatch,
  clearError,
}: {
  draft: FinancialSetupPayload;
  dispatch: React.Dispatch<DraftAction>;
  clearError: () => void;
}) {
  return (
    <View testID="financial-setup-step-1">
      <StepHeading
        eyebrow="Bắt đầu với thu nhập"
        title="Thu nhập thực nhận trung bình mỗi tháng của bạn là bao nhiêu?"
        description="PocketPilot dùng con số này để tính mức chi tiêu và tiết kiệm phù hợp."
        icon="cash-outline"
      />
      <MoneyInput
        label="Thu nhập hàng tháng"
        value={draft.monthly_income}
        accessibilityLabel="Thu nhập thực nhận trung bình mỗi tháng, đơn vị đồng"
        helper="Nhập số tiền sau thuế và các khoản khấu trừ."
        onChange={(monthlyIncome) => {
          clearError();
          dispatch({ type: 'patch', patch: { monthly_income: monthlyIncome } });
        }}
      />
      <Text style={styles.fieldLabel}>Bạn thường nhận lương khi nào?</Text>
      <View accessibilityRole="radiogroup" style={styles.optionList}>
        {INCOME_FREQUENCIES.map((frequency) => (
          <OptionCard
            key={frequency.value}
            {...frequency}
            selected={draft.income_frequency === frequency.value}
            onSelect={(value) => {
              clearError();
              dispatch({ type: 'patch', patch: { income_frequency: value } });
            }}
          />
        ))}
      </View>
      <View style={styles.privacyNote}>
        <View style={styles.privacyIcon}>
          <Ionicons name="shield-checkmark-outline" size={21} color={COLORS.indigo} />
        </View>
        <View style={styles.privacyCopy}>
          <Text style={styles.privacyTitle}>Chỉ dùng cho hồ sơ tài chính</Text>
          <Text style={styles.privacyText}>
            PocketPilot dùng thông tin này để cá nhân hóa kế hoạch; bạn không cần nhập số
            tài khoản hay thông tin đăng nhập ngân hàng.
          </Text>
        </View>
      </View>
    </View>
  );
}

interface ExpenseEditorState {
  name: string;
  category: string;
  monthly_amount: number;
  nameSource: 'empty' | 'suggested' | 'custom';
}

const EMPTY_EXPENSE: ExpenseEditorState = {
  name: '',
  category: '',
  monthly_amount: 0,
  nameSource: 'empty',
};

function ExpensesStep({
  expenses,
  dispatch,
  editor,
  setEditor,
  editingIndex,
  setEditingIndex,
  editorError,
  setEditorError,
  clearWizardError,
}: {
  expenses: RecurringExpenseInput[];
  dispatch: React.Dispatch<DraftAction>;
  editor: ExpenseEditorState;
  setEditor: React.Dispatch<React.SetStateAction<ExpenseEditorState>>;
  editingIndex: number | null;
  setEditingIndex: React.Dispatch<React.SetStateAction<number | null>>;
  editorError: string | null;
  setEditorError: React.Dispatch<React.SetStateAction<string | null>>;
  clearWizardError: () => void;
}) {
  const fixedExpenseTotal = useMemo(
    () => expenses.reduce((total, expense) => total + expense.monthly_amount, 0),
    [expenses]
  );
  const editorDirty =
    editingIndex !== null ||
    editor.name.trim().length > 0 ||
    editor.monthly_amount > 0 ||
    editor.category !== EMPTY_EXPENSE.category;

  const resetEditor = () => {
    setEditor(EMPTY_EXPENSE);
    setEditingIndex(null);
    setEditorError(null);
    clearWizardError();
  };

  const saveExpense = () => {
    const name = editor.name.trim();
    if (!editor.category) {
      setEditorError('Hãy chọn nhóm chi phí.');
      return;
    }
    if (!name) {
      setEditorError('Hãy nhập tên khoản chi.');
      return;
    }
    if (!Number.isInteger(editor.monthly_amount) || editor.monthly_amount <= 0) {
      setEditorError('Số tiền hàng tháng phải lớn hơn 0.');
      return;
    }
    dispatch({
      type: 'upsert_expense',
      index: editingIndex,
      expense: {
        name,
        category: editor.category,
        monthly_amount: editor.monthly_amount,
      },
    });
    clearWizardError();
    resetEditor();
  };

  const beginEdit = (expense: RecurringExpenseInput, index: number) => {
    const usesSuggestedName = EXPENSE_CATEGORIES.some(
      (category) => category.defaultName === expense.name.trim()
    );
    setEditor({
      ...expense,
      nameSource: usesSuggestedName ? 'suggested' : 'custom',
    });
    setEditingIndex(index);
    setEditorError(null);
    clearWizardError();
  };

  return (
    <View testID="financial-setup-step-2">
      <StepHeading
        eyebrow="Chi phí cố định"
        title="Mỗi tháng bạn có những khoản chi nào phải trả đều đặn?"
        description="Thêm các khoản ước tính như tiền nhà, điện nước hoặc trả góp. Bạn có thể bỏ qua bước này."
        icon="repeat-outline"
      />

      {expenses.length > 0 ? (
        <View style={styles.savedList}>
          <View style={styles.expenseSummaryCard}>
            <View style={styles.expenseSummaryIcon}>
              <Ionicons name="pie-chart-outline" size={22} color={COLORS.surface} />
            </View>
            <View style={styles.expenseSummaryCopy}>
              <Text style={styles.expenseSummaryLabel}>Tổng chi cố định mỗi tháng</Text>
              <Text style={styles.expenseSummaryValue}>{formatCurrency(fixedExpenseTotal)}</Text>
            </View>
            <View style={styles.expenseCountBadge}>
              <Text style={styles.expenseCountText}>{expenses.length} khoản</Text>
            </View>
          </View>
          <Text style={styles.sectionLabel}>Các khoản đã thêm</Text>
          {expenses.map((expense, index) => {
            const category = EXPENSE_CATEGORIES.find(
              (item) => item.value === expense.category
            );
            return (
              <View key={`${expense.name}-${index}`} style={styles.expenseCard}>
                <View style={styles.expenseCardIcon}>
                  <Ionicons
                    name={category?.icon ?? 'wallet-outline'}
                    size={20}
                    color={COLORS.indigo}
                  />
                </View>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseName}>{expense.name}</Text>
                  <Text style={styles.expenseMeta}>
                    {labelForValue(EXPENSE_CATEGORIES, expense.category)} ·{' '}
                    {formatCurrency(expense.monthly_amount)}/tháng
                  </Text>
                </View>
                <View style={styles.expenseActions}>
                  <Pressable
                    onPress={() => beginEdit(expense, index)}
                    style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sửa khoản chi ${expense.name}`}
                  >
                    <Ionicons name="pencil-outline" size={18} color={COLORS.indigo} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      dispatch({ type: 'remove_expense', index });
                      resetEditor();
                    }}
                    style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa khoản chi ${expense.name}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.editorCard}>
        <View style={styles.editorTitleRow}>
          <View style={styles.editorTitleIcon}>
            <Ionicons
              name={editingIndex === null ? 'add-circle-outline' : 'create-outline'}
              size={21}
              color={COLORS.indigo}
            />
          </View>
          <View style={styles.editorTitleCopy}>
            <Text style={styles.editorTitle}>
              {editingIndex === null ? 'Thêm khoản chi' : 'Sửa khoản chi'}
            </Text>
            <Text style={styles.editorSubtitle}>Chọn nhóm để PocketPilot gợi ý tên tự động.</Text>
          </View>
        </View>
        <Text style={styles.fieldLabel}>Nhóm chi phí</Text>
        <View style={styles.chipGrid} accessibilityRole="radiogroup">
          {EXPENSE_CATEGORIES.map((category) => {
            const selected = editor.category === category.value;
            return (
              <Pressable
                key={category.value}
                onPress={() => {
                  setEditor((current) => {
                    const shouldSuggestName =
                      current.nameSource !== 'custom' || current.name.trim().length === 0;
                    return {
                      ...current,
                      category: category.value,
                      name: shouldSuggestName ? category.defaultName : current.name,
                      nameSource: shouldSuggestName ? 'suggested' : 'custom',
                    };
                  });
                  setEditorError(null);
                  clearWizardError();
                }}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={category.label}
              >
                <Ionicons
                  name={category.icon}
                  size={16}
                  color={selected ? COLORS.indigoDark : COLORS.secondary}
                />
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Tên khoản chi</Text>
          <TextInput
            style={styles.textInput}
            value={editor.name}
            onChangeText={(name) => {
              setEditor((current) => ({
                ...current,
                name,
                nameSource: name.trim().length > 0 ? 'custom' : 'empty',
              }));
              setEditorError(null);
              clearWizardError();
            }}
            placeholder="Ví dụ: Tiền thuê nhà"
            placeholderTextColor={COLORS.muted}
            accessibilityLabel="Tên khoản chi cố định"
            maxLength={80}
            returnKeyType="next"
          />
          {editor.nameSource === 'suggested' ? (
            <View style={styles.suggestionNote}>
              <Ionicons name="sparkles-outline" size={14} color={COLORS.indigo} />
              <Text style={styles.suggestionNoteText}>Tên được gợi ý theo nhóm, bạn vẫn có thể sửa.</Text>
            </View>
          ) : null}
        </View>
        <MoneyInput
          label="Ước tính mỗi tháng"
          value={editor.monthly_amount}
          onChange={(monthlyAmount) => {
            setEditor((current) => ({ ...current, monthly_amount: monthlyAmount }));
            setEditorError(null);
            clearWizardError();
          }}
          accessibilityLabel="Số tiền khoản chi cố định mỗi tháng, đơn vị đồng"
        />
        {editorError ? (
          <Text style={styles.inlineError} accessibilityLiveRegion="polite">
            {editorError}
          </Text>
        ) : null}
        <View style={styles.editorActions}>
          {editorDirty ? (
            <Pressable
              style={styles.secondarySmallButton}
              onPress={resetEditor}
              accessibilityRole="button"
              accessibilityLabel={
                editingIndex !== null ? 'Hủy sửa khoản chi' : 'Xóa khoản chi đang nhập'
              }
            >
              <Ionicons name="close" size={17} color={COLORS.secondary} />
              <Text style={styles.secondarySmallButtonText}>
                {editingIndex !== null ? 'Hủy' : 'Xóa nhập'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.addButton}
            onPress={saveExpense}
            accessibilityRole="button"
            accessibilityLabel={editingIndex === null ? 'Thêm khoản chi' : 'Lưu khoản chi'}
          >
            <Ionicons
              name={editingIndex === null ? 'add' : 'checkmark'}
              size={18}
              color={COLORS.surface}
            />
            <Text style={styles.addButtonText}>
              {editingIndex === null ? 'Thêm khoản chi' : 'Lưu thay đổi'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function GoalStep({
  goal,
  dispatch,
  clearError,
}: {
  goal: PrimaryGoalInput;
  dispatch: React.Dispatch<DraftAction>;
  clearError: () => void;
}) {
  return (
    <View testID="financial-setup-step-3">
      <StepHeading
        eyebrow="Mục tiêu chính"
        title="Điều gì quan trọng nhất với bạn lúc này?"
        description="Chọn một mục tiêu để PocketPilot ưu tiên trong kế hoạch đầu tiên."
        icon="flag-outline"
      />
      <Text style={styles.fieldLabel}>Loại mục tiêu</Text>
      <View style={styles.goalGrid} accessibilityRole="radiogroup">
        {GOAL_TYPES.map((goalType) => {
          const selected = goal.goal_type === goalType.value;
          return (
            <Pressable
              key={goalType.value}
              onPress={() => {
                clearError();
                dispatch({ type: 'patch_goal', patch: { goal_type: goalType.value } });
              }}
              style={[styles.goalTypeCard, selected && styles.goalTypeCardSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={goalType.label}
            >
              <View
                style={[
                  styles.goalTypeIcon,
                  selected && styles.goalTypeIconSelected,
                ]}
              >
                <Ionicons
                  name={goalType.icon}
                  size={21}
                  color={selected ? COLORS.surface : COLORS.indigo}
                />
              </View>
              <Text
                style={[styles.goalTypeText, selected && styles.goalTypeTextSelected]}
              >
                {goalType.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Tên mục tiêu</Text>
        <TextInput
          style={styles.textInput}
          value={goal.name}
          onChangeText={(name) => {
            clearError();
            dispatch({ type: 'patch_goal', patch: { name } });
          }}
          placeholder="Ví dụ: Quỹ dự phòng 6 tháng"
          placeholderTextColor={COLORS.muted}
          accessibilityLabel="Tên mục tiêu tài chính"
          maxLength={100}
          returnKeyType="next"
        />
      </View>
      <MoneyInput
        label="Số tiền mục tiêu"
        value={goal.target_amount}
        onChange={(targetAmount) => {
          clearError();
          dispatch({ type: 'patch_goal', patch: { target_amount: targetAmount } });
        }}
        accessibilityLabel="Số tiền mục tiêu, đơn vị đồng"
      />
      <MoneyInput
        label="Bạn đã có bao nhiêu?"
        value={goal.current_amount}
        onChange={(currentAmount) => {
          clearError();
          dispatch({ type: 'patch_goal', patch: { current_amount: currentAmount } });
        }}
        accessibilityLabel="Số tiền hiện đã có cho mục tiêu, đơn vị đồng"
        helper="Để trống nếu bạn chưa bắt đầu."
      />
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Ngày dự kiến hoàn thành (không bắt buộc)</Text>
        <TextInput
          style={styles.textInput}
          value={goal.target_date ?? ''}
          onChangeText={(targetDate) => {
            clearError();
            dispatch({
              type: 'patch_goal',
              patch: { target_date: targetDate.trim() ? targetDate : null },
            });
          }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={COLORS.muted}
          accessibilityLabel="Ngày dự kiến hoàn thành theo định dạng năm tháng ngày"
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          maxLength={10}
        />
        <Pressable
          style={styles.unspecifiedButton}
          onPress={() => {
            clearError();
            dispatch({ type: 'patch_goal', patch: { target_date: null } });
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: goal.target_date === null }}
          accessibilityLabel="Chưa xác định ngày hoàn thành"
        >
          <Ionicons
            name={goal.target_date === null ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={COLORS.indigo}
          />
          <Text style={styles.unspecifiedText}>Chưa xác định</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PreferencesStep({
  draft,
  dispatch,
}: {
  draft: FinancialSetupPayload;
  dispatch: React.Dispatch<DraftAction>;
}) {
  const toggleCategory = (category: string) => {
    const selected = draft.focus_categories.includes(category);
    dispatch({
      type: 'patch',
      patch: {
        focus_categories: selected
          ? draft.focus_categories.filter((value) => value !== category)
          : [...draft.focus_categories, category],
      },
    });
  };

  return (
    <View testID="financial-setup-step-4">
      <StepHeading
        eyebrow="Cách PocketPilot hỗ trợ"
        title="Bạn muốn kế hoạch nghiêng về hướng nào?"
        description="Không có lựa chọn đúng hay sai. Bạn có thể thay đổi sau trong Phân tích."
        icon="options-outline"
      />
      <Text style={styles.fieldLabel}>Mức ưu tiên tiết kiệm</Text>
      <View accessibilityRole="radiogroup" style={styles.optionList}>
        {SAVINGS_PRIORITIES.map((priority) => (
          <OptionCard
            key={priority.value}
            {...priority}
            selected={draft.savings_priority === priority.value}
            onSelect={(value) =>
              dispatch({ type: 'patch', patch: { savings_priority: value } })
            }
          />
        ))}
      </View>

      <Text style={[styles.fieldLabel, styles.sectionSpacing]}>
        Nhóm chi bạn muốn kiểm soát (không bắt buộc)
      </Text>
      <View style={styles.chipGrid}>
        {FOCUS_CATEGORIES.map((category) => {
          const selected = draft.focus_categories.includes(category.value);
          return (
            <Pressable
              key={category.value}
              onPress={() => toggleCategory(category.value)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={category.label}
            >
              <Ionicons
                name={selected ? 'checkmark-circle' : category.icon}
                size={16}
                color={selected ? COLORS.indigoDark : COLORS.secondary}
              />
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {category.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.fieldGroup, styles.sectionSpacing]}>
        <Text style={styles.fieldLabel}>Điều PocketPilot nên biết thêm?</Text>
        <TextInput
          style={[styles.textInput, styles.notesInput]}
          value={draft.financial_situation_notes ?? ''}
          onChangeText={(notes) =>
            dispatch({
              type: 'patch',
              patch: { financial_situation_notes: notes || null },
            })
          }
          placeholder="Ví dụ: Thu nhập của tôi thay đổi theo mùa…"
          placeholderTextColor={COLORS.muted}
          accessibilityLabel="Ghi chú thêm về tình hình tài chính"
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.characterCount}>
          {draft.financial_situation_notes?.length ?? 0}/500
        </Text>
      </View>
    </View>
  );
}

function ReviewSection({
  title,
  icon,
  onEdit,
  children,
  editStep,
}: {
  title: string;
  icon: IconName;
  onEdit: () => void;
  children: React.ReactNode;
  editStep: number;
}) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewCardHeader}>
        <View style={styles.reviewTitleRow}>
          <View style={styles.reviewTitleIcon}>
            <Ionicons name={icon} size={18} color={COLORS.indigo} />
          </View>
          <Text style={styles.reviewTitle}>{title}</Text>
        </View>
        <Pressable
          onPress={onEdit}
          style={styles.editButton}
          accessibilityRole="button"
          accessibilityLabel={`Chỉnh sửa ${title}, quay lại bước ${editStep}`}
        >
          <Ionicons name="pencil-outline" size={15} color={COLORS.indigo} />
          <Text style={styles.editButtonText}>Chỉnh sửa</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ReviewRow({ label, value, emphasize = false }: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, emphasize && styles.reviewValueEmphasized]}>
        {value}
      </Text>
    </View>
  );
}

function ReviewStep({
  draft,
  onEdit,
}: {
  draft: FinancialSetupPayload;
  onEdit: (step: number) => void;
}) {
  const recurringTotal = useMemo(
    () =>
      draft.recurring_expenses.reduce(
        (sum, expense) => sum + expense.monthly_amount,
        0
      ),
    [draft.recurring_expenses]
  );
  const remaining = draft.monthly_income - recurringTotal;
  const focusLabels = draft.focus_categories.map((category) =>
    labelForValue(FOCUS_CATEGORIES, category)
  );

  return (
    <View testID="financial-setup-step-5">
      <StepHeading
        eyebrow="Sẵn sàng tạo kế hoạch"
        title="Kiểm tra lại hồ sơ tài chính của bạn"
        description="PocketPilot sẽ dùng thông tin này làm nền tảng cho ghi nhớ tài chính và các gợi ý sau này."
        icon="shield-checkmark-outline"
      />
      <View style={styles.reviewSnapshot}>
        <View style={styles.reviewSnapshotGlow} />
        <Text style={styles.reviewSnapshotEyebrow}>BỨC TRANH DÒNG TIỀN</Text>
        <Text style={styles.reviewSnapshotAmount}>{formatCurrency(remaining)}</Text>
        <Text style={styles.reviewSnapshotCaption}>Còn lại trước các khoản chi linh hoạt</Text>
        <View style={styles.reviewSnapshotMetrics}>
          <View style={styles.reviewSnapshotMetric}>
            <Text style={styles.reviewSnapshotMetricLabel}>Thu nhập</Text>
            <Text style={styles.reviewSnapshotMetricValue}>
              {formatCurrency(draft.monthly_income)}
            </Text>
          </View>
          <View style={styles.reviewSnapshotDivider} />
          <View style={styles.reviewSnapshotMetric}>
            <Text style={styles.reviewSnapshotMetricLabel}>Chi cố định</Text>
            <Text style={styles.reviewSnapshotMetricValue}>{formatCurrency(recurringTotal)}</Text>
          </View>
        </View>
      </View>
      <ReviewSection
        title="Thu nhập"
        icon="cash-outline"
        editStep={1}
        onEdit={() => onEdit(0)}
      >
        <ReviewRow label="Thu nhập/tháng" value={formatCurrency(draft.monthly_income)} />
        <ReviewRow
          label="Lịch nhận lương"
          value={labelForValue(INCOME_FREQUENCIES, draft.income_frequency)}
        />
      </ReviewSection>

      <ReviewSection
        title="Chi phí cố định"
        icon="repeat-outline"
        editStep={2}
        onEdit={() => onEdit(1)}
      >
        {draft.recurring_expenses.length ? (
          draft.recurring_expenses.map((expense, index) => (
            <ReviewRow
              key={`${expense.name}-${index}`}
              label={expense.name}
              value={formatCurrency(expense.monthly_amount)}
            />
          ))
        ) : (
          <Text style={styles.emptyReview}>Chưa thêm khoản chi cố định.</Text>
        )}
        <View style={styles.reviewDivider} />
        <ReviewRow label="Tổng chi cố định" value={formatCurrency(recurringTotal)} />
        <ReviewRow
          label="Còn lại trước chi linh hoạt"
          value={formatCurrency(remaining)}
          emphasize
        />
      </ReviewSection>

      <ReviewSection
        title="Mục tiêu chính"
        icon="flag-outline"
        editStep={3}
        onEdit={() => onEdit(2)}
      >
        <ReviewRow
          label="Loại mục tiêu"
          value={labelForValue(GOAL_TYPES, draft.primary_goal.goal_type)}
        />
        <ReviewRow label="Tên" value={draft.primary_goal.name} />
        <ReviewRow
          label="Mục tiêu"
          value={formatCurrency(draft.primary_goal.target_amount)}
        />
        <ReviewRow
          label="Đã có"
          value={formatCurrency(draft.primary_goal.current_amount)}
        />
        <ReviewRow
          label="Ngày dự kiến"
          value={draft.primary_goal.target_date ?? 'Chưa xác định'}
        />
      </ReviewSection>

      <ReviewSection
        title="Cách hỗ trợ"
        icon="options-outline"
        editStep={4}
        onEdit={() => onEdit(3)}
      >
        <ReviewRow
          label="Ưu tiên"
          value={labelForValue(SAVINGS_PRIORITIES, draft.savings_priority)}
        />
        <ReviewRow
          label="Nhóm cần kiểm soát"
          value={focusLabels.length ? focusLabels.join(', ') : 'Chưa chọn'}
        />
        {draft.financial_situation_notes ? (
          <View style={styles.reviewNotes}>
            <Text style={styles.reviewLabel}>Ghi chú</Text>
            <Text style={styles.reviewNotesText}>{draft.financial_situation_notes}</Text>
          </View>
        ) : null}
      </ReviewSection>
    </View>
  );
}

function LoadingState() {
  return (
    <SafeAreaView style={styles.stateContainer}>
      <View style={styles.stateBrandMark}>
        <Ionicons name="wallet" size={29} color={COLORS.surface} />
      </View>
      <Text style={styles.stateTitle}>Đang tải hồ sơ tài chính…</Text>
      <Text style={styles.stateDescription}>PocketPilot đang đồng bộ dữ liệu đã lưu của bạn.</Text>
      <ActivityIndicator size="small" color={COLORS.indigo} />
    </SafeAreaView>
  );
}

function LoadErrorState({ onRetry, onCancel }: { onRetry: () => void; onCancel: () => void }) {
  return (
    <SafeAreaView style={styles.stateContainer}>
      <View style={[styles.stateBrandMark, styles.stateErrorIcon]}>
        <Ionicons name="cloud-offline-outline" size={28} color={COLORS.error} />
      </View>
      <Text style={styles.stateTitle}>Chưa thể tải hồ sơ</Text>
      <Text style={styles.stateDescription}>
        Hãy kiểm tra kết nối và thử lại. Dữ liệu hiện tại của bạn chưa bị thay đổi.
      </Text>
      <Pressable
        style={styles.primaryStateButton}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Thử tải lại hồ sơ tài chính"
      >
        <Ionicons name="refresh" size={18} color={COLORS.surface} />
        <Text style={styles.primaryButtonText}>Thử lại</Text>
      </Pressable>
      <Pressable
        style={styles.cancelStateButton}
        onPress={onCancel}
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={17} color={COLORS.secondary} />
        <Text style={styles.cancelStateButtonText}>Quay lại</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function SuccessState({ isEdit }: { isEdit: boolean }) {
  return (
    <SafeAreaView style={styles.successContainer} accessibilityLiveRegion="polite">
      <View style={styles.successIcon}>
        <Ionicons name="checkmark" size={42} color={COLORS.surface} />
      </View>
      <View style={styles.successBrandRow}>
        <Ionicons name="sparkles" size={16} color={COLORS.indigo} />
        <Text style={styles.successBrandText}>POCKETPILOT</Text>
      </View>
      <Text style={styles.successTitle} accessibilityRole="header">
        {isEdit ? 'Đã cập nhật hồ sơ!' : 'Kế hoạch của bạn đã sẵn sàng!'}
      </Text>
      <Text style={styles.successDescription}>
        {isEdit
          ? 'PocketPilot đã cập nhật nền tảng tài chính của bạn. Đang quay lại màn trước…'
          : 'PocketPilot đã ghi nhớ nền tảng tài chính của bạn. Đang mở Tổng quan…'}
      </Text>
    </SafeAreaView>
  );
}

export default function FinancialSetupScreen({ navigation, route }: Props) {
  const isEdit = route.params.mode === 'edit';
  const [draft, dispatch] = useReducer(setupReducer, DEFAULT_DRAFT);
  const [step, setStep] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [expenseEditor, setExpenseEditor] = useState<ExpenseEditorState>(EMPTY_EXPENSE);
  const [expenseEditingIndex, setExpenseEditingIndex] = useState<number | null>(null);
  const [expenseEditorError, setExpenseEditorError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const expenseEditorDirty =
    expenseEditingIndex !== null ||
    expenseEditor.name.trim().length > 0 ||
    expenseEditor.monthly_amount > 0 ||
    expenseEditor.category !== EMPTY_EXPENSE.category;

  const loadExisting = useCallback(async () => {
    setLoadingExisting(true);
    setLoadError(false);
    try {
      const response = await getFinancialSetup();
      if (response.status !== 'completed' || !response.data) {
        throw new Error('Setup data is not available');
      }
      dispatch({ type: 'replace', payload: response.data });
    } catch {
      setLoadError(true);
    } finally {
      setLoadingExisting(false);
    }
  }, []);

  useEffect(() => {
    if (isEdit) void loadExisting();
  }, [isEdit, loadExisting]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const goBack = useCallback(() => {
    setValidationError(null);
    setSubmitError(null);
    if (step > 0) {
      setStep((current) => current - 1);
    } else if (isEdit) {
      navigation.goBack();
    }
  }, [isEdit, navigation, step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (succeeded || submitting) return true;
      if (step > 0 || isEdit) {
        goBack();
        return true;
      }
      return true;
    });
    return () => subscription.remove();
  }, [goBack, isEdit, step, submitting, succeeded]);

  useEffect(() => {
    if (!succeeded) return undefined;
    const timer = setTimeout(() => {
      if (isEdit) {
        navigation.goBack();
        return;
      }
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: {
              screen: 'Transactions',
              params: { showSetupBanner: true },
            },
          },
        ],
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [isEdit, navigation, succeeded]);

  const validateCurrentStep = (): string | null => {
    if (step === 0) {
      if (!Number.isInteger(draft.monthly_income) || draft.monthly_income <= 0) {
        return 'Hãy nhập thu nhập hàng tháng lớn hơn 0.';
      }
    }
    if (step === 1 && expenseEditorDirty) {
      return 'Hãy thêm hoặc hủy khoản chi đang nhập trước khi tiếp tục.';
    }
    if (step === 2) {
      if (!draft.primary_goal.goal_type) return 'Hãy chọn một loại mục tiêu.';
      if (!draft.primary_goal.name.trim()) return 'Hãy nhập tên mục tiêu.';
      if (
        !Number.isInteger(draft.primary_goal.target_amount) ||
        draft.primary_goal.target_amount <= 0
      ) {
        return 'Số tiền mục tiêu phải lớn hơn 0.';
      }
      if (
        !Number.isInteger(draft.primary_goal.current_amount) ||
        draft.primary_goal.current_amount < 0
      ) {
        return 'Số tiền hiện có không được âm.';
      }
      if (draft.primary_goal.current_amount > draft.primary_goal.target_amount) {
        return 'Số tiền hiện có không thể lớn hơn số tiền mục tiêu.';
      }
      if (
        draft.primary_goal.target_date !== null &&
        !isValidIsoDate(draft.primary_goal.target_date)
      ) {
        return 'Ngày dự kiến phải đúng định dạng YYYY-MM-DD.';
      }
    }
    return null;
  };

  const nextStep = () => {
    const error = validateCurrentStep();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    setStep((current) => Math.min(current + 1, 4));
  };

  const skipPreferences = () => {
    dispatch({
      type: 'patch',
      patch: {
        savings_priority: 'balanced',
        focus_categories: [],
        financial_situation_notes: null,
      },
    });
    nextStep();
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await saveFinancialSetup(normalizePayload(draft));
      if (response.status !== 'completed') throw new Error('Setup was not completed');
      setSucceeded(true);
    } catch {
      setSubmitError(
        'Chưa thể lưu hồ sơ. Dữ liệu bạn vừa nhập vẫn được giữ lại — hãy thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) return <LoadingState />;
  if (loadError) {
    return <LoadErrorState onRetry={loadExisting} onCancel={() => navigation.goBack()} />;
  }
  if (succeeded) return <SuccessState isEdit={isEdit} />;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <IncomeStep
            draft={draft}
            dispatch={dispatch}
            clearError={() => setValidationError(null)}
          />
        );
      case 1:
        return (
          <ExpensesStep
            expenses={draft.recurring_expenses}
            dispatch={dispatch}
            editor={expenseEditor}
            setEditor={setExpenseEditor}
            editingIndex={expenseEditingIndex}
            setEditingIndex={setExpenseEditingIndex}
            editorError={expenseEditorError}
            setEditorError={setExpenseEditorError}
            clearWizardError={() => setValidationError(null)}
          />
        );
      case 2:
        return (
          <GoalStep
            goal={draft.primary_goal}
            dispatch={dispatch}
            clearError={() => setValidationError(null)}
          />
        );
      case 3:
        return <PreferencesStep draft={draft} dispatch={dispatch} />;
      case 4:
        return (
          <ReviewStep
            draft={draft}
            onEdit={(targetStep) => {
              setValidationError(null);
              setSubmitError(null);
              setStep(targetStep);
            }}
          />
        );
      default:
        return null;
    }
  };

  const canGoBack = step > 0 || isEdit;
  const footerLabel =
    step === 4
      ? isEdit
        ? 'Lưu thay đổi'
        : 'Tạo kế hoạch của tôi'
      : 'Tiếp tục';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ProgressHeader step={step} onBack={goBack} backDisabled={!canGoBack} />
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          {renderStep()}
        </ScrollView>
        <View style={styles.footer}>
          {validationError ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
              <Text style={styles.errorBannerText}>{validationError}</Text>
            </View>
          ) : null}
          {submitError ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="cloud-offline-outline" size={18} color={COLORS.error} />
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}
          <Pressable
            testID={step === 4 ? 'submit-financial-setup' : 'financial-setup-next'}
            style={({ pressed }) => [
              styles.primaryButton,
              submitting && styles.primaryButtonDisabled,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={step === 4 ? submit : nextStep}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={footerLabel}
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>{footerLabel}</Text>
                <Ionicons
                  name={step === 4 ? 'checkmark-circle-outline' : 'arrow-forward'}
                  size={19}
                  color={COLORS.surface}
                />
              </View>
            )}
          </Pressable>
          {step === 1 && draft.recurring_expenses.length === 0 ? (
            <Pressable
              onPress={nextStep}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Bỏ qua bước chi phí cố định"
            >
              <Text style={styles.skipButtonText}>Bỏ qua bước này</Text>
            </Pressable>
          ) : null}
          {step === 3 ? (
            <Pressable
              onPress={skipPreferences}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Bỏ qua sở thích hỗ trợ và dùng lựa chọn cân bằng"
            >
              <Text style={styles.skipButtonText}>Bỏ qua và dùng mặc định Cân bằng</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 34 },
  progressHeader: {
    minHeight: 116,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 13,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  progressTopRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.small,
    backgroundColor: THEME_COLORS.surfaceMuted,
  },
  backButtonDisabled: { opacity: 0.25 },
  headerBrand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerBrandMark: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.navy,
  },
  headerBrandText: { color: COLORS.text, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  stepCounter: {
    minWidth: 44,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.pill,
    backgroundColor: COLORS.indigoLight,
    paddingHorizontal: 9,
  },
  stepCounterText: { color: COLORS.indigoDark, fontSize: 12, fontWeight: '900' },
  progressInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  progressNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressName: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  progressLabel: { color: COLORS.secondary, fontSize: 11, fontWeight: '700' },
  progressSegments: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 5,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
  },
  progressSegmentActive: { backgroundColor: COLORS.indigo },
  headingWrap: { marginBottom: 26 },
  headingMeta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  headingIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.indigoLight,
  },
  eyebrow: {
    color: COLORS.indigo,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  stepTitle: {
    color: COLORS.text,
    fontSize: 25,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: -0.55,
    marginBottom: 9,
  },
  stepDescription: { color: COLORS.secondary, fontSize: 14, lineHeight: 21 },
  fieldGroup: { marginBottom: 19 },
  fieldLabel: { color: COLORS.text, fontSize: 13, fontWeight: '800', marginBottom: 9 },
  moneyInputShell: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    ...SOFT_SHADOW,
  },
  moneyInputIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.indigoLight,
    marginRight: 8,
  },
  moneyInput: {
    flex: 1,
    minHeight: 58,
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  currencyBadge: {
    borderRadius: 8,
    backgroundColor: THEME_COLORS.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  currencySuffix: { color: COLORS.secondary, fontSize: 11, fontWeight: '900' },
  inputError: { borderColor: COLORS.error },
  helperText: { color: COLORS.secondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  textInput: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  optionList: { gap: 10, marginBottom: 24 },
  optionCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  optionCardCompact: { minHeight: 50 },
  optionCardSelected: { borderColor: COLORS.indigo, backgroundColor: COLORS.indigoLight },
  optionIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.indigoLight,
    marginRight: 12,
  },
  optionIconSelected: { backgroundColor: COLORS.indigo },
  optionTextWrap: { flex: 1 },
  optionLabel: { color: COLORS.text, fontSize: 14, fontWeight: '900' },
  optionLabelSelected: { color: COLORS.indigoDark },
  optionDescription: { color: COLORS.secondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  radioOuterSelected: { borderColor: COLORS.indigo, backgroundColor: COLORS.indigo },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.indigoLight,
    borderWidth: 1,
    borderColor: THEME_COLORS.mint,
    borderRadius: RADII.medium,
    padding: 13,
    marginTop: 2,
  },
  privacyIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    marginRight: 11,
  },
  privacyCopy: { flex: 1 },
  privacyTitle: { color: COLORS.indigoDark, fontSize: 13, fontWeight: '900', marginBottom: 3 },
  privacyText: { color: COLORS.secondary, fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 9,
  },
  savedList: { marginBottom: 22 },
  expenseSummaryCard: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: RADII.large,
    backgroundColor: COLORS.navy,
    padding: 15,
    marginBottom: 17,
    ...CARD_SHADOW,
  },
  expenseSummaryIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginRight: 12,
  },
  expenseSummaryCopy: { flex: 1 },
  expenseSummaryLabel: { color: '#A9BDC8', fontSize: 11, fontWeight: '700' },
  expenseSummaryValue: {
    color: COLORS.surface,
    fontSize: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  expenseCountBadge: {
    borderRadius: RADII.pill,
    backgroundColor: 'rgba(221,245,237,0.13)',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  expenseCountText: { color: '#CDEDE4', fontSize: 10, fontWeight: '800' },
  expenseCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.medium,
    paddingLeft: 11,
    paddingRight: 5,
    paddingVertical: 9,
    marginBottom: 8,
    ...SOFT_SHADOW,
  },
  expenseCardIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.indigoLight,
    marginRight: 10,
  },
  expenseInfo: { flex: 1, paddingRight: 6 },
  expenseName: { color: COLORS.text, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  expenseMeta: { color: COLORS.secondary, fontSize: 12, lineHeight: 17 },
  expenseActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  textActionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  editorCard: {
    borderRadius: RADII.large,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 17,
    ...CARD_SHADOW,
  },
  editorTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 19 },
  editorTitleIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.indigoLight,
    marginRight: 11,
  },
  editorTitleCopy: { flex: 1 },
  editorTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900' },
  editorSubtitle: { color: COLORS.secondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  chipSelected: { borderColor: COLORS.indigo, backgroundColor: COLORS.indigoLight },
  chipText: { color: COLORS.secondary, fontSize: 12, fontWeight: '800' },
  chipTextSelected: { color: COLORS.indigoDark },
  suggestionNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  suggestionNoteText: { flex: 1, color: COLORS.indigoDark, fontSize: 11, lineHeight: 16 },
  inlineError: {
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 18,
    borderRadius: RADII.small,
    backgroundColor: COLORS.errorBackground,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 12,
  },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  secondarySmallButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: RADII.small,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 16,
  },
  secondarySmallButtonText: { color: COLORS.secondary, fontSize: 13, fontWeight: '800' },
  addButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADII.small,
    backgroundColor: COLORS.indigo,
    paddingHorizontal: 16,
  },
  addButtonText: { color: COLORS.surface, fontSize: 13, fontWeight: '900' },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 22 },
  goalTypeCard: {
    width: '48.5%',
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.surface,
    padding: 10,
    ...SOFT_SHADOW,
  },
  goalTypeCardSelected: { borderColor: COLORS.indigo, backgroundColor: COLORS.indigoLight },
  goalTypeIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.indigoLight,
    marginBottom: 8,
  },
  goalTypeIconSelected: { backgroundColor: COLORS.indigo },
  goalTypeText: { color: COLORS.text, textAlign: 'center', fontSize: 12, fontWeight: '900' },
  goalTypeTextSelected: { color: COLORS.indigoDark },
  unspecifiedButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADII.small,
    backgroundColor: COLORS.indigoLight,
    paddingHorizontal: 11,
    marginTop: 4,
  },
  unspecifiedText: { color: COLORS.indigoDark, fontSize: 13, fontWeight: '800' },
  sectionSpacing: { marginTop: 10 },
  notesInput: { minHeight: 118, textAlignVertical: 'top' },
  characterCount: { color: COLORS.muted, fontSize: 11, textAlign: 'right', marginTop: 5 },
  reviewSnapshot: {
    overflow: 'hidden',
    borderRadius: RADII.large,
    backgroundColor: COLORS.navy,
    padding: 19,
    marginBottom: 16,
    ...CARD_SHADOW,
  },
  reviewSnapshotGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    top: -90,
    right: -55,
    borderRadius: 85,
    backgroundColor: 'rgba(34,197,166,0.12)',
  },
  reviewSnapshotEyebrow: { color: '#A8D8CC', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  reviewSnapshotAmount: {
    color: COLORS.surface,
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
    marginTop: 8,
  },
  reviewSnapshotCaption: { color: '#A9BDC8', fontSize: 11, marginTop: 3 },
  reviewSnapshotMetrics: { flexDirection: 'row', marginTop: 17 },
  reviewSnapshotMetric: { flex: 1 },
  reviewSnapshotMetricLabel: { color: '#8FA9B8', fontSize: 10, fontWeight: '700' },
  reviewSnapshotMetricValue: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 5,
  },
  reviewSnapshotDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.13)',
    marginHorizontal: 14,
  },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.medium,
    padding: 16,
    marginBottom: 12,
    ...SOFT_SHADOW,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reviewTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  reviewTitleIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: COLORS.indigoLight,
    marginRight: 9,
  },
  reviewTitle: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '900' },
  editButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingLeft: 10,
  },
  editButtonText: { color: COLORS.indigo, fontSize: 12, fontWeight: '800' },
  reviewRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  reviewLabel: { flex: 1, color: COLORS.secondary, fontSize: 13, lineHeight: 19 },
  reviewValue: {
    flex: 1.3,
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'right',
  },
  reviewValueEmphasized: { color: COLORS.indigoDark, fontWeight: '900' },
  reviewDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  emptyReview: { color: COLORS.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  reviewNotes: { marginTop: 8 },
  reviewNotesText: { color: COLORS.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 11,
    paddingBottom: 9,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    ...SOFT_SHADOW,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.medium,
    backgroundColor: COLORS.indigo,
    paddingHorizontal: 18,
  },
  primaryButtonPressed: { backgroundColor: COLORS.indigoDark },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: COLORS.surface, fontSize: 15, fontWeight: '900' },
  skipButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  skipButtonText: { color: COLORS.secondary, fontSize: 12, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADII.small,
    borderWidth: 1,
    borderColor: '#F0C5C0',
    backgroundColor: COLORS.errorBackground,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
  },
  errorBannerText: { flex: 1, color: COLORS.error, fontSize: 12, lineHeight: 18 },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 28,
    gap: 11,
  },
  stateBrandMark: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: COLORS.navy,
    marginBottom: 7,
    ...CARD_SHADOW,
  },
  stateErrorIcon: { backgroundColor: COLORS.errorBackground },
  stateTitle: { color: COLORS.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  stateDescription: {
    color: COLORS.secondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 360,
  },
  primaryStateButton: {
    minWidth: 180,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: RADII.medium,
    backgroundColor: COLORS.indigo,
    marginTop: 8,
  },
  cancelStateButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  cancelStateButtonText: { color: COLORS.secondary, fontSize: 13, fontWeight: '800' },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 28,
  },
  successIcon: {
    width: 82,
    height: 82,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    marginBottom: 16,
    ...CARD_SHADOW,
  },
  successBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  successBrandText: { color: COLORS.indigoDark, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  successTitle: {
    color: COLORS.text,
    fontSize: 25,
    lineHeight: 33,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  successDescription: {
    color: COLORS.secondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 360,
  },
  pressed: { opacity: 0.72 },
});
