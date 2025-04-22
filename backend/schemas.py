from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, List

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    unit: str
    code: Optional[str] = None
    specification: Optional[str] = None
    reference_days: Optional[int] = 5
    current_stock: Optional[float] = 0

class ProductCreate(ProductBase):
    pass

class Product(ProductBase):
    id: int

    class Config:
        from_attributes = True

class SalesBase(BaseModel):
    product_id: int
    date: date
    quantity: float

class SalesCreate(SalesBase):
    pass

class Sales(SalesBase):
    id: int
    product: Product

    class Config:
        from_attributes = True

class ArrivalBase(BaseModel):
    product_id: int
    order_date: date
    expected_date: date
    quantity: float
    status: str = "pending"

class ArrivalCreate(ArrivalBase):
    pass

class ArrivalUpdate(BaseModel):
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    status: Optional[str] = None
    quantity: Optional[float] = None
    expected_date: Optional[date] = None

class Arrival(ArrivalBase):
    id: int
    product_code: str
    product_name: str
    created_at: datetime
    updated_at: datetime
    product: Optional[Product] = None

    class Config:
        from_attributes = True

class OrderRequest(BaseModel):
    order_date: datetime
    items: List[dict]

class OrderResponse(BaseModel):
    product_id: int
    order_quantity: float
    expected_date: date 