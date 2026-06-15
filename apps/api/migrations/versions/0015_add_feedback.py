"""add feedback table

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import UUID

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotente: não falha se a tabela/índice já existirem (ex.: deploy parcial
    # anterior que criou a tabela mas não registrou a revisão no alembic_version).
    bind = op.get_bind()

    if "feedback" not in inspect(bind).get_table_names():
        op.create_table(
            "feedback",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("user_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("user_email", sa.String(255), nullable=False, server_default=""),
            sa.Column("type", sa.String(50), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    # Re-inspeciona após possível criação para refletir o estado atual.
    existing_indexes = {ix["name"] for ix in inspect(bind).get_indexes("feedback")}
    if "ix_feedback_organization_id" not in existing_indexes:
        op.create_index("ix_feedback_organization_id", "feedback", ["organization_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "feedback" in inspect(bind).get_table_names():
        existing_indexes = {ix["name"] for ix in inspect(bind).get_indexes("feedback")}
        if "ix_feedback_organization_id" in existing_indexes:
            op.drop_index("ix_feedback_organization_id", "feedback")
        op.drop_table("feedback")
