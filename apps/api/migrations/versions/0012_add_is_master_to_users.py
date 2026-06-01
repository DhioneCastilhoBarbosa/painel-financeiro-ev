"""add is_master to users

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-01
"""
import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("is_master", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.execute(
        "UPDATE users SET is_master = true WHERE email = 'jorgesch07@gmail.com'"
    )


def downgrade():
    op.drop_column("users", "is_master")
