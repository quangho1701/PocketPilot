// Owner: Ha
// Feature: Personalized Budget Planning
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import type { PlanStackParamList, RootStackParamList } from '@/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Budget, BudgetAllocation, BudgetCategory, BudgetProgress, BudgetingMode } from '@/types/budget';
import type { FinancialSetupPayload } from '@/types/setup';
import { approveBudgetProposal, generateBudgetProposal, getBudgetMonth, getBudgetProgress, getDraftGoals, listBudgetCategories } from '@/services/budget';
import { getFinancialSetup } from '@/services/setup';
import { COLORS, FONTS } from '@/theme';
import { formatCompactUsd, formatMonthYear, formatUsd } from '@/utils/finance';
import { isDraftPromptDismissed } from './draftPromptSession';
import GoalManager from './GoalManager';

type Props = NativeStackScreenProps<PlanStackParamList, 'PlanMain'>;
type ScreenState = 'active' | 'draft' | 'archived' | 'empty' | 'stale';
type PendingAction = 'generate' | 'approve' | null;
const MODES: Array<{ value: BudgetingMode; title: string; caption: string }> = [
  { value: 'ai_personalized', title: 'Personalized', caption: 'Your profile, goals, and habits' },
  { value: '50_30_20', title: '50 / 30 / 20', caption: 'Needs · wants · savings' },
  { value: 'zero_based', title: 'Zero-based', caption: 'Allocate all monthly income' },
  { value: 'custom', title: 'Custom', caption: 'Use allocations you enter' },
];
const MODE_LABELS: Record<BudgetingMode, string> = {
  ai_personalized: 'Personalized',
  '50_30_20': '50 / 30 / 20 rule',
  zero_based: 'Zero-based',
  custom: 'Custom',
};

const clamp = (value: number) => Math.max(0, Math.min(value, 100));
const currentMonth = () => ({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
function planState(budget: Budget | null): ScreenState {
  if (!budget) return 'empty';
  if (budget.status === 'active') return 'active';
  if (budget.status === 'draft') return 'draft';
  return 'archived';
}
function categoryName(item: BudgetAllocation, names: Map<string, string>) {
  return names.get(item.category_id) ?? (item.category_slug ?? 'Category').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BudgetScreen({ navigation }: Props) {
  const [setup, setSetup] = useState<FinancialSetupPayload | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [progress, setProgress] = useState<BudgetProgress | null>(null);
  const [mode, setMode] = useState<BudgetingMode>('ai_personalized');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const loadPlan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [setupResponse, latest, categoryRows, draftGoals] = await Promise.all([getFinancialSetup(), getBudgetMonth(selectedMonth.month, selectedMonth.year), listBudgetCategories(), getDraftGoals()]);
      setSetup(setupResponse.data); setBudget(latest); setCategories(categoryRows);
      if (!draftGoals.confirmed && !isDraftPromptDismissed()) { navigation.navigate('DraftPlan'); return; }
      setMode((latest?.budgeting_mode as BudgetingMode) || 'ai_personalized');
      if (latest && planState(latest) === 'active') {
        try { setProgress(await getBudgetProgress(latest.month, latest.year)); } catch { setProgress(null); }
      } else setProgress(null);
    } catch { setError('Could not open your Plan. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, [navigation, selectedMonth.month, selectedMonth.year]);
  useFocusEffect(useCallback(() => { void loadPlan(); }, [loadPlan]));

  const names = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);
  const state = planState(budget);
  const openSetup = () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('FinancialSetup', { mode: setup ? 'edit' : 'initial' });
  const generate = async () => {
    const month = currentMonth();
    const custom = mode === 'custom' ? categories.map((category) => ({ category_id: category.id, amount: Number((customAmounts[category.id] ?? '').replace(/[^0-9]/g, '')) || 0 })).filter((item) => item.amount > 0) : undefined;
    if (mode === 'custom' && !custom?.length) { setError('Enter at least one allocation for a custom plan.'); return; }
    setPending('generate'); setError(null);
    try {
      setBudget(await generateBudgetProposal({ ...month, budgeting_mode: mode, custom_allocations: custom }));
      setProgress(null);
    } catch { setError('Could not create a proposal. Check your financial profile and try again.'); }
    finally { setPending(null); }
  };
  const approve = async () => {
    if (!budget) return;
    setPending('approve'); setError(null);
    try { await approveBudgetProposal(budget.id); await loadPlan(); }
    catch { setError('Could not approve the plan. Check the allocations and try again.'); }
    finally { setPending(null); }
  };
  const shiftMonth = (offset: number) => setSelectedMonth((value) => { const date = new Date(value.year, value.month - 1 + offset, 1); return { month: date.getMonth() + 1, year: date.getFullYear() }; });

  if (loading) return <StateView icon="pie-chart-outline" title="Opening your Plan" description="PocketPilot is loading your monthly plan." />;
  if (!setup) return <StateView icon="wallet-outline" title="Financial setup required" description="Complete setup so PocketPilot can build your plan." action="Open setup" onAction={openSetup} />;
  if (error && !budget) return <StateView icon="cloud-offline-outline" title="Could not load Plan" description={error} action="Try again" onAction={() => void loadPlan()} danger />;
  if (!budget) {
    const now = currentMonth();
    if (selectedMonth.month !== now.month || selectedMonth.year !== now.year) return <StateView icon="calendar-outline" title="No plan for this month" description="There is no saved plan for the selected month." action="Return to current month" onAction={() => setSelectedMonth(now)} />;
    return <PlanStart mode={mode} setMode={setMode} onGenerate={generate} pending={pending === 'generate'} error={error} categories={categories} customAmounts={customAmounts} setCustomAmounts={setCustomAmounts} />;
  }

  const allocated = budget.allocations.reduce((sum, item) => sum + item.allocated_amount, 0);
  const spent = progress?.total_spent ?? 0;
  const utilization = progress ? progress.budget_utilization_percent : allocated > 0 ? 100 : 0;
  const monthLabel = formatMonthYear(`${budget.year}-${String(budget.month).padStart(2, '0')}-01`) ?? `${budget.month}/${budget.year}`;

  return <SafeAreaView style={styles.safeArea} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.monthNav}><Pressable onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={20} color={COLORS.inkSoft} /></Pressable><View><Text style={[styles.eyebrow, { textAlign: 'center' }]}>PLAN LEDGER</Text><Text style={styles.title}>{monthLabel}</Text></View><Pressable onPress={() => shiftMonth(1)} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={20} color={COLORS.inkSoft} /></Pressable></View>
    <Text style={styles.subtitle}>{state === 'active' ? 'Active monthly plan' : state === 'draft' ? 'Proposal awaiting approval' : state === 'archived' ? 'Archived monthly plan' : 'Most recent plan from a previous month'}</Text>
    {error ? <Notice text={error} onDismiss={() => setError(null)} /> : null}
    {state === 'stale' ? <View style={[styles.notice, styles.warning]}><Ionicons name="calendar-outline" size={17} color={COLORS.amber} /><Text style={styles.noticeText}>This is your most recent plan. Create a proposal for the current month below.</Text></View> : null}
    {state === 'archived' ? <View style={[styles.notice, styles.archivedNotice]}><Ionicons name="archive-outline" size={17} color={COLORS.textSecondary} /><Text style={styles.noticeText}>This plan is archived and cannot be edited or applied again.</Text></View> : null}
    <View style={styles.gaugeBlock}><View style={styles.arcWrap}><Svg width="320" height="165" viewBox="0 0 320 165"><Path d="M20 150 A140 140 0 0 1 300 150" fill="none" stroke={COLORS.border} strokeWidth="16"/><Path d="M20 150 A140 140 0 0 1 300 150" fill="none" stroke={COLORS.ink} strokeWidth="16" strokeDasharray="439.82" strokeDashoffset={439.82*(1-clamp(utilization)/100)} strokeLinecap="butt"/></Svg><View style={styles.arcCopy}><Text style={styles.gaugeLabel}>{progress ? 'SPENT' : 'ALLOCATED'}</Text><Text style={styles.gaugeAmount}>{formatUsd(progress ? spent : allocated)}</Text><Text style={styles.gaugeMeta}>of {formatUsd(allocated)} budget</Text></View></View></View>
    <View style={styles.ledger}><LedgerRow label="Monthly income" value={formatUsd(budget.total_income)} /><LedgerRow label="Budget" value={formatUsd(allocated)} detail={`${Math.round(budget.total_income ? allocated / budget.total_income * 100 : 0)}%`} /><LedgerRow label="Savings" value={formatUsd(budget.planned_savings)} detail={`${Math.round(budget.total_income ? budget.planned_savings / budget.total_income * 100 : 0)}%`} last /></View>
    {state === 'draft' ? <View style={styles.review}><View style={styles.reviewCopy}><Text style={styles.reviewTitle}>PROPOSAL · {MODE_LABELS[budget.budgeting_mode as BudgetingMode] ?? 'Unknown'}</Text><Text style={styles.reviewText}>Tap a category to adjust it, then apply the plan.</Text></View><Pressable onPress={() => void approve()} disabled={pending === 'approve'} style={styles.primaryButton}>{pending === 'approve' ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Apply</Text>}</Pressable></View> : null}
    {(state === 'stale' || state === 'archived') ? <ModePicker mode={mode} setMode={setMode} /> : null}
    {(state === 'stale' || state === 'archived') && mode === 'custom' ? <CustomAllocationEditor categories={categories} customAmounts={customAmounts} setCustomAmounts={setCustomAmounts} /> : null}
    {(state === 'stale' || state === 'archived') ? <Pressable onPress={() => void generate()} disabled={pending === 'generate'} style={[styles.primaryButton, styles.generateButton]}>{pending === 'generate' ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Create this month's proposal</Text>}</Pressable> : null}
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Budget</Text><Text style={styles.sectionMeta}>{state === 'draft' ? 'Tap to adjust allocations' : progress ? 'Plan and actual spending' : 'Planned allocations'}</Text></View><Text style={styles.sectionValue}>{formatCompactUsd(allocated)}</Text></View>
    <View>{budget.allocations.map((item) => { const row = progress?.categories.find((entry) => entry.category_id === item.category_id); const used = row?.percentage_used ?? 0; const tone = used > 100 ? COLORS.oxblood : row?.near_limit ? COLORS.brass : COLORS.greenDeep; return <Pressable key={item.id} disabled={state === 'archived' || state === 'stale'} onPress={() => navigation.navigate('BudgetEdit', { budgetId: budget.id, categoryId: item.category_id })} style={styles.categoryRow}><View style={styles.categoryIcon}><Ionicons name={used > 100 ? 'alert-circle-outline' : 'wallet-outline'} size={18} color={tone} /></View><View style={styles.categoryCopy}><View style={styles.categoryLine}><Text style={styles.categoryName}>{categoryName(item, names)}</Text><Text style={[styles.categoryBalance, { color: tone }]}>{row ? `${formatCompactUsd(row.remaining_amount)} remaining` : ''}</Text></View><View style={styles.bar}><View style={[styles.barFill, { width: `${clamp(row ? used : 100)}%`, backgroundColor: tone }]} /></View><Text style={styles.categoryMeta}>{row ? `${formatCompactUsd(row.spent_amount)} spent · ${Math.round(used)}%` : 'No spending data yet'}</Text></View><Text style={styles.categoryAmount}>{formatCompactUsd(item.allocated_amount)}</Text><Ionicons name="chevron-forward" size={14} color={COLORS.greenDeep} /></Pressable>; })}</View>
    <GoalManager />
    <Text style={styles.disclaimer}>Figures are based on your saved plan and synced transactions.</Text>
  </ScrollView></SafeAreaView>;
}

function PlanStart({ mode, setMode, onGenerate, pending, error, categories, customAmounts, setCustomAmounts }: { mode: BudgetingMode; setMode: (mode: BudgetingMode) => void; onGenerate: () => void; pending: boolean; error: string | null; categories: BudgetCategory[]; customAmounts: Record<string, string>; setCustomAmounts: (value: Record<string, string>) => void }) { return <SafeAreaView style={styles.stateScreen} edges={['top']}><ScrollView contentContainerStyle={styles.startContent}><Text style={styles.eyebrow}>PLAN LEDGER</Text><Text style={styles.stateTitle}>Start your monthly plan</Text><Text style={styles.stateText}>Choose how PocketPilot should build the proposal. You can review it before applying it.</Text><ModePicker mode={mode} setMode={setMode} />{mode === 'custom' ? <View style={styles.customEditor}><Text style={styles.modeLabel}>CUSTOM ALLOCATIONS</Text>{categories.filter((item) => item.mapping_group !== 'savings').map((category) => <View key={category.id} style={styles.customRow}><Text style={styles.customName}>{category.name}</Text><Text style={styles.customCurrency}>$</Text><TextInput value={customAmounts[category.id] ?? ''} onChangeText={(value) => setCustomAmounts({ ...customAmounts, [category.id]: value.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} style={styles.customInput} accessibilityLabel={`USD allocation for ${category.name}`} /></View>)}<Text style={styles.modalNote}>Unallocated income will be recorded as planned savings.</Text></View> : null}<Pressable onPress={onGenerate} disabled={pending} style={[styles.primaryButton, styles.startButton]}>{pending ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Create proposal</Text>}</Pressable>{error ? <Text style={styles.inlineError}>{error}</Text> : null}</ScrollView></SafeAreaView>; }
function ModePicker({ mode, setMode }: { mode: BudgetingMode; setMode: (mode: BudgetingMode) => void }) { return <View style={styles.modeBlock}><Text style={styles.modeLabel}>PLANNING METHOD</Text>{MODES.map((item) => <Pressable key={item.value} onPress={() => setMode(item.value)} style={[styles.modeRow, mode === item.value && styles.modeRowActive]}><View style={styles.modeMark}>{mode === item.value ? <Ionicons name="checkmark" size={14} color={COLORS.parchment} /> : null}</View><View style={styles.modeCopy}><Text style={styles.modeTitle}>{item.title}</Text><Text style={styles.modeCaption}>{item.caption}</Text></View></Pressable>)}</View>; }
function CustomAllocationEditor({ categories, customAmounts, setCustomAmounts }: { categories: BudgetCategory[]; customAmounts: Record<string, string>; setCustomAmounts: (value: Record<string, string>) => void }) { return <View style={styles.customEditor}><Text style={styles.modeLabel}>CUSTOM ALLOCATIONS</Text>{categories.filter((item) => item.mapping_group !== 'savings').map((category) => <View key={category.id} style={styles.customRow}><Text style={styles.customName}>{category.name}</Text><Text style={styles.customCurrency}>$</Text><TextInput value={customAmounts[category.id] ?? ''} onChangeText={(value) => setCustomAmounts({ ...customAmounts, [category.id]: value.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} style={styles.customInput} accessibilityLabel={`USD allocation for ${category.name}`} /></View>)}<Text style={styles.modalNote}>Unallocated income will be recorded as planned savings.</Text></View>; }
function LedgerRow({ label, value, detail, last }: { label: string; value: string; detail?: string; last?: boolean }) { return <View style={[styles.ledgerRow, last && styles.ledgerLast]}><Text style={styles.ledgerLabel}>{label}</Text><Text style={styles.ledgerValue}>{detail ? `${detail} · ` : ''}{value}</Text></View>; }
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) { return <Pressable onPress={onDismiss} style={[styles.notice, styles.errorNotice]}><Ionicons name="alert-circle-outline" size={17} color={COLORS.oxblood} /><Text style={styles.noticeText}>{text}</Text><Ionicons name="close" size={16} color={COLORS.oxblood} /></Pressable>; }
function StateView({ icon, title, description, action, onAction, danger }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; action?: string; onAction?: () => void; danger?: boolean }) { return <SafeAreaView style={[styles.stateScreen, styles.centeredState]} edges={['top']}><Ionicons name={icon} size={34} color={danger ? COLORS.oxblood : COLORS.greenDeep} /><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{description}</Text>{action && onAction ? <Pressable onPress={onAction} style={[styles.primaryButton, styles.startButton]}><Text style={styles.primaryText}>{action}</Text></Pressable> : null}</SafeAreaView>; }
const styles = StyleSheet.create({
  goalEditorInput: { borderBottomWidth: 1, borderColor: COLORS.ink, paddingVertical: 9, color: COLORS.ink, marginBottom: 15 },
  safeArea: { flex: 1, backgroundColor: COLORS.parchment }, content: { padding: 20, paddingBottom: 34 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1.5, borderBottomColor: COLORS.borderStrong, paddingBottom: 7 }, eyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.3 }, title: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 27, textTransform: 'capitalize' }, subtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 7 },
  gaugeBlock: { alignItems: 'center', paddingTop: 22, paddingBottom: 8 }, arcWrap: { width: 320, height: 170, position: 'relative' }, arcCopy: { position: 'absolute', left: 0, right: 0, bottom: 4, alignItems: 'center' }, gauge: { width: '82%', height: 15, borderWidth: 1, borderColor: COLORS.ink, backgroundColor: COLORS.parchmentDeep }, gaugeFill: { height: '100%', backgroundColor: COLORS.greenDeep }, gaugeLabel: { color: COLORS.textMuted, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.1 }, gaugeAmount: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 34, marginTop: 2 }, gaugeMeta: { color: COLORS.textSecondary, fontSize: 11 },
  ledger: { borderWidth: 1, borderColor: COLORS.ink, paddingHorizontal: 14 }, ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border }, ledgerLast: { borderBottomWidth: 0 }, ledgerLabel: { color: COLORS.text, fontSize: 13 }, ledgerValue: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 11, fontWeight: '700' },
  review: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.greenDeep, marginTop: 18, padding: 11, backgroundColor: COLORS.mintSoft }, reviewCopy: { flex: 1, paddingRight: 8 }, reviewTitle: { color: COLORS.greenDeep, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: .7 }, reviewText: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 }, primaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.greenDeep, paddingHorizontal: 14 }, primaryText: { color: COLORS.parchment, fontFamily: FONTS.mono, fontSize: 10, fontWeight: '700', letterSpacing: .7, textTransform: 'uppercase' },
  modeBlock: { borderTopWidth: 1, borderTopColor: COLORS.borderStrong, marginTop: 22 }, modeLabel: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.1, marginVertical: 10 }, modeRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: COLORS.border, paddingVertical: 10 }, modeRowActive: { backgroundColor: COLORS.parchmentDeep, paddingHorizontal: 7, marginHorizontal: -7 }, modeDisabled: { opacity: .48 }, modeMark: { width: 19, height: 19, borderWidth: 1, borderColor: COLORS.greenDeep, backgroundColor: COLORS.parchment, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, modeCopy: { flex: 1 }, modeTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '700' }, modeCaption: { color: COLORS.textMuted, fontSize: 9.5, marginTop: 2 }, generateButton: { marginTop: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 27, marginBottom: 4, borderBottomWidth: 1.5, borderBottomColor: COLORS.borderStrong, paddingBottom: 7 }, sectionTitle: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 22 }, sectionMeta: { color: COLORS.textMuted, fontSize: 9.5, marginTop: 2 }, sectionValue: { color: COLORS.greenDeep, fontFamily: FONTS.mono, fontSize: 11 },
  categoryRow: { minHeight: 77, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 11 }, categoryIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.greenDeep }, categoryCopy: { flex: 1, minWidth: 0, marginHorizontal: 10 }, categoryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 }, categoryName: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '700' }, categoryBalance: { fontFamily: FONTS.mono, fontSize: 8.5 }, bar: { height: 7, borderWidth: 1, borderColor: COLORS.ink, marginTop: 7 }, barFill: { height: '100%' }, categoryMeta: { color: COLORS.textMuted, fontFamily: FONTS.mono, fontSize: 8, marginTop: 4 }, categoryAmount: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 10, fontWeight: '700', marginRight: 7 },
  goal: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border, paddingVertical: 16, marginTop: 22 }, goalHead: { flexDirection: 'row', alignItems: 'center' }, goalCopy: { flex: 1, marginHorizontal: 11 }, goalName: { color: COLORS.ink, fontSize: 13, fontWeight: '700', marginTop: 2 }, goalPercent: { color: COLORS.greenDeep, fontFamily: FONTS.mono, fontSize: 13, fontWeight: '700' }, goalTrack: { height: 9, borderWidth: 1, borderColor: COLORS.ink, marginTop: 12 }, goalFill: { height: '100%', backgroundColor: COLORS.greenDeep }, goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }, goalSaved: { color: COLORS.greenDeep, fontFamily: FONTS.mono, fontSize: 9 }, goalTarget: { color: COLORS.textSecondary, fontFamily: FONTS.mono, fontSize: 9 }, disclaimer: { color: COLORS.textMuted, fontFamily: FONTS.mono, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 16 },
  notice: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 9, marginTop: 12, gap: 7 }, warning: { backgroundColor: COLORS.brassSoft, borderColor: COLORS.brass }, archivedNotice: { backgroundColor: COLORS.surfaceMuted, borderColor: COLORS.textSecondary }, errorNotice: { backgroundColor: COLORS.errorSoft, borderColor: COLORS.oxblood }, noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: 10, lineHeight: 14 },
  stateScreen: { flex: 1, backgroundColor: COLORS.parchment }, centeredState: { alignItems: 'center', justifyContent: 'center', padding: 24 }, startContent: { flexGrow: 1, width: '100%', justifyContent: 'center', alignItems: 'center', padding: 24 }, stateTitle: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 28, textAlign: 'center', marginTop: 14 }, stateText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 330 }, startButton: { marginTop: 18, minWidth: 210 }, inlineError: { color: COLORS.oxblood, fontSize: 11, textAlign: 'center', marginTop: 12 },
  customEditor: { width: '100%', borderTopWidth: 1, borderTopColor: COLORS.borderStrong, marginTop: 14 }, customRow: { width: '100%', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 7 }, customName: { flex: 1, color: COLORS.ink, fontSize: 11 }, customInput: { width: 105, color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 12, textAlign: 'right', paddingVertical: 5 }, customCurrency: { color: COLORS.textMuted, fontSize: 11, marginLeft: 5 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30,42,50,.52)' }, modal: { backgroundColor: COLORS.parchment, borderTopWidth: 1.5, borderColor: COLORS.ink, padding: 20, paddingBottom: 28 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 12 }, modalLabel: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.1 }, modalNameRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 17 }, modalName: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 23, marginLeft: 10 }, inputLabel: { color: COLORS.textMuted, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1 }, amountInputRow: { flexDirection: 'row', alignItems: 'baseline', borderBottomWidth: 1.5, borderBottomColor: COLORS.ink, marginBottom: 15 }, currency: { color: COLORS.textMuted, fontFamily: FONTS.display, fontSize: 24, marginRight: 8 }, amountInput: { flex: 1, color: COLORS.ink, fontFamily: FONTS.display, fontSize: 33, paddingVertical: 5 }, modalNote: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 13 }, saveButton: { marginTop: 18 },
});
