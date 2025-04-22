"""add arrivals table

Revision ID: 01808a83b111
Revises: previous_revision
Create Date: 2024-03-22 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = '01808a83b111'
down_revision: Union[str, None] = None  # 请替换为您实际的上一个版本号
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 检查表是否已存在
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()
    
    if 'arrivals' not in tables:
        op.create_table('arrivals',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('product_id', sa.Integer(), nullable=False),
            sa.Column('order_date', sa.Date(), nullable=False),
            sa.Column('expected_date', sa.Date(), nullable=False),
            sa.Column('quantity', sa.Float(), nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default='pending'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_arrivals_product_id'), 'arrivals', ['product_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_arrivals_product_id'), table_name='arrivals')
    op.drop_table('arrivals')
