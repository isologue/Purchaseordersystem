"""add product fields to arrivals table

Revision ID: add_product_fields_arrivals
Revises: 01808a83b111
Create Date: 2024-03-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_product_fields_arrivals'
down_revision: Union[str, None] = '01808a83b111'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add product_code and product_name columns to arrivals table."""
    op.add_column('arrivals', sa.Column('product_code', sa.String(), nullable=True))
    op.add_column('arrivals', sa.Column('product_name', sa.String(), nullable=True))
    op.create_index(op.f('ix_arrivals_product_code'), 'arrivals', ['product_code'], unique=False)
    op.create_index(op.f('ix_arrivals_product_name'), 'arrivals', ['product_name'], unique=False)


def downgrade() -> None:
    """Remove product_code and product_name columns from arrivals table."""
    op.drop_index(op.f('ix_arrivals_product_name'), table_name='arrivals')
    op.drop_index(op.f('ix_arrivals_product_code'), table_name='arrivals')
    op.drop_column('arrivals', 'product_name')
    op.drop_column('arrivals', 'product_code') 