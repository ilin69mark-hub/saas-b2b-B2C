// src/components/Dashboard/DealerDashboardNew.tsx
import React, { useEffect, Suspense, lazy, useState } from 'react';
import { Layout, Row, Col, Card, Typography, Tabs, Space, Spin, Statistic } from 'antd';
import { SunOutlined, MoonOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useDealerDashboardStore } from '@/store/dealerDashboardStore';
import apiClient from '@/api/axiosClient';
import { useThemeMode } from '@/components/ThemeProvider';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

dayjs.locale('ru');

const { Header: AntHeader } = Layout;
const { Content } = Layout;
const { Title, Text } = Typography;

const ProfitTab = lazy(() => import('./tabs/ProfitTab'));
const FunnelPlanTab = lazy(() => import('./tabs/FunnelPlanTab'));
const ProductsStockTab = lazy(() => import('./tabs/ProductsStockTab'));
const CommunicationsTab = lazy(() => import('./tabs/CommunicationsTab'));

interface UserData {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

interface DealerDashboardNewProps {
  user: UserData;
  title?: string;
}

const DealerDashboardNew: React.FC<DealerDashboardNewProps> = ({ user, title }) => {
  const {
    activeTab,
    summary,
    dealerCenterName,
    setActiveTab,
    setSummary,
    setLoading,
    setLastUpdated
  } = useDealerDashboardStore();

  const [currentDate, setCurrentDate] = useState(dayjs().format('D MMMM YYYY, dddd'));
  const [financeData, setFinanceData] = useState<{netProfit: number; prevMonthNetProfit: number; forecast: number} | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(dayjs());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(dayjs().format('D MMMM YYYY, dddd'));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get('/dealer/summary');
        setSummary({
          netProfit: data.netProfit || 0,
          grossRevenue: data.grossRevenue || 0,
          planCompletionPercent: data.planCompletionPercent || 0,
          marginProfit: data.marginProfit || 0,
          activeAlerts: data.activeAlerts || 0,
        });
      } catch (e) {
        console.error('Summary fetch error', e);
      } finally {
        setLoading(false);
        setLastUpdated(new Date());
      }
    };

    fetchSummary();

    const updateInterval = setInterval(fetchSummary, 3 * 60 * 1000);
    return () => clearInterval(updateInterval);
  }, [setSummary, setLoading, setLastUpdated]);

  const monthStr = selectedMonth.format('YYYY-MM');

  useEffect(() => {
    const isCurrentMonth = dayjs().isSame(selectedMonth, 'month');
    const date = isCurrentMonth
      ? dayjs().format('YYYY-MM-DD')
      : selectedMonth.endOf('month').format('YYYY-MM-DD');
    apiClient.get('/dealer/finance', { params: { date } }).then(({ data }) => {
      setFinanceData({
        netProfit: data.net_profit || 0,
        prevMonthNetProfit: data.prev_month_net_profit || 0,
        forecast: data.net_profit_forecast || 0,
      });
    }).catch(() => {});
  }, [monthStr]);

  const netProfit = financeData?.netProfit ?? 0;
  const prevNetProfit = financeData?.prevMonthNetProfit ?? 0;
  const forecast = financeData?.forecast ?? 0;
  const profitChange = prevNetProfit !== 0
    ? ((netProfit - prevNetProfit) / Math.abs(prevNetProfit)) * 100
    : null;

  const { theme: themeName, toggleTheme } = useThemeMode();
  const isDark = themeName === 'dark';
  const headerStyle = isDark
    ? { background: '#1f1f1f', borderBottom: '1px solid #303030' }
    : { background: '#fff', borderBottom: '1px solid #f0f0f0' };
  const tabStripStyle = isDark
    ? { background: '#1f1f1f', borderBottom: '1px solid #303030' }
    : { background: '#fff', borderBottom: '1px solid #f0f0f0' };

  const renderTabContent = () => (
    <Suspense fallback={
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    }>
      {activeTab === 'profit' && <ProfitTab selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />}
      {activeTab === 'funnel' && <FunnelPlanTab />}
      {activeTab === 'products' && <ProductsStockTab />}
      {activeTab === 'communications' && <CommunicationsTab />}
    </Suspense>
  );

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
              {title || dealerCenterName}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{currentDate}</Text>
          </div>
        </div>

        <Row gutter={[12, 8]} style={{ flex: 1, margin: '0 24px', flexWrap: 'wrap' }}>
          <Col flex={1}>
            <Card size="small" style={{ height: '100%', width: '100%', background: netProfit >= 0 ? '#e6f7ff' : '#fff1f0' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px', overflow: 'hidden', textAlign: 'center' }}>
              <Statistic 
                title={<span style={{ whiteSpace: 'normal' }}>Чистая прибыль <Text type="secondary" style={{ fontSize: 11 }}>за {selectedMonth.format('MMMM YYYY')}</Text></span>}
                value={netProfit}
                precision={0}
                prefix={<span>₽ </span>}
                valueStyle={{ fontSize: 16, color: netProfit >= 0 ? '#1890ff' : '#ff4d4f' }}
                suffix={profitChange !== null ? (
                  <Text type={profitChange >= 0 ? 'success' : 'danger'} style={{ fontSize: 13 }}>
                    {profitChange >= 0 ? <RiseOutlined /> : <FallOutlined />}
                    {' '}{Math.abs(profitChange).toFixed(1)}% к прошлому месяцу
                  </Text>
                ) : null}
              />
            </Card>
          </Col>
          <Col flex={1}>
            <Card size="small" style={{ height: '100%', width: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px', overflow: 'hidden', textAlign: 'center' }}>
              <Statistic 
                title={<span style={{ whiteSpace: 'normal' }}>Прогноз чистой прибыли</span>}
                value={forecast}
                precision={0}
                prefix={<span style={{ whiteSpace: 'normal' }}>₽ до конца месяца</span>}
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
          <Col flex={1}>
            <Card size="small" style={{ height: '100%', width: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px', overflow: 'hidden', textAlign: 'center' }}>
              <Statistic 
                title="Валовый оборот" 
                value={summary?.grossRevenue || 0} 
                precision={0}
                prefix="₽ "
                valueStyle={{ fontSize: 16 }}
              />
            </Card>
          </Col>
          <Col flex={1}>
            <Card size="small" style={{ height: '100%', width: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px', overflow: 'hidden', textAlign: 'center' }}>
              <Statistic 
                title="% плана сети" 
                value={summary?.planCompletionPercent || 0} 
                precision={0}
                suffix="%"
                valueStyle={{ fontSize: 16, color: (summary?.planCompletionPercent || 0) >= 80 ? '#52c41a' : '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col flex={1}>
            <Card size="small" style={{ height: '100%', width: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '10px 16px', overflow: 'hidden', textAlign: 'center' }}>
              <Statistic 
                title="Маржинальная прибыль" 
                value={summary?.marginProfit || 0} 
                precision={0}
                prefix="₽ "
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

      <Content style={{ padding: '0' }}>
        <div style={{ 
          ...tabStripStyle,
          padding: '0 24px',
          overflowX: 'auto',
        }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'profit', label: '💰 Прибыль' },
              { key: 'funnel', label: '📊 Воронка и План' },
              { key: 'products', label: '🛋️ Товары и Склад' },
              { key: 'communications', label: '📞 Коммуникации' },
            ]}
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

export default DealerDashboardNew;