"""add_current_stock_to_product

Revision ID: 9aaa774f1353
Revises: a41d9f3b6f86
Create Date: 2025-03-22 14:13:04.714473

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9aaa774f1353'
down_revision: Union[str, None] = 'a41d9f3b6f86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('products', sa.Column('current_stock', sa.Float(), nullable=True, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('products', 'current_stock')
