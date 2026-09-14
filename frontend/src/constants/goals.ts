import { Ionicons } from '@expo/vector-icons';

export interface GoalTypeOption {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const GOAL_TYPES: GoalTypeOption[] = [
  { value: 'emergency_fund', label: 'Emergency fund', icon: 'shield-checkmark-outline' },
  { value: 'travel', label: 'Travel', icon: 'airplane-outline' },
  { value: 'education', label: 'Education', icon: 'school-outline' },
  { value: 'debt_payoff', label: 'Debt payoff', icon: 'card-outline' },
  { value: 'major_purchase', label: 'Major purchase', icon: 'bag-handle-outline' },
  { value: 'other', label: 'Other', icon: 'sparkles-outline' },
];

export function goalTypeLabel(value: string): string {
  return GOAL_TYPES.find((option) => option.value === value)?.label ?? value.replace(/_/g, ' ');
}
