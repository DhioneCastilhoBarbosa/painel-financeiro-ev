"""add cnpj and message to leads

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("leads", sa.Column("cnpj", sa.String(20), nullable=True))
    op.add_column("leads", sa.Column("message", sa.String(1000), nullable=True))


def downgrade():
    op.drop_column("leads", "message")
    op.drop_column("leads", "cnpj")
