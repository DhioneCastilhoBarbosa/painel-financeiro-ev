"""add custom_role_id to invitations

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "invitations",
        sa.Column(
            "custom_role_id",
            UUID(as_uuid=True),
            sa.ForeignKey("custom_roles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("invitations", "custom_role_id")
