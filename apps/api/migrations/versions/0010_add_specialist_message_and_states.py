"""add specialist_message to leads and states to lead_notification_emails

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("leads", sa.Column("specialist_message", sa.String(2000), nullable=True))
    op.add_column(
        "lead_notification_emails",
        sa.Column("states", JSONB(), nullable=False, server_default="[]"),
    )


def downgrade():
    op.drop_column("leads", "specialist_message")
    op.drop_column("lead_notification_emails", "states")
