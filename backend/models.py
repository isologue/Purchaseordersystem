from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    unit = Column(String)
    code = Column(String, unique=True, index=True)  # 商品编码
    specification = Column(String, nullable=True)  # 新增规格字段
    reference_days = Column(Integer, default=5)  # 预估天数
    current_stock = Column(Float, default=0)  # 添加实时库存字段
    sales = relationship("Sales", back_populates="product", cascade="all, delete-orphan")
    arrivals = relationship("Arrival", back_populates="product")

class Sales(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    date = Column(Date)
    quantity = Column(Float)
    product = relationship("Product", back_populates="sales") 

class Arrival(Base):
    __tablename__ = "arrivals"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    product_code = Column(String, index=True)  # 新增商品编码字段
    product_name = Column(String, index=True)  # 新增商品名称字段
    order_date = Column(Date)  # 下单日期
    expected_date = Column(Date)  # 预计到货日期
    quantity = Column(Float)  # 到货数量
    status = Column(String, default="pending")  # pending: 待到货, arrived: 已到货, cancelled: 已取消
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="arrivals") 