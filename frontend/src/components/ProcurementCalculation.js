import React, { useState, useEffect, useContext } from 'react';
import { Form, Select, Button, Table, InputNumber, message, Tooltip, Space, Modal } from 'antd';
import moment from 'moment';
import { GlobalContext } from '../App';
import { API_BASE_URL } from '../config';
import ExcelJS from 'exceljs';

const { Option } = Select;

const ProcurementCalculation = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const { 
    orderResults, 
    setOrderResults,
    selectedProducts,
    setSelectedProducts,
    formData,
    setFormData
  } = useContext(GlobalContext);
  const [orderForm] = Form.useForm();
  const [arrivalModalVisible, setArrivalModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actualQuantity, setActualQuantity] = useState(0);

  useEffect(() => {
    fetchProducts();
  }, []);

  // 当组件加载时，如果有保存的表单数据，就恢复它
  useEffect(() => {
    if (formData.items?.length > 0) {
      orderForm.setFieldsValue(formData);
    }
  }, [formData, orderForm]);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/products`);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      message.error('获取商品列表失败');
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleOrderSubmit = async (values) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/calculate-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: values.items,
          order_date: moment()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setOrderResults(data);
        setFormData(values);
        message.success('计算完成');
      } else {
        message.error('计算失败');
      }
    } catch (error) {
      message.error('计算失败');
    }
    setLoading(false);
  };

  const handleProductSelect = async (values) => {
    try {
      // 获取所有选中商品的在途库存
      const inTransitStockPromises = values.map(async (id) => {
        const response = await fetch(`${API_BASE_URL}/api/calculate-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{
              product_id: id,
              current_stock: 0,
              reference_days: 5,
              in_transit_stock: 0
            }],
            order_date: moment().toISOString()
          })
        });
        
        if (!response.ok) {
          throw new Error('获取在途库存失败');
        }
        
        const data = await response.json();
        return data[0]?.in_transit_stock || 0;
      });

      const inTransitStocks = await Promise.all(inTransitStockPromises);
      
      // 构建新的选中商品列表
      const newSelectedProducts = values.map((id, index) => {
        // 查找已选中的商品中是否存在该ID
        const existingProduct = selectedProducts.find(p => p.id === id);
        if (existingProduct) {
          // 如果已存在，更新在途库存，保留其他值
          return {
            ...existingProduct,
            in_transit_stock: inTransitStocks[index]
          };
        }
        // 如果是新选中的商品，初始化其值
        const product = products.find(p => p.id === id);
        return {
          ...product,
          current_stock: product.current_stock || 0,
          reference_days: product.reference_days || 5,
          in_transit_stock: inTransitStocks[index]
        };
      });
      
      setSelectedProducts(newSelectedProducts);
    } catch (error) {
      message.error('获取在途库存失败');
      // 如果获取在途库存失败，仍然添加商品，但在途库存设为0
      const newSelectedProducts = values.map(id => {
        const existingProduct = selectedProducts.find(p => p.id === id);
        if (existingProduct) {
          return existingProduct;
        }
        const product = products.find(p => p.id === id);
        return {
          ...product,
          current_stock: product.current_stock || 0,
          reference_days: product.reference_days || 5,
          in_transit_stock: 0
        };
      });
      setSelectedProducts(newSelectedProducts);
    }
  };

  const handleProductDataChange = (index, name, value) => {
    setSelectedProducts(prev => {
      const newProducts = [...prev];
      if (Array.isArray(name)) {
        // 处理嵌套属性
        let obj = newProducts[index];
        for (let i = 0; i < name.length - 1; i++) {
          obj = obj[name[i]];
        }
        obj[name[name.length - 1]] = value;
      } else {
        newProducts[index][name] = value;
      }
      return newProducts;
    });
  };

  // 打开录入到货记录模态框
  const showArrivalModal = (record) => {
    setSelectedRecord(record);
    // 如果 order_quantity 小于等于 0，设置默认值为 0
    setActualQuantity(Math.max(0, record.order_quantity));
    setArrivalModalVisible(true);
  };

  // 录入到货记录
  const handleCreateArrival = async () => {
    try {
      // 先检查是否存在相同记录
      const checkResponse = await fetch(
        `${API_BASE_URL}/api/arrivals/check?` + 
        `product_code=${encodeURIComponent(selectedRecord.product_code)}&` +
        `product_name=${encodeURIComponent(selectedRecord.product_name)}&` +
        `order_date=${encodeURIComponent(selectedRecord.order_date)}`
      );

      if (!checkResponse.ok) {
        throw new Error('检查记录失败');
      }

      const existingRecord = await checkResponse.json();
      const method = existingRecord ? 'PUT' : 'POST';
      const url = existingRecord 
        ? `${API_BASE_URL}/api/arrivals/${existingRecord.id}` 
        : `${API_BASE_URL}/api/arrivals`;

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedRecord.product_id,
          product_code: selectedRecord.product_code,
          product_name: selectedRecord.product_name,
          quantity: actualQuantity,
          order_date: selectedRecord.order_date,
          expected_date: moment(selectedRecord.expected_date).format('YYYY-MM-DD'),
          status: 'pending'
        })
      });

      if (response.ok) {
        message.success(existingRecord ? '已更新到货记录' : '已录入到货记录');
        setArrivalModalVisible(false);
        setSelectedRecord(null);
        setActualQuantity(0);
      } else {
        message.error(existingRecord ? '更新到货记录失败' : '录入到货记录失败');
      }
    } catch (error) {
      message.error('操作失败: ' + error.message);
    }
  };

  // 计算采购建议
  const calculateOrder = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/calculate-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: selectedProducts.map(product => ({
            product_id: product.id,
            current_stock: product.current_stock || 0,
            reference_days: product.reference_days || 5,
            in_transit_stock: 0  // 移除前端传入的在途库存，使用后端计算的值
          })),
          order_date: moment().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error('计算采购建议失败');
      }

      const data = await response.json();
      setOrderResults(data);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 添加导出Excel功能
  const handleExportExcel = async () => {
    if (!orderResults.length) {
      message.warning('没有可导出的数据');
      return;
    }

    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('采购计算结果');

      // 设置列
      worksheet.columns = [
        { header: '商品编码', key: 'code', width: 15 },
        { header: '商品名称', key: 'name', width: 20 },
        { header: '商品描述', key: 'description', width: 30 },
        { header: '规格', key: 'spec', width: 15 },
        { header: '建议采购量', key: 'quantity', width: 15 },
        { header: '采购量/规格', key: 'ratio', width: 15 },
        { header: '预计到货日期', key: 'date', width: 15 },
        { header: '预估销量', key: 'estimated', width: 15 },
        { header: '日均销量', key: 'daily', width: 15 },
        { header: '在途库存', key: 'transit', width: 15 },
        { header: '备注', key: 'remarks', width: 30 }
      ];

      // 添加数据
      orderResults.forEach(record => {
        const specification = Number(record.product?.specification) || 1;
        worksheet.addRow({
          code: record.product_code || '',
          name: record.product_name || '',
          description: record.product?.description || '-',
          spec: record.product?.specification || '',
          quantity: record.order_quantity || 0,
          ratio: record.order_quantity ? (record.order_quantity / specification).toFixed(2) : '0.00',
          date: record.expected_date ? moment(record.expected_date).format('YYYY-MM-DD') : '',
          estimated: record.estimated_sales || 0,
          daily: record.median_daily_sales || 0,
          transit: record.in_transit_stock || 0,
          remarks: record.message || ''
        });
      });

      // 设置表头样式
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // 设置数据行样式
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });

      // 导出文件
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `采购计算结果_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      message.success('导出成功');
    } catch (error) {
      console.error('导出Excel失败:', error);
      message.error('导出失败');
    }
  };

  // 渲染结果表格
  const renderResults = () => {
    if (!orderResults.length) return null;

    const columns = [
      {
        title: '商品编码',
        dataIndex: 'product_code',
        key: 'product_code',
      },
      {
        title: '商品名称',
        dataIndex: 'product_name',
        key: 'product_name',
      },
      {
        title: '商品描述',
        dataIndex: ['product', 'description'],
        key: 'description',
        render: (text) => text || '-'  // 如果描述为空则显示'-'
      },
      {
        title: '规格',
        dataIndex: ['product', 'specification'],
        key: 'specification',
      },
      {
        title: '建议采购量',
        dataIndex: 'order_quantity',
        key: 'order_quantity',
        render: (value, record) => {
          // 计算采购量/规格的值
          const specification = Number(record.product?.specification) || 1;
          const ratio = value / specification;
          
          // 构建显示值
          let displayValue = record.message || `${value}${value > 0 ? `（${ratio.toFixed(2)}）` : ''}`;

          // 构建计算过程的展示内容
          const tooltipContent = (
            <div style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
              {`日均销量计算:
- 销量列表: [${record.sales_data?.map(s => s[1]).join(', ')}]
- 中位数日均销量: ${record.median_daily_sales}

预估销量计算:
- 中位数日均销量 ${record.median_daily_sales} × 预估天数 ${record.reference_days}
- 预估销量 = ${record.estimated_sales}

建议采购量计算:
- 预估销量 ${record.estimated_sales}
- 减去 实时库存 (${record.current_stock}) + 在途库存 (${record.in_transit_stock})
${value > 0 ? `- 建议采购量 = ${value}
- 规格：${specification}
- 采购量/规格 = ${ratio.toFixed(2)}` : '- 结论：无需补货（库存充足）'}`}
            </div>
          );

          return (
            <Tooltip 
              title={tooltipContent}
              overlayStyle={{ maxWidth: '500px' }}
            >
              <span style={{ cursor: 'pointer' }}>{displayValue}</span>
            </Tooltip>
          );
        }
      },
      {
        title: '在途库存',
        dataIndex: 'in_transit_stock',
        key: 'in_transit_stock',
        render: (value) => (value === null || value === undefined) ? '0.00' : Number(value).toFixed(2)
      },
      {
        title: '预计到货日期',
        dataIndex: 'expected_date',
        key: 'expected_date',
        render: (text) => moment(text).format('YYYY-MM-DD')
      },
      {
        title: '预估销量',
        dataIndex: 'estimated_sales',
        key: 'estimated_sales',
      },
      {
        title: '日均销量',
        dataIndex: 'median_daily_sales',
        key: 'median_daily_sales',
      },
      {
        title: '备注',
        dataIndex: 'message',
        key: 'message',
      },
      {
        title: '操作',
        key: 'action',
        render: (_, record) => (
          <Space>
            <Button
              type="primary"
              onClick={() => showArrivalModal(record)}
            >
              录入到货记录
            </Button>
          </Space>
        )
      },
      
    ];

    return (
      <div>
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Button type="primary" onClick={handleExportExcel}>
            导出Excel
          </Button>
        </div>
        <Table
          dataSource={orderResults.map((result, index) => ({
            ...result,
            key: index,
          }))}
          columns={columns}
        />

        {/* 录入到货记录模态框 */}
        <Modal
          title="录入到货记录"
          visible={arrivalModalVisible}
          onOk={handleCreateArrival}
          onCancel={() => {
            setArrivalModalVisible(false);
            setSelectedRecord(null);
            setActualQuantity(0);
          }}
        >
          {selectedRecord && (
            <div>
              <p>商品名称：{selectedRecord.product_name}</p>
              <p>商品描述：{selectedRecord.product?.description || '无'}</p>
              <p>规格：{selectedRecord.product?.specification || '无'}</p>
              <p>计算结果：{selectedRecord.order_quantity} {selectedRecord.order_quantity <= 0 && '(无需补货)'}</p>
              <Form.Item label="实际到货数量">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={0.01}
                  precision={2}
                  value={actualQuantity}
                  onChange={(value) => setActualQuantity(value)}
                />
              </Form.Item>
            </div>
          )}
        </Modal>
      </div>
    );
  };

  // 渲染商品表单
  const renderProductForms = () => {
    return selectedProducts.map((product, index) => (
      <div key={index} style={{ marginBottom: '16px', padding: '16px', border: '1px solid #f0f0f0', borderRadius: '4px' }}>
        <div style={{ marginBottom: '16px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
          <p style={{ margin: 0 }}>
            <strong>商品信息：</strong>
            {`${product.code || '无编码'} - ${product.name} ${product.specification ? `(${product.specification})` : ''} ${product.description ? `- ${product.description}` : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Form.Item
            label="实时库存"
            style={{ flex: 1, marginBottom: 0 }}
          >
            <InputNumber
              style={{ width: '100%' }}
              value={product.current_stock}
              onChange={(value) => handleProductDataChange(index, 'current_stock', value)}
              placeholder="请输入实时库存"
            />
          </Form.Item>
          <Form.Item
            label="在途库存"
            style={{ flex: 1, marginBottom: 0 }}
          >
            <Tooltip 
              title={
                <div style={{ whiteSpace: 'pre-line' }}>
                  {`在途库存：${product.in_transit_stock || 0}
                  
说明：在途库存由系统自动计算
- 包含已下单但未到货的商品数量
- 下单日期早于今天
- 预计到货日期晚于今天
- 最后更新时间：${moment().format('YYYY-MM-DD HH:mm:ss')}`}
                </div>
              }
            >
              <InputNumber
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
                value={product.in_transit_stock || 0}
                disabled
                readOnly
                formatter={value => (value === null || value === undefined) ? '0.00' : Number(value).toFixed(2)}
              />
            </Tooltip>
          </Form.Item>
          <Form.Item
            label="预估天数"
            style={{ flex: 1, marginBottom: 0 }}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              value={product.reference_days}
              onChange={(value) => handleProductDataChange(index, 'reference_days', value)}
              placeholder="请输入预估天数"
            />
          </Form.Item>
          <Button type="link" danger onClick={() => handleRemoveProduct(index)}>
            删除
          </Button>
        </div>
      </div>
    ));
  };

  // 添加删除商品的处理函数
  const handleRemoveProduct = (index) => {
    setSelectedProducts(prev => {
      const newProducts = [...prev];
      newProducts.splice(index, 1);
      return newProducts;
    });
  };

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>采购计算</h2>
      
      {/* 商品选择部分 */}
      <Form 
        form={orderForm}
        onFinish={calculateOrder}
        initialValues={{
          product_ids: selectedProducts.map(p => p.id)
        }}
      >
        <Form.Item
          name="product_ids"
          label="选择商品"
          rules={[{ required: true, message: '请选择商品' }]}
        >
          <Select
            mode="multiple"
            placeholder="请选择商品"
            style={{ width: '100%' }}
            showSearch
            filterOption={(input, option) => {
              const product = products.find(p => p.id === option.value);
              if (!product) return false;
              const searchText = input.toLowerCase();
              return (
                (product.code || '').toLowerCase().includes(searchText) ||
                (product.name || '').toLowerCase().includes(searchText) ||
                (product.specification || '').toLowerCase().includes(searchText) ||
                (product.description || '').toLowerCase().includes(searchText)
              );
            }}
            onChange={handleProductSelect}
            value={selectedProducts.map(p => p.id)}
          >
            {products.map(product => (
              <Option key={product.id} value={product.id}>
                {`${product.code || '无编码'} - ${product.name} ${product.specification ? `(${product.specification})` : ''} ${product.description ? `- ${product.description}` : ''}`}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 商品表单列表 */}
        {selectedProducts.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {renderProductForms()}
          </div>
        )}

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            计算
          </Button>
        </Form.Item>
      </Form>

      {/* 结果展示部分 */}
      {orderResults.length > 0 && (
        renderResults()
      )}
    </div>
  );
};

export default ProcurementCalculation; 