import React, { useState, useEffect } from 'react';
import { Button, Table, Space, Modal, Form, Input, InputNumber, Upload, message, Select } from 'antd';
import { InboxOutlined, EditOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import moment from 'moment';
import { API_BASE_URL } from '../config';

const { Option } = Select;
const { confirm } = Modal;

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [importProductModalVisible, setImportProductModalVisible] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [productForm] = Form.useForm();
  const [salesHistoryVisible, setSalesHistoryVisible] = useState(false);
  const [selectedProductSales, setSelectedProductSales] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [filters, setFilters] = useState({
    code: '',
    name: ''
  });

  useEffect(() => {
    fetchProducts();
  }, [filters]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/api/products?`;
      if (filters.code) url += `code=${encodeURIComponent(filters.code)}&`;
      if (filters.name) url += `name=${encodeURIComponent(filters.name)}&`;
      const response = await fetch(url);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      message.error('获取商品列表失败');
    }
    setLoading(false);
  };

  const handleProductSubmit = async () => {
    try {
      const values = await productForm.validateFields();
      const url = editingProduct
        ? `${API_BASE_URL}/api/products/${editingProduct.id}`
        : `${API_BASE_URL}/api/products/`;
      
      const response = await fetch(url, {
        method: editingProduct ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });

      if (response.ok) {
        message.success(`${editingProduct ? '更新' : '添加'}商品成功`);
        setProductModalVisible(false);
        setEditingProduct(null);
        productForm.resetFields();
        fetchProducts();
      }
    } catch (error) {
      message.error(`${editingProduct ? '更新' : '添加'}商品失败`);
    }
  };

  const handleDelete = async (record) => {
    confirm({
      title: '确认删除',
      content: '确定要删除这个商品吗？',
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/products/${record.id}`, {
            method: 'DELETE'
          });
          if (response.ok) {
            message.success('删除商品成功');
            fetchProducts();
          }
        } catch (error) {
          message.error('删除商品失败');
        }
      }
    });
  };

  const handleProductImport = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/import-products`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        message.success(`导入成功：更新${result.updated_count}条，新增${result.created_count}条`);
        fetchProducts();
      } else {
        message.error('导入失败');
      }
    } catch (error) {
      message.error('导入失败');
    }
    setImportProductModalVisible(false);
  };

  const downloadProductTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/download-product-template`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      message.error('下载模板失败');
    }
  };

  const downloadStockTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/download-stock-template`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stock_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      message.error('下载模板失败');
    }
  };

  const handleStockImport = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/import-stock`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        message.success(`导入成功：更新${result.updated_count}条记录`);
        if (result.errors && result.errors.length > 0) {
          confirm({
            title: '部分数据导入失败',
            content: (
              <div>
                {result.errors.map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </div>
            )
          });
        }
        fetchProducts();
      } else {
        message.error('导入失败');
      }
    } catch (error) {
      message.error('导入失败');
    }
  };

  const fetchProductSales = async (productId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sales/product/${productId}`);
      setSelectedProductSales(response.data);
      setSalesHistoryVisible(true);
    } catch (error) {
      message.error('获取历史销量失败');
    }
  };

  const handleViewSales = (product) => {
    setSelectedProduct(product);
    fetchProductSales(product.id);
  };

  const productColumns = [
    {
      title: '商品编码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '商品名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
    },
    {
      title: '规格',
      dataIndex: 'specification',
      key: 'specification',
    },
    {
      title: '预估天数',
      dataIndex: 'reference_days',
      key: 'reference_days',
    },
    {
      title: '实时库存',
      dataIndex: 'current_stock',
      key: 'current_stock',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            onClick={() => {
              setEditingProduct(record);
              productForm.setFieldsValue(record);
              setProductModalVisible(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            onClick={() => handleViewSales(record)}
          >
            历史销量
          </Button>
          <Button
            type="link"
            danger
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的商品');
      return;
    }

    confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 个商品吗？`,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/products/batch-delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              product_ids: selectedRowKeys
            }),
          });

          if (response.ok) {
            message.success('批量删除成功');
            setSelectedRowKeys([]);
            fetchProducts();
          } else {
            message.error('批量删除失败');
          }
        } catch (error) {
          message.error('批量删除失败: ' + error.message);
        }
      },
    });
  };

  // 表格行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys) => {
      setSelectedRowKeys(selectedKeys);
    },
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            onClick={() => {
              setEditingProduct(null);
              productForm.resetFields();
              setProductModalVisible(true);
            }}
          >
            新增商品
          </Button>
          <Button
            danger
            onClick={handleBatchDelete}
            disabled={selectedRowKeys.length === 0}
          >
            批量删除
          </Button>
          <Input.Search
            placeholder="商品编码"
            allowClear
            style={{ width: 200 }}
            onSearch={(value) => setFilters(prev => ({ ...prev, code: value }))}
          />
          <Input.Search
            placeholder="商品名称"
            allowClear
            style={{ width: 200 }}
            onSearch={(value) => setFilters(prev => ({ ...prev, name: value }))}
          />
          <Upload
            accept=".xlsx"
            showUploadList={false}
            beforeUpload={handleProductImport}
          >
            <Button icon={<UploadOutlined />}>导入商品</Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={downloadProductTemplate}>
            下载商品模板
          </Button>
          <Upload
            accept=".xlsx"
            showUploadList={false}
            beforeUpload={handleStockImport}
          >
            <Button icon={<UploadOutlined />}>导入库存</Button>
          </Upload>
          <Button icon={<DownloadOutlined />} onClick={downloadStockTemplate}>
            下载库存模板
          </Button>
        </Space>
      </div>

      <Table
        rowSelection={rowSelection}
        columns={productColumns}
        dataSource={products}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title={editingProduct ? "编辑商品" : "新增商品"}
        visible={productModalVisible}
        onOk={handleProductSubmit}
        onCancel={() => {
          setProductModalVisible(false);
          setEditingProduct(null);
          productForm.resetFields();
        }}
      >
        <Form
          form={productForm}
          layout="vertical"
        >
          <Form.Item
            name="code"
            label="商品编码"
            rules={[{ required: true, message: '请输入商品编码' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="unit"
            label="单位"
            rules={[{ required: true, message: '请输入单位' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="specification"
            label="规格"
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="reference_days"
            label="预估天数"
            initialValue={5}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${selectedProduct?.name || ''} - 销量历史`}
        visible={salesHistoryVisible}
        onCancel={() => setSalesHistoryVisible(false)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={selectedProductSales.map((sale, index) => ({
            ...sale,
            key: index,
            date: moment(sale.date).format('YYYY-MM-DD')
          }))}
          columns={[
            {
              title: '日期',
              dataIndex: 'date',
              key: 'date',
            },
            {
              title: '销量',
              dataIndex: 'quantity',
              key: 'quantity',
            }
          ]}
        />
      </Modal>
    </div>
  );
};

export default ProductList; 