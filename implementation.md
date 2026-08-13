# PocketPilot Implementation Design

## Personalized Budget Planning + Goal Simulation

> **Purpose:** Design and validate the architecture before
> implementation. This document is the working technical specification
> for the Personalized Budget Planning + Goal Simulation features. The
> team-confirmed database schema is the source of truth. Any item marked
> **OPEN** should be discussed before implementation rather than
> silently decided in code.

------------------------------------------------------------------------

# Part I --- Overall Architecture & Holistic Review

## 1. Feature Responsibilities

### Personalized Budget Planning

Personalized Budget Planning has two different time scales:

**1. Holistic monthly budget** - Generated once per month. - Establishes
the user's overall financial plan for the month. - Uses recent
income/spending, goals, selected budgeting strategy, preferences, and
learned behavior. - Becomes the baseline against which actual spending
is evaluated.

**2. Dynamic budget adjustment suggestions** - Generated throughout the
month when meaningful spending discrepancies or changing circumstances
are detected. - Does **not** automatically replace the monthly budget. -
Produces a recommendation for how the user could rebalance the rest of
the month. - Requires user approval before changing database-backed
budget allocations.

This distinction is central to PocketPilot's value proposition: the app
is not a static monthly budgeting tool; it continuously learns from user
behavior and helps the user adapt.

### Goal Simulation

Goal Simulation is a read-only "what-if" calculation capability.

Examples: - "If I spend \$50 less on dining each month, when will I
reach my travel goal?" - "I spent more on travel this month. How much do
I need to cut elsewhere to still hit my goal?" - "If I save another
\$100/month, how much sooner can I reach my goal?"

For v1: - simulations are not persisted - simulations do not modify
budgets, allocations, goals, or transactions - the simulation engine is
exposed through an API so the Spending Assistant can call it - the LLM
can interpret the user's question and explain the calculated result, but
the financial math remains deterministic

------------------------------------------------------------------------

## 2. High-Level Architecture

``` text
                    +----------------------+
                    |      Transactions    |
                    | income + expenses    |
                    +----------+-----------+
                               |
                    +----------v-----------+
                    |   Budget Engine      |
                    |                      |
                    | - selected strategy  |
                    | - recent behavior    |
                    | - goals              |
                    | - preferences        |
                    | - learned insights   |
                    +----------+-----------+
                               |
                    +----------v-----------+
                    | Monthly Budget       |
                    | + Allocations        |
                    +----------+-----------+
                               |
                 +-------------v-------------+
                 | Actual spending during    |
                 | the month                 |
                 +-------------+-------------+
                               |
                    +----------v-----------+
                    | Drift / Discrepancy  |
                    | Detection             |
                    +----------+-----------+
                               |
                    +----------v-----------+
                    | Adjustment            |
                    | Recommendation        |
                    +----------+-----------+
                               |
                         User approves
                               |
                               v
                     Updated allocation


Conversations
      |
      +-------------> Goal inference / memory system
      |                         |
      |                         v
      |                       Goals
      |                         |
      |                         v
      |                  Budget / Simulation
      |
      +-------------> Spending Assistant
                                |
                       Goal simulation intent
                                |
                                v
                       Goal Simulation API
                                |
                                v
                       Deterministic result
                                |
                                v
                         AI explanation
```

------------------------------------------------------------------------

## 3. Confirmed Database Schema

The following schema is **team-confirmed** and should not be redesigned
as part of this feature.

### Users

-   `user_id`
-   `name`
-   `email`
-   `pref_curr`
-   `timezone`
-   `created_at`
-   `updated_at`

### Transactions

-   `transaction_id`
-   `user_id`
-   `amount`
-   `type` --- income / expense
-   `category_id`
-   `merchant`
-   `description`
-   `payment_method`
-   `source` --- manual / OCR / bank
-   `created_at`
-   `transaction_date`

Transactions are the source of truth for actual income and spending.

**Scope boundary:** manual transaction entry, OCR, bank ingestion, and
transaction categorization are upstream functionality. Budget Planning
consumes the resulting Transactions.

``` text
User enters expense
       |
       v
Transaction created/categorized
       |
       v
Budget Engine reads transaction
```

### Categories

-   `category_id`
-   `name`
-   `type` --- default / custom
-   `icon / color`

### Financial Memory --- User Preferences

-   `user_id`
-   `budget_style`
-   `financial_priorities`
-   `risk_tolerance`
-   `currency`

### Financial Memory --- User Insights

-   `user_id`
-   `insight_type`
-   `insight_value` --- HIGH / MEDIUM / LOW
-   `confidence`
-   `last_updated`

Example: `WeekendSpender — HIGH — 0.91 — 2/2/26`

### Budget

Monthly budget for each user: - `budget_id` - `user_id` - `month` -
`year` - `total_income` - `planned_savings` - `status`

### BudgetAllocation

-   `allocation_id`
-   `budget_id`
-   `category_id`
-   `allocated_amount`
-   `spent` --- optional
-   `remaining` --- optional

Current direction: prefer deriving `spent` and `remaining` from
Transactions rather than storing duplicate state.

### Goals

-   `goal_id`
-   `user_id`
-   `title`
-   `target_amount`
-   `current_amount`
-   `target_date`
-   `priority`
-   `status`
-   `created_at`

Goals can originate from explicit user input **or from conversations**.

### AI Conversations

-   `chat_id`
-   `user_id`
-   `message`
-   `sender`
-   `timestamp`

### AI Recommendations

-   `recommendation_id`
-   `user_id`
-   `type` --- purchase decision, weekly review, budget update, etc.
-   `recommendation`
-   `reasoning`
-   `accepted`
-   `timestamp`

### Weekly Insights

-   `insight_id`
-   `user_id`
-   `week`
-   `summary`
-   `generated_at`

------------------------------------------------------------------------

## 4. Cross-Feature Ownership

### Transaction Management / Categorization

Owns: - manual transaction entry - OCR - bank transaction ingestion -
transaction categorization - transaction CRUD

Budget Planning consumes Transactions.

### Persistent Financial Memory / Adaptive Learning

Owns: - learning behavioral patterns - maintaining User Insights -
detecting/inferencing financial goals from conversations - updating
relevant financial memory

Budget Planning consumes User Insights and Goals.

### Spending Assistant

Owns: - conversational interaction - understanding user intent -
identifying goal-simulation questions - calling the Goal Simulation
API - presenting the result naturally

### Personalized Budget Planning + Goal Simulation

Owns: - budget calculation - budgeting strategies - monthly budget
generation - dynamic adjustment recommendations - budget-vs-actual
calculations - goal prioritization for budgeting - deterministic goal
projection - deterministic goal simulation - APIs consumed by the
Assistant

------------------------------------------------------------------------

## 5. Goal Inference From Conversations

A financial goal does not have to originate from a form.

Example:

> "I'm trying to save \$2,000 for a Japan trip by June."

The conversation/memory layer can extract:

``` text
title = Japan trip
target_amount = 2000
target_date = June
status = active
priority = unknown
```

The memory/assistant workflow should determine whether the statement is
sufficiently clear to create or update a Goal record.

The Budget Planning feature then treats the resulting `Goals` record
exactly the same as a manually created goal.

``` text
Conversation
    |
    v
Goal inference / validation
    |
    v
Goals table
    |
    v
Budget Engine
```

### Scope boundary

The goal-inference pipeline is primarily a Persistent Financial Memory +
Spending Assistant integration responsibility. The Budget Planning
implementation should define the required Goals interface rather than
duplicate goal extraction.

**OPEN:** How should inferred goals be confirmed before being persisted?

------------------------------------------------------------------------

## 6. Core Architectural Principles

1.  **Transactions are the source of truth for spending.**
2.  **Goals are the source of truth for financial objectives.**
3.  **Holistic budgets are generated monthly.**
4.  **Budget adjustment recommendations can be generated throughout the
    month.**
5.  **User approval is required before a recommendation changes the
    active budget.**
6.  **Financial calculations remain deterministic and testable.**
7.  **AI can propose/personalize, but deterministic rules validate the
    financial result.**
8.  **User Insights influence budgeting rules over time rather than
    directly replacing them.**
9.  **Goal Simulation is read-only in v1.**
10. **The Spending Assistant should be able to invoke Goal Simulation
    through an API.**

------------------------------------------------------------------------

# Part II --- Implementation Details: Personalized Budget Planning

## 7. Budget Generation Model

The system should generate a **holistic monthly budget once per month**.

Inputs:

### Financial data

-   income Transactions
-   expense Transactions
-   category information
-   active Goals

### User-selected strategy

-   50/30/20
-   zero-based budgeting
-   custom allocation

### Personalization context

-   User Preferences
-   User Insights
-   recent spending behavior
-   financial priorities
-   goal priorities and target dates

------------------------------------------------------------------------

## 8. Historical Spending Window

**Confirmed decision: approximately 3--4 months of recent transaction
history.**

Rationale: - older spending may no longer represent the user's current
lifestyle - users' goals can change quickly - the app itself is intended
to change user behavior - monthly budget generation means recent
behavior should have more weight than old behavior

The implementation should make the window configurable so the team can
tune it without rewriting the aggregation logic.

### Edge cases

-   less than 3 months of history → use all available history and
    indicate limited history
-   no expense history → use the selected strategy plus available
    preferences/goals
-   irregular income → define a conservative income baseline from recent
    data

**OPEN:** Exact weighting between months, if any. A simple
recent-average baseline is acceptable initially.

------------------------------------------------------------------------

## 9. Budgeting Modes

The user should choose how their initial budget is generated.

### Mode A --- 50/30/20

Use the traditional: - 50% needs - 30% wants - 20% savings

Category mapping should use the application's Categories rather than
hard-coded strings.

### Mode B --- Zero-Based Budgeting

Assign the user's available income across categories and savings goals
until there is no unallocated amount.

``` text
Income
- Needs
- Wants
- Savings / Goals
= 0 unallocated
```

### Mode C --- Custom Allocation

Allow the user to define their own allocation structure.

------------------------------------------------------------------------

## 10. AI-Generated Budgeting

AI-generated budgeting is a **core product differentiator**, so it
should not be treated as a distant future feature.

The system should make it available as early as practical.

### Important design distinction

The LLM should **not be allowed to freely invent financial numbers**.

Instead, use a hybrid architecture:

``` text
Recent Transactions
User Preferences
Goals
User Insights
        |
        v
AI Budget Recommendation Layer
        |
        | proposes allocation / strategy
        v
Deterministic Budget Validator
        |
        | validates:
        | - income constraint
        | - non-negative amounts
        | - goal requirements
        | - category totals
        | - selected financial rules
        v
Budget Proposal
        |
        v
User approval
```

This allows AI-generated budgeting to be available early while
preserving predictable financial behavior.

### Cold-start behavior

AI-generated budgeting should not require years of history.

It can initially use: - the user's recent 3--4 months of transactions -
selected budgeting preferences - financial priorities - active goals -
available User Insights - the user's current budget behavior

If behavioral data is limited, the system should explicitly treat the
recommendation as lower-confidence and fall back toward the selected
preset strategy.

### Learning progression

``` text
Preset strategy
      |
      v
Recent user behavior
      |
      v
User Insights
      |
      v
AI-generated recommendation
      |
      v
Deterministic validation
      |
      v
User approval
      |
      v
New spending behavior
      |
      v
Updated insights
      |
      +--------> Better future recommendation
```

### Recommended v1 approach

Support both: 1. **Rule-based preset modes** 2. **AI-generated
personalized mode**

The AI mode can initially use a constrained recommendation prompt and
structured output rather than requiring a sophisticated predictive
model.

**OPEN:** Exact structured output schema for the AI budget proposal.

------------------------------------------------------------------------

## 11. Deterministic Budget Engine

The deterministic engine should be responsible for: - aggregating recent
income - aggregating category spending - determining available funds -
calculating planned savings - applying goal requirements - enforcing
allocation constraints - calculating current budget utilization -
calculating remaining funds

The engine should validate AI-generated proposals before they can be
shown as a final budget.

Example:

``` text
AI proposal
   |
   v
Deterministic validation
   |
   +-- valid --> user review
   |
   +-- invalid --> reject/correct proposal
```

AI should therefore be a **recommendation layer**, not the source of
financial truth.

------------------------------------------------------------------------

## 12. Goal Prioritization

When multiple active goals exist, planned savings should prioritize: 1.
goal `priority` 2. `target_date`

Example:

``` text
Goal A: High priority, June deadline
Goal B: Medium priority, December deadline

→ Goal A receives greater savings priority.
```

The exact allocation formula should be implemented as deterministic
business logic.

**OPEN:** How to distribute savings when two goals have identical
priority and similar deadlines.

------------------------------------------------------------------------

## 13. Monthly Budget Lifecycle

``` text
Start of month
      |
      v
Retrieve recent 3–4 months
      |
      v
Retrieve Goals
      |
      v
Retrieve User Preferences
      |
      v
Retrieve User Insights
      |
      v
Apply selected / AI-generated strategy
      |
      v
Deterministic validation
      |
      v
Generate monthly budget proposal
      |
      v
User reviews
      |
      v
User approves
      |
      v
Save Budget + BudgetAllocations
      |
      v
Monitor spending throughout month
```

The monthly budget is the **holistic plan**, not something that should
be regenerated every time a transaction occurs.

------------------------------------------------------------------------

## 14. Dynamic Budget Adjustment

This is separate from monthly budget generation.

During the month, the system should continuously evaluate whether actual
spending is diverging meaningfully from the plan.

Example:

``` text
Monthly budget:
Travel = $200

User spends:
Travel = $450

Remaining month:
Less money is available than expected

System detects discrepancy
        |
        v
Calculate possible rebalancing
        |
        v
Generate recommendation
```

The recommendation could be:

> "You've spent \$250 more on travel than planned. To keep your savings
> goal on track, consider reducing dining and entertainment by \$125
> each for the remainder of the month."

### Important distinction

The system is **not generating a new holistic budget every time**.

It is generating a **current-month adjustment recommendation**.

------------------------------------------------------------------------

## 15. Adjustment Triggering

Adjustment recommendations can be generated when meaningful
discrepancies occur.

Potential signals: - category spending substantially exceeds its
expected trajectory - user has consistently overspent in a category - a
large unexpected expense occurs - income changes - a goal becomes more
urgent - spending behavior changes significantly - remaining budget
becomes inconsistent with the monthly plan

The exact thresholds should be configurable.

Avoid hard-coding a single arbitrary percentage as the only trigger.

### Recommended conceptual trigger

``` text
Expected spending trajectory
        vs
Actual spending trajectory
        |
        v
Meaningful deviation?
        |
       yes
        |
        v
Determine remaining-month impact
        |
        v
Find feasible rebalancing options
        |
        v
Generate recommendation
```

------------------------------------------------------------------------

## 16. AI Learning in Dynamic Adjustments

This is where PocketPilot's adaptive-learning architecture becomes
especially important.

The system should learn from: - what the user actually spends - repeated
overspending patterns - which recommendations the user accepts/rejects -
changes in goals - changes in financial priorities - changes in
lifestyle

User Insights should feed into future adjustment logic.

Example:

``` text
Month 1:
Dining consistently exceeds budget
        |
        v
Insight:
Frequent weekend dining
confidence = 0.91
        |
        v
Month 2:
Budget engine starts with a more realistic dining baseline
        |
        v
AI may recommend reducing another discretionary
category rather than repeatedly setting an
unrealistically low dining budget
```

The goal is **not** to punish the user for repeatedly deviating from the
budget.

The goal is to learn whether: - the budget was unrealistic - the user's
behavior changed - the user has a new priority - the spending is
temporary

------------------------------------------------------------------------

## 17. Budget Adjustment Recommendations

The recommendation should be stored in `AI Recommendations` when
appropriate.

Example:

``` text
type:
budget update

recommendation:
"Reduce entertainment by $80 for the rest of the month."

reasoning:
"Travel spending is $160 above its expected trajectory.
This adjustment preserves your planned savings."

accepted:
false
```

If the user accepts: `accepted = true`

The system can then update the relevant `BudgetAllocation`.

**Confirmed decision:** Budget adjustments require user approval.

The system should never silently alter the user's financial plan.

------------------------------------------------------------------------

## 18. Deriving Spent and Remaining

Current direction:

**Derive `spent` and `remaining` from Transactions.**

``` text
BudgetAllocation.allocated_amount
          +
Transactions for category/month
          |
          v
Derived spent
          |
          v
Derived remaining
```

Reason: - transactions change frequently - users can edit/delete
transactions - duplicated financial state creates consistency problems

The optional database fields can remain available if a later performance
decision requires them.

------------------------------------------------------------------------

## 19. Budget API Requirements

The exact route naming should follow existing FastAPI conventions.

Required capabilities:

### Monthly budget

-   generate monthly budget
-   retrieve current monthly budget
-   approve/save budget
-   update allocations after user edits

### Dynamic adjustment

-   evaluate budget discrepancies
-   generate adjustment recommendation
-   accept/reject recommendation
-   apply approved adjustment

### Budget analysis

-   current spending by category
-   remaining budget
-   variance from plan

### AI budgeting

-   request AI-generated budget proposal
-   validate proposal
-   return proposal for user approval

The backend should keep calculation services separate from route
handlers.

------------------------------------------------------------------------

# Part III --- Implementation Details: Goal Simulation

## 20. Goal Simulation Purpose

Goal Simulation answers a hypothetical question without changing the
user's real financial state.

It is primarily a **backend financial calculation capability** that the
Spending Assistant can call.

------------------------------------------------------------------------

## 21. V1 Interaction Model

For v1, the primary user experience can be conversational.

Example:

> User: "If I cut dining by \$50 a month, can I reach my Japan goal by
> June?"

``` text
User
 |
 v
Spending Assistant
 |
 v
Intent = Goal Simulation
 |
 v
Extract scenario
 |
 v
Goal Simulation API
 |
 v
Retrieve goal + budget + relevant transactions
 |
 v
Calculate baseline
 |
 v
Calculate scenario
 |
 v
Return structured result
 |
 v
Spending Assistant explains result
```

No simulation record needs to be stored.

------------------------------------------------------------------------

## 22. Simulation Inputs

The simulation service should support a constrained set of scenario
types initially.

### Potential v1 scenarios

1.  Reduce category spending by a monthly amount.
2.  Increase category spending by a monthly amount.
3.  Increase monthly savings.
4.  Add a recurring monthly expense.
5.  Remove/reduce a recurring expense.

A request should resolve to structured inputs such as:

``` text
goal_id
scenario_type
category_id (optional)
amount
frequency
```

The service should normalize weekly/biweekly values into a monthly
effect before calculation.

------------------------------------------------------------------------

## 23. Baseline Calculation

The baseline represents the user's current trajectory.

Inputs may include: - Goal `current_amount` - Goal `target_amount` -
Goal `target_date` - current monthly income - current spending - current
planned savings - active budget

The engine calculates: - amount remaining - baseline monthly savings -
projected completion date - whether the target date is achievable

------------------------------------------------------------------------

## 24. Scenario Calculation

The scenario applies the hypothetical change without changing the
underlying database state.

Example:

``` text
Current:
Goal remaining = $1,500
Monthly savings = $150

Scenario:
Dining reduced by $50/month

Scenario:
Monthly savings = $200
```

The engine then calculates the new projected completion date.

------------------------------------------------------------------------

## 25. Baseline vs Scenario Output

The API should return structured values such as:

``` text
goal_id

baseline:
  monthly_savings
  projected_completion_date
  target_date_feasible

scenario:
  monthly_savings
  projected_completion_date
  target_date_feasible

difference:
  monthly_savings_change
  completion_date_change
  additional_amount_saved
```

The Spending Assistant can convert this into natural language.

Example:

> "Reducing dining by \$50 a month would increase your projected monthly
> savings from \$150 to \$200 and move your goal approximately two
> months earlier."

------------------------------------------------------------------------

## 26. Simulation Must Not Mutate Financial Data

The simulation engine must be read-only.

It can read: - Transactions - Budget - BudgetAllocation - Goals - User
Preferences / relevant insights

It must not update: - Transactions - Budget - BudgetAllocation - Goals -
User Preferences - User Insights

``` text
READ financial state
       |
       v
CALCULATE hypothetical state
       |
       v
RETURN result
```

No Simulation table is required for v1.

------------------------------------------------------------------------

## 27. Spending Assistant Integration

The simulation endpoint should be designed as a reusable backend
capability.

Conceptually:

``` text
POST /.../goal-simulation
```

The Spending Assistant can invoke it when the user's query is classified
as a simulation request.

Example:

> "I spent \$300 on travel this month instead of \$150. How can I still
> reach my savings goal?"

Assistant extracts:

``` text
scenario:
travel spending increase = $150
```

Then calls the Goal Simulation API.

The simulation engine calculates what needs to change elsewhere.

The Assistant explains the result.

**Important boundary:** The Assistant should not reproduce the
simulation math in its own service. There should be one source of truth
for financial calculations: the Goal Simulation Engine.

------------------------------------------------------------------------

## 28. LLM Responsibilities

### LLM / Assistant

Responsible for: - recognizing simulation intent - extracting
hypothetical changes from natural language - asking for clarification if
required - explaining deterministic results - presenting tradeoffs in
natural language

### Deterministic simulation engine

Responsible for: - validating inputs - calculating baseline -
calculating scenario - projecting goal completion - calculating
differences

Example:

``` text
User:
"If I spend $50 less on dining?"

LLM:
scenario_type = category_reduction
category = dining
amount = $50/month

        |
        v

Simulation Engine:
calculates financial impact

        |
        v

LLM:
explains result
```

The LLM should never invent the completion date or savings amount.

------------------------------------------------------------------------

## 29. Goal Simulation + Goal Inference

These are separate responsibilities.

### Goal inference

``` text
"I want to save $2,000 for Japan by June."
        |
        v
Memory / Assistant
        |
        v
Goals table
```

### Goal simulation

``` text
"If I spend $50 less on dining, can I reach my Japan goal by June?"
        |
        v
Spending Assistant
        |
        v
Goal Simulation API
        |
        v
Goal projection
```

The simulation service only needs the goal to exist in the `Goals`
table.

------------------------------------------------------------------------

## 30. Simulation Edge Cases

The service should handle: - no active goal - goal already achieved -
missing target date - zero/invalid target amount - scenario produces
negative savings - scenario makes the goal unreachable - scenario makes
the goal immediately achievable - insufficient transaction history -
category with insufficient spending history - ambiguous natural-language
scenario - hypothetical change that exceeds realistic category spending

For ambiguous requests, the Assistant should ask for clarification
rather than guessing.

------------------------------------------------------------------------

## 31. Simulation API Contract

Conceptually:

### Request

``` json
{
  "goal_id": "...",
  "scenario_type": "reduce_category_spending",
  "category_id": "...",
  "amount": 50,
  "frequency": "monthly"
}
```

### Response

``` json
{
  "goal_id": "...",
  "baseline": {
    "monthly_savings": 150,
    "projected_completion_date": "...",
    "target_date_feasible": true
  },
  "scenario": {
    "monthly_savings": 200,
    "projected_completion_date": "...",
    "target_date_feasible": true
  },
  "difference": {
    "monthly_savings_change": 50,
    "completion_date_change_months": -2
  }
}
```

The exact schema should be finalized against the existing FastAPI
conventions.

------------------------------------------------------------------------

# 32. Implementation Order

## Phase 1 --- Cross-team contracts

Confirm: - Transactions interface - Goals interface - User Insights
interface - Budget API contract - AI budget proposal schema - Spending
Assistant → Goal Simulation API contract - goal inference → Goals
persistence flow

## Phase 2 --- Core budgeting engine

1.  Implement 3--4 month transaction aggregation.
2.  Implement preset strategies.
3.  Implement goal-priority savings allocation.
4.  Implement category allocation.
5.  Implement deterministic budget validation.
6.  Implement Budget + BudgetAllocation persistence.
7.  Implement budget-vs-actual calculations.

## Phase 3 --- AI-generated budgeting

1.  Define structured AI budget proposal.
2.  Feed recent spending, goals, preferences, and relevant insights into
    the AI layer.
3.  Validate AI output with deterministic rules.
4.  Present proposal to user.
5.  Require approval.
6.  Persist approved budget.
7.  Feed later behavior back into User Insights.

## Phase 4 --- Dynamic adjustment

1.  Implement spending trajectory/variance detection.
2.  Identify meaningful discrepancies.
3.  Calculate feasible remaining-month rebalancing.
4.  Generate adjustment recommendation.
5.  Use User Insights to improve recommendations.
6.  Store recommendation in AI Recommendations when appropriate.
7.  Require user approval.
8.  Apply approved allocation changes.

## Phase 5 --- Goal Simulation

1.  Implement goal projection.
2.  Implement scenario normalization.
3.  Implement scenario calculation.
4.  Implement baseline-vs-scenario comparison.
5.  Expose Goal Simulation API.
6.  Integrate with Spending Assistant.
7.  Add LLM explanation layer.

------------------------------------------------------------------------

# 33. Definition of Done

## Personalized Budget Planning

-   [ ] Monthly holistic budget is generated once per month.
-   [ ] Budget uses approximately 3--4 months of recent transaction
    history.
-   [ ] User can select 50/30/20, zero-based, or custom budgeting.
-   [ ] AI-generated personalized budgeting is available as early as
    practical.
-   [ ] AI-generated budgets use recent behavior, goals, preferences,
    and available insights.
-   [ ] AI-generated proposals are validated by deterministic financial
    rules.
-   [ ] User approves the monthly budget before it becomes active.
-   [ ] Goals influence planned savings using priority + target date.
-   [ ] Actual spending is derived from Transactions.
-   [ ] Dynamic discrepancies can trigger adjustment recommendations
    during the month.
-   [ ] Adjustments do not silently change the active budget.
-   [ ] User approval is required for budget adjustments.
-   [ ] User Insights improve future budget/adjustment recommendations.
-   [ ] The system distinguishes temporary overspending from persistent
    behavior change where possible.
-   [ ] Core financial calculations are deterministic and testable.
-   [ ] LLM failures do not break financial calculations.

## Goal Simulation

-   [ ] Goal Simulation can be invoked by the Spending Assistant.
-   [ ] User can express hypothetical spending/savings changes in
    natural language.
-   [ ] Assistant converts the request into structured simulation
    parameters.
-   [ ] Baseline projection is deterministic.
-   [ ] Scenario projection is deterministic.
-   [ ] Baseline and scenario results are compared.
-   [ ] Results include projected goal impact.
-   [ ] Simulation does not modify financial database state.
-   [ ] Simulation results are not persisted for v1.
-   [ ] LLM explains results rather than calculating them.
-   [ ] Invalid or ambiguous scenarios are handled safely.

------------------------------------------------------------------------

# 34. Highest-Priority Decisions Before Implementation

### Budgeting

1.  Exact formulas for 50/30/20.
2.  Exact zero-based allocation rules.
3.  Exact custom-allocation behavior.
4.  Structured output schema for AI-generated budgets.
5.  Deterministic validation rules for AI-generated proposals.
6.  How recent behavior should influence AI recommendations versus the
    selected preset.
7.  Exact discrepancy/adjustment thresholds.
8.  How to distinguish temporary unusual spending from genuine behavior
    change.
9.  How User Insights modify adjustment rules.
10. How to allocate savings between equally prioritized goals.

### Goal Simulation

11. Exact v1 scenario types.
12. Exact natural-language → structured simulation input contract.
13. Goal Simulation API contract with Spending Assistant.
14. How to handle missing/ambiguous goal information.

### Cross-team

15. How conversationally inferred goals are confirmed and written to the
    Goals table.
16. What information the Budget Engine can request from the
    Memory/Learning system.
17. What information the Spending Assistant can request from Budget and
    Simulation APIs.

------------------------------------------------------------------------

# 35. Final Architecture Direction

PocketPilot should not be designed as:

> "Generate a budget once and compare spending against it."

It should be designed as a continuous loop:

``` text
                 +---------------------+
                 | User behavior       |
                 | + transactions      |
                 +----------+----------+
                            |
                            v
                 +---------------------+
                 | Memory / Learning   |
                 | + User Insights     |
                 +----------+----------+
                            |
              +-------------v--------------+
              | AI + Deterministic Budget  |
              | Recommendation Engine      |
              +-------------+--------------+
                            |
                    Monthly Budget
                            |
                    Actual Behavior
                            |
                 Discrepancy Detection
                            |
                 Dynamic Adjustment
                     Recommendation
                            |
                     User Approval
                            |
                  Updated Allocation
                            |
                       New Data
                            |
                            +---------> learning loop
```

The monthly budget provides **structure**.

The dynamic adjustment system provides **adaptation**.

The Memory/Learning system provides **long-term personalization**.

The AI-generated budgeting mode provides the project's **core
differentiation**.

Goal Simulation provides a **read-only decision-support capability**
that can be invoked conversationally by the Spending Assistant.

The fundamental architectural rule is:

> **AI should learn from behavior and propose increasingly personalized
> financial plans, while deterministic financial logic remains the final
> constraint and calculation layer.**
