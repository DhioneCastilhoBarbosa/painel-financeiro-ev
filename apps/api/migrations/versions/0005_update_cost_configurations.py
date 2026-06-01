"""update cost_configurations — align with OPEX/split/tax fields

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # ── Add new fixed-cost columns (R$/mês) ──────────────────────────────────
    op.add_column("cost_configurations", sa.Column("demand_cost",             sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("internet_monthly",        sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("preventive_maintenance",  sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("corrective_maintenance",  sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("rent",                    sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("insurance",               sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("admin_costs",             sa.Float, nullable=False, server_default="0"))

    # ── Add backend_monthly (from platform_fixed_monthly) ───────────────────
    op.add_column("cost_configurations", sa.Column("backend_monthly", sa.Float, nullable=False, server_default="0"))
    op.execute("UPDATE cost_configurations SET backend_monthly = platform_fixed_monthly")

    # ── Add payment_gateway_pct (from platform_fee_pct) ─────────────────────
    op.add_column("cost_configurations", sa.Column("payment_gateway_pct", sa.Float, nullable=False, server_default="0.025"))
    op.execute("UPDATE cost_configurations SET payment_gateway_pct = platform_fee_pct")

    # ── Add default_rate_pct (from operational_cost_pct) ────────────────────
    op.add_column("cost_configurations", sa.Column("default_rate_pct", sa.Float, nullable=False, server_default="0.01"))
    op.execute("UPDATE cost_configurations SET default_rate_pct = operational_cost_pct")

    # ── Add split base ───────────────────────────────────────────────────────
    op.add_column("cost_configurations", sa.Column("revenue_split_base", sa.String(20), nullable=False, server_default="revenue"))

    # ── Add tax_rate_pct (from tax_pct) + tax_base ───────────────────────────
    op.add_column("cost_configurations", sa.Column("tax_rate_pct", sa.Float, nullable=False, server_default="0"))
    op.execute("UPDATE cost_configurations SET tax_rate_pct = tax_pct")
    op.add_column("cost_configurations", sa.Column("tax_base", sa.String(20), nullable=False, server_default="profit"))

    # ── Drop deprecated columns ──────────────────────────────────────────────
    op.drop_column("cost_configurations", "operational_cost_pct")
    op.drop_column("cost_configurations", "platform_fee_pct")
    op.drop_column("cost_configurations", "platform_fixed_monthly")
    op.drop_column("cost_configurations", "maintenance_monthly")
    op.drop_column("cost_configurations", "tax_pct")


def downgrade():
    # Restore deprecated columns
    op.add_column("cost_configurations", sa.Column("operational_cost_pct",  sa.Float, nullable=False, server_default="0.05"))
    op.add_column("cost_configurations", sa.Column("platform_fee_pct",      sa.Float, nullable=False, server_default="0.03"))
    op.add_column("cost_configurations", sa.Column("platform_fixed_monthly",sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("maintenance_monthly",   sa.Float, nullable=False, server_default="0"))
    op.add_column("cost_configurations", sa.Column("tax_pct",               sa.Float, nullable=False, server_default="0.06"))

    op.execute("UPDATE cost_configurations SET platform_fee_pct = payment_gateway_pct")
    op.execute("UPDATE cost_configurations SET operational_cost_pct = default_rate_pct")
    op.execute("UPDATE cost_configurations SET platform_fixed_monthly = backend_monthly")
    op.execute("UPDATE cost_configurations SET maintenance_monthly = preventive_maintenance")
    op.execute("UPDATE cost_configurations SET tax_pct = tax_rate_pct")

    op.drop_column("cost_configurations", "demand_cost")
    op.drop_column("cost_configurations", "internet_monthly")
    op.drop_column("cost_configurations", "backend_monthly")
    op.drop_column("cost_configurations", "preventive_maintenance")
    op.drop_column("cost_configurations", "corrective_maintenance")
    op.drop_column("cost_configurations", "rent")
    op.drop_column("cost_configurations", "insurance")
    op.drop_column("cost_configurations", "admin_costs")
    op.drop_column("cost_configurations", "payment_gateway_pct")
    op.drop_column("cost_configurations", "default_rate_pct")
    op.drop_column("cost_configurations", "revenue_split_base")
    op.drop_column("cost_configurations", "tax_rate_pct")
    op.drop_column("cost_configurations", "tax_base")
