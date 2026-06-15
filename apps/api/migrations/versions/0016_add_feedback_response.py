"""add admin_response to feedback

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotente: só adiciona a coluna se ainda não existir.
    bind = op.get_bind()
    insp = inspect(bind)
    if "feedback" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("feedback")}
    if "admin_response" not in columns:
        op.add_column("feedback", sa.Column("admin_response", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "feedback" in insp.get_table_names():
        columns = {c["name"] for c in insp.get_columns("feedback")}
        if "admin_response" in columns:
            op.drop_column("feedback", "admin_response")
