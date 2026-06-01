"""add charger_capex table

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-31
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "charger_capex",
        sa.Column("id", UUID(), nullable=False),
        sa.Column("org_id", UUID(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("charger_type", sa.String(50), nullable=True),
        sa.Column("num_chargers", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("station_key", sa.String(500), nullable=True),
        sa.Column("capex_brl", sa.Float(), nullable=False),
        sa.Column("opex_pct", sa.Float(), nullable=False, server_default="0.25"),
        sa.Column("tax_pct", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("monthly_revenue_est", sa.Float(), nullable=True),
        sa.Column("installed_at", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_charger_capex_org_id", "charger_capex", ["org_id"])
    op.create_index("ix_charger_capex_station_key", "charger_capex", ["station_key"])


def downgrade():
    op.drop_index("ix_charger_capex_station_key", "charger_capex")
    op.drop_index("ix_charger_capex_org_id", "charger_capex")
    op.drop_table("charger_capex")
