import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite';
import { SpecialGothic_400Regular, SpecialGothic_700Bold } from '@expo-google-fonts/special-gothic';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DEMO_USER_ID, listBudgetCategories } from '@/services/api';
import {
  categorizeTransaction,
  createTransaction,
  deleteTransaction,
  listTransactions,
  scanReceipt,
  updateTransaction,
  type TransactionCreatePayload,
  type TransactionListParams,
} from '@/services/transactions';
import type { BudgetCategory, CategoryPrediction, ReceiptOCRResponse, Transaction } from '@/types';
import type { RootStackParamList } from '@/navigation/types';
import { formatDisplayMoney, type DisplayCurrency } from './AnalyticsDashboard';

type Props = {
  navigation: NativeStackScreenProps<RootStackParamList, 'TransactionLedger'>['navigation'];
  route: NativeStackScreenProps<RootStackParamList, 'TransactionLedger'>['route'];
};
type TransactionTypeFilter = '' | 'expense' | 'income';
type TransactionSourceFilter = '' | 'manual' | 'ocr';

const COLORS = {
  parchment: '#FAF2DC', parchmentDeep: '#EFE5C6', ink: '#1E2A32', green: '#23392E',
  oxblood: '#6E2B32', brass: '#C9A15C', rule: '#1E2A3247', muted: '#3A4750', paleGreen: '#DCE8D7',
};
const EMPTY_FORM: TransactionCreatePayload = {
  amount: 0, transaction_type: 'expense', merchant: '', category_id: '',
  transaction_date: new Date().toISOString().slice(0, 10), currency: 'USD', payment_method: 'cash', description: '', source: 'manual',
};
const FONTS = { display: 'InstrumentSerif_400Regular', body: 'SpecialGothic_400Regular', bodyBold: 'SpecialGothic_700Bold', mono: 'SpecialElite_400Regular' };

function formatMoney(value: number, currency = 'VND') {
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}
function parseAmountInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  const [whole = '', ...decimalParts] = normalized.split('.');
  const parsed = Number(decimalParts.length ? `${whole || '0'}.${decimalParts.join('')}` : whole);
  return Number.isFinite(parsed) ? parsed : 0;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export default function TransactionLedgerScreen({ navigation, route }: Props) {
  const [fontsLoaded] = useFonts({ InstrumentSerif_400Regular, SpecialGothic_400Regular, SpecialGothic_700Bold, SpecialElite_400Regular });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('USD');
  const [prediction, setPrediction] = useState<CategoryPrediction | null>(null);
  const [ocrPreview, setOcrPreview] = useState<ReceiptOCRResponse | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalText, setEditingOriginalText] = useState<{ merchant: string; description: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<TransactionTypeFilter>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('');
  const [filterSource, setFilterSource] = useState<TransactionSourceFilter>('');
  const [sortBy, setSortBy] = useState<'transaction_date' | 'amount' | 'merchant'>('transaction_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentParams = useCallback((currentPage = 1): TransactionListParams => ({ merchant: search || undefined, transaction_type: filterType || undefined, category_id: filterCategory || undefined, payment_method: filterPaymentMethod || undefined, source: filterSource || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, sort_by: sortBy, sort_order: sortOrder, page: currentPage, page_size: 20 }), [dateFrom, dateTo, filterCategory, filterPaymentMethod, filterSource, filterType, search, sortBy, sortOrder]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [transactionResponse, categoryResponse] = await Promise.all([
        listTransactions(currentParams(1)),
        listBudgetCategories(DEMO_USER_ID),
      ]);
      setTransactions(transactionResponse.items); setPage(1); setHasMore(transactionResponse.page < transactionResponse.total_pages);
      setTotalCount(transactionResponse.total); setCategories(categoryResponse);
      setForm((current) => ({ ...current, category_id: current.category_id || categoryResponse[0]?.id || '' }));
    } catch { setError('Could not load the ledger. Check the backend and your login session.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [currentParams]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 2800); return () => clearTimeout(timer); }, [notice]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await listTransactions(currentParams(page + 1));
      setTransactions((current) => [...current, ...response.items]); setPage(response.page); setHasMore(response.page < response.total_pages);
    } catch { setError('Could not load more transactions.'); } finally { setLoadingMore(false); }
  };
  const resetForm = useCallback(() => {
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || '' }); setPrediction(null); setOcrPreview(null); setReceiptUri(null); setEditingId(null); setEditingOriginalText(null);
  }, [categories]);

  const openNewForm = useCallback(() => {
    resetForm();
    setError(null);
    setShowForm(true);
  }, [resetForm]);

  const editTransaction = (transaction: Transaction) => {
    setEditingId(transaction.id); setEditingOriginalText({ merchant: transaction.merchant, description: transaction.description || '' }); setPrediction(null); setOcrPreview(null); setReceiptUri(null);
    setForm({ amount: Number(transaction.amount), transaction_type: transaction.transaction_type, merchant: transaction.merchant, category_id: transaction.category_id, transaction_date: transaction.transaction_date, currency: transaction.currency, payment_method: transaction.payment_method || 'cash', description: transaction.description || '', source: transaction.source, receipt_reference: transaction.receipt_reference || undefined });
    setError(null); setShowForm(true);
  };
  const submit = async () => {
    if (!form.merchant.trim() || form.amount <= 0 || !form.category_id) { setError('Enter a merchant, amount, and category.'); return; }
    if (!/^[A-Z]{3}$/.test(form.currency) || !validDate(form.transaction_date)) { setError('Use a three-letter currency code and date format YYYY-MM-DD.'); return; }
    setSaving(true); setError(null);
    try {
      let suggestionForSave = prediction;
      let payload: TransactionCreatePayload = { ...form, amount: Number(form.amount), merchant: form.merchant.trim() };
      if (editingId && editingOriginalText && (payload.merchant !== editingOriginalText.merchant || (payload.description || '') !== editingOriginalText.description)) {
        const refreshedPrediction = await categorizeTransaction({ merchant: payload.merchant, description: payload.description || undefined, transaction_type: payload.transaction_type, items: ocrPreview?.items });
        suggestionForSave = refreshedPrediction;
        setPrediction(refreshedPrediction);
        payload = { ...payload, category_id: refreshedPrediction.category_id };
      }
      if (suggestionForSave) {
        payload = {
          ...payload,
          suggested_category_id: suggestionForSave.category_id,
          category_suggestion_source: suggestionForSave.source,
          category_suggestion_confidence: suggestionForSave.confidence,
          category_suggestion_accepted: payload.category_id === suggestionForSave.category_id,
        };
      }
      if (editingId) await updateTransaction(editingId, payload); else await createTransaction(payload);
      resetForm(); setShowForm(false); setNotice(editingId ? 'Transaction updated.' : 'Transaction saved.'); await load();
    } catch { setError('Could not save the transaction. Check the category and login session.'); } finally { setSaving(false); }
  };

  const scanReceiptImage = async (source: 'camera' | 'library') => {
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError(`${source === 'camera' ? 'Camera' : 'Photo library'} permission is required to scan a receipt.`); return; }
    const pickerOptions = { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 } as const;
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(pickerOptions) : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0]; setScanning(true); setError(null); setShowForm(true); setReceiptUri(asset.uri);
    try {
      const preview = await scanReceipt({ uri: asset.uri, name: asset.fileName || `receipt-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' });
      setOcrPreview(preview);
      setForm((current) => ({ ...current, amount: preview.amount ? Number(preview.amount) : current.amount, merchant: preview.merchant || current.merchant, transaction_date: preview.transaction_date || current.transaction_date, currency: preview.currency || current.currency || 'USD', category_id: preview.suggested_category?.category_id || current.category_id, source: 'ocr', receipt_reference: preview.receipt_reference || undefined }));
      setPrediction(preview.suggested_category || null);
      if (!preview.merchant && !preview.amount) setError('Receipt scanned, but no transaction fields were detected.');
      if (!preview.currency) setError('Currency was not detected. Review and enter it before saving.');
    } catch { setError('Could not scan the receipt. Check the image and backend connection.'); } finally { setScanning(false); }
  };
  const chooseReceiptSource = () => Alert.alert('Scan receipt', 'Choose how to add the receipt image.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Camera', onPress: () => void scanReceiptImage('camera') }, { text: 'Photo library', onPress: () => void scanReceiptImage('library') }]);

  useEffect(() => {
    const mode = route.params?.mode;
    if (!mode || !fontsLoaded) return;
    openNewForm();
    if (mode === 'scan') {
      const timer = setTimeout(chooseReceiptSource, 250);
      navigation.setParams({ mode: undefined });
      return () => clearTimeout(timer);
    }
    navigation.setParams({ mode: undefined });
  }, [fontsLoaded, navigation, openNewForm, route.params?.mode]);

  if (!fontsLoaded) return <SafeAreaView style={styles.safeArea}><View style={styles.center}><ActivityIndicator color={COLORS.green} /></View></SafeAreaView>;
  const suggestCategory = async () => {
    if (!form.merchant.trim()) { setError('Enter a merchant before requesting a category suggestion.'); return; }
    setCategorizing(true); setError(null);
    try { const result = await categorizeTransaction({ merchant: form.merchant.trim(), description: form.description || undefined, transaction_type: form.transaction_type, items: ocrPreview?.items }); setPrediction(result); setForm((current) => ({ ...current, category_id: result.category_id })); }
    catch { setError('AI categorization is unavailable. Choose a category manually.'); } finally { setCategorizing(false); }
  };
  const remove = (transaction: Transaction) => Alert.alert('Delete transaction?', `${transaction.merchant} · ${formatDisplayMoney(Number(transaction.amount), transaction.currency, displayCurrency)}`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteTransaction(transaction.id); setNotice('Transaction deleted.'); await load(); } catch { setError('Could not delete the transaction.'); } } }]);
  const applyFilters = () => { setSearch(searchDraft.trim()); setShowFilters(false); };
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}><Pressable onPress={() => navigation.goBack()} hitSlop={10}><Ionicons name="arrow-back" size={22} color={COLORS.ink} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>PERSONAL LEDGER</Text><Text style={styles.title}>Transactions</Text></View><View style={styles.headerSpacer} /></View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
          {notice ? <View style={styles.notice}><Ionicons name="checkmark-circle-outline" size={17} color={COLORS.green} /><Text style={styles.noticeText}>{notice}</Text></View> : null}
          <View style={styles.toolbar}><Text style={styles.countLabel}>{totalCount} ENTRIES</Text><View style={styles.toolbarActions}><Pressable onPress={() => setShowFilters((value) => !value)} style={styles.filterButton}><Ionicons name="options-outline" size={17} color={COLORS.green} /><Text style={styles.filterButtonText}>Filter</Text></Pressable><Pressable onPress={() => (showForm ? (setShowForm(false), resetForm()) : openNewForm())} style={styles.addButton}><Ionicons name={showForm ? 'close' : 'add'} size={18} color={COLORS.parchment} /><Text style={styles.addButtonText}>{showForm ? 'Close' : 'Add'}</Text></Pressable></View></View>
          {showFilters ? <View style={styles.filterCard}><View style={styles.searchRow}><Ionicons name="search-outline" size={17} color={COLORS.muted} /><TextInput value={searchDraft} onChangeText={setSearchDraft} onSubmitEditing={applyFilters} placeholder="Search merchant" placeholderTextColor={`${COLORS.ink}88`} style={styles.searchInput} returnKeyType="search" /></View><TextInput value={filterPaymentMethod} onChangeText={setFilterPaymentMethod} placeholder="Payment method (cash, card...)" placeholderTextColor={`${COLORS.ink}88`} style={styles.filterInput} /><Text style={styles.fieldLabel}>SORT BY</Text><View style={styles.chipRow}>{([['transaction_date', 'Date'], ['amount', 'Amount'], ['merchant', 'Merchant']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setSortBy(value)} style={[styles.smallChip, sortBy === value && styles.smallChipActive]}><Text style={[styles.smallChipText, sortBy === value && styles.smallChipTextActive]}>{label}</Text></Pressable>)}<Pressable onPress={() => setSortOrder((value) => value === 'desc' ? 'asc' : 'desc')} style={styles.orderButton}><Ionicons name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'} size={14} color={COLORS.green} /><Text style={styles.orderButtonText}>{sortOrder === 'desc' ? 'DESC' : 'ASC'}</Text></Pressable></View><Text style={styles.fieldLabel}>TYPE</Text><View style={styles.chipRow}>{([['', 'All'], ['expense', 'Expense'], ['income', 'Income']] as const).map(([value, label]) => <Pressable key={value || 'all'} onPress={() => setFilterType(value)} style={[styles.smallChip, filterType === value && styles.smallChipActive]}><Text style={[styles.smallChipText, filterType === value && styles.smallChipTextActive]}>{label}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>SOURCE</Text><View style={styles.chipRow}>{([['', 'All'], ['manual', 'Manual'], ['ocr', 'OCR']] as const).map(([value, label]) => <Pressable key={value || 'all-source'} onPress={() => setFilterSource(value)} style={[styles.smallChip, filterSource === value && styles.smallChipActive]}><Text style={[styles.smallChipText, filterSource === value && styles.smallChipTextActive]}>{label}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>CATEGORY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}><Pressable onPress={() => setFilterCategory('')} style={[styles.smallChip, !filterCategory && styles.smallChipActive]}><Text style={[styles.smallChipText, !filterCategory && styles.smallChipTextActive]}>All</Text></Pressable>{categories.map((item) => <Pressable key={item.id} onPress={() => setFilterCategory(item.id)} style={[styles.smallChip, filterCategory === item.id && styles.smallChipActive]}><Text style={[styles.smallChipText, filterCategory === item.id && styles.smallChipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView><View style={styles.dateRow}><TextInput value={dateFrom} onChangeText={setDateFrom} placeholder="From YYYY-MM-DD" placeholderTextColor={`${COLORS.ink}88`} style={styles.dateInput} /><TextInput value={dateTo} onChangeText={setDateTo} placeholder="To YYYY-MM-DD" placeholderTextColor={`${COLORS.ink}88`} style={styles.dateInput} /></View><Pressable onPress={applyFilters} style={styles.applyButton}><Text style={styles.applyButtonText}>Apply filters</Text></Pressable></View> : null}
          {showForm ? <View style={styles.formCard}><Text style={styles.formTitle}>{editingId ? 'Edit entry' : 'New entry'}</Text><Pressable onPress={chooseReceiptSource} disabled={scanning} style={styles.receiptButton}>{scanning ? <ActivityIndicator size="small" color={COLORS.green} /> : <Ionicons name="scan-outline" size={16} color={COLORS.green} />}<Text style={styles.receiptButtonText}>{scanning ? 'Scanning receipt...' : 'Scan receipt'}</Text></Pressable>{receiptUri ? <View style={styles.receiptReview}><Image source={{ uri: receiptUri }} style={styles.receiptImage} /><View style={styles.receiptReviewCopy}><Text style={styles.sectionEyebrow}>RECEIPT REVIEW</Text><Text style={styles.receiptReviewText}>{ocrPreview?.confidence ? `OCR confidence ${Math.round(ocrPreview.confidence)}%` : 'Review extracted fields before saving.'}</Text>{ocrPreview?.items?.length ? <Text style={styles.receiptReviewText}>{ocrPreview.items.length} line items detected</Text> : null}{ocrPreview?.subtotal ? <Text style={styles.receiptReviewText}>Subtotal: {formatMoney(Number(ocrPreview.subtotal), form.currency || '—')}</Text> : null}{ocrPreview?.tax ? <Text style={styles.receiptReviewText}>Tax: {formatMoney(Number(ocrPreview.tax), form.currency || '—')}</Text> : null}{ocrPreview?.raw_text ? <Text style={styles.receiptRawText} numberOfLines={8}>{ocrPreview.raw_text}</Text> : null}</View></View> : null}<View style={styles.typeRow}>{(['expense', 'income'] as const).map((type) => <Pressable key={type} onPress={() => setForm((current) => ({ ...current, transaction_type: type }))} style={[styles.typeButton, form.transaction_type === type && styles.typeButtonActive]}><Text style={[styles.typeText, form.transaction_type === type && styles.typeTextActive]}>{type.toUpperCase()}</Text></Pressable>)}</View><TextInput value={form.amount ? String(form.amount) : ''} onChangeText={(value) => setForm((current) => ({ ...current, amount: parseAmountInput(value) }))} placeholder="Amount" placeholderTextColor={`${COLORS.ink}99`} keyboardType="numeric" style={styles.input} /><TextInput value={form.currency} onChangeText={(currency) => setForm((current) => ({ ...current, currency: currency.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) }))} placeholder="Currency code (VND, USD, EUR...)" placeholderTextColor={`${COLORS.ink}99`} autoCapitalize="characters" maxLength={3} style={styles.input} /><TextInput value={form.merchant} onChangeText={(merchant) => setForm((current) => ({ ...current, merchant }))} placeholder="Merchant / income source" placeholderTextColor={`${COLORS.ink}99`} style={styles.input} /><TextInput value={form.payment_method || ''} onChangeText={(payment_method) => setForm((current) => ({ ...current, payment_method }))} placeholder="Payment method (cash, card, bank...)" placeholderTextColor={`${COLORS.ink}99`} style={styles.input} /><TextInput value={form.description} onChangeText={(description) => setForm((current) => ({ ...current, description }))} placeholder="Description (optional)" placeholderTextColor={`${COLORS.ink}99`} style={styles.input} /><Pressable onPress={() => void suggestCategory()} disabled={categorizing} style={styles.suggestButton}>{categorizing ? <ActivityIndicator size="small" color={COLORS.green} /> : <Ionicons name="sparkles-outline" size={16} color={COLORS.green} />}<Text style={styles.suggestButtonText}>Suggest category with AI</Text></Pressable>{prediction ? <View style={styles.predictionCard}><Text style={styles.predictionEyebrow}>CATEGORY SUGGESTION · REVIEW</Text><View style={styles.predictionRow}><Text style={styles.predictionName}>{prediction.category_name}</Text><Text style={styles.predictionConfidence}>{Math.round(prediction.confidence * 100)}%</Text></View><Text style={styles.predictionRationale}>{prediction.rationale}</Text>{prediction.alternatives.length ? <Text style={styles.predictionAlternatives}>Alternatives: {prediction.alternatives.map((item) => item.category_name).join(' · ')}</Text> : null}<Text style={styles.predictionSource}>{prediction.source === 'rules' ? 'Local fallback · review before saving' : 'AI suggestion · review before saving'}</Text></View> : null}<TextInput value={form.transaction_date} onChangeText={(transaction_date) => setForm((current) => ({ ...current, transaction_date }))} placeholder="Transaction date (YYYY-MM-DD)" placeholderTextColor={`${COLORS.ink}99`} style={styles.input} /><Text style={styles.fieldLabel}>CATEGORY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{categories.map((item) => <Pressable key={item.id} onPress={() => setForm((current) => ({ ...current, category_id: item.id }))} style={[styles.categoryChip, form.category_id === item.id && styles.categoryChipActive]}><Text style={[styles.categoryText, form.category_id === item.id && styles.categoryTextActive]}>{item.name}</Text></Pressable>)}</ScrollView><Pressable onPress={submit} disabled={saving} style={styles.saveButton}>{saving ? <ActivityIndicator color={COLORS.parchment} /> : null}<Text style={styles.saveText}>{editingId ? 'Update transaction' : 'Save transaction'}</Text></Pressable></View> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <View style={styles.center}><ActivityIndicator color={COLORS.green} /></View> : transactions.length ? <View style={styles.list}>{transactions.map((item) => { const isIncome = item.transaction_type === 'income'; const category = categories.find((candidate) => candidate.id === item.category_id); const expanded = expandedId === item.id; return <View key={item.id} style={styles.rowWrap}><Pressable onPress={() => setExpandedId(expanded ? null : item.id)} style={styles.row}><View style={[styles.rowIcon, isIncome && styles.rowIconIncome]}><Ionicons name={isIncome ? 'arrow-down' : 'arrow-up'} size={18} color={COLORS.green} /></View><View style={styles.rowCopy}><Text style={styles.merchant} numberOfLines={1}>{item.merchant}</Text><Text style={styles.meta}>{category?.name || 'Uncategorized'} · {item.transaction_date} · Original {item.currency}</Text></View><View style={styles.rowRight}><Text style={[styles.amount, isIncome && styles.amountIncome]}>{isIncome ? '+' : '-'}{formatDisplayMoney(Number(item.amount), item.currency, displayCurrency)}</Text><View style={styles.rowActions}><Pressable onPress={() => editTransaction(item)} hitSlop={8}><Ionicons name="pencil-outline" size={18} color={COLORS.muted} /></Pressable><Pressable onPress={() => remove(item)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={COLORS.oxblood} /></Pressable></View></View></Pressable>{expanded ? <View style={styles.detailRow}><Text style={styles.detailText}>Payment: {item.payment_method || 'Not specified'} · Source: {item.source.toUpperCase()}</Text>{item.receipt_reference ? <Text style={styles.detailText}>Original receipt preserved.</Text> : null}{item.description ? <Text style={styles.detailText}>{item.description}</Text> : null}</View> : null}</View>; })}{hasMore ? <Pressable onPress={() => void loadMore()} disabled={loadingMore} style={styles.loadMore}>{loadingMore ? <ActivityIndicator color={COLORS.green} /> : <Text style={styles.loadMoreText}>Load more transactions</Text>}</Pressable> : null}</View> : <View style={styles.emptyList}><View style={styles.emptyState}><Ionicons name="receipt-outline" size={32} color={COLORS.green} /><Text style={styles.emptyTitle}>Your ledger is empty</Text><Text style={styles.emptyText}>Add your first transaction to start tracking spending.</Text></View></View>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.parchment }, container: { flex: 1 }, scroll: { flex: 1 }, scrollContent: { flexGrow: 1, paddingBottom: 64 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1.5, borderBottomColor: COLORS.ink }, headerSpacer: { width: 22 }, headerCopy: { flex: 1, marginHorizontal: 16 }, eyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.5 }, title: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 25, marginTop: 3 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 }, toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, countLabel: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.2 }, addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.green, paddingHorizontal: 12, paddingVertical: 9 }, addButtonText: { color: COLORS.parchment, fontFamily: FONTS.bodyBold, fontSize: 13 }, filterButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: COLORS.green, paddingHorizontal: 10, paddingVertical: 8 }, filterButtonText: { color: COLORS.green, fontFamily: FONTS.bodyBold, fontSize: 12 },
  filterCard: { marginHorizontal: 20, marginBottom: 12, padding: 14, borderWidth: 1, borderColor: COLORS.rule, backgroundColor: COLORS.parchmentDeep }, searchRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.ink, marginBottom: 12 }, searchInput: { flex: 1, minHeight: 38, marginLeft: 7, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 14 }, filterInput: { minHeight: 38, borderBottomWidth: 1, borderBottomColor: COLORS.ink, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 13, marginBottom: 12 }, chipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 }, filterChips: { marginBottom: 10 }, smallChip: { borderWidth: 1, borderColor: COLORS.rule, paddingHorizontal: 10, paddingVertical: 7, marginRight: 7 }, smallChipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink }, smallChipText: { color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11 }, smallChipTextActive: { color: COLORS.parchment, fontFamily: FONTS.bodyBold }, orderButton: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: COLORS.green, paddingHorizontal: 8, paddingVertical: 7 }, orderButtonText: { color: COLORS.green, fontFamily: FONTS.mono, fontSize: 9 }, dateRow: { flexDirection: 'row', gap: 10 }, dateInput: { flex: 1, minHeight: 38, borderBottomWidth: 1, borderBottomColor: COLORS.ink, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12 }, applyButton: { alignItems: 'center', backgroundColor: COLORS.green, paddingVertical: 10, marginTop: 13 }, applyButtonText: { color: COLORS.parchment, fontFamily: FONTS.bodyBold, fontSize: 12 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 20, marginTop: 12, padding: 10, backgroundColor: COLORS.paleGreen }, noticeText: { color: COLORS.green, fontFamily: FONTS.bodyBold, fontSize: 12 },
  dashboardCard: { marginHorizontal: 20, marginBottom: 12, padding: 16, backgroundColor: COLORS.green }, dashboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dashboardEyebrow: { color: COLORS.brass, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.5 }, dashboardSubhead: { color: COLORS.parchment, fontFamily: FONTS.body, fontSize: 11, opacity: 0.75, marginTop: 4 }, periodToggle: { flexDirection: 'row', borderWidth: 1, borderColor: `${COLORS.parchment}66` }, periodChip: { paddingHorizontal: 7, paddingVertical: 4 }, periodChipActive: { backgroundColor: COLORS.parchment }, periodChipText: { color: COLORS.parchment, fontFamily: FONTS.mono, fontSize: 8 }, periodChipTextActive: { color: COLORS.green }, currencySummary: { marginTop: 13 }, currencyLabel: { color: COLORS.parchment, fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 1 }, dashboardMetrics: { flexDirection: 'row', marginTop: 7 }, dashboardMetric: { flex: 1, paddingRight: 8 }, dashboardLabel: { color: COLORS.parchment, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1, opacity: 0.8 }, dashboardValue: { color: COLORS.parchment, fontFamily: FONTS.bodyBold, fontSize: 13, marginTop: 5 }, incomeValue: { color: '#BFE4B7' }, expenseValue: { color: '#F0B1A8' }, dashboardFootnote: { color: COLORS.parchment, fontFamily: FONTS.body, fontSize: 11, opacity: 0.75, marginTop: 14 },
  insightCard: { marginHorizontal: 20, marginBottom: 12, padding: 14, borderWidth: 1, borderColor: COLORS.rule, backgroundColor: COLORS.parchmentDeep }, sectionEyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1.3 }, barBlock: { marginTop: 11 }, barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, barLabel: { flex: 1, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12 }, barValue: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10 }, barTrack: { height: 8, marginTop: 5, borderWidth: 1, borderColor: COLORS.ink }, barFill: { height: '100%', backgroundColor: COLORS.green }, barFillBrass: { backgroundColor: COLORS.brass }, chartFrame: { flexDirection: 'row', alignItems: 'flex-end', height: 132, gap: 8, marginTop: 14, marginBottom: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.rule }, chartColumnWrap: { flex: 1, alignItems: 'center', minWidth: 0 }, chartBarArea: { width: '100%', height: 104, justifyContent: 'flex-end', alignItems: 'center' }, chartColumn: { width: '68%', minHeight: 8, backgroundColor: COLORS.green }, chartColumnBrass: { backgroundColor: COLORS.brass }, chartLabel: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 8, marginTop: 7, maxWidth: 58 },
  formCard: { marginHorizontal: 20, marginBottom: 12, padding: 16, backgroundColor: COLORS.parchmentDeep, borderWidth: 1, borderColor: COLORS.ink }, formTitle: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 22, marginBottom: 12 }, receiptButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.green, backgroundColor: COLORS.parchment, marginBottom: 10 }, receiptButtonText: { color: COLORS.green, fontFamily: FONTS.bodyBold, fontSize: 12 }, receiptReview: { flexDirection: 'row', gap: 10, padding: 9, backgroundColor: COLORS.parchment, borderLeftWidth: 3, borderLeftColor: COLORS.brass, marginBottom: 12 }, receiptImage: { width: 72, height: 92, backgroundColor: COLORS.parchmentDeep }, receiptReviewCopy: { flex: 1, paddingTop: 2 }, receiptReviewText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, lineHeight: 16, marginTop: 4 }, receiptRawText: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 9, lineHeight: 13, marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: COLORS.rule }, typeRow: { flexDirection: 'row', marginBottom: 8 }, typeButton: { borderWidth: 1, borderColor: COLORS.rule, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 }, typeButtonActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink }, typeText: { color: COLORS.ink, fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1 }, typeTextActive: { color: COLORS.parchment }, input: { minHeight: 42, borderBottomWidth: 1, borderBottomColor: COLORS.ink, color: COLORS.ink, fontFamily: FONTS.body, fontSize: 15, marginBottom: 10 }, fieldLabel: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1, marginTop: 2, marginBottom: 8 }, categoryChip: { borderWidth: 1, borderColor: COLORS.rule, paddingHorizontal: 10, paddingVertical: 8, marginRight: 7 }, categoryChipActive: { backgroundColor: COLORS.brass, borderColor: COLORS.ink }, categoryText: { color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12 }, categoryTextActive: { fontFamily: FONTS.bodyBold }, saveButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: COLORS.oxblood, marginTop: 16 }, saveText: { color: COLORS.parchment, fontFamily: FONTS.bodyBold, fontSize: 14 }, suggestButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.green, backgroundColor: COLORS.parchment, marginBottom: 12 }, suggestButtonText: { color: COLORS.green, fontFamily: FONTS.bodyBold, fontSize: 12 }, predictionCard: { borderLeftWidth: 3, borderLeftColor: COLORS.brass, backgroundColor: COLORS.parchment, padding: 10, marginBottom: 12 }, predictionEyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 1 }, predictionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }, predictionName: { color: COLORS.ink, fontFamily: FONTS.bodyBold, fontSize: 16 }, predictionConfidence: { color: COLORS.green, fontFamily: FONTS.bodyBold, fontSize: 13 }, predictionRationale: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, lineHeight: 16, marginTop: 4 }, predictionAlternatives: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, lineHeight: 14, marginTop: 4 }, predictionSource: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10, marginTop: 5 },
  error: { color: COLORS.oxblood, fontFamily: FONTS.body, marginHorizontal: 20, marginBottom: 8, fontSize: 13 }, center: { justifyContent: 'center', alignItems: 'center', padding: 28 }, list: { paddingHorizontal: 20, paddingBottom: 24 }, rowWrap: { borderBottomWidth: 1, borderBottomColor: COLORS.rule }, row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 }, rowIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.parchmentDeep, borderWidth: 1, borderColor: COLORS.ink }, rowIconIncome: { backgroundColor: COLORS.paleGreen }, rowCopy: { flex: 1, marginHorizontal: 12 }, merchant: { color: COLORS.ink, fontFamily: FONTS.bodyBold, fontSize: 16 }, meta: { color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 10, marginTop: 4 }, rowRight: { alignItems: 'flex-end', gap: 6 }, rowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 }, amount: { color: COLORS.oxblood, fontFamily: FONTS.bodyBold, fontSize: 13 }, amountIncome: { color: COLORS.green }, detailRow: { padding: 10, marginBottom: 10, backgroundColor: COLORS.parchmentDeep }, detailText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, lineHeight: 17 }, loadMore: { alignItems: 'center', borderWidth: 1, borderColor: COLORS.green, paddingVertical: 11, marginTop: 14 }, loadMoreText: { color: COLORS.green, fontFamily: FONTS.bodyBold, fontSize: 12 }, recentCard: { marginHorizontal: 20, marginBottom: 20, padding: 14, borderTopWidth: 1, borderTopColor: COLORS.rule }, recentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.rule }, recentMerchant: { color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12 }, recentAmount: { color: COLORS.oxblood, fontFamily: FONTS.bodyBold, fontSize: 12 }, emptyList: { justifyContent: 'center', padding: 28 }, emptyState: { alignItems: 'center', padding: 24 }, emptyTitle: { color: COLORS.ink, fontFamily: FONTS.display, fontSize: 22, marginTop: 12 }, emptyText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 7 },
});
