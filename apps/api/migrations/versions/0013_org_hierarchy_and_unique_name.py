"""org hierarchy: is_mother flag and unique org name

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-03
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Adiciona flag is_mother em organizations
    op.add_column(
        "organizations",
        sa.Column("is_mother", sa.Boolean(), nullable=False, server_default="false"),
    )

    # 2. Constraint de unicidade no nome da organização (todas as orgs)
    op.create_unique_constraint("uq_organizations_name", "organizations", ["name"])

    # 3. Marca a org Intelbras como mãe (se já existir no banco)
    op.execute(
        "UPDATE organizations SET is_mother = true WHERE lower(trim(name)) = 'intelbras'"
    )

    # 4. Cria a org Intelbras caso ainda não exista
    intelbras_id = str(uuid.uuid4())
    op.execute(
        f"""
        INSERT INTO organizations (id, name, slug, plan, status, settings, is_mother,
                                   created_at, trial_ends_at)
        SELECT '{intelbras_id}', 'Intelbras', 'intelbras', 'enterprise', 'active',
               '{{}}'::jsonb, true, NOW(), NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM organizations WHERE lower(trim(name)) = 'intelbras'
        )
        """
    )


def downgrade():
    op.drop_constraint("uq_organizations_name", "organizations", type_="unique")
    op.drop_column("organizations", "is_mother")
