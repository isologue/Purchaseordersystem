import React, { useState, useEffect, useCallback } from 'react';
import { Table, Space, Button, Select, DatePicker, message, Modal, Form, Input, Upload } from 'antd';
import { EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, ExclamationCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import moment from 'moment';
import { API_BASE_URL } from '../config';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { confirm } = Modal;

const ArrivalList = () => {
  const [arrivals, setArrivals] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    productCode: '',
    productName: '',
    status: undefined,
    dateRange: [],
    orderDateRange: []
  });
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingArrival, setEditingArrival] = useState(null);
  const [form] = Form.useForm();
  const [addForm] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [importModalVisible, setImportModalVisible] = useState(false);

  // 获取所有商品
  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/products`);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      message.error('获取商品列表失败');
    }
  };

  // 获取到货记录
  const fetchArrivals = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/api/arrivals?`;
      
      if (filters.productCode) {
        url += `product_code=${encodeURIComponent(filters.productCode)}&`;
      }
      if (filters.productName) {
        url += `product_name=${encodeURIComponent(filters.productName)}&`;
      }
      if (filters.status) {
        url += `status=${encodeURIComponent(filters.status)}&`;
      }
      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        url += `start_date=${filters.dateRange[0].format('YYYY-MM-DD')}&`;
        url += `end_date=${filters.dateRange[1].format('YYYY-MM-DD')}&`;
      }
      if (filters.orderDateRange && filters.orderDateRange[0] && filters.orderDateRange[1]) {
        url += `order_start_date=${filters.orderDateRange[0].format('YYYY-MM-DD')}&`;
        url += `order_end_date=${filters.orderDateRange[1].format('YYYY-MM-DD')}&`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('获取到货记录失败');
      }
      const data = await response.json();
      setArrivals(data);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchArrivals();
  }, [filters, fetchArrivals]);

  // 更新到货记录状态
  const handleStatusChange = async (record, newStatus) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/arrivals/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        message.success('状态更新成功');
        fetchArrivals();
      }
    } catch (error) {
      message.error('状态更新失败');
    }
  };

  // 删除到货记录
  const handleDelete = async (record) => {
    confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除这条到货记录吗？',
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/arrivals/${record.id}`, {
            method: 'DELETE'
          });
          if (response.ok) {
            message.success('删除成功');
            fetchArrivals();
          }
        } catch (error) {
          message.error('删除失败');
        }
      }
    });
  };

  // 编辑到货记录
  const handleEdit = (record) => {
    setEditingArrival(record);
    form.setFieldsValue({
      quantity: record.quantity,
      expected_date: moment(record.expected_date),
    });
    setEditModalVisible(true);
  };

  // 保存编辑
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const response = await fetch(`${API_BASE_URL}/api/arrivals/${editingArrival.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: parseFloat(values.quantity),
          expected_date: values.expected_date.format('YYYY-MM-DD'),
        })
      });
      if (response.ok) {
        message.success('更新成功');
        setEditModalVisible(false);
        fetchArrivals();
      }
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的记录');
      return;
    }

    confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？`,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/arrivals/batch-delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              arrival_ids: selectedRowKeys
            }),
          });

          if (response.ok) {
            const result = await response.json();
            message.success(result.message);
            setSelectedRowKeys([]);
            fetchArrivals();
          } else {
            message.error('删除失败');
          }
        } catch (error) {
          message.error('删除失败: ' + error.message);
        }
      },
    });
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys) => {
      setSelectedRowKeys(selectedKeys);
    },
  };

  const columns = [
    {
      title: '商品编码',
      dataIndex: ['product', 'code'],
      key: 'code',
    },
    {
      title: '商品名称',
      dataIndex: ['product', 'name'],
      key: 'name',
    },
    {
      title: '规格',
      dataIndex: ['product', 'specification'],
      key: 'specification',
    },
    {
      title: '单位',
      dataIndex: ['product', 'unit'],
      key: 'unit',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: '下单日期',
      dataIndex: 'order_date',
      key: 'order_date',
      render: (text) => moment(text).format('YYYY-MM-DD'),
    },
    {
      title: '预计到货日期',
      dataIndex: 'expected_date',
      key: 'expected_date',
      render: (text) => moment(text).format('YYYY-MM-DD'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusMap = {
          'pending': '待到货',
          'arrived': '已到货',
          'cancelled': '已取消'
        };
        return statusMap[status] || status;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                icon={<CheckOutlined />}
                style={{ color: '#52c41a' }}
                onClick={() => handleStatusChange(record, 'arrived')}
              >
                标记到货
              </Button>
              <Button
                type="link"
                icon={<CloseOutlined />}
                style={{ color: '#ff4d4f' }}
                onClick={() => handleStatusChange(record, 'cancelled')}
              >
                取消
              </Button>
            </>
          )}
          {record.status === 'arrived' && (
            <Button
              type="link"
              icon={<CloseOutlined />}
              style={{ color: '#faad14' }}
              onClick={() => handleStatusChange(record, 'pending')}
            >
              未到货
            </Button>
          )}
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  // 处理新增记录
  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      const response = await fetch(`${API_BASE_URL}/api/arrivals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: values.product_id,
          quantity: parseFloat(values.quantity),
          order_date: values.order_date.format('YYYY-MM-DD'),
          expected_date: values.expected_date.format('YYYY-MM-DD'),
          status: 'pending'
        })
      });
      
      if (response.ok) {
        message.success('新增成功');
        setAddModalVisible(false);
        addForm.resetFields();
        fetchArrivals();
      } else {
        message.error('新增失败');
      }
    } catch (error) {
      message.error('新增失败: ' + error.message);
    }
  };

  // 处理筛选条件变化
  const handleFilterChange = (values) => {
    setFilters({
      ...filters,
      ...values
    });
  };

  // 商品选择列表的选项渲染
  const productSelectOptions = products.map(product => (
    <Option key={product.id} value={product.id}>
      {`${product.code} | ${product.name} | ${product.specification || '无'} | ${product.description}`}
    </Option>
  ));

  const handleImportArrivals = async () => {
    if (!importFile) {
        message.warning('请先选择文件');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', importFile);

        const response = await fetch(`${API_BASE_URL}/api/arrivals/import`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('服务器响应:', errorText);
            throw new Error('导入失败');
        }

        const responseData = await response.json();
        message.success(responseData.message);
        fetchArrivals();  // 刷新到货记录
        setImportModalVisible(false);
        setImportFile(null);
    } catch (error) {
        console.error('处理导入请求失败:', error);
        message.error(error.message || '导入失败');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddModalVisible(true)}
          >
            新增到货记录
          </Button>
          <Button
            danger
            onClick={handleBatchDelete}
            disabled={selectedRowKeys.length === 0}
          >
            批量删除
          </Button>
          <Button
            type="primary"
            onClick={() => setImportModalVisible(true)}
          >
            批量导入到货记录
          </Button>
          <Form
            layout="inline"
            form={filterForm}
            onValuesChange={handleFilterChange}
          >
            <Form.Item name="productCode" label="商品编码">
              <Input
                placeholder="输入商品编码"
                allowClear
                onChange={(e) => handleFilterChange({ productCode: e.target.value })}
              />
            </Form.Item>
            <Form.Item name="productName" label="商品名称">
              <Input
                placeholder="输入商品名称"
                allowClear
                onChange={(e) => handleFilterChange({ productName: e.target.value })}
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                style={{ width: 120 }}
                allowClear
                placeholder="选择状态"
                onChange={(value) => handleFilterChange({ status: value })}
              >
                <Option value="pending">待到货</Option>
                <Option value="arrived">已到货</Option>
                <Option value="cancelled">已取消</Option>
              </Select>
            </Form.Item>
            <Form.Item name="dateRange" label="预计到货日期">
              <RangePicker
                onChange={(dates) => handleFilterChange({ dateRange: dates })}
              />
            </Form.Item>
            <Form.Item name="orderDateRange" label="下单日期">
              <RangePicker
                onChange={(dates) => handleFilterChange({ orderDateRange: dates })}
              />
            </Form.Item>
          </Form>
        </Space>
      </div>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={arrivals}
        loading={loading}
        rowKey="id"
      />

      {/* 编辑模态框 */}
      <Modal
        title="编辑到货记录"
        visible={editModalVisible}
        onOk={handleSave}
        onCancel={() => setEditModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="quantity"
            label="数量"
            rules={[{ required: true, message: '请输入数量' }]}
          >
            <Input type="number" />
          </Form.Item>
          <Form.Item
            name="expected_date"
            label="预计到货日期"
            rules={[{ required: true, message: '请选择预计到货日期' }]}
          >
            <DatePicker />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新增模态框 */}
      <Modal
        title="新增到货记录"
        visible={addModalVisible}
        onOk={handleAdd}
        onCancel={() => {
          setAddModalVisible(false);
          addForm.resetFields();
        }}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item 
            label="商品" 
            name="product_id"
            rules={[{ required: true, message: '请选择商品' }]}
          >
            <Select
              showSearch
              placeholder="选择商品"
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
              style={{ width: '100%' }}
            >
              {productSelectOptions}
            </Select>
          </Form.Item>
          <Form.Item
            name="quantity"
            label="数量"
            rules={[{ required: true, message: '请输入数量' }]}
          >
            <Input type="number" />
          </Form.Item>
          <Form.Item
            name="order_date"
            label="下单日期"
            rules={[{ required: true, message: '请选择下单日期' }]}
          >
            <DatePicker />
          </Form.Item>
          <Form.Item
            name="expected_date"
            label="预计到货日期"
            rules={[{ required: true, message: '请选择预计到货日期' }]}
          >
            <DatePicker />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="导入到货数据"
        visible={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
            <Button key="cancel" onClick={() => setImportModalVisible(false)}>
                取消
            </Button>,
            <Button key="submit" type="primary" onClick={handleImportArrivals}>
                确定
            </Button>
        ]}
      >
        <Upload
            beforeUpload={file => {
                setImportFile(file);
                return false; // Prevent automatic upload
            }}
            showUploadList={false}
            accept=".xlsx,.xls"
        >
            <Button icon={<UploadOutlined />}>选择文件</Button>
            {importFile && <span style={{ marginLeft: '8px' }}>{importFile.name}</span>}
        </Upload>
      </Modal>
    </div>
  );
};

export default ArrivalList; 