export type ScenarioType =
  | 'one_time_expense'
  | 'recurring_expense'
  | 'additional_savings';

export type ScenarioFrequency = 'weekly' | 'monthly';

export type ProjectionStatus =
  | 'projected'
  | 'completed'
  | 'insufficient_plan'
  | 'unreachable'
  | 'deadline_passed'
  | 'unsupported_horizon'
  | 'unsupported';

export interface GoalSimulationGoal {
  id: string;
  title: string;
  current_amount: number;
  target_amount: number;
  target_date: string | null;
}

export interface TrajectoryPoint {
  date: string;
  amount: number;
}

export interface ProjectionOutcome {
  status: ProjectionStatus;
  monthly_contribution: number;
  projected_completion_date: string | null;
}

export interface ScenarioOutcome extends ProjectionOutcome {
  scenario_type: ScenarioType;
  amount: number;
  frequency: ScenarioFrequency | null;
  monthly_equivalent: number | null;
}

export interface SimulationImpact {
  completion_date_change_days: number | null;
  delay_months: number;
  acceleration_months: number;
  amount_short: number | null;
  unfunded_against_planned_savings: number;
}

export interface TargetDateAssessment {
  deadline: string;
  achievable: boolean;
  projected_completion_date: string | null;
  shortfall: number;
  required_additional_monthly_savings: number | null;
}

export interface GoalSimulationResult {
  schema_version: number;
  status: ProjectionStatus;
  goal: GoalSimulationGoal;
  baseline: ProjectionOutcome;
  scenario: ScenarioOutcome;
  impact: SimulationImpact;
  target_date_assessment: TargetDateAssessment | null;
  assumptions: string[];
  warnings: string[];
  trajectory: TrajectoryPoint[];
}