"""add user_name to charging_sessions

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "charging_sessions",
        sa.Column("user_name", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("charging_sessions", "user_name")
