"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Organizations
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("plan", sa.String(50), default="trial"),
        sa.Column("status", sa.String(50), default="active"),
        sa.Column("settings", postgresql.JSONB, default={}),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"])

    # Users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), default="analyst"),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_organization_id", "users", ["organization_id"])

    # Invitations
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("token", sa.String(255), nullable=False, unique=True),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Subscriptions
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("plan", sa.String(50), default="trial"),
        sa.Column("status", sa.String(50), default="trialing"),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Cost configurations
    op.create_table(
        "cost_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_default", sa.Boolean, default=False),
        sa.Column("energy_cost_per_kwh", sa.Float, default=0.75),
        sa.Column("operational_cost_pct", sa.Float, default=0.05),
        sa.Column("platform_fee_pct", sa.Float, default=0.03),
        sa.Column("platform_fixed_monthly", sa.Float, default=0.0),
        sa.Column("tax_pct", sa.Float, default=0.06),
        sa.Column("maintenance_monthly", sa.Float, default=0.0),
        sa.Column("revenue_split_pct", sa.Float, default=0.0),
        sa.Column("depreciation_years", sa.Integer, default=5),
        sa.Column("discount_rate_annual", sa.Float, default=0.12),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cost_configurations_organization_id", "cost_configurations", ["organization_id"])

    # Data files
    op.create_table(
        "data_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("storage_key", sa.String(1000), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, default=0),
        sa.Column("status", sa.String(50), default="pending"),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("date_min", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_max", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stations", postgresql.JSONB, default=[]),
        sa.Column("connector_types", postgresql.JSONB, default=[]),
        sa.Column("extra_metadata", postgresql.JSONB, default={}),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_data_files_organization_id", "data_files", ["organization_id"])

    # Charging sessions — chave primária composta (id, started_at) exigida pelo TimescaleDB
    op.create_table(
        "charging_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("data_files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Float, nullable=True),
        sa.Column("station_name", sa.String(500), nullable=True),
        sa.Column("connector_type", sa.String(100), nullable=True),
        sa.Column("user_tag", sa.String(500), nullable=True),
        sa.Column("revenue_total", sa.Numeric(10, 4), default=0),
        sa.Column("revenue_start_fee", sa.Numeric(10, 4), default=0),
        sa.Column("revenue_energy", sa.Numeric(10, 4), default=0),
        sa.Column("revenue_idle", sa.Numeric(10, 4), default=0),
        sa.Column("energy_kwh", sa.Numeric(10, 4), default=0),
        sa.Column("payment_status", sa.String(50), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("is_paid", sa.Boolean, default=False),
        sa.Column("has_voucher", sa.Boolean, default=False),
        sa.Column("raw", postgresql.JSONB, default={}),
        sa.PrimaryKeyConstraint("id", "started_at"),
    )
    op.create_index("ix_charging_sessions_organization_id", "charging_sessions", ["organization_id"])
    op.create_index("ix_charging_sessions_started_at", "charging_sessions", ["started_at"])
    op.create_index("ix_charging_sessions_file_id", "charging_sessions", ["file_id"])
    op.create_index("ix_charging_sessions_station_name", "charging_sessions", ["station_name"])

    # Converter para TimescaleDB hypertable
    op.execute(
        "SELECT create_hypertable('charging_sessions', 'started_at', if_not_exists => TRUE)"
    )

    # Payback scenarios
    op.create_table(
        "payback_scenarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("share_token", sa.String(255), nullable=True, unique=True),
        sa.Column("inputs", postgresql.JSONB, default={}),
        sa.Column("results", postgresql.JSONB, default={}),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_payback_scenarios_organization_id", "payback_scenarios", ["organization_id"])


def downgrade() -> None:
    op.drop_table("payback_scenarios")
    op.drop_table("charging_sessions")
    op.drop_table("data_files")
    op.drop_table("cost_configurations")
    op.drop_table("subscriptions")
    op.drop_table("invitations")
    op.drop_table("users")
    op.drop_table("organizations")
