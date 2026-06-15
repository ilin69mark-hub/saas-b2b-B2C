import React, { useEffect, Suspense, lazy, useState } from 'react';
import { Layout, Typography, Badge, Space, Spin, Menu, theme } from 'antd';
import {
  BellOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  HeartOutlined,
  ToolOutlined,
  DollarOutlined,
  AuditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import { useThemeMode } from '@/components/ThemeProvider';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useSuperAdminStore } from '@/store/superAdminStore';
import UserMenu from './UserMenu';
import type { User } from '@/types';

dayjs.locale('ru');

const { Header: AntHeader, Sider, Content } = Layout;
const { Title, Text } = Typography;

const MetricsSection = lazy(() => import('./sections/MetricsSection'));
const TenantsSection = lazy(() => import('./sections/TenantsSection'));
const ActivitySection = lazy(() => import('./sections/ActivitySection'));
const TechHealthSection = lazy(() => import('./sections/TechHealthSection'));
const BillingSection = lazy(() => import('./sections/BillingSection'));
const AuditSection = lazy(() => import('./sections/AuditSection'));

interface SuperAdminDashboardProps {
  user: User;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ user }) => {
  const { token } = theme.useToken();
  const {
    activeSection,
    alertCount,
    setActiveSection,
    setStats,
    setLoading,
    setAlertCount,
    setLastUpdated,
  } = useSuperAdminStore();

  const [currentDate, setCurrentDate] = useState(dayjs().format('D MMMM YYYY, dddd'));
  const [currentTime, setCurrentTime] = useState(dayjs().format('HH:mm'));
  const { theme: themeName, toggleTheme } = useThemeMode();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(dayjs().format('D MMMM YYYY, dddd'));
      setCurrentTime(dayjs().format('HH:mm'));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/admin/stats');
        const data = res.data as Record<string, unknown>;
        setStats({
          mrr: Number(data.mrr) || 0,
          arr: Number(data.arr) || 0,
          churnRate: Number(data.churnRate) || 0,
          overduePayments: Number(data.overduePayments) || 0,
          arpu: Number(data.arpu) || 0,
          activeTenants: Number(data.active_tenants) || 0,
          newThisMonth: Number(data.new_this_month) || 0,
          churnedThisMonth: Number(data.churned_tenants) || 0,
        });
        setAlertCount(Number(data.alerts) || 0);
      } catch {
        setStats({
          mrr: 0,
          arr: 0,
          churnRate: 0,
          overduePayments: 0,
          arpu: 0,
          activeTenants: 0,
          newThisMonth: 0,
          churnedThisMonth: 0,
        });
      } finally {
        setLoading(false);
        setLastUpdated(new Date());
      }
    };

    fetchStats();
    const updateInterval = setInterval(fetchStats, 60 * 1000);
    return () => clearInterval(updateInterval);
  }, [setStats, setLoading, setLastUpdated]);

  const handleThemeToggle = () => {
    toggleTheme();
  };

  const menuItems = [
    { key: 'metrics', icon: <DashboardOutlined />, label: 'SaaS-метрики' },
    { key: 'tenants', icon: <ApartmentOutlined />, label: 'Тенанты' },
    { key: 'activity', icon: <HeartOutlined />, label: 'Активность' },
    { key: 'tech', icon: <ToolOutlined />, label: 'Тех. здоровье' },
    { key: 'billing', icon: <DollarOutlined />, label: 'Биллинг' },
    { key: 'audit', icon: <AuditOutlined />, label: 'Аудит' },
  ];

  const renderSection = () => {
    return (
      <Suspense
        fallback={
          <div style={{ textAlign: 'center', padding: 50 }}>
            <Spin size="large" />
          </div>
        }
      >
        {activeSection === 'metrics' && <MetricsSection />}
        {activeSection === 'tenants' && <TenantsSection />}
        {activeSection === 'activity' && <ActivitySection />}
        {activeSection === 'tech' && <TechHealthSection />}
        {activeSection === 'billing' && <BillingSection />}
        {activeSection === 'audit' && <AuditSection />}
      </Suspense>
    );
  };

  const layoutStyle = themeName === 'dark'
    ? { minHeight: '100vh' }
    : { minHeight: '100vh' };

  const headerStyle = themeName === 'dark'
    ? { background: '#1f1f1f', borderBottom: '1px solid #303030' }
    : { background: '#fff', borderBottom: '1px solid #f0f0f0' };

  const sidebarStyle = themeName === 'dark'
    ? { background: '#1f1f1f', borderRight: '1px solid #303030' }
    : { background: '#fff', borderRight: '1px solid #f0f0f0' };

  const contentStyle = themeName === 'dark'
    ? { background: '#141414', color: '#fff' }
    : { background: '#fff' };

  return (
    <Layout style={layoutStyle}>
      <AntHeader
        style={{
          ...headerStyle,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 48,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Title level={4} style={{ margin: 0, color: token.colorPrimary }}>
            SaaS Платформа
          </Title>
          <Badge status="processing" />
          <Text type="secondary" style={{ color: themeName === 'dark' ? '#aaa' : undefined }}>
            Супер Админ
          </Text>
        </div>



        <Space size="middle">
          <Text type="secondary" style={{ color: themeName === 'dark' ? '#aaa' : undefined }}>
            {currentDate} {currentTime}
          </Text>
          <Badge count={alertCount} offset={[-5, 5]}>
            <BellOutlined
              style={{
                fontSize: 20,
                cursor: 'pointer',
                color: themeName === 'dark' ? '#fff' : undefined,
              }}
            />
          </Badge>
          <span onClick={handleThemeToggle} style={{ cursor: 'pointer', fontSize: 18 }}>
            {themeName === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          </span>
          <UserMenu user={user} />
        </Space>
      </AntHeader>

      <Layout>
        <Sider
          width={220}
          collapsedWidth={80}
          collapsed={collapsed}
          style={sidebarStyle}
          trigger={null}
        >
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: `1px solid ${themeName === 'dark' ? '#303030' : '#f0f0f0'}`,
              textAlign: 'center',
            }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[activeSection]}
            onClick={({ key }) => setActiveSection(key)}
            style={{
              background: 'transparent',
              borderRight: 0,
            }}
            items={menuItems}
          />
        </Sider>

        <Content style={{ padding: 24, ...contentStyle }}>
          {renderSection()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default SuperAdminDashboard;