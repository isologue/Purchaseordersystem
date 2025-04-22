import React, { useState, useEffect } from 'react';
import { Button, Table, Space, Modal, Form, Input, DatePicker, Upload, message, Select, InputNumber } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import axios from 'axios';
import ExcelJS from 'exceljs';
import { API_BASE_URL } from '../config';

const SalesList = () => {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [salesModalVisible, setSalesModalVisible] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [salesForm] = Form.useForm();
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [salesNameFilter, setSalesNameFilter] = useState('');
  const [salesCodeFilter, setSalesCodeFilter] = useState('');
  const [salesHistoryVisible, setSalesHistoryVisible] = useState(false);
  const [selectedProductSales, setSelectedProductSales] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    fetchProducts();
    fetchSales();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/products`);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      message.error('获取商品列表失败');
    }
  };

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sales`);
      const data = await response.json();
      const salesData = data.map(sale => ({
        ...sale,
        productName: sale.product?.name || '',
        productCode: sale.product?.code || ''
      }));
      setSales(salesData);
    } catch (error) {
      message.error('获取销量数据失败');
    }
  };

  const handleSubmit = async (values) => {
    try {
      const formData = {
        product_id: values.product_id,
        date: values.date.format('YYYY-MM-DD'),
        quantity: values.quantity
      };

      if (editingSale) {
        await axios.put(`${API_BASE_URL}/api/sales/${editingSale.id}`, formData);
        message.success('销量记录更新成功');
      } else {
        await axios.post(`${API_BASE_URL}/api/sales`, formData);
        message.success('销量记录添加成功');
      }

      setSalesModalVisible(false);
      fetchSales();
      salesForm.resetFields();
    } catch (error) {
      console.error('保存销量记录失败:', error);
      message.error('操作失败: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDeleteSale = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sales/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        message.success('销量记录删除成功');
        fetchSales();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const fetchProductSales = async (productId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sales/product/${productId}`);
      const data = await response.json();
      setSelectedProductSales(data);
    } catch (error) {
      message.error('获取历史销量失败');
    }
  };

  const handleFileUpload = (file) => {
    setImportFile(file);
    return false;
  };

  const handleImport = async () => {
    if (!importFile) {
      message.warning('请先选择文件');
      return;
    }

    // 发送数据到后端
    try {
      console.log('发送请求到:', `${API_BASE_URL}/api/sales/import`);

      // 创建 FormData 并添加文件
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await fetch(`${API_BASE_URL}/api/sales/import`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('服务器响应:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.detail || '导入失败');
        } catch (e) {
          throw new Error(`导入失败: ${errorText}`);
        }
      }

      const responseData = await response.json();
      // console.log("responseData:", response);
      message.success(responseData.message);
      fetchSales();
      setImportModalVisible(false);
      setImportFile(null);
    } catch (error) {
      console.error('处理导入请求失败:', error);
      message.error(error.message || '导入失败');
    }
  };

  const handleResetDatabase = async () => {
    Modal.confirm({
      title: '确认清空销量数据',
      content: '这将删除所有销量历史数据，该操作不可恢复，确定要继续吗？',
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/reset-database`, {
            method: 'POST'
          });
          if (response.ok) {
            message.success('销量数据已清空');
            fetchSales();
          }
        } catch (error) {
          message.error('清空销量数据失败');
        }
      }
    });
  };

  const handleExport = async () => {
    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('销售记录');

      // 设置列
      worksheet.columns = [
        { header: '日期', key: 'date', width: 15 },
        { header: '商品编码', key: 'product_code', width: 15 },
        { header: '商品名称', key: 'product_name', width: 20 },
        { header: '规格', key: 'specification', width: 15 },
        { header: '销售数量', key: 'quantity', width: 15 }
      ];

      // 添加数据
      sales.forEach(record => {
        worksheet.addRow({
          date: record.date,
          product_code: record.productCode,
          product_name: record.productName,
          specification: record.specification,
          quantity: record.quantity
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
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `销售记录_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      message.success('导出成功');
    } catch (error) {
      console.error('导出Excel失败:', error);
      message.error('导出失败');
    }
  };

  const salesColumns = [
    {
      title: '商品编码',
      dataIndex: 'productCode',
      key: 'productCode',
    },
    {
      title: '商品名称',
      dataIndex: 'productName',
      key: 'productName',
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (text) => moment(text).format('YYYY-MM-DD'),
    },
    {
      title: '销量',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => {
            setEditingSale(record);
            salesForm.setFieldsValue({
              ...record,
              date: moment(record.date)
            });
            setSalesModalVisible(true);
          }}>编辑</Button>
          <Button type="link" danger onClick={() => handleDeleteSale(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  const salesHistoryColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      render: (text) => moment(text).format('YYYY-MM-DD')
    },
    {
      title: '销量',
      dataIndex: 'quantity',
      render: (text) => text.toString()
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <Space style={{ marginBottom: '16px' }}>
          <Button type="primary" onClick={() => {
            setEditingSale(null);
            salesForm.resetFields();
            setSalesModalVisible(true);
          }}>
            新增销量
          </Button>
          <Button type="primary" onClick={() => setImportModalVisible(true)}>
            批量导入销量
          </Button>
          <Button type="primary" onClick={handleExport}>
            导出Excel
          </Button>
          <Button type="primary" danger onClick={handleResetDatabase}>
            清空销量历史
          </Button>
          <Input
            placeholder="按商品编码筛选"
            value={salesCodeFilter}
            onChange={e => setSalesCodeFilter(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            placeholder="按商品名称筛选"
            value={salesNameFilter}
            onChange={e => setSalesNameFilter(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
        </Space>
      </div>

      <Table
        dataSource={sales.filter(sale =>
          sale.productCode.toLowerCase().includes(salesCodeFilter.toLowerCase()) &&
          sale.productName.toLowerCase().includes(salesNameFilter.toLowerCase())
        )}
        columns={salesColumns}
        rowKey="id"
      />

      <Modal
        title={editingSale ? "编辑销量记录" : "新增销量记录"}
        open={salesModalVisible}
        onOk={() => salesForm.submit()}
        onCancel={() => {
          setSalesModalVisible(false);
          setEditingSale(null);
          salesForm.resetFields();
        }}
      >
        <Form
          form={salesForm}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="product_id"
            label="选择商品"
            rules={[{ required: true, message: '请选择商品' }]}
          >
            <Select
              showSearch
              placeholder="请选择商品"
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {products.map(product => (
                <Select.Option key={product.id} value={product.id}>
                  {product.code} - {product.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="date"
            label="日期"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="销量"
            rules={[{ required: true, message: '请输入销量' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="导入销量数据"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false);
          setImportFile(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setImportModalVisible(false);
            setImportFile(null);
          }}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleImport}>
            确定
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item
            label="选择Excel文件"
            required
          >
            <Upload
              beforeUpload={handleFileUpload}
              showUploadList={false}
              accept=".xlsx,.xls"
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
              {importFile && <span style={{ marginLeft: '8px' }}>{importFile.name}</span>}
            </Upload>
          </Form.Item>
          <div style={{ color: '#666' }}>
            <p>文件格式说明：</p>
            <p>1. 第一列为商品编码</p>
            <p>2. 第一行为日期（格式：YYYY-MM-DD）</p>
            <p>3. 表格内容为对应日期的销量数据</p>
            <p>4. 示例：</p>
            <pre style={{ background: '#f5f5f5', padding: '8px' }}>
              {`商品编码  2024-01-01  2024-01-02  2024-01-03
G001      100         120         150
G002      200         180         220
G003      150         160         140`}
            </pre>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`${selectedProduct?.name || ''} - 历史销量`}
        open={salesHistoryVisible}
        onCancel={() => setSalesHistoryVisible(false)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={selectedProductSales}
          columns={salesHistoryColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default SalesList; 