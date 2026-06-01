"""add custom_roles table and custom_role_id to users

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "custom_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("permissions", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column(
        "users",
        sa.Column(
            "custom_role_id",
            UUID(as_uuid=True),
            sa.ForeignKey("custom_roles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_users_custom_role_id", "users", ["custom_role_id"])


def downgrade():
    op.drop_index("ix_users_custom_role_id", table_name="users")
    op.drop_column("users", "custom_role_id")
    op.drop_table("custom_roles")
