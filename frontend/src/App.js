import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { UnorderedListOutlined, CalculatorOutlined, InboxOutlined, BarChartOutlined } from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import ProductList from './components/ProductList';
import ProcurementCalculation from './components/ProcurementCalculation';
import ArrivalList from './components/ArrivalList';
import SalesList from './components/SalesList';

const { Header, Content, Sider } = Layout;

// 创建全局状态上下文
export const GlobalContext = React.createContext();

const AppContent = () => {
  const location = useLocation();
  const [orderResults, setOrderResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [formData, setFormData] = useState({
    product_ids: [],
    items: []
  });

  return (
    <GlobalContext.Provider value={{ 
      orderResults, 
      setOrderResults,
      selectedProducts,
      setSelectedProducts,
      formData,
      setFormData
    }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ background: '#fff', padding: 0 }}>
          <div style={{ float: 'left', marginLeft: '24px', fontSize: '20px' }}>
            库存管理系统
          </div>
        </Header>
        <Layout>
          <Sider width={200} style={{ background: '#fff' }}>
            <Menu
              mode="inline"
              selectedKeys={[location.pathname]}
              style={{ height: '100%', borderRight: 0 }}
              items={[
                {
                  key: '/',
                  icon: <UnorderedListOutlined />,
                  label: <Link to="/">商品管理</Link>,
                },
                {
                  key: '/calculate',
                  icon: <CalculatorOutlined />,
                  label: <Link to="/calculate">采购计算</Link>,
                },
                {
                  key: '/arrivals',
                  icon: <InboxOutlined />,
                  label: <Link to="/arrivals">到货记录</Link>,
                },
                {
                  key: '/sales',
                  icon: <BarChartOutlined />,
                  label: <Link to="/sales">销量管理</Link>,
                },
              ]}
            />
          </Sider>
          <Layout style={{ padding: '24px' }}>
            <Content style={{ background: '#fff', padding: 24, margin: 0, minHeight: 280 }}>
              <Routes>
                <Route path="/" element={<ProductList />} />
                <Route path="/calculate" element={<ProcurementCalculation />} />
                <Route path="/arrivals" element={<ArrivalList />} />
                <Route path="/sales" element={<SalesList />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </GlobalContext.Provider>
  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App; 