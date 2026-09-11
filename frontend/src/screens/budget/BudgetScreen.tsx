// Owner: Ha
// Feature: Personalized Budget Planning
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList, RootStackParamList } from '@/navigation/types';
import type { Budget, BudgetAllocation, BudgetCategory, BudgetProgress, BudgetingMode } from '@/types/budget';
import type { FinancialSetupPayload } from '@/types/setup';
import { approveBudgetProposal, generateBudgetProposal, getBudgetProgress, getLatestBudget, listBudgetCategories, updateBudgetProposal } from '@/services/budget';
import { getFinancialSetup } from '@/services/setup';
import { COLORS, FONTS } from '@/theme';
import { formatCompactVnd, formatMonthYear, formatVnd } from '@/utils/finance';

type Props = BottomTabScreenProps<MainTabParamList, 'Budget'>;
type ScreenState = 'active' | 'draft' | 'archived' | 'empty' | 'stale';
type PendingAction = 'generate' | 'save' | 'approve' | null;
const MODES: Array<{ value: BudgetingMode; title: string; caption: string }> = [
  { value: 'ai_personalized', title: 'Cá nhân hóa', caption: 'Hồ sơ, mục tiêu và thói quen' },
  { value: '50_30_20', title: '50 / 30 / 20', caption: 'Nhu cầu · mong muốn · tiết kiệm' },
  { value: 'zero_based', title: 'Zero-based', caption: 'Phân bổ toàn bộ thu nhập' },
  { value: 'custom', title: 'Tùy chỉnh', caption: 'Dùng các khoản bạn đã lập' },
];
const MODE_LABELS: Record<BudgetingMode, string> = {
  ai_personalized: 'Cá nhân hóa',
  '50_30_20': 'Quy tắc 50 / 30 / 20',
  zero_based: 'Phân bổ toàn bộ',
  custom: 'Tùy chỉnh',
};

const clamp = (value: number) => Math.max(0, Math.min(value, 100));
const currentMonth = () => ({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
function planState(budget: Budget | null): ScreenState {
  if (!budget) return 'empty';
  const current = currentMonth();
  if (budget.month !== current.month || budget.year !== current.year) return 'stale';
  if (budget.status === 'active') return 'active';
  if (budget.status === 'draft') return 'draft';
  return 'archived';
}
function categoryName(item: BudgetAllocation, names: Map<string, string>) {
  return names.get(item.category_id) ?? (item.category_slug ?? 'Danh mục').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  const [editing, setEditing] = useState<BudgetAllocation | null>(null);
  const [editedAmount, setEditedAmount] = useState('');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  const loadPlan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [setupResponse, latest, categoryRows] = await Promise.all([getFinancialSetup(), getLatestBudget(), listBudgetCategories()]);
      setSetup(setupResponse.data); setBudget(latest); setCategories(categoryRows);
      setMode((latest?.budgeting_mode as BudgetingMode) || 'ai_personalized');
      if (latest && planState(latest) === 'active') {
        try { setProgress(await getBudgetProgress(latest.month, latest.year)); } catch { setProgress(null); }
      } else setProgress(null);
    } catch { setError('Không thể mở sổ kế hoạch. Hãy kiểm tra kết nối rồi thử lại.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void loadPlan(); }, [loadPlan]));

  const names = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);
  const state = planState(budget);
  const openSetup = () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate('FinancialSetup', { mode: setup ? 'edit' : 'initial' });
  const generate = async () => {
    const month = currentMonth();
    const custom = mode === 'custom' ? categories.map((category) => ({ category_id: category.id, amount: Number((customAmounts[category.id] ?? '').replace(/[^0-9]/g, '')) || 0 })).filter((item) => item.amount > 0) : undefined;
    if (mode === 'custom' && !custom?.length) { setError('Hãy nhập ít nhất một khoản phân bổ cho kế hoạch tùy chỉnh.'); return; }
    setPending('generate'); setError(null);
    try {
      setBudget(await generateBudgetProposal({ ...month, budgeting_mode: mode, custom_allocations: custom }));
      setProgress(null);
    } catch { setError('Chưa tạo được bản đề xuất. Hãy kiểm tra hồ sơ tài chính rồi thử lại.'); }
    finally { setPending(null); }
  };
  const saveAllocation = async () => {
    if (!budget || !editing) return;
    const amount = Number(editedAmount.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) { setError('Hãy nhập mức phân bổ hợp lệ.'); return; }
    const allocations = budget.allocations.map((item) => ({ category_id: item.category_id, amount: item.id === editing.id ? amount : item.allocated_amount }));
    setPending('save'); setError(null);
    try { setBudget(await updateBudgetProposal(budget.id, { allocations })); setEditing(null); }
    catch { setError('Chưa lưu được thay đổi. Dữ liệu phân bổ không hợp lệ hoặc kế hoạch không còn có thể chỉnh sửa.'); }
    finally { setPending(null); }
  };
  const approve = async () => {
    if (!budget) return;
    setPending('approve'); setError(null);
    try { await approveBudgetProposal(budget.id); await loadPlan(); }
    catch { setError('Chưa phê duyệt được kế hoạch. Hãy kiểm tra các khoản phân bổ.'); }
    finally { setPending(null); }
  };

  if (loading) return <StateView icon="pie-chart-outline" title="Đang mở sổ kế hoạch" description="PocketPilot đang lấy kế hoạch tháng của bạn." />;
  if (!setup) return <StateView icon="wallet-outline" title="Cần hồ sơ tài chính" description="Hoàn tất hồ sơ để PocketPilot có thể lập kế hoạch phù hợp." action="Thiết lập hồ sơ" onAction={openSetup} />;
  if (error && !budget) return <StateView icon="cloud-offline-outline" title="Chưa thể tải kế hoạch" description={error} action="Thử lại" onAction={() => void loadPlan()} danger />;
  if (!budget) return <PlanStart mode={mode} setMode={setMode} onGenerate={generate} pending={pending === 'generate'} error={error} categories={categories} customAmounts={customAmounts} setCustomAmounts={setCustomAmounts} />;

  const allocated = budget.allocations.reduce((sum, item) => sum + item.allocated_amount, 0);
  const spent = progress?.total_spent ?? 0;
  const utilization = progress ? progress.budget_utilization_percent : allocated > 0 ? 100 : 0;
  const monthLabel = formatMonthYear(`${budget.year}-${String(budget.month).padStart(2, '0')}-01`) ?? `${budget.month}/${budget.year}`;
  const goalPercent = setup.primary_goal.target_amount > 0 ? clamp((setup.primary_goal.current_amount / setup.primary_goal.target_amount) * 100) : 0;

  return <SafeAreaView style={styles.safeArea} edges={['top']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.monthNav}><View><Text style={styles.eyebrow}>SỔ KẾ HOẠCH</Text><Text style={styles.title}>{monthLabel}</Text></View></View>
    <Text style={styles.subtitle}>{state === 'active' ? 'Kế hoạch đang hoạt động' : state === 'draft' ? 'Bản đề xuất chờ duyệt' : state === 'archived' ? 'Kế hoạch đã lưu trữ' : 'Kế hoạch gần nhất thuộc tháng trước'}</Text>
    {error ? <Notice text={error} onDismiss={() => setError(null)} /> : null}
    {state === 'stale' ? <View style={[styles.notice, styles.warning]}><Ionicons name="calendar-outline" size={17} color={COLORS.amber} /><Text style={styles.noticeText}>Đây là kế hoạch gần nhất. Tạo một bản đề xuất cho tháng hiện tại bên dưới.</Text></View> : null}
    {state === 'archived' ? <View style={[styles.notice, styles.archivedNotice]}><Ionicons name="archive-outline" size={17} color={COLORS.textSecondary} /><Text style={styles.noticeText}>Kế hoạch này đã được lưu trữ và không thể chỉnh sửa hoặc áp dụng lại.</Text></View> : null}
    <View style={styles.gaugeBlock}><View style={styles.gauge}><View style={[styles.gaugeFill, { width: `${clamp(utilization)}%` }]} /></View><Text style={styles.gaugeLabel}>{progress ? 'ĐÃ CHI' : 'ĐÃ PHÂN BỔ'}</Text><Text style={styles.gaugeAmount}>{formatVnd(progress ? spent : allocated)}</Text><Text style={styles.gaugeMeta}>trên {formatVnd(allocated)} ngân sách</Text></View>
    <View style={styles.ledger}><LedgerRow label="Thu nhập tháng" value={formatVnd(budget.total_income)} /><LedgerRow label="Ngân sách" value={formatVnd(allocated)} detail={`${Math.round(budget.total_income ? allocated / budget.total_income * 100 : 0)}%`} /><LedgerRow label="Tiết kiệm" value={formatVnd(budget.planned_savings)} detail={`${Math.round(budget.total_income ? budget.planned_savings / budget.total_income * 100 : 0)}%`} last /></View>
    {state === 'draft' ? <View style={styles.review}><View style={styles.reviewCopy}><Text style={styles.reviewTitle}>BẢN ĐỀ XUẤT · {MODE_LABELS[budget.budgeting_mode as BudgetingMode] ?? 'Không xác định'}</Text><Text style={styles.reviewText}>Chạm một danh mục để chỉnh, sau đó áp dụng kế hoạch.</Text></View><Pressable onPress={() => void approve()} disabled={pending === 'approve'} style={styles.primaryButton}>{pending === 'approve' ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Áp dụng</Text>}</Pressable></View> : null}
    {(state === 'stale' || state === 'archived') ? <ModePicker mode={mode} setMode={setMode} /> : null}
    {(state === 'stale' || state === 'archived') && mode === 'custom' ? <CustomAllocationEditor categories={categories} customAmounts={customAmounts} setCustomAmounts={setCustomAmounts} /> : null}
    {(state === 'stale' || state === 'archived') ? <Pressable onPress={() => void generate()} disabled={pending === 'generate'} style={[styles.primaryButton, styles.generateButton]}>{pending === 'generate' ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Tạo bản đề xuất tháng này</Text>}</Pressable> : null}
    <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Ngân sách</Text><Text style={styles.sectionMeta}>{state === 'draft' ? 'Chạm để điều chỉnh phân bổ' : progress ? 'Kế hoạch và chi tiêu thực tế' : 'Các khoản đã lập'}</Text></View><Text style={styles.sectionValue}>{formatCompactVnd(allocated)}</Text></View>
    <View>{budget.allocations.map((item) => { const row = progress?.categories.find((entry) => entry.category_id === item.category_id); const used = row?.percentage_used ?? 0; const tone = used > 100 ? COLORS.oxblood : row?.near_limit ? COLORS.brass : COLORS.greenDeep; return <Pressable key={item.id} disabled={state !== 'draft'} onPress={() => { setEditing(item); setEditedAmount(String(Math.round(item.allocated_amount))); }} style={styles.categoryRow}><View style={styles.categoryIcon}><Ionicons name={used > 100 ? 'alert-circle-outline' : 'wallet-outline'} size={18} color={tone} /></View><View style={styles.categoryCopy}><View style={styles.categoryLine}><Text style={styles.categoryName}>{categoryName(item, names)}</Text><Text style={[styles.categoryBalance, { color: tone }]}>{row ? `${formatCompactVnd(row.remaining_amount)} còn lại` : ''}</Text></View><View style={styles.bar}><View style={[styles.barFill, { width: `${clamp(row ? used : 100)}%`, backgroundColor: tone }]} /></View><Text style={styles.categoryMeta}>{row ? `${formatCompactVnd(row.spent_amount)} đã chi · ${Math.round(used)}%` : 'Chưa có dữ liệu chi tiêu'}</Text></View><Text style={styles.categoryAmount}>{formatCompactVnd(item.allocated_amount)}</Text>{state === 'draft' ? <Ionicons name="create-outline" size={14} color={COLORS.greenDeep} /> : null}</Pressable>; })}</View>
    <View style={styles.goal}><View style={styles.goalHead}><Ionicons name="flag-outline" size={20} color={COLORS.greenDeep} /><View style={styles.goalCopy}><Text style={styles.eyebrow}>MỤC TIÊU CHÍNH</Text><Text style={styles.goalName}>{setup.primary_goal.name}</Text></View><Text style={styles.goalPercent}>{Math.round(goalPercent)}%</Text></View><View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${goalPercent}%` }]} /></View><View style={styles.goalAmounts}><Text style={styles.goalSaved}>Đã có {formatCompactVnd(setup.primary_goal.current_amount)}</Text><Text style={styles.goalTarget}>Đích {formatCompactVnd(setup.primary_goal.target_amount)}</Text></View></View>
    <Text style={styles.disclaimer}>Số liệu hiển thị từ kế hoạch đã lưu và các giao dịch đã đồng bộ.</Text>
  </ScrollView><EditModal editing={editing} names={names} progress={progress} amount={editedAmount} setAmount={setEditedAmount} onClose={() => setEditing(null)} onSave={saveAllocation} pending={pending === 'save'} budget={budget} /></SafeAreaView>;
}

function PlanStart({ mode, setMode, onGenerate, pending, error, categories, customAmounts, setCustomAmounts }: { mode: BudgetingMode; setMode: (mode: BudgetingMode) => void; onGenerate: () => void; pending: boolean; error: string | null; categories: BudgetCategory[]; customAmounts: Record<string, string>; setCustomAmounts: (value: Record<string, string>) => void }) { return <SafeAreaView style={styles.stateScreen} edges={['top']}><ScrollView contentContainerStyle={styles.startContent}><Text style={styles.eyebrow}>SỔ KẾ HOẠCH</Text><Text style={styles.stateTitle}>Bắt đầu kế hoạch tháng</Text><Text style={styles.stateText}>Chọn cách PocketPilot sẽ tạo bản đề xuất. Bạn luôn có thể xem lại trước khi áp dụng.</Text><ModePicker mode={mode} setMode={setMode} />{mode === 'custom' ? <View style={styles.customEditor}><Text style={styles.modeLabel}>PHÂN BỔ TÙY CHỈNH</Text>{categories.filter((item) => item.mapping_group !== 'savings').map((category) => <View key={category.id} style={styles.customRow}><Text style={styles.customName}>{category.name}</Text><TextInput value={customAmounts[category.id] ?? ''} onChangeText={(value) => setCustomAmounts({ ...customAmounts, [category.id]: value.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} style={styles.customInput} accessibilityLabel={`Phân bổ cho ${category.name}, đơn vị đồng`} /><Text style={styles.customCurrency}>₫</Text></View>)}<Text style={styles.modalNote}>Phần thu nhập chưa phân bổ sẽ được máy chủ ghi nhận là khoản tiết kiệm dự kiến.</Text></View> : null}<Pressable onPress={onGenerate} disabled={pending} style={[styles.primaryButton, styles.startButton]}>{pending ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Tạo bản đề xuất</Text>}</Pressable>{error ? <Text style={styles.inlineError}>{error}</Text> : null}</ScrollView></SafeAreaView>; }
function ModePicker({ mode, setMode }: { mode: BudgetingMode; setMode: (mode: BudgetingMode) => void }) { return <View style={styles.modeBlock}><Text style={styles.modeLabel}>CÁCH LẬP KẾ HOẠCH</Text>{MODES.map((item) => <Pressable key={item.value} onPress={() => setMode(item.value)} style={[styles.modeRow, mode === item.value && styles.modeRowActive]}><View style={styles.modeMark}>{mode === item.value ? <Ionicons name="checkmark" size={14} color={COLORS.parchment} /> : null}</View><View style={styles.modeCopy}><Text style={styles.modeTitle}>{item.title}</Text><Text style={styles.modeCaption}>{item.caption}</Text></View></Pressable>)}</View>; }
function CustomAllocationEditor({ categories, customAmounts, setCustomAmounts }: { categories: BudgetCategory[]; customAmounts: Record<string, string>; setCustomAmounts: (value: Record<string, string>) => void }) { return <View style={styles.customEditor}><Text style={styles.modeLabel}>PHÂN BỔ TÙY CHỈNH</Text>{categories.filter((item) => item.mapping_group !== 'savings').map((category) => <View key={category.id} style={styles.customRow}><Text style={styles.customName}>{category.name}</Text><TextInput value={customAmounts[category.id] ?? ''} onChangeText={(value) => setCustomAmounts({ ...customAmounts, [category.id]: value.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} style={styles.customInput} accessibilityLabel={`Phân bổ cho ${category.name}, đơn vị đồng`} /><Text style={styles.customCurrency}>₫</Text></View>)}<Text style={styles.modalNote}>Phần thu nhập chưa phân bổ sẽ được máy chủ ghi nhận là khoản tiết kiệm dự kiến.</Text></View>; }
function LedgerRow({ label, value, detail, last }: { label: string; value: string; detail?: string; last?: boolean }) { return <View style={[styles.ledgerRow, last && styles.ledgerLast]}><Text style={styles.ledgerLabel}>{label}</Text><Text style={styles.ledgerValue}>{detail ? `${detail} · ` : ''}{value}</Text></View>; }
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) { return <Pressable onPress={onDismiss} style={[styles.notice, styles.errorNotice]}><Ionicons name="alert-circle-outline" size={17} color={COLORS.oxblood} /><Text style={styles.noticeText}>{text}</Text><Ionicons name="close" size={16} color={COLORS.oxblood} /></Pressable>; }
function StateView({ icon, title, description, action, onAction, danger }: { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; action?: string; onAction?: () => void; danger?: boolean }) { return <SafeAreaView style={[styles.stateScreen, styles.centeredState]} edges={['top']}><Ionicons name={icon} size={34} color={danger ? COLORS.oxblood : COLORS.greenDeep} /><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{description}</Text>{action && onAction ? <Pressable onPress={onAction} style={[styles.primaryButton, styles.startButton]}><Text style={styles.primaryText}>{action}</Text></Pressable> : null}</SafeAreaView>; }
function EditModal({ editing, names, progress, amount, setAmount, onClose, onSave, pending, budget }: { editing: BudgetAllocation | null; names: Map<string, string>; progress: BudgetProgress | null; amount: string; setAmount: (value: string) => void; onClose: () => void; onSave: () => void; pending: boolean; budget: Budget | null }) { const row = progress?.categories.find((item) => item.category_id === editing?.category_id); const available = budget && editing ? budget.total_income - (budget.allocations.reduce((sum, item) => sum + item.allocated_amount, 0) - editing.allocated_amount) : 0; return <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalLabel}>CHI TIẾT DANH MỤC</Text><Pressable onPress={onClose}><Ionicons name="close" size={21} color={COLORS.ink} /></Pressable></View><View style={styles.modalNameRow}><View style={styles.categoryIcon}><Ionicons name="wallet-outline" size={19} color={COLORS.greenDeep} /></View><Text style={styles.modalName}>{editing ? categoryName(editing, names) : ''}</Text></View><Text style={styles.inputLabel}>NGÂN SÁCH THÁNG</Text><View style={styles.amountInputRow}><Text style={styles.currency}>₫</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" autoFocus style={styles.amountInput} accessibilityLabel="Mức ngân sách" /></View><LedgerRow label="Ngân sách còn có thể phân bổ" value={formatVnd(Math.max(available, 0))} /><LedgerRow label="Đã chi trong tháng" value={row ? formatVnd(row.spent_amount) : 'Chưa có dữ liệu'} /><LedgerRow label="Ngân sách hiện tại" value={editing ? formatVnd(editing.allocated_amount) : ''} last /><Text style={styles.modalNote}>PocketPilot sẽ gửi mức mới đến bản đề xuất và giữ tổng phân bổ trong giới hạn thu nhập.</Text><Pressable onPress={onSave} disabled={pending} style={[styles.primaryButton, styles.saveButton]}>{pending ? <ActivityIndicator color={COLORS.parchment} /> : <Text style={styles.primaryText}>Lưu thay đổi</Text>}</Pressable></View></View></Modal>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.parchment }, content: { padding: 20, paddingBottom: 34 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1.5, borderBottomColor: COLORS.borderStrong, paddingBottom: 7 }, eyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.3 }, title: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 27, textTransform: 'capitalize' }, subtitle: { color: COLORS.textSecondary, fontSize: 12, marginTop: 7 },
  gaugeBlock: { alignItems: 'center', paddingVertical: 26 }, gauge: { width: '82%', height: 15, borderWidth: 1, borderColor: COLORS.ink, backgroundColor: COLORS.parchmentDeep }, gaugeFill: { height: '100%', backgroundColor: COLORS.greenDeep }, gaugeLabel: { color: COLORS.textMuted, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.1, marginTop: 14 }, gaugeAmount: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 40, marginTop: 2 }, gaugeMeta: { color: COLORS.textSecondary, fontSize: 11 },
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
