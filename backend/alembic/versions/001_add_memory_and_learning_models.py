"""add memory and learning models

Revision ID: 001
Revises:
Create Date: 2026-07-20

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users (base table required by all FK relationships) ---
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- user_profiles ---
    op.create_table(
        "user_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("monthly_income", sa.Float(), nullable=True),
        sa.Column("income_frequency", sa.String(20), nullable=True),
        sa.Column("risk_tolerance", sa.String(20), nullable=False, server_default="moderate"),
        sa.Column("savings_priority", sa.String(20), nullable=False, server_default="balanced"),
        sa.Column("spending_categories", sa.JSON(), nullable=True),
        sa.Column("notification_preferences", sa.JSON(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("financial_situation_notes", sa.Text(), nullable=True),
        sa.Column("behavior_profile", sa.JSON(), nullable=True),
        sa.Column("last_learning_update", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- financial_memories ---
    op.create_table(
        "financial_memories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("memory_type", sa.Enum(
            "transaction", "goal", "income", "recurring_expense",
            "note", "pattern", "preference",
            name="memorytype",
        ), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("importance", sa.Enum(
            "low", "medium", "high", "critical",
            name="memoryimportance",
        ), nullable=False, server_default="medium"),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(50), nullable=True),
        sa.Column("source_id", sa.String(36), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_fm_user_type", "financial_memories", ["user_id", "memory_type"])
    op.create_index("idx_fm_user_category", "financial_memories", ["user_id", "category"])
    op.create_index("idx_fm_user_not_deleted", "financial_memories", ["user_id", "is_deleted"])

    # --- memory_embeddings ---
    op.create_table(
        "memory_embeddings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "memory_id",
            sa.String(36),
            sa.ForeignKey("financial_memories.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("embedding_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.Column("model_version", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_me_memory_id", "memory_embeddings", ["memory_id"])

    # Vector index for approximate nearest-neighbor search.
    # Vector storage is supported from CockroachDB v24.2; HNSW support can
    # vary by version, so brute-force ORDER BY <=> remains the fallback.
    try:
        op.execute("""
            CREATE INDEX idx_me_vector
            ON memory_embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """)
    except Exception:
        pass  # Fallback to brute-force scan if HNSW not yet supported

    # --- spending_patterns ---
    op.create_table(
        "spending_patterns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("pattern_type", sa.Enum(
            "recurring", "seasonal", "behavioral", "trend", "category_shift",
            name="patterntype",
        ), nullable=False),
        sa.Column("status", sa.Enum(
            "active", "expired", "tentative",
            name="patternstatus",
        ), nullable=False, server_default="tentative"),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("average_amount", sa.Float(), nullable=True),
        sa.Column("frequency_days", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("time_of_day", sa.String(20), nullable=True),
        sa.Column("data_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pattern_data", sa.JSON(), nullable=True),
        sa.Column("next_expected_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("predicted_amount", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_sp_user_status", "spending_patterns", ["user_id", "status"])
    op.create_index("idx_sp_user_category", "spending_patterns", ["user_id", "category"])

    # --- user_decisions ---
    op.create_table(
        "user_decisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("item_description", sa.Text(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("ai_recommendation", sa.Enum("buy", "wait", "skip", name="decisiontype"), nullable=False),
        sa.Column("ai_reasoning", sa.Text(), nullable=False),
        sa.Column("user_decision", sa.Enum("buy", "wait", "skip", name="decisiontype"), nullable=False),
        sa.Column("outcome", sa.Enum(
            "followed", "overridden", "pending",
            name="decisionoutcome",
        ), nullable=False, server_default="pending"),
        sa.Column("context_snapshot", sa.JSON(), nullable=True),
        sa.Column("user_feedback", sa.Text(), nullable=True),
        sa.Column("was_helpful", sa.Boolean(), nullable=True),
        sa.Column("memory_id", sa.String(36), sa.ForeignKey("financial_memories.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_ud_user", "user_decisions", ["user_id"])
    op.create_index("idx_ud_user_category", "user_decisions", ["user_id", "category"])
    op.create_index("idx_ud_user_outcome", "user_decisions", ["user_id", "outcome"])


def downgrade() -> None:
    op.drop_table("user_decisions")
    op.drop_table("spending_patterns")
    op.drop_table("memory_embeddings")
    op.drop_table("financial_memories")
    op.drop_table("user_profiles")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS decisionoutcome")
    op.execute("DROP TYPE IF EXISTS decisiontype")
    op.execute("DROP TYPE IF EXISTS patternstatus")
    op.execute("DROP TYPE IF EXISTS patterntype")
    op.execute("DROP TYPE IF EXISTS memoryimportance")
    op.execute("DROP TYPE IF EXISTS memorytype")
