// src/components/Dashboard/FranchiserManagerDashboard.tsx
import React, { useEffect, Suspense, lazy, useState } from 'react';
import { Layout, Row, Col, Card, Typography, Tabs, Space, Spin, Statistic } from 'antd';
import {
  RiseOutlined,
  WarningOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useTerritoryManagerStore, TerritorySummary, DealerMetrics } from '@/store/territoryManagerStore';
import apiClient from '@/api/axiosClient';
import { useThemeMode } from '@/components/ThemeProvider';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

dayjs.locale('ru');

const { Header: AntHeader } = Layout;
const { Content } = Layout;
const { Title, Text } = Typography;

const TerritoryMapTab = lazy(() => import('./tabs/TerritoryMapTab'));
const TerritoryFunnelTab = lazy(() => import('./tabs/TerritoryFunnelTab'));
const TerritoryPlanFactTab = lazy(() => import('./tabs/TerritoryPlanFactTab'));
const TerritoryCommunicationsTab = lazy(() => import('./tabs/TerritoryCommunicationsTab'));
const TerritoryBenchmarkTab = lazy(() => import('./tabs/TerritoryBenchmarkTab'));

interface FranchiserManagerDashboardProps {
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role?: string;
    territory?: string;
  };
  title?: string;
}

const FranchiserManagerDashboard: React.FC<FranchiserManagerDashboardProps> = ({ user, title }) => {
  const {
    activeTab,
    summary,
    setActiveTab,
    setManager,
    fetchSummary,
    fetchDealers,
  } = useTerritoryManagerStore();

  const [currentTime, setCurrentTime] = useState(dayjs().format('HH:mm'));
  const [currentDate, setCurrentDate] = useState(dayjs().format('D MMMM YYYY, dddd'));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs().format('HH:mm'));
      setCurrentDate(dayjs().format('D MMMM YYYY, dddd'));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user) {
      setManager({
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        territoryName: user.territory || 'Без территории',
        region: '',
      });
    }
  }, [user, setManager]);

  useEffect(() => {
    fetchSummary();
    fetchDealers();
    const updateInterval = setInterval(() => {
      fetchSummary();
      fetchDealers();
    }, 3 * 60 * 1000);
    return () => clearInterval(updateInterval);
  }, [fetchSummary, fetchDealers]);

  const { theme: themeName, toggleTheme } = useThemeMode();
  const isDark = themeName === 'dark';
  const headerStyle = isDark
    ? { background: '#1f1f1f', borderBottom: '1px solid #303030' }
    : { background: '#fff', borderBottom: '1px solid #f0f0f0' };
  const tabStripStyle = isDark
    ? { background: '#1f1f1f', borderBottom: '1px solid #303030' }
    : { background: '#fff', borderBottom: '1px solid #f0f0f0' };

  const tabItems = [
    { key: 'map', label: 'Карта территории' },
    { key: 'funnel', label: 'Воронка' },
    { key: 'planfact', label: 'План-факт и Прогноз' },
    { key: 'communications', label: 'Коммуникации и Задачи' },
    { key: 'benchmark', label: 'Бенчмаркинг' },
  ];

  const renderTabContent = () => {
    return (
      <Suspense fallback={
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin size="large" />
        </div>
      }>
        {activeTab === 'map' && <TerritoryMapTab />}
        {activeTab === 'funnel' && <TerritoryFunnelTab />}
        {activeTab === 'planfact' && <TerritoryPlanFactTab />}
        {activeTab === 'communications' && <TerritoryCommunicationsTab />}
        {activeTab === 'benchmark' && <TerritoryBenchmarkTab />}
      </Suspense>
    );
  };

  const getStatusColor = (percent: number) => {
    if (percent >= 80) return '#52c41a';
    if (percent >= 50) return '#fa8c16';
    return '#ff4d4f';
  };

  return (
    <Layout style={{ minHeight: '100vh', background: isDark ? '#141414' : '#f5f5f5' }}>
      <AntHeader style={{ 
        ...headerStyle,
        padding: '0 24px', 
        display: 'flex', 
        alignItems: 'stretch', 
        justifyContent: 'space-between', 
        position: 'sticky',
        top: 0,
        zIndex: 100,
        height: 'auto',
        lineHeight: 'normal',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
              {title || `${user.first_name || ''} ${user.last_name || ''}`.trim()}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {user.territory || 'Территория не указана'} • {currentDate} {currentTime}
            </Text>
          </div>
        </div>

        <Row gutter={[12, 8]} style={{ flex: 1, margin: '0 24px', flexWrap: 'wrap' }}>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px' }}>
              <Statistic 
                title="Выполнение плана" 
                value={summary?.planCompletionPercent || 0} 
                precision={0}
                suffix="%"
                valueStyle={{ fontSize: 16, color: getStatusColor(summary?.planCompletionPercent || 0) }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px' }}>
              <Statistic 
                title="Прогноз квартала" 
                value={summary?.quarterForecastPercent || 0} 
                precision={0}
                suffix="%"
                prefix={<RiseOutlined />}
                valueStyle={{ fontSize: 16, color: getStatusColor(summary?.quarterForecastPercent || 0) }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px' }}>
              <Statistic 
                title="Дилеров в красной" 
                value={summary?.redZoneDealersCount || 0} 
                valueStyle={{ fontSize: 16, color: summary?.redZoneDealersCount ? '#ff4d4f' : '#52c41a' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px' }}>
              <Statistic 
                title="Средняя конверсия" 
                value={summary?.avgConversion || 0} 
                precision={1}
                suffix="%"
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
        </Row>

        <Space size="middle">
          <NotificationBell />
          <span
            onClick={toggleTheme}
            role="button"
            aria-label="Переключить тему"
            style={{ cursor: 'pointer', fontSize: 18, color: isDark ? '#fff' : undefined }}
          >
            {isDark ? <SunOutlined /> : <MoonOutlined />}
          </span>
          <UserMenu user={user as any} />
        </Space>
      </AntHeader>

      <Content style={{ padding: 0 }}>
        <div style={{ 
          ...tabStripStyle,
          padding: '0 24px',
          overflowX: 'auto',
        }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            style={{ marginBottom: -1 }}
          />
        </div>

        <div style={{ padding: 24 }}>
          {renderTabContent()}
        </div>
      </Content>
    </Layout>
  );
};

export default FranchiserManagerDashboard;