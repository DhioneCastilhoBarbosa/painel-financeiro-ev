"""add admin_response to feedback

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column("admin_response", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("feedback", "admin_response")
