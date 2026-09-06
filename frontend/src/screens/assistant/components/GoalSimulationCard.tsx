import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GoalSimulationResult, ProjectionStatus } from '@/types';
import { COLORS, FONTS } from '@/theme';
import { formatCompactVnd, formatMonthYear, formatVnd } from '@/utils/finance';

interface Props {
  result: GoalSimulationResult;
}

type StatusTone = 'safe' | 'warning' | 'danger' | 'neutral';

const STATUS_DETAILS: Record<ProjectionStatus, { label: string; tone: StatusTone }> = {
  projected: { label: 'ĐÃ ƯỚC TÍNH', tone: 'safe' },
  completed: { label: 'ĐÃ HOÀN THÀNH', tone: 'safe' },
  insufficient_plan: { label: 'CHƯA ĐỦ KẾ HOẠCH', tone: 'warning' },
  unreachable: { label: 'CHƯA THỂ ĐẠT', tone: 'danger' },
  deadline_passed: { label: 'ĐÃ QUA HẠN', tone: 'danger' },
  unsupported_horizon: { label: 'VƯỢT KỲ HẠN', tone: 'warning' },
  unsupported: { label: 'CHƯA HỖ TRỢ', tone: 'neutral' },
};

function scenarioSummary(result: GoalSimulationResult): string {
  const { scenario } = result;
  if (scenario.scenario_type === 'one_time_expense') {
    return `Chi thêm một lần ${formatVnd(scenario.amount)}`;
  }
  if (scenario.scenario_type === 'recurring_expense') {
    const cadence = scenario.frequency === 'weekly' ? 'mỗi tuần' : 'mỗi tháng';
    return `Chi thêm ${formatVnd(scenario.amount)} ${cadence}`;
  }
  return `Để dành thêm ${formatVnd(scenario.amount)} mỗi tháng`;
}

function projectionLabel(status: ProjectionStatus, completionDate: string | null): string {
  const month = formatMonthYear(completionDate);
  if (month) return month;
  if (status === 'completed') return 'Đã hoàn thành';
  if (status === 'insufficient_plan') return 'Chưa có khoản để dành';
  if (status === 'unsupported_horizon') return 'Ngoài kỳ hạn ước tính';
  if (status === 'deadline_passed') return 'Đã qua thời hạn';
  return 'Chưa thể ước tính';
}

function impactLabel(result: GoalSimulationResult): string {
  const { impact, status } = result;
  if (impact.delay_months > 0) {
    return `Chậm hơn khoảng ${impact.delay_months} tháng`;
  }
  if (impact.acceleration_months > 0) {
    return `Sớm hơn khoảng ${impact.acceleration_months} tháng`;
  }
  if (status === 'unsupported_horizon' || status === 'unreachable') {
    return 'Mục tiêu có thể chưa đạt trong kỳ hạn ước tính';
  }
  if (status === 'insufficient_plan') return 'Cần một khoản để dành hàng tháng';
  return 'Không thay đổi thời điểm dự kiến';
}

function trajectoryBars(result: GoalSimulationResult) {
  const points = result.trajectory;
  const displayPoints = points.length > 5 ? points.filter((_, index) => index % Math.ceil(points.length / 5) === 0).slice(0, 5) : points;
  const maximum = Math.max(result.goal.target_amount, ...displayPoints.map((point) => point.amount), 1);
  return displayPoints.map((point) => ({
    ...point,
    height: Math.max(8, Math.min(100, (point.amount / maximum) * 100)),
  }));
}

export default function GoalSimulationCard({ result }: Props) {
  const details = STATUS_DETAILS[result.status];
  const bars = trajectoryBars(result);
  const assessment = result.target_date_assessment;
  const toneStyles = {
    safe: styles.safeTone,
    warning: styles.warningTone,
    danger: styles.dangerTone,
    neutral: styles.neutralTone,
  };
  const iconColor = details.tone === 'danger' ? COLORS.error : details.tone === 'warning' ? COLORS.amber : COLORS.teal;
  const graphSummary = bars.length
    ? `Đường tiến độ mô phỏng có ${bars.length} mốc, kết thúc ở ${formatCompactVnd(bars[bars.length - 1].amount)}.`
    : 'Chưa có dữ liệu tiến độ mô phỏng.';

  return (
    <View style={styles.card} accessibilityLabel={`Mô phỏng mục tiêu ${result.goal.title}. ${impactLabel(result)}. ${graphSummary}`}>
      <View style={styles.header}>
        <View style={styles.goalIdentity}>
          <View style={[styles.goalIcon, toneStyles[details.tone]]}>
            <Ionicons name="flag-outline" size={17} color={iconColor} />
          </View>
          <View style={styles.goalCopy}>
            <Text style={styles.eyebrow}>MÔ PHỎNG MỤC TIÊU</Text>
            <Text style={styles.goalTitle} numberOfLines={2}>{result.goal.title}</Text>
          </View>
        </View>
        <View style={[styles.statusStamp, toneStyles[details.tone]]}>
          <Text style={[styles.statusText, { color: iconColor }]}>{details.label}</Text>
        </View>
      </View>

      <View style={styles.scenarioRow}>
        <Ionicons name="swap-horizontal-outline" size={15} color={COLORS.teal} />
        <Text style={styles.scenarioText}>{scenarioSummary(result)}</Text>
      </View>

      <View style={styles.projectionGrid}>
        <View style={styles.projectionColumn}>
          <Text style={styles.projectionLabel}>KẾ HOẠCH HIỆN TẠI</Text>
          <Text style={styles.projectionValue}>{projectionLabel(result.baseline.status, result.baseline.projected_completion_date)}</Text>
          <Text style={styles.contributionText}>{formatCompactVnd(result.baseline.monthly_contribution)}/tháng</Text>
        </View>
        <View style={styles.projectionDivider} />
        <View style={styles.projectionColumn}>
          <Text style={styles.projectionLabel}>VỚI THAY ĐỔI</Text>
          <Text style={styles.projectionValue}>{projectionLabel(result.scenario.status, result.scenario.projected_completion_date)}</Text>
          <Text style={styles.contributionText}>{formatCompactVnd(result.scenario.monthly_contribution)}/tháng</Text>
        </View>
      </View>

      <View style={[styles.impactRow, toneStyles[details.tone]]}>
        <Ionicons name={details.tone === 'danger' ? 'alert-circle-outline' : 'trending-up-outline'} size={17} color={iconColor} />
        <Text style={[styles.impactText, { color: iconColor }]}>{impactLabel(result)}</Text>
      </View>

      {bars.length ? (
        <View style={styles.trajectorySection} accessible accessibilityLabel={graphSummary}>
          <View style={styles.trajectoryHeader}>
            <Text style={styles.trajectoryLabel}>TIẾN ĐỘ THEO MÔ PHỎNG</Text>
            <Text style={styles.trajectoryTarget}>Đích {formatCompactVnd(result.goal.target_amount)}</Text>
          </View>
          <View style={styles.chart}>
            <View style={styles.targetRule} />
            {bars.map((point, index) => (
              <View key={`${point.date}-${index}`} style={styles.barColumn}>
                <View style={[styles.bar, { height: `${point.height}%` }]} />
              </View>
            ))}
          </View>
          <View style={styles.chartDates}>
            <Text style={styles.chartDate}>{formatMonthYear(bars[0].date) ?? ''}</Text>
            <Text style={styles.chartDate}>{formatMonthYear(bars[bars.length - 1].date) ?? ''}</Text>
          </View>
        </View>
      ) : null}

      {assessment ? (
        <View style={[styles.deadlineRow, assessment.achievable ? styles.safeTone : styles.warningTone]}>
          <Ionicons name={assessment.achievable ? 'checkmark-circle-outline' : 'calendar-outline'} size={16} color={assessment.achievable ? COLORS.success : COLORS.amber} />
          <View style={styles.deadlineCopy}>
            <Text style={styles.deadlineTitle}>
              {assessment.achievable ? 'Vẫn đúng tiến độ mục tiêu' : `Còn thiếu ${formatCompactVnd(assessment.shortfall)} vào hạn`}
            </Text>
            <Text style={styles.deadlineMeta}>
              Hạn {formatMonthYear(assessment.deadline) ?? assessment.deadline}
              {assessment.required_additional_monthly_savings != null
                ? ` · Cần thêm ${formatCompactVnd(assessment.required_additional_monthly_savings)}/tháng`
                : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {result.assumptions.length ? <View style={styles.assumptions}><Text style={styles.assumptionsLabel}>GIẢ ĐỊNH</Text>{result.assumptions.map((assumption) => <Text key={assumption} style={styles.assumption}>• {assumption}</Text>)}</View> : null}
      {result.warnings.map((warning) => (
        <View key={warning} style={styles.warningRow}>
          <Ionicons name="warning-outline" size={15} color={COLORS.amber} />
          <Text style={styles.warningText}>{warning}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderStrong },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  goalIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  goalIcon: { width: 34, height: 34, borderRadius: 0, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  goalCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  eyebrow: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.8 },
  goalTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 17, lineHeight: 20, marginTop: 2 },
  statusStamp: { maxWidth: '40%', borderWidth: 1, borderRadius: 0, paddingHorizontal: 6, paddingVertical: 4 },
  statusText: { fontFamily: FONTS.mono, fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  safeTone: { backgroundColor: COLORS.mintSoft, borderColor: COLORS.greenDeep },
  warningTone: { backgroundColor: COLORS.amberSoft, borderColor: COLORS.brass },
  dangerTone: { backgroundColor: COLORS.errorSoft, borderColor: COLORS.oxblood },
  neutralTone: { backgroundColor: COLORS.surfaceMuted, borderColor: COLORS.border },
  scenarioRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  scenarioText: { flex: 1, color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginLeft: 6 },
  projectionGrid: { flexDirection: 'row', paddingVertical: 12 },
  projectionColumn: { flex: 1, minWidth: 0 },
  projectionDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border, marginHorizontal: 10 },
  projectionLabel: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.55 },
  projectionValue: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 14, lineHeight: 17, marginTop: 4 },
  contributionText: { color: COLORS.textSecondary, fontFamily: FONTS.mono, fontSize: 8.5, marginTop: 2 },
  impactRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 0, paddingHorizontal: 9, paddingVertical: 8 },
  impactText: { flex: 1, fontSize: 11, fontWeight: '800', lineHeight: 16, marginLeft: 6 },
  trajectorySection: { marginTop: 12 },
  trajectoryHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  trajectoryLabel: { color: COLORS.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  trajectoryTarget: { color: COLORS.textSecondary, fontSize: 8.5, fontWeight: '700' },
  chart: { height: 54, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: COLORS.borderStrong, marginTop: 7, paddingHorizontal: 6, backgroundColor: COLORS.parchmentDeep },
  targetRule: { position: 'absolute', top: 2, left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: COLORS.borderStrong },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 7, minHeight: 4, borderRadius: 0, backgroundColor: COLORS.greenDeep },
  chartDates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartDate: { color: COLORS.textMuted, fontSize: 8 },
  deadlineRow: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 0, padding: 9, marginTop: 11 },
  deadlineCopy: { flex: 1, minWidth: 0, marginLeft: 7 },
  deadlineTitle: { color: COLORS.text, fontSize: 10.5, fontWeight: '800', lineHeight: 15 },
  deadlineMeta: { color: COLORS.textSecondary, fontSize: 9, lineHeight: 14, marginTop: 2 },
  assumptions: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 10, paddingTop: 7 },
  assumptionsLabel: { color: COLORS.oxblood, fontFamily: FONTS.mono, fontSize: 8, letterSpacing: 0.6, marginBottom: 3 },
  assumption: { color: COLORS.textMuted, fontSize: 9, lineHeight: 14, marginTop: 2 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  warningText: { flex: 1, color: COLORS.amber, fontSize: 9.5, lineHeight: 14, marginLeft: 5 },
});
