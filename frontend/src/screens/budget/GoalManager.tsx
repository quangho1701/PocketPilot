import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOAL_TYPES, goalTypeLabel } from '@/constants/goals';
import { createPlanGoal, deletePlanGoal, listPlanGoals, updatePlanGoal } from '@/services/budget';
import { COLORS, FONTS } from '@/theme';
import type { PlanGoal, PlanGoalInput } from '@/types/budget';
import { formatCompactUsd } from '@/utils/finance';

const clamp = (value: number) => Math.max(0, Math.min(value, 100));
const digits = (value: string) => value.replace(/[^0-9]/g, '');

export default function GoalManager() {
  const [goals, setGoals] = useState<PlanGoal[]>([]);
  const [editing, setEditing] = useState<PlanGoal | 'new' | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [goalType, setGoalType] = useState('other');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setGoals(await listPlanGoals()), []);
  useEffect(() => { void load(); }, [load]);

  const open = (goal: PlanGoal | 'new') => {
    setEditing(goal);
    setName(goal === 'new' ? '' : goal.name);
    setTarget(goal === 'new' ? '' : String(Math.round(goal.target_amount)));
    setCurrent(goal === 'new' ? '0' : String(Math.round(goal.current_amount)));
    setDeadline(goal === 'new' ? '' : goal.target_date?.slice(0, 10) ?? '');
    setGoalType(goal === 'new' ? 'other' : goal.goal_type);
    setIsPrimary(goal === 'new' ? goals.length === 0 : goal.is_primary);
    setConfirmingDelete(false);
    setError(null);
  };

  const close = () => { if (!saving) setEditing(null); };

  const save = async () => {
    const targetAmount = Number(digits(target));
    const currentAmount = Number(digits(current));
    if (!name.trim() || targetAmount <= 0) { setError('Enter a goal name and a target greater than zero.'); return; }
    if (currentAmount > targetAmount) { setError('Current savings cannot be greater than the target.'); return; }
    if (deadline && !/^\d{4}-\d{2}(-\d{2})?$/.test(deadline)) { setError('Use YYYY-MM or YYYY-MM-DD for the deadline.'); return; }
    const payload: PlanGoalInput = {
      name: name.trim(), target_amount: targetAmount, current_amount: currentAmount,
      target_date: deadline ? (deadline.length === 7 ? `${deadline}-01` : deadline) : null,
      goal_type: goalType, is_primary: isPrimary,
    };
    setSaving(true); setError(null);
    try {
      if (editing === 'new') await createPlanGoal(payload);
      else if (editing) await updatePlanGoal(editing.id, payload);
      await load(); setEditing(null);
    } catch { setError('The goal could not be saved. Please try again.'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!editing || editing === 'new') return;
    setSaving(true); setError(null);
    try { setGoals(await deletePlanGoal(editing.id)); setEditing(null); }
    catch { setError('The goal could not be deleted. Please try again.'); }
    finally { setSaving(false); }
  };

  return <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View><Text style={styles.sectionTitle}>Goals</Text><Text style={styles.sectionMeta}>{goals.length ? `${goals.length} active` : 'No goals yet'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add Goal" style={styles.add} onPress={() => open('new')}><Ionicons name="add" size={16} color={COLORS.ink}/><Text style={styles.addText}>Add Goal</Text></Pressable>
    </View>
    {!goals.length ? <Pressable onPress={() => open('new')} style={styles.empty}><Ionicons name="flag-outline" size={22} color={COLORS.greenDeep}/><Text style={styles.emptyTitle}>Add a financial goal</Text><Text style={styles.emptyText}>Track a target, current savings, and deadline from your Plan.</Text></Pressable> : null}
    {goals.map((goal) => { const percent = goal.target_amount ? clamp(goal.current_amount / goal.target_amount * 100) : 0; return <Pressable key={goal.id} accessibilityRole="button" accessibilityLabel={`Edit goal ${goal.name}`} style={styles.goal} onPress={() => open(goal)}>
      <View style={styles.goalHead}><Ionicons name={GOAL_TYPES.find((type) => type.value === goal.goal_type)?.icon ?? 'flag-outline'} size={20} color={COLORS.greenDeep}/><View style={styles.goalCopy}><Text style={styles.eyebrow}>{goal.is_primary ? 'PRIMARY GOAL' : goalTypeLabel(goal.goal_type).toUpperCase()}</Text><Text style={styles.goalName}>{goal.name}</Text></View><Text style={styles.goalPercent}>{Math.round(percent)}%</Text><Ionicons name="create-outline" size={15} color={COLORS.inkSoft}/></View>
      <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]}/></View><View style={styles.amounts}><Text style={styles.saved}>Saved {formatCompactUsd(goal.current_amount)}</Text><Text style={styles.target}>Target {formatCompactUsd(goal.target_amount)}</Text></View>
    </Pressable>; })}
    <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={close}><View style={styles.backdrop}><View style={styles.modal}>
      <View style={styles.modalHeader}><Text style={styles.modalTitle}>{confirmingDelete ? 'Delete Goal?' : editing === 'new' ? 'Add Goal' : 'Edit Goal'}</Text><Pressable accessibilityLabel="Close goal editor" onPress={close}><Ionicons name="close" size={23} color={COLORS.inkSoft}/></Pressable></View>
      {confirmingDelete && editing !== 'new' ? <View style={styles.confirmBody}><Ionicons name="warning-outline" size={30} color={COLORS.oxblood}/><Text style={styles.confirmTitle}>Delete “{editing?.name}”?</Text><Text style={styles.confirmText}>This removes the goal from your Plan. If it is primary, the oldest remaining goal will become primary.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.confirmActions}><Pressable disabled={saving} onPress={() => setConfirmingDelete(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={() => void remove()} style={styles.deleteConfirm}>{saving ? <ActivityIndicator color={COLORS.parchment}/> : <Text style={styles.primaryText}>Delete Goal</Text>}</Pressable></View></View> :
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <Text style={styles.label}>GOAL NAME</Text><TextInput value={name} onChangeText={setName} placeholder="e.g. New laptop" placeholderTextColor={COLORS.textMuted} style={styles.input}/>
        <Text style={styles.label}>TARGET AMOUNT</Text><MoneyInput value={target} onChange={setTarget}/>
        <Text style={styles.label}>CURRENT / SAVED AMOUNT</Text><MoneyInput value={current} onChange={setCurrent}/>
        <Text style={styles.label}>DEADLINE</Text><TextInput value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textMuted} style={styles.input}/>
        <Text style={styles.label}>GOAL TYPE / CATEGORY</Text><View style={styles.types}>{GOAL_TYPES.map((type) => <Pressable key={type.value} onPress={() => setGoalType(type.value)} style={[styles.type, goalType === type.value && styles.typeActive]}><Ionicons name={type.icon} size={17} color={goalType === type.value ? COLORS.parchment : COLORS.greenDeep}/><Text style={[styles.typeText, goalType === type.value && styles.typeTextActive]}>{type.label}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isPrimary }} onPress={() => setIsPrimary(true)} style={[styles.primaryChoice, isPrimary && styles.primaryChoiceActive]}><View style={styles.check}>{isPrimary ? <Ionicons name="checkmark" size={14} color={COLORS.parchment}/> : null}</View><View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{isPrimary ? 'Primary goal' : 'Set as Primary'}</Text><Text style={styles.choiceText}>The assistant uses this as the default when a primary goal is needed. Setting it will replace the current primary.</Text></View></Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void save()} disabled={saving} style={styles.save}>{saving ? <ActivityIndicator color={COLORS.parchment}/> : <Text style={styles.primaryText}>Save Goal</Text>}</Pressable>
        {editing !== 'new' ? <Pressable disabled={saving} onPress={() => { setError(null); setConfirmingDelete(true); }} style={styles.deleteButton}><Ionicons name="trash-outline" size={16} color={COLORS.oxblood}/><Text style={styles.deleteText}>Delete Goal</Text></Pressable> : null}
      </ScrollView>}
    </View></View></Modal>
  </View>;
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <View style={styles.money}><Text style={styles.currency}>$</Text><TextInput value={value} onChangeText={(text) => onChange(digits(text))} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} style={styles.moneyInput}/></View>;
}

const styles = StyleSheet.create({
  section:{marginTop:24}, sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',borderBottomWidth:1.5,borderBottomColor:COLORS.borderStrong,paddingBottom:7}, sectionTitle:{color:COLORS.ink,fontFamily:FONTS.display,fontSize:22}, sectionMeta:{color:COLORS.textMuted,fontSize:9.5,marginTop:2}, add:{flexDirection:'row',alignItems:'center',paddingVertical:7}, addText:{color:COLORS.ink,fontSize:10,fontWeight:'700',marginLeft:3}, empty:{alignItems:'center',borderWidth:1,borderColor:COLORS.border,marginTop:14,padding:18}, emptyTitle:{color:COLORS.ink,fontWeight:'700',marginTop:7},emptyText:{color:COLORS.textSecondary,fontSize:10,textAlign:'center',marginTop:4},
  goal:{borderBottomWidth:1,borderColor:COLORS.border,paddingVertical:16},goalHead:{flexDirection:'row',alignItems:'center'},goalCopy:{flex:1,marginHorizontal:11},eyebrow:{color:COLORS.oxblood,fontFamily:FONTS.mono,fontSize:9,letterSpacing:1.1},goalName:{color:COLORS.ink,fontSize:13,fontWeight:'700',marginTop:2},goalPercent:{color:COLORS.greenDeep,fontFamily:FONTS.mono,fontSize:13,fontWeight:'700',marginRight:9},track:{height:9,borderWidth:1,borderColor:COLORS.ink,marginTop:12},fill:{height:'100%',backgroundColor:COLORS.greenDeep},amounts:{flexDirection:'row',justifyContent:'space-between',marginTop:7},saved:{color:COLORS.greenDeep,fontFamily:FONTS.mono,fontSize:9},target:{color:COLORS.textSecondary,fontFamily:FONTS.mono,fontSize:9},
  backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(30,42,50,.52)'},modal:{maxHeight:'92%',backgroundColor:COLORS.parchment,borderTopWidth:1.5,borderColor:COLORS.ink,paddingBottom:22},modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:COLORS.border,padding:20,paddingBottom:13},modalTitle:{color:COLORS.ink,fontFamily:FONTS.display,fontSize:24},form:{padding:20,paddingBottom:10},label:{color:COLORS.textMuted,fontFamily:FONTS.mono,fontSize:9,letterSpacing:1,marginTop:12},input:{borderBottomWidth:1,borderColor:COLORS.ink,paddingVertical:9,color:COLORS.ink,marginBottom:2},money:{flexDirection:'row',alignItems:'baseline',borderBottomWidth:1,borderColor:COLORS.ink},currency:{color:COLORS.textMuted,fontFamily:FONTS.display,fontSize:22,marginRight:8},moneyInput:{flex:1,color:COLORS.ink,fontFamily:FONTS.display,fontSize:28,paddingVertical:5},types:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:9},type:{width:'48%',flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:COLORS.greenDeep,padding:9},typeActive:{backgroundColor:COLORS.greenDeep},typeText:{color:COLORS.greenDeep,fontSize:10,fontWeight:'700',marginLeft:7},typeTextActive:{color:COLORS.parchment},primaryChoice:{flexDirection:'row',borderWidth:1,borderColor:COLORS.border,padding:12,marginTop:18},primaryChoiceActive:{backgroundColor:COLORS.mintSoft,borderColor:COLORS.greenDeep},check:{width:20,height:20,borderWidth:1,borderColor:COLORS.greenDeep,backgroundColor:COLORS.greenDeep,alignItems:'center',justifyContent:'center',marginRight:10},choiceCopy:{flex:1},choiceTitle:{color:COLORS.ink,fontWeight:'700',fontSize:12},choiceText:{color:COLORS.textSecondary,fontSize:9.5,lineHeight:14,marginTop:3},error:{color:COLORS.oxblood,fontSize:10,marginTop:12},save:{minHeight:46,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.greenDeep,marginTop:18},primaryText:{color:COLORS.parchment,fontFamily:FONTS.mono,fontSize:10,fontWeight:'700',letterSpacing:.7,textTransform:'uppercase'},deleteButton:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'center',marginTop:10},deleteText:{color:COLORS.oxblood,fontFamily:FONTS.mono,fontSize:10,fontWeight:'700',marginLeft:6,textTransform:'uppercase'},confirmBody:{alignItems:'center',padding:24},confirmTitle:{color:COLORS.ink,fontFamily:FONTS.display,fontSize:23,marginTop:10,textAlign:'center'},confirmText:{color:COLORS.textSecondary,fontSize:11,lineHeight:17,textAlign:'center',marginTop:8},confirmActions:{flexDirection:'row',width:'100%',gap:10,marginTop:22},secondaryButton:{flex:1,minHeight:44,borderWidth:1,borderColor:COLORS.ink,alignItems:'center',justifyContent:'center'},secondaryText:{color:COLORS.ink,fontFamily:FONTS.mono,fontSize:10,fontWeight:'700',textTransform:'uppercase'},deleteConfirm:{flex:1,minHeight:44,backgroundColor:COLORS.oxblood,alignItems:'center',justifyContent:'center'},
});
