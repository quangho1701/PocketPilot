# Personalized Budget Planning --- Final Coding Plan

## Purpose

Implement **Part 2: Personalized Budget Planning / Budgeting Assistant**
from the approved `implementation.md`.

This is the coding roadmap across backend, database, AI, frontend, and
tests. Work through the tasks sequentially, keeping each task small
enough to implement and verify independently.

## Confirmed design constraints

-   Use the team-confirmed database schema; do not redesign it without
    discussion.
-   Use approximately **3--4 months** of recent transaction history.
-   Support **50/30/20, zero-based, custom allocation, and
    AI-personalized budgeting**.
-   AI-personalized budgeting is a **core v1 capability** and should be
    enabled as early as practical.
-   The holistic budget is generated **once per month**.
-   Dynamic adjustment recommendations can be generated throughout the
    month.
-   User approval is required before database-backed budget allocations
    are changed.
-   Goals are prioritized by **priority, then target date**.
-   User Insights provide behavioral context and should make future
    budgets/adjustments more realistic.
-   `spent` and `remaining` should preferably be derived from
    Transactions.
-   AI proposes and explains; deterministic financial logic calculates
    and validates.
-   Do not add Goal Simulation implementation in this phase.
-   Use the repository's existing authentication/user-identification
    pattern; do not introduce a new auth system.

------------------------------------------------------------------------

# Phase 1 --- Repository & Architecture Verification

## Task 1 --- Inspect existing repository conventions

**Goal**
Document the current architecture before adding any budgeting code so the implementation follows the repository’s existing patterns.

**Files to inspect**
- [backend/app/models/base.py](backend/app/models/base.py)
- [backend/app/models/user.py](backend/app/models/user.py)
- [backend/app/models/financial_memory.py](backend/app/models/financial_memory.py)
- [backend/app/models/user_profile.py](backend/app/models/user_profile.py)
- [backend/app/models/user_decision.py](backend/app/models/user_decision.py)
- [backend/app/models/spending_pattern.py](backend/app/models/spending_pattern.py)
- [backend/app/models/memory_embedding.py](backend/app/models/memory_embedding.py)
- [backend/app/database.py](backend/app/database.py)
- [backend/alembic/env.py](backend/alembic/env.py)
- [backend/app/main.py](backend/app/main.py)
- [backend/app/routers/budget.py](backend/app/routers/budget.py)
- [backend/app/routers/transactions.py](backend/app/routers/transactions.py)
- [backend/app/routers/memory.py](backend/app/routers/memory.py)
- [backend/app/services/budget_service.py](backend/app/services/budget_service.py)
- [backend/app/services/transaction_service.py](backend/app/services/transaction_service.py)
- [backend/app/services/learning_service.py](backend/app/services/learning_service.py)
- [backend/app/utils/bedrock.py](backend/app/utils/bedrock.py)
- [frontend/src/services/api.ts](frontend/src/services/api.ts)
- [frontend/src/screens/budget/BudgetScreen.tsx](frontend/src/screens/budget/BudgetScreen.tsx)
- [frontend/App.tsx](frontend/App.tsx)
- [frontend/package.json](frontend/package.json)

**Implementation steps**
1. Confirm the current backend style for models, sessions, routers, services, and schemas.
2. Confirm how the app currently handles async database access and dependency injection.
3. Confirm whether the project already has a testing setup for backend or frontend.
4. Record where new budgeting code should live:
   - database models under [backend/app/models](backend/app/models)
   - API routes under [backend/app/routers](backend/app/routers)
   - business logic under [backend/app/services](backend/app/services)
   - request/response validation under [backend/app/schemas](backend/app/schemas)
   - UI under [frontend/src/screens](frontend/src/screens)
   - API calls under [frontend/src/services](frontend/src/services)

**Expected output**
- A short architecture note stating where budget models, services, routes, schemas, and UI components should be added.
- No production code changes yet.

**Verification**
- Review the files above and ensure the plan matches how the repository already works.
- If a required pattern is missing, note it as an OPEN DECISION rather than inventing a new architectural pattern.

------------------------------------------------------------------------

## Task 2 --- Verify existing domain models

**Goal**
Determine which domain objects already exist and which must be created for the budgeting feature.

**Files to inspect**
- [backend/app/models/user.py](backend/app/models/user.py)
- [backend/app/models/financial_memory.py](backend/app/models/financial_memory.py)
- [backend/app/models/user_profile.py](backend/app/models/user_profile.py)
- [backend/app/models/user_decision.py](backend/app/models/user_decision.py)
- [backend/app/models/spending_pattern.py](backend/app/models/spending_pattern.py)
- [backend/app/models/memory_embedding.py](backend/app/models/memory_embedding.py)
- [backend/app/services/learning_service.py](backend/app/services/learning_service.py)
- [backend/app/routers/memory.py](backend/app/routers/memory.py)
- [backend/app/services/transaction_service.py](backend/app/services/transaction_service.py)
- [backend/app/services/budget_service.py](backend/app/services/budget_service.py)

**Implementation steps**
1. Check whether the repository already contains a user model, transaction-like model, profile model, or goal-related model.
2. Confirm whether the existing memory and learning models can support budgeting context without creating new duplication.
3. For each entity below, record one of the following:
   - existing and reusable
   - missing and must be created
   - partially existing and needs a small extension

   Entities to review:
   - Users
   - Transactions
   - Categories
   - User Preferences
   - User Insights
   - Goals
   - Budget
   - BudgetAllocation
   - AI Recommendations

4. Keep the plan aligned with the confirmed schema in implementation.md. Do not redesign existing tables just because the current repository is incomplete.

**Expected output**
- A short inventory of existing vs missing budgeting-related domain objects.
- A list of the minimum new models needed for the budgeting feature.

**Verification**
- Compare the findings against the confirmed plan in implementation.md.
- If the repository already has a near-match for an entity, reuse it instead of creating a duplicate model.

**OPEN DECISION**
- OPEN DECISION 1: The repository currently does not have a dedicated transaction model or budget/goal model. For Phase 2, create the minimum budget-related models needed for v1 rather than trying to retro-fit the memory models.

------------------------------------------------------------------------

# Phase 2 --- Database Foundation

## Task 3 --- Implement missing Budget and BudgetAllocation models

**Goal**
Create the minimum database-backed models required to persist a monthly budget and its category allocations.

**Files to create or modify**
- Create [backend/app/models/budget.py](backend/app/models/budget.py)
- Create [backend/app/models/budget_allocation.py](backend/app/models/budget_allocation.py)
- Modify [backend/app/models/__init__.py](backend/app/models/__init__.py)
- Modify [backend/app/schemas/budget.py](backend/app/schemas/budget.py) if it does not exist yet

**Implementation steps**
1. Create a Budget model using the confirmed schema:
   - id
   - user_id
   - month
   - year
   - total_income
   - planned_savings
   - status
   - created_at
   - updated_at
2. Create a BudgetAllocation model using the confirmed schema:
   - id
   - budget_id
   - category_id
   - allocated_amount
3. Follow the same style as the existing SQLAlchemy models in [backend/app/models/base.py](backend/app/models/base.py) and [backend/app/models/user.py](backend/app/models/user.py).
4. Add ownership by user_id using a foreign key to the existing users table.
5. Add the relationship from Budget to BudgetAllocation so each budget can contain many allocations.
6. Keep spent and remaining out of the initial persistence model and derive them from transactions later.

**Expected output**
- Two new SQLAlchemy models ready for use by the service layer.
- The models should be importable from the package without errors.

**Database usage**
- The new models will be used later for storing approved monthly budgets and category allocations.
- They do not need to be populated until the approval flow is implemented.

**Verification**
- Import the models in Python and instantiate a simple object without errors.
- Confirm the class names and field names are consistent with the confirmed schema.

**OPEN DECISION**
- OPEN DECISION 2: The confirmed schema uses category_id, but the repository does not currently have a category model. For v1, keep category_id as a simple identifier field and do not create a separate category table yet.

------------------------------------------------------------------------

## Task 4 --- Create/update migrations

**Goal**
Add the database migration definitions needed for the new budget tables so the app can persist budgets and allocations.

**Files to create or modify**
- Create a new migration file under [backend/alembic/versions](backend/alembic/versions)
- Modify [backend/alembic/env.py](backend/alembic/env.py) if required to include the new models

**Implementation steps**
1. Create a migration that adds the following tables:
   - budgets
   - budget_allocations
2. Add the relevant columns from the confirmed schema:
   - budgets: user_id, month, year, total_income, planned_savings, status
   - budget_allocations: budget_id, category_id, allocated_amount
3. Add foreign key relationships from budget_allocations.budget_id to budgets.id.
4. Add indexes for efficient monthly lookup, especially on (user_id, year, month).
5. Keep the migration minimal and scoped to the budgeting feature only.

**Expected output**
- A migration file that creates the budget tables and supporting indexes.
- The migration should be runnable against a local database without additional manual schema changes.

**Database usage**
- This migration is the foundation for all later budget persistence and approval flows.

**Verification**
- Run the migration locally and confirm that the new tables exist.
- Check that the indexes and foreign key constraints are present.

**OPEN DECISION**
- OPEN DECISION 3: The implementation.md says the team-confirmed schema should be the source of truth, but it does not explicitly define the exact status values for a budget. For v1, use a simple string status such as draft, active, or archived and document it in the implementation plan.

------------------------------------------------------------------------

# Phase 3 --- Financial Data Retrieval

## Task 5 --- Build recent transaction aggregation

Create a reusable service:

``` text
get_recent_financial_history(user_id, months=4)
```

Return structured data containing:

-   total income
-   total expenses
-   monthly totals
-   category spending
-   transaction counts

Use `transaction_date` for time windows.

Handle:

-   no history
-   less than 3 months
-   multiple months
-   income vs expense

------------------------------------------------------------------------

## Task 6 --- Build category spending aggregation

Create reusable category-level calculations for:

``` text
category_id
monthly spending
historical average
current-month spending
```

This service will be reused by:

-   budget generation
-   budget-vs-actual
-   dynamic adjustment detection
-   AI context

------------------------------------------------------------------------

## Task 7 --- Build financial context service

Create one service that gathers the personalization context needed by
the budgeting engine:

``` text
Recent Transactions
+
User Preferences
+
User Insights
+
Active Goals
+
Current income
```

### User Preferences

Use:

-   `budget_style`
-   `financial_priorities`
-   `risk_tolerance`
-   `currency`

### User Insights

Use relevant:

-   `insight_type`
-   `insight_value`
-   `confidence`
-   `last_updated`

Do not build a new learning system here.

### Goals

Use:

-   target amount
-   current amount
-   target date
-   priority
-   status

Return one structured financial-context object.

------------------------------------------------------------------------

# Phase 4 --- Deterministic Budget Engine

## Task 8 --- Define a common budget strategy interface

Create a strategy abstraction such as:

``` text
BudgetStrategy.generate(context) -> BudgetProposal
```

Implement:

``` text
50/30/20
Zero-Based
Custom
AI Personalized
```

Keep strategy logic out of route handlers.

------------------------------------------------------------------------

## Task 9 --- Implement 50/30/20

Implement the deterministic:

``` text
50% needs
30% wants
20% savings
```

Use the existing Categories system for category mapping rather than
hard-coded category strings where possible.

Test with known income values.

------------------------------------------------------------------------

## Task 10 --- Implement zero-based budgeting

Ensure:

``` text
income - allocations - planned_savings = 0
```

Enforce:

-   no negative allocations
-   allocations cannot exceed available income

Test known cases.

------------------------------------------------------------------------

## Task 11 --- Implement custom allocation

Use the existing user preference/configuration mechanism if one exists.

If custom allocation persistence is genuinely missing, mark the smallest
required change as an **OPEN DECISION** rather than inventing a new
subsystem.

------------------------------------------------------------------------

# Phase 5 --- Goal-Aware Budgeting

## Task 12 --- Calculate goal savings requirements

For each active goal, calculate the contribution needed to make
reasonable progress toward the target.

Prioritize:

1.  `priority`
2.  `target_date`

Handle:

-   completed goals
-   multiple goals
-   missing target dates
-   insufficient savings capacity

Return a structured goal contribution plan.

------------------------------------------------------------------------

## Task 13 --- Integrate goals into all budgeting strategies

Goals should affect planned savings rather than being ignored after
calculating a generic savings percentage.

Conceptually:

``` text
Income
 ├── essential spending
 ├── discretionary spending
 └── goal savings
```

Verify that high-priority, near-term goals receive appropriate savings
priority.

------------------------------------------------------------------------

# Phase 6 --- Budget Proposal & Validation

## Task 14 --- Define BudgetProposal schema

Create a structured internal representation such as:

``` json
{
  "total_income": 3000,
  "planned_savings": 600,
  "allocations": [
    {
      "category_id": "food",
      "amount": 500
    }
  ]
}
```

Follow existing project naming conventions.

------------------------------------------------------------------------

## Task 15 --- Implement deterministic budget validation

Validate every proposal before it becomes active.

Check:

-   numeric amounts
-   non-negative amounts
-   valid categories
-   allocation totals
-   available income
-   planned savings
-   goal requirements

The core flow must be:

``` text
Proposal
   ↓
Validator
   ├── invalid → reject/fallback
   └── valid → user review
```

Write unit tests for invalid proposals.

------------------------------------------------------------------------

# Phase 7 --- AI-Personalized Budgeting

## Task 16 --- Define structured AI budget output

AI should produce actual proposed allocations, not merely an
explanation.

Example:

``` json
{
  "allocations": [
    {
      "category_id": "dining",
      "amount": 280,
      "reason": "Recent spending is consistently above the preset baseline."
    }
  ],
  "planned_savings": 650,
  "reasoning": "Personalized based on recent spending, goals, and preferences.",
  "confidence": 0.86
}
```

Make the output schema strict and machine-parseable.

------------------------------------------------------------------------

## Task 17 --- Build AI budgeting context

Transform the financial context into concise AI input.

Include:

-   recent 3--4 month spending
-   category averages
-   income
-   selected budgeting style
-   financial priorities
-   risk tolerance
-   active goals
-   relevant User Insights

Do not send unnecessary raw database data.

------------------------------------------------------------------------

## Task 18 --- Implement AI personalized budget generation

Use the existing AI/Bedrock integration.

The AI should propose allocations based on the user's actual financial
context.

It should not:

-   invent transactions
-   invent goals
-   perform authoritative financial calculations
-   bypass budget constraints

### Cold-start behavior

When history is limited:

``` text
Preset strategy
+
available preferences
+
goals
+
available insights
        ↓
AI personalization
```

This allows AI budgeting to be available early without requiring
months/years of data.

------------------------------------------------------------------------

## Task 19 --- Validate AI output

Run AI output through the deterministic validator.

``` text
AI output
   ↓
Parse
   ↓
Validate
   ↓
Valid?
 ├── yes → user review
 └── no  → controlled retry or deterministic fallback
```

Test malformed JSON, negative amounts, invalid categories, and
over-allocation.

------------------------------------------------------------------------

## Task 20 --- Implement AI fallback

If the AI is unavailable, times out, returns invalid output, or fails
validation:

``` text
AI failure
    ↓
Selected deterministic strategy
```

Budgeting must remain functional without AI.

------------------------------------------------------------------------

# Phase 8 --- Monthly Budget Generation & Persistence

## Task 21 --- Implement monthly budget generation service

Flow:

``` text
Financial context
      ↓
Selected strategy
      ↓
Deterministic or AI budget proposal
      ↓
Validation
      ↓
Budget proposal
```

Do not persist until approval.

The holistic budget should be generated once per month rather than
regenerated on every transaction.

------------------------------------------------------------------------

## Task 22 --- Add budget generation API

Expose an endpoint following existing repository conventions.

Conceptually:

``` text
POST /budgets/generate
```

Input:

-   user
-   month/year
-   budgeting mode

Output:

-   income
-   planned savings
-   allocations
-   strategy
-   AI reasoning/recommendations where applicable
-   validation warnings

------------------------------------------------------------------------

## Task 23 --- Add budget approval API

Expose an approval endpoint following existing conventions.

Flow:

``` text
Frontend
   ↓
Approve proposal
   ↓
Backend re-validates
   ↓
Create Budget
   ↓
Create BudgetAllocations
   ↓
Mark active
```

Verify database state exactly matches the approved proposal.

------------------------------------------------------------------------

# Phase 9 --- Current Budget & Actual Spending

## Task 24 --- Implement current-budget retrieval

Return:

-   active monthly Budget
-   allocations
-   derived spent
-   derived remaining
-   variance

Do not duplicate transaction-derived values unnecessarily.

------------------------------------------------------------------------

## Task 25 --- Implement budget-vs-actual calculations

For each category:

``` text
allocated
actual_spent
remaining
variance
```

Example:

``` text
Dining
allocated = $300
spent     = $360
remaining = -$60
variance  = +$60
```

This service becomes the input to dynamic adjustment detection.

------------------------------------------------------------------------

# Phase 10 --- Dynamic Budget Adjustments

## Task 26 --- Implement spending trajectory calculation

Compare actual spending against expected monthly trajectory.

Do not simply use:

``` text
spent > allocation
```

because spending naturally varies throughout a month.

Consider:

-   days elapsed
-   expected spending trajectory
-   actual spending
-   remaining allocation
-   recent behavior

------------------------------------------------------------------------

## Task 27 --- Implement discrepancy detection

Detect meaningful situations such as:

-   category spending materially ahead of trajectory
-   unusually large expense
-   income change
-   repeated overspending
-   goal becoming difficult to reach
-   significant behavior change

Keep thresholds configurable.

------------------------------------------------------------------------

## Task 28 --- Implement deterministic adjustment calculation

Calculate feasible rebalancing options.

Example:

``` text
Travel is $250 above expected
        ↓
Goal savings must remain on track
        ↓
Potential:
Dining -$125
Entertainment -$125
```

The financial numbers must come from deterministic logic.

------------------------------------------------------------------------

## Task 29 --- Integrate User Insights into adjustment logic

Use relevant User Insights to make recommendations more realistic.

Example:

``` text
WeekendSpender = HIGH
confidence = 0.91
        ↓
Dining repeatedly exceeds budget
        ↓
Future adjustment considers that behavior
```

Do not build a new ML system.

------------------------------------------------------------------------

## Task 30 --- Add AI explanation/ranking for adjustments

AI may:

-   explain the adjustment
-   personalize the wording
-   rank already-valid deterministic options
-   explain tradeoffs

AI must not invent the financial numbers.

Flow:

``` text
Deterministic adjustment options
              ↓
             AI
              ↓
Personalized recommendation
```

------------------------------------------------------------------------

## Task 31 --- Persist adjustment recommendation

Use `AI Recommendations` where appropriate:

-   `user_id`
-   `type = budget update`
-   `recommendation`
-   `reasoning`
-   `accepted`
-   `timestamp`

Do not modify the active budget at recommendation-generation time.

------------------------------------------------------------------------

## Task 32 --- Implement adjustment approval/rejection

Reject/dismiss:

``` text
accepted = false
```

No budget modification.

Approve:

``` text
accepted = true
       ↓
Apply only approved allocation changes
```

------------------------------------------------------------------------

# Phase 11 --- Frontend

## Task 33 --- Build budget dashboard

Display:

-   monthly income
-   planned savings
-   category allocations
-   spent
-   remaining
-   variance

Keep the first version simple.

------------------------------------------------------------------------

## Task 34 --- Add budgeting-mode selector

Allow:

-   50/30/20
-   Zero-based
-   Custom
-   AI Personalized

AI Personalized should be available in the initial product flow, not
treated as a future placeholder.

------------------------------------------------------------------------

## Task 35 --- Build budget generation flow

Frontend:

``` text
Select mode
   ↓
Generate
   ↓
Loading
   ↓
Proposal
   ↓
Review
```

Do not save automatically.

------------------------------------------------------------------------

## Task 36 --- Build proposal review UI

Show:

-   total income
-   planned savings
-   category allocations
-   goal impact
-   relevant historical/contextual explanation
-   AI reasoning for AI-generated budgets

Actions:

``` text
Approve
Regenerate
Cancel
```

------------------------------------------------------------------------

## Task 37 --- Connect approval

On approval:

``` text
Frontend
   ↓
Approval API
   ↓
Backend validation
   ↓
Persist
   ↓
Refresh budget
```

------------------------------------------------------------------------

## Task 38 --- Display adjustment recommendations

Show:

-   what is deviating
-   why the system noticed it
-   proposed changes
-   goal impact
-   recommendation reasoning

Actions:

``` text
Accept
Dismiss
```

------------------------------------------------------------------------

## Task 39 --- Connect adjustment approval

Accepting updates only the approved allocations.

Rejecting does not change the active budget.

------------------------------------------------------------------------

# Phase 12 --- Testing

## Task 40 --- Unit-test transaction aggregation

Cover:

-   income
-   expenses
-   category grouping
-   3--4 month window
-   missing history
-   multiple months

------------------------------------------------------------------------

## Task 41 --- Unit-test budgeting strategies

Cover:

-   50/30/20
-   zero-based
-   custom
-   goal-aware allocation

Verify totals and constraints.

------------------------------------------------------------------------

## Task 42 --- Unit-test budget validation

Cover:

-   negative values
-   invalid categories
-   over-allocation
-   invalid savings
-   malformed proposals

------------------------------------------------------------------------

## Task 43 --- Unit-test AI output handling

Cover:

-   valid structured output
-   malformed output
-   missing fields
-   invalid types
-   invalid categories
-   over-allocation
-   fallback behavior

------------------------------------------------------------------------

## Task 44 --- Integration-test monthly budget flow

Verify:

``` text
Transactions
+
Goals
+
Preferences
+
Insights
      ↓
Generate
      ↓
Validate
      ↓
Approve
      ↓
Database
```

------------------------------------------------------------------------

## Task 45 --- Integration-test dynamic adjustment

Verify:

``` text
Budget
+
Transactions
      ↓
Discrepancy
      ↓
Adjustment
      ↓
Approve
      ↓
Updated allocation
```

Also test rejection.

------------------------------------------------------------------------

## Task 46 --- Frontend/E2E test

Verify:

``` text
Select mode
   ↓
Generate
   ↓
Review
   ↓
Approve
   ↓
View active budget
   ↓
Spending deviates
   ↓
Adjustment appears
   ↓
Accept/reject
```

------------------------------------------------------------------------

# Phase 13 --- Final Definition of Done

The budgeting feature is ready for review when:

-   [ ] Recent 3--4 month history is used.
-   [ ] Monthly holistic budgets are generated once per month.
-   [ ] 50/30/20 works.
-   [ ] Zero-based budgeting works.
-   [ ] Custom budgeting works.
-   [ ] AI-personalized budgeting is available.
-   [ ] AI uses recent spending.
-   [ ] AI uses User Preferences.
-   [ ] AI uses active Goals.
-   [ ] AI uses relevant User Insights.
-   [ ] AI proposes actual budget allocations.
-   [ ] Deterministic validation is the financial source of truth.
-   [ ] Invalid AI output cannot become an active budget.
-   [ ] AI failure falls back safely.
-   [ ] User approves the monthly budget before persistence.
-   [ ] Actual spending is derived from Transactions.
-   [ ] Dynamic spending discrepancies can be detected.
-   [ ] Adjustment recommendations can be generated during the month.
-   [ ] User Insights can influence adjustment recommendations.
-   [ ] Adjustment recommendations require user approval.
-   [ ] Approved adjustments update only the intended allocations.
-   [ ] Core financial logic has unit tests.
-   [ ] API flows have integration tests.
-   [ ] Frontend supports the core budget workflow.
-   [ ] Goal Simulation remains outside this implementation phase.

------------------------------------------------------------------------

# Recommended Git Commit Structure

Keep commits small and logically scoped:

``` text
1. Add/verify budgeting database models
2. Add transaction aggregation
3. Add financial context service
4. Add budget strategy interface
5. Implement 50/30/20
6. Implement zero-based budgeting
7. Implement custom allocation
8. Add goal-aware allocation
9. Add budget proposal validation
10. Add AI personalized budgeting
11. Add AI validation and fallback
12. Add monthly budget API
13. Add budget approval/persistence
14. Add current budget and actual spending
15. Add spending trajectory detection
16. Add adjustment calculation
17. Add AI adjustment recommendations
18. Add adjustment approval flow
19. Add budget frontend
20. Add budgeting mode selector
21. Add proposal review UI
22. Add adjustment UI
23. Add backend tests
24. Add frontend/E2E tests
```

# Final Dependency Map

``` text
Repository verification
        ↓
Database/domain models
        ↓
Transaction aggregation
        ↓
Financial context
        ├──────────────┐
        ↓              ↓
Preset strategies    Goals
        │              │
        └──────┬───────┘
               ↓
       Deterministic Engine
               │
               ├──────────────┐
               ↓              ↓
        AI Personalization  Validation
               │              │
               └──────┬───────┘
                      ↓
                Budget Proposal
                      ↓
                 User Review
                      ↓
                   Approval
                      ↓
             Budget + Allocations
                      ↓
              Actual Transactions
                      ↓
             Trajectory Detection
                      ↓
             Adjustment Calculation
                      ↓
              AI Recommendation
                      ↓
                 User Approval
                      ↓
              Updated Allocation
```

## Core principle

> **AI learns from user behavior and proposes increasingly personalized
> budgets, while deterministic financial logic remains the source of
> truth for calculations, constraints, and validation.**

The monthly budget provides structure. Dynamic adjustments provide
adaptation. Transactions provide financial ground truth. Goals, User
Preferences, and User Insights provide personalization.
