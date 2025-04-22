"""merge heads

Revision ID: merge_heads_revision
Revises: 9aaa774f1353, 01808a83b111
Create Date: 2024-03-23 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'merge_heads_revision'
down_revision: Union[str, None] = ('9aaa774f1353', '01808a83b111')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass 