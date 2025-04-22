from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, date
import statistics
from database import SessionLocal, engine
import models
import schemas
from sqlalchemy.orm import joinedload
import pandas as pd
import io
from fastapi.responses import FileResponse
import tempfile
from fastapi import Depends
from sqlalchemy.orm import Session
from io import BytesIO
from fastapi.responses import StreamingResponse
import re
from sqlalchemy import func, cast, Date
import pytz

app = FastAPI()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建数据库表
models.Base.metadata.create_all(bind=engine)

# 数据库依赖
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/api/download-sales-template")
async def download_sales_template():
    try:
        # 获取所有商品列表
        db = SessionLocal()
        products = db.query(models.Product).all()
        db.close()

        # 创建示例数据 - 从今天开始，往后7天
        dates = [(datetime.now() + timedelta(days=i)).strftime('%Y/%#m/%#d') for i in range(7)]
        
        # 创建DataFrame
        df = pd.DataFrame(columns=['商品编码'] + dates)
        
        # 添加示例数据
        for product in products[:5]:  # 只添加前5个商品作为示例
            row = [product.code or '']
            row.extend([0] * len(dates))  # 添加0作为示例销量
            df.loc[len(df)] = row

        # 保存为Excel文件
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='销量数据')
            
            # 获取工作表
            worksheet = writer.sheets['销量数据']
            
            # 设置列宽
            worksheet.column_dimensions['A'].width = 15  # 商品编码列
            for i in range(len(dates)):
                worksheet.column_dimensions[chr(66 + i)].width = 12  # 日期列

        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=sales_template.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class OrderItem(BaseModel):
    product_id: int
    current_stock: float
    in_transit_stock: float
    reference_days: int

class OrderRequest(BaseModel):
    items: List[OrderItem]
    order_date: datetime

class ProductCreate(BaseModel):
    code: str
    name: str
    unit: str
    description: Optional[str] = None
    specification: Optional[str] = None
    reference_days: Optional[int] = 5

# 商品管理API
@app.get("/api/products")
async def get_products(code: Optional[str] = None, name: Optional[str] = None):
    db = SessionLocal()
    try:
        query = db.query(models.Product)
        
        if code:
            query = query.filter(models.Product.code.ilike(f"%{code}%"))
        if name:
            query = query.filter(models.Product.name.ilike(f"%{name}%"))
            
        products = query.all()
        return products
    finally:
        db.close()

@app.post("/api/products/")
def create_product(product: ProductCreate):
    db = SessionLocal()
    try:
        db_product = models.Product(
            code=product.code,
            name=product.name,
            unit=product.unit,
            description=product.description,
            specification=product.specification,
            reference_days=product.reference_days
        )
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@app.put("/api/products/{product_id}")
async def update_product(product_id: int, product: schemas.ProductCreate):
    db = SessionLocal()
    try:
        db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not db_product:
            raise HTTPException(status_code=404, detail="商品不存在")
        
        for key, value in product.model_dump().items():
            setattr(db_product, key, value)
            
        db.commit()
        db.refresh(db_product)
        return db_product
    finally:
        db.close()

@app.delete("/api/products/{product_id}")
async def delete_product(product_id: int):
    db = SessionLocal()
    try:
        db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not db_product:
            raise HTTPException(status_code=404, detail="商品不存在")
        
        db.delete(db_product)
        db.commit()
        return {"message": "商品已删除"}
    finally:
        db.close()

@app.get("/api/download-product-template")
def download_product_template():
    df = pd.DataFrame(columns=['商品编码', '商品名称', '单位', '规格', '预估天数', '描述'])
    df.loc[0] = ['G001', '示例商品1', '个', '规格1', 5, '商品1的详细描述']
    df.loc[1] = ['G002', '示例商品2', '箱', '规格2', 7, '商品2的详细描述']
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename=product_template.xlsx',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
    return StreamingResponse(output, headers=headers)

@app.post("/api/import-products")
def import_products(file: UploadFile = File(...)):
    if not file.filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="Only .xlsx files are allowed")
    
    try:
        print("\n" + "="*50)
        print("开始导入商品数据...")
        
        df = pd.read_excel(file.file)
        required_columns = ['商品编码', '商品名称', '单位']
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=400, detail="Missing required columns")
        
        print("\n检测到的列:")
        print(f"- 必需列: {required_columns}")
        print(f"- 可选列: ['规格', '预估天数', '描述']")
        print(f"- 实际列: {list(df.columns)}")
        
        db = SessionLocal()
        try:
            updated_count = 0
            created_count = 0
            
            print("\n开始处理商品数据:")
            for _, row in df.iterrows():
                product_code = str(row['商品编码']).strip()
                if pd.isna(product_code):
                    print(f"跳过空行")
                    continue
                
                print("\n" + "-"*30)
                print(f"处理商品: {product_code}")
                
                product_data = {
                    'code': product_code,
                    'name': str(row['商品名称']).strip(),
                    'unit': str(row['单位']).strip(),
                    'specification': str(row['规格']).strip() if '规格' in df.columns and pd.notna(row['规格']) else None,
                    'description': str(row['描述']).strip() if '描述' in df.columns and pd.notna(row['描述']) else None,
                    'reference_days': int(row['预估天数']) if '预估天数' in df.columns and pd.notna(row['预估天数']) else 5
                }
                
                print("商品信息:")
                for key, value in product_data.items():
                    print(f"- {key}: {value}")
                
                existing_product = db.query(models.Product).filter(models.Product.code == product_code).first()
                if existing_product:
                    print("\n更新已存在的商品:")
                    print(f"- ID: {existing_product.id}")
                    print("- 更新字段:")
                    for key, value in product_data.items():
                        old_value = getattr(existing_product, key)
                        setattr(existing_product, key, value)
                        print(f"  * {key}: {old_value} -> {value}")
                    updated_count += 1
                else:
                    print("\n创建新商品")
                    db_product = models.Product(**product_data)
                    db.add(db_product)
                    created_count += 1
            
            db.commit()
            print("\n" + "="*50)
            print("导入完成!")
            print(f"- 更新商品数: {updated_count}")
            print(f"- 新增商品数: {created_count}")
            print("="*50)
            
            return {
                "message": "Products imported successfully",
                "updated_count": updated_count,
                "created_count": created_count
            }
        except Exception as e:
            db.rollback()
            print(f"\n导入出错: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            db.close()
    except Exception as e:
        print(f"\n读取文件出错: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

# 销量管理API
@app.get("/api/sales")
def get_sales(db: Session = Depends(get_db)):
    try:
        query = db.query(models.Sales).options(joinedload(models.Sales.product))
        sales = query.order_by(models.Sales.date.desc()).all()
        return [
            {
                "id": sale.id,
                "product_id": sale.product_id,
                "date": sale.date.strftime("%Y-%m-%d") if sale.date else None,
                "quantity": sale.quantity,
                "product": {
                    "id": sale.product.id,
                    "name": sale.product.name,
                    "code": sale.product.code
                } if sale.product is not None else None
            }
            for sale in sales
        ]
    except Exception as e:
        print(f"获取销量数据时出错: {str(e)}")  # 添加错误日志
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sales")
def create_sale(sale: dict, db: Session = Depends(get_db)):
    try:
        # 处理日期格式
        if isinstance(sale["date"], str):
            if "T" in sale["date"]:
                date = datetime.fromisoformat(sale["date"].replace("Z", "+00:00")).date()
            else:
                date = datetime.strptime(sale["date"], "%Y-%m-%d").date()
        else:
            date = sale["date"].date()

        # 检查是否存在相同的销量记录
        existing_sale = db.query(models.Sales).filter(
            models.Sales.product_id == sale["product_id"],
            models.Sales.date == date
        ).first()
        print(f"对比记录1{models.Sales.product_id}")
        print(f"对比记录1{sale["product_id"]}")
        print(f"对比记录2{models.Sales.date}")
        print(f"对比记录2{date}")
        if existing_sale:
            # 如果存在，更新数量
            print(f"更新销量记录: 商品编码={sale["product_id"]}, 日期={date}, 新数量={sale["quantity"]}")
            existing_sale.quantity = sale["quantity"]  # 直接替换数量
            db.commit()
            db.refresh(existing_sale)
            return existing_sale
        else:
            # 如果不存在，创建新记录
            print(f"新增销量记录: 商品编码={sale["product_id"]}, 日期={date}, 数量={sale["quantity"]}")
            db_sale = models.Sales(
                product_id=sale["product_id"],
                date=date,
                quantity=sale["quantity"]
            )
            db.add(db_sale)
            db.commit()
            db.refresh(db_sale)
            return db_sale
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/sales/{sale_id}")
def update_sale(sale_id: int, sale: dict, db: Session = Depends(get_db)):
    try:
        db_sale = db.query(models.Sales).filter(models.Sales.id == sale_id).first()
        if not db_sale:
            raise HTTPException(status_code=404, detail="Sale not found")
        
        # 处理日期格式
        if isinstance(sale["date"], str):
            if "T" in sale["date"]:
                # 处理 ISO 格式的日期时间字符串
                date = datetime.fromisoformat(sale["date"].replace("Z", "+00:00")).date()
            else:
                # 处理 YYYY-MM-DD 格式的日期字符串
                date = datetime.strptime(sale["date"], "%Y-%m-%d").date()
        else:
            date = sale["date"].date()

        db_sale.product_id = sale["product_id"]
        db_sale.date = date
        db_sale.quantity = sale["quantity"]
        
        db.commit()
        db.refresh(db_sale)
        return db_sale
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/sales/{sale_id}")
async def delete_sales(sale_id: int):
    db = SessionLocal()
    try:
        db_sales = db.query(models.Sales).filter(models.Sales.id == sale_id).first()
        if not db_sales:
            raise HTTPException(status_code=404, detail="销量记录不存在")
        
        db.delete(db_sales)
        db.commit()
        return {"message": "销量记录已删除"}
    finally:
        db.close()

@app.post("/api/calculate-order")
async def calculate_order(request: OrderRequest):
    db = SessionLocal()
    try:
        results = []
        local_tz = pytz.timezone('Asia/Shanghai')
        order_date_utc = request.order_date.replace(tzinfo=pytz.UTC)
        order_date_local = order_date_utc.astimezone(local_tz)
        current_date = order_date_local.date()
        
        print("\n开始计算订单...")
        print(f"当前日期: {current_date}")
        
        for item in request.items:
            print(f"\n处理商品ID: {item.product_id}")
            
            # 获取商品信息
            product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
            if not product:
                print(f"未找到商品ID: {item.product_id}")
                continue

            print(f"商品信息: {product.code} - {product.name}")

            # 获取在途记录详情
            in_transit_records = db.query(models.Arrival).filter(
                models.Arrival.product_id == item.product_id,  # 保留 product_id 匹配
                models.Arrival.product_code == product.code,   # 同时匹配 product_code
                models.Arrival.status == 'pending',
                models.Arrival.order_date < current_date,  # 下单日期必须小于当天（不包含当天）
                models.Arrival.expected_date >= current_date  # 到货日期大于等于当天
            ).all()

            print("\n在途记录:")
            in_transit_stock = 0
            for record in in_transit_records:
                print(f"- ID: {record.id}")
                print(f"  商品ID: {record.product_id}")
                print(f"  商品编码: {record.product_code}")
                print(f"  商品名称: {record.product_name}")
                print(f"  下单日期: {record.order_date}")
                print(f"  预计到货日期: {record.expected_date}")
                print(f"  数量: {record.quantity}")
                print(f"  状态: {record.status}")
                in_transit_stock += record.quantity

            print(f"\n计算得出的在途库存: {in_transit_stock}")

            # 解析商品描述中的T+n
            delivery_days = 3  # 默认3天
            if product.description:
                match = re.search(r'T\+(\d+)', product.description)
                if match:
                    delivery_days = int(match.group(1))
                    print(f"\n送货天数: T+{delivery_days}")
                else:
                    print(f"\n送货天数: T+{delivery_days} (默认)")
            
            # 使用本地时间计算日期
            local_date = order_date_local.date()
            end_date = local_date - timedelta(days=1)  # 从昨天开始往前算
            start_date = end_date - timedelta(days=item.reference_days - 1)
            
            print(f"\n日期范围:")
            print(f"- 订单日期（本地）: {local_date}")
            print(f"- 统计结束日期: {end_date}")
            print(f"- 统计开始日期: {start_date}")
            print(f"- 统计范围: 从 {start_date} 到 {end_date} (共{item.reference_days}天)")
            
            sales_data = db.query(models.Sales).filter(
                models.Sales.product_id == item.product_id,
                models.Sales.date >= start_date,
                models.Sales.date <= end_date
            ).order_by(models.Sales.date.desc()).all()
            
            if not sales_data:
                print("\n没有找到历史销量数据")
                results.append({
                    "product_id": item.product_id,
                    "product_name": product.name,
                    "product_code": product.code,
                    "product": {
                        "specification": product.specification,
                        "unit": product.unit,
                        "description": product.description  # 确保包含描述
                    },
                    "message": "历史数据不足，请手动设置预估销量",
                    "order_quantity": 0,
                    "expected_date": local_date + timedelta(days=delivery_days)
                })
                continue
            
            print("\n历史销量数据:")
            daily_sales = []
            for sale in sales_data:
                print(f"- {sale.date}: {sale.quantity}")
                daily_sales.append(sale.quantity)

            print("\n日均销量计算:")
            print(f"- 销量列表: {daily_sales}")
            median_sales = statistics.median(daily_sales)
            print(f"- 中位数日均销量: {median_sales}")

            print("\n预估销量计算:")
            print(f"- 中位数日均销量 {median_sales} × 预估天数 {item.reference_days}")
            estimated_sales = median_sales * item.reference_days
            print(f"- 预估销量 = {estimated_sales}")

            print("\n建议采购量计算:")
            print(f"- 预估销量 {estimated_sales}")
            print(f"- 减去 实时库存 ({item.current_stock}) + 在途库存 ({in_transit_stock})")
            order_quantity = estimated_sales - (item.current_stock + in_transit_stock)
            print(f"- 建议采购量 = {round(order_quantity, 2)}")
            
            if order_quantity <= 0:
                print("\n结论: 无需补货")
                results.append({
                    "product_id": item.product_id,
                    "product_name": product.name,
                    "product_code": product.code,
                    "product": {
                        "specification": product.specification,
                        "unit": product.unit,
                        "description": product.description  # 确保包含描述
                    },
                    "message": "无需补货",
                    "order_quantity": 0,
                    "expected_date": local_date + timedelta(days=delivery_days),
                    "estimated_sales": round(estimated_sales, 2),
                    "median_daily_sales": round(median_sales, 2),
                    "sales_data": [(sale.date.strftime('%Y-%m-%d'), sale.quantity) for sale in sales_data],
                    "reference_days": item.reference_days,
                    "current_stock": item.current_stock,
                    "in_transit_stock": round(in_transit_stock, 2),
                    "order_date": local_date.strftime('%Y-%m-%d')
                })
            else:
                print(f"\n结论: 建议采购 {round(order_quantity, 2)} 个")
                results.append({
                    "product_id": item.product_id,
                    "product_name": product.name,
                    "product_code": product.code,
                    "product": {
                        "specification": product.specification,
                        "unit": product.unit,
                        "description": product.description  # 确保包含描述
                    },
                    "order_quantity": round(order_quantity, 2),
                    "expected_date": local_date + timedelta(days=delivery_days),
                    "estimated_sales": round(estimated_sales, 2),
                    "median_daily_sales": round(median_sales, 2),
                    "sales_data": [(sale.date.strftime('%Y-%m-%d'), sale.quantity) for sale in sales_data],
                    "reference_days": item.reference_days,
                    "current_stock": item.current_stock,
                    "in_transit_stock": round(in_transit_stock, 2),
                    "order_date": local_date.strftime('%Y-%m-%d')
                })
            
            print("="*50)
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/sales/product/{product_id}")
def get_product_sales(product_id: int):
    db = SessionLocal()
    try:
        # 获取指定商品的所有销量记录，按日期降序排序
        sales = db.query(models.Sales).filter(models.Sales.product_id == product_id).order_by(models.Sales.date.desc()).all()
        return sales
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/api/sales/import")
def import_sales(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        # 读取Excel文件
        df = pd.read_excel(file.file)
        
        # 验证文件格式
        if len(df.columns) < 2:  # 至少需要商品编码列和一个日期列
            raise HTTPException(status_code=400, detail="Excel文件格式不正确，至少需要商品编码列和一个日期列")

        # 获取日期列（除第一列外的所有列）
        dates = df.columns[1:].tolist()
        print(f"dates:{dates}")
        success_count = 0
        error_records = []
        
        # 获取所有系统中的商品
        all_products = db.query(models.Product).all()
        
        # 遍历每一行（每个商品）
        for _, row in df.iterrows():
            try:
                print(f"row:{row}")
                product_code = str(row.iloc[0]).strip()  # 第一列是商品编码
                
                # 查找商品
                product = db.query(models.Product).filter(
                    models.Product.code == product_code
                ).first()
                
                if not product:
                    error_records.append({
                        "商品编码": product_code,
                        "错误": "商品不存在"
                    })
                    continue
                
                # 遍历每个日期列
                for date_str in dates:
                    try:
                        # 获取销量
                        quantity = row[date_str]
                        if pd.isna(quantity):
                            continue
                        print(f"date_str:{date_str}  --- {quantity} ")
                        # 确保销量是数字
                        try:
                            quantity = float(quantity)  # 这里可能会抛出异常
                        except ValueError:
                            error_records.append({
                                "商品编码": product_code,
                                "错误": f"处理销量数据错误: could not convert string to float: '{quantity}'"
                            })
                            continue

                        # 处理日期格式
                        formatted_date_str = date_str.strftime('%Y/%m/%d') if isinstance(date_str, datetime) else date_str
                        print(f"格式化第一步{formatted_date_str}")
                        formatted_date = datetime.strptime(formatted_date_str, '%Y/%m/%d').date()  # 假设原始格式为 YYYY/MM/DD
                        # formatted_date_str = formatted_date.strftime('%Y-%m-%d')  # 转换为 YYYY-MM-DD 格式
                        print(f"格式化第二步{formatted_date}")

                        # 检查是否存在相同日期的记录
                        existing_sale = db.query(models.Sales).filter(
                            models.Sales.product_id == product.id,
                            models.Sales.date == formatted_date 
                        ).first()
                        # print(f"对比记录1{models.Sales.product_id}")
                        # print(f"对比记录1{product.id}")
                        # print(f"对比记录2{models.Sales.date}")
                        # print(f"对比记录2{formatted_date}")

                        if existing_sale:
                            print(f"更新销量记录: 商品编码={product_code}, 日期={formatted_date}, 新数量={quantity}")
                            existing_sale.quantity = quantity  # 更新数量
                            success_count += 1
                            # db.commit()
                            # db.refresh(existing_sale)
                            # return existing_sale
                        else:
                            print(f"新增销量记录: 商品编码={product_code}, 日期={formatted_date}, 数量={quantity}")
                            db_sale = models.Sales(
                                product_id=product.id,
                                date=formatted_date,
                                quantity=quantity
                            )
                            db.add(db_sale)  # 新增记录
                          
                            success_count += 1
                        
                            
                    except Exception as e:
                        error_records.append({
                            "商品编码": product_code,
                            "错误": f"处理销量数据错误: {str(e)}"
                        })

            except Exception as e:
                error_records.append({
                    "商品编码": str(row.iloc[0]),
                    "错误": str(e)
                })

        # 为每个日期，处理系统中存在但Excel中未出现的商品
        excel_product_codes = set(str(row.iloc[0]).strip() for _, row in df.iterrows() if pd.notna(row.iloc[0]))
        for date_str in dates:
            formatted_date_str = date_str.strftime('%Y/%m/%d') if isinstance(date_str, datetime) else date_str
            formatted_date = datetime.strptime(formatted_date_str, '%Y/%m/%d').date()
            
            for product in all_products:
                print(f'product{product}')
                print(f'all_products{all_products}')
                if product.code not in excel_product_codes:
                    existing_sale = db.query(models.Sales).filter(
                        
                        models.Sales.product_id == product.id,
                        models.Sales.date == formatted_date
                    ).first()
                    print(f'existing_sale{existing_sale}')
                    if not existing_sale:
                        db_sale = models.Sales(
                            product_id=product.id,
                            date=formatted_date,
                            quantity=0
                        )
                        db.add(db_sale)
                        success_count += 1

        # 提交数据库会话
        db.commit()  # 确保所有更改都被提交
        
        return {
            "success": True,
            "message": f"成功导入 {success_count} 条记录",
            "errors": error_records if error_records else None
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reset-database")
def reset_database():
    try:
        db = SessionLocal()
        # 只删除销量数据，保留商品数据
        db.query(models.Sales).delete()
        db.commit()
        return {"message": "销量数据已清空"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/api/download-stock-template")
async def download_stock_template():
    try:
        # 创建DataFrame
        df = pd.DataFrame(columns=['商品编码', '实时库存'])
        
        # 获取所有商品
        db = SessionLocal()
        products = db.query(models.Product).all()
        db.close()
        
        # 添加所有商品数据
        for product in products:
            df.loc[len(df)] = [product.code or '', product.current_stock or 0]

        # 保存为Excel文件
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='实时库存')
            
            # 获取工作表
            worksheet = writer.sheets['实时库存']
            
            # 设置列宽
            worksheet.column_dimensions['A'].width = 15  # 商品编码列
            worksheet.column_dimensions['B'].width = 12  # 实时库存列

        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=stock_template.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import-stock")
async def import_stock(file: UploadFile = File(...)):
    if not file.filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="只支持.xlsx文件")
    
    try:
        df = pd.read_excel(file.file)
        required_columns = ['商品编码', '实时库存']
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=400, detail="文件格式错误，请使用正确的模板")
        
        db = SessionLocal()
        updated_count = 0
        errors = []
        
        for _, row in df.iterrows():
            product_code = str(row['商品编码']).strip()
            if pd.isna(product_code):
                continue
                
            try:
                current_stock = float(row['实时库存'])
                product = db.query(models.Product).filter(models.Product.code == product_code).first()
                
                if product:
                    product.current_stock = current_stock
                    updated_count += 1
                else:
                    errors.append(f"商品编码 {product_code} 不存在")
                    
            except ValueError:
                errors.append(f"商品编码 {product_code} 的实时库存值格式错误")
        
        db.commit()
        db.close()
        
        if errors:
            return {"message": "部分数据导入成功", "updated_count": updated_count, "errors": errors}
        return {"message": "导入成功", "updated_count": updated_count}
        
    except Exception as e:
        if db:
            db.rollback()
            db.close()
        raise HTTPException(status_code=500, detail=str(e))

# 到货记录API
@app.get("/api/arrivals")
async def get_arrivals(
    product_code: Optional[str] = None,
    product_name: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    order_start_date: Optional[date] = None,
    order_end_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.Arrival).options(joinedload(models.Arrival.product))
        
        if product_code:
            query = query.filter(models.Arrival.product_code.ilike(f"%{product_code}%"))
        if product_name:
            query = query.filter(models.Arrival.product_name.ilike(f"%{product_name}%"))
        if status:
            query = query.filter(models.Arrival.status == status)
        if start_date:
            query = query.filter(models.Arrival.expected_date >= start_date)
        if end_date:
            query = query.filter(models.Arrival.expected_date <= end_date)
        if order_start_date:
            query = query.filter(models.Arrival.order_date >= order_start_date)
        if order_end_date:
            query = query.filter(models.Arrival.order_date <= order_end_date)
            
        arrivals = query.order_by(models.Arrival.expected_date.desc()).all()
        
        return [{
            "id": arrival.id,
            "product_id": arrival.product_id,
            "product_code": arrival.product_code,
            "product_name": arrival.product_name,
            "order_date": arrival.order_date.strftime("%Y-%m-%d") if arrival.order_date else None,
            "expected_date": arrival.expected_date.strftime("%Y-%m-%d") if arrival.expected_date else None,
            "quantity": arrival.quantity,
            "status": arrival.status,
            "product": {
                "id": arrival.product.id,
                "code": arrival.product.code,
                "name": arrival.product.name,
                "specification": arrival.product.specification,
                "unit": arrival.product.unit
            } if arrival.product else None
        } for arrival in arrivals]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/arrivals")
async def create_arrival(arrival: schemas.ArrivalCreate, db: Session = Depends(get_db)):
    try:
        # 获取商品信息
        product = db.query(models.Product).filter(models.Product.id == arrival.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="商品不存在")

        # 检查是否存在相同记录
        existing_arrival = db.query(models.Arrival).filter(
            models.Arrival.product_id == arrival.product_id,
            models.Arrival.order_date == arrival.order_date
        ).first()

        if existing_arrival:
            # 如果存在，更新数量
            existing_arrival.quantity = arrival.quantity
            existing_arrival.expected_date = arrival.expected_date
            existing_arrival.status = arrival.status
            existing_arrival.product_code = product.code
            existing_arrival.product_name = product.name
            db.commit()
            db.refresh(existing_arrival)
            return existing_arrival
        else:
            # 如果不存在，创建新记录
            db_arrival = models.Arrival(
                product_id=arrival.product_id,
                product_code=product.code,
                product_name=product.name,
                order_date=arrival.order_date,
                expected_date=arrival.expected_date,
                quantity=arrival.quantity,
                status=arrival.status
            )
            db.add(db_arrival)
            db.commit()
            db.refresh(db_arrival)
            return db_arrival
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.put("/api/arrivals/{arrival_id}")
async def update_arrival(arrival_id: int, arrival: schemas.ArrivalUpdate, db: Session = Depends(get_db)):
    try:
        db_arrival = db.query(models.Arrival).filter(models.Arrival.id == arrival_id).first()
        if not db_arrival:
            raise HTTPException(status_code=404, detail="到货记录不存在")
        
        # 获取商品信息
        product = db.query(models.Product).filter(models.Product.id == db_arrival.product_id).first()
        if product:
            # 更新商品相关信息
            db_arrival.product_code = product.code
            db_arrival.product_name = product.name
        
        # 更新其他字段
        for key, value in arrival.model_dump(exclude_unset=True).items():
            setattr(db_arrival, key, value)
        
        db.commit()
        db.refresh(db_arrival)
        return db_arrival
    finally:
        db.close()

@app.delete("/api/arrivals/{arrival_id}")
async def delete_arrival(arrival_id: int):
    db = SessionLocal()
    try:
        db_arrival = db.query(models.Arrival).filter(models.Arrival.id == arrival_id).first()
        if not db_arrival:
            raise HTTPException(status_code=404, detail="到货记录不存在")
        
        db.delete(db_arrival)
        db.commit()
        return {"message": "到货记录已删除"}
    finally:
        db.close()

class DeleteArrivalsRequest(BaseModel):
    arrival_ids: List[int]

@app.post("/api/arrivals/batch-delete")
def batch_delete_arrivals(request: DeleteArrivalsRequest, db: Session = Depends(get_db)):
    try:
        # 删除指定的到货记录
        deleted_count = db.query(models.Arrival).filter(
            models.Arrival.id.in_(request.arrival_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        return {
            "success": True,
            "message": f"成功删除 {deleted_count} 条记录"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

class DeleteProductsRequest(BaseModel):
    product_ids: List[int]

@app.post("/api/products/batch-delete")
async def batch_delete_products(request: DeleteProductsRequest):
    db = SessionLocal()
    try:
        # 删除指定的商品
        deleted_count = db.query(models.Product).filter(
            models.Product.id.in_(request.product_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        return {
            "success": True,
            "message": f"成功删除 {deleted_count} 个商品"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# 检查到货记录是否存在
@app.get("/api/arrivals/check")
async def check_arrival(
    product_code: str,
    product_name: str,
    order_date: str,
    db: Session = Depends(get_db)
):
    try:
        # 将order_date字符串转换为日期对象
        order_date_obj = datetime.strptime(order_date, '%Y-%m-%d').date()
        
        # 查询是否存在相同记录
        existing_arrival = db.query(models.Arrival).filter(
            models.Arrival.product_code == product_code,
            models.Arrival.product_name == product_name,
            models.Arrival.order_date == order_date_obj
        ).first()
        
        if existing_arrival:
            return {
                "id": existing_arrival.id,
                "product_id": existing_arrival.product_id,
                "product_code": existing_arrival.product_code,
                "product_name": existing_arrival.product_name,
                "order_date": existing_arrival.order_date.strftime('%Y-%m-%d'),
                "expected_date": existing_arrival.expected_date.strftime('%Y-%m-%d'),
                "quantity": existing_arrival.quantity,
                "status": existing_arrival.status
            }
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/arrivals/import")
def import_arrivals(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        # 读取Excel文件
        df = pd.read_excel(file.file)

        # 验证文件格式
        if len(df.columns) < 2:  # 至少需要商品编码列和一个日期列
            raise HTTPException(status_code=400, detail="Excel文件格式不正确，至少需要商品编码列和一个日期列")

        # 获取日期列（除第一列外的所有列）
        dates = df.columns[1:].tolist()
        success_count = 0
        error_records = []

        # 遍历每一行（每个商品）
        for _, row in df.iterrows():
            try:
                product_code = str(row.iloc[0]).strip()  # 第一列是商品编码

                # 查找商品
                product = db.query(models.Product).filter(
                    models.Product.code == product_code
                ).first()

                if not product:
                    error_records.append({
                        "商品编码": product_code,
                        "错误": "商品不存在"
                    })
                    continue

                # 提取描述中的 T+n
                description = product.description or ""
                delivery_days = 0
                match = re.search(r'T\+(\d+)', description)
                if match:
                    delivery_days = int(match.group(1))

                # 遍历每个日期列
                for date_str in dates:
                    try:
                        quantity = row[date_str]
                        if pd.isna(quantity):
                            continue

                        # 确保数量是数字
                        quantity = float(quantity)

                        # # 处理预计到货日期
                        # arrival_date = datetime.strptime(date_str, '%Y/%m/%d').date()  # 假设原始格式为 YYYY/MM/DD
                        

                        if isinstance(date_str, str):
                            arrival_date = datetime.strptime(date_str, '%Y/%m/%d').date()  # 假设原始格式为 YYYY/MM/DD
                        else:
                            arrival_date = date_str.date()  # 如果已经是 datetime 对象，直接使用
                        # 计算下单日期
                        order_date = arrival_date - timedelta(days=delivery_days)
                        # 检查是否存在相同日期的记录
                        existing_arrival = db.query(models.Arrival).filter(
                            models.Arrival.product_id == product.id,
                            models.Arrival.order_date == order_date
                        ).first()

                        if existing_arrival:
                            print(f"更新到货记录: 商品编码={product_code}, 下单日期={order_date}, 预计到货日期={arrival_date}, 新数量={quantity}")
                            existing_arrival.quantity += quantity  # 更新数量
                        else:
                            print(f"新增到货记录: 商品编码={product_code}, 下单日期={order_date}, 预计到货日期={arrival_date}, 数量={quantity}")
                            db_arrival = models.Arrival(
                                product_id=product.id,
                                product_code=product_code,
                                order_date=order_date,
                                expected_date=arrival_date,
                                quantity=quantity,
                                status='pending'  # 默认状态
                            )
                            db.add(db_arrival)  # 新增记录

                        success_count += 1

                    except Exception as e:
                        error_records.append({
                            "商品编码": product_code,
                            "错误": f"处理到货数据错误: {str(e)}"
                        })

            except Exception as e:
                error_records.append({
                    "商品编码": str(row.iloc[0]),
                    "错误": str(e)
                })

        # 提交数据库会话
        db.commit()  # 确保所有更改都被提交

        return {
            "success": True,
            "message": f"成功导入 {success_count} 条记录",
            "errors": error_records if error_records else None
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 