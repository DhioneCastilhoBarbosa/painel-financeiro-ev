"""add leads, simulator_config and lead_notification_emails

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

DEFAULT_CHARGER_CONFIGS = {
    "AC 7,4 kW": {"price_brl": 8000, "power_kw": 7.4, "avg_sessions_day": 3, "avg_duration_min": 90},
    "AC 22 kW": {"price_brl": 15000, "power_kw": 22.0, "avg_sessions_day": 4, "avg_duration_min": 60},
    "DC 30 kW": {"price_brl": 45000, "power_kw": 30.0, "avg_sessions_day": 5, "avg_duration_min": 45},
    "DC 60 kW": {"price_brl": 75000, "power_kw": 60.0, "avg_sessions_day": 6, "avg_duration_min": 35},
    "DC 80 kW": {"price_brl": 95000, "power_kw": 80.0, "avg_sessions_day": 6, "avg_duration_min": 30},
    "DC 120 kW": {"price_brl": 130000, "power_kw": 120.0, "avg_sessions_day": 7, "avg_duration_min": 25},
    "DC 180 kW": {"price_brl": 180000, "power_kw": 180.0, "avg_sessions_day": 8, "avg_duration_min": 20},
}


def upgrade():
    # ── leads ──────────────────────────────────────────────────────────────
    op.create_table(
        "leads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("charger_type", sa.String(50), nullable=False, index=True),
        sa.Column("sector", sa.String(100), nullable=False, index=True),
        sa.Column("position", sa.String(100), nullable=False),
        sa.Column("num_chargers", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("simulation_result", JSONB(), nullable=False, server_default="{}"),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            index=True,
        ),
    )

    # ── simulator_config ───────────────────────────────────────────────────
    op.create_table(
        "simulator_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("charger_configs", JSONB(), nullable=False),
        sa.Column("price_per_kwh", sa.Float(), nullable=False, server_default="0.85"),
        sa.Column("opex_pct", sa.Float(), nullable=False, server_default="0.25"),
        sa.Column("growth_pct_month", sa.Float(), nullable=False, server_default="0.03"),
        sa.Column("discount_rate_annual", sa.Float(), nullable=False, server_default="0.12"),
        sa.Column("projection_years", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # Insert default config row
    import json
    op.execute(
        f"""
        INSERT INTO simulator_config (id, charger_configs, price_per_kwh, opex_pct,
            growth_pct_month, discount_rate_annual, projection_years, is_active, updated_at)
        VALUES (gen_random_uuid(), '{json.dumps(DEFAULT_CHARGER_CONFIGS)}'::jsonb,
            0.85, 0.25, 0.03, 0.12, 5, true, now())
        """
    )

    # ── lead_notification_emails ───────────────────────────────────────────
    op.create_table(
        "lead_notification_emails",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade():
    op.drop_table("lead_notification_emails")
    op.drop_table("simulator_config")
    op.drop_table("leads")
