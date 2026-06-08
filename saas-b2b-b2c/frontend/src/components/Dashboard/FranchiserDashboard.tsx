import React, { useState, useEffect, Suspense, lazy, Component } from 'react';
import { Layout, Row, Col, Card, Typography, Tabs, Space, Spin, Statistic, message, Alert } from 'antd';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  PercentageOutlined,
  RiseOutlined,
  TeamOutlined,
  ShopOutlined,
  DesktopOutlined,
  FileTextOutlined,
  DashboardOutlined,
  HeartOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useFranchiserStore, FranchiserSummary } from '@/store/franchiserStore';
import { useThemeMode } from '@/components/ThemeProvider';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

dayjs.locale('ru');

const { Header: AntHeader } = Layout;
const { Content } = Layout;
const { Title, Text } = Typography;

const NetworkDashboardTab = lazy(() => import('./tabs/FranchiserNetworkTab'));
const TeamTab = lazy(() => import('./tabs/FranchiserTeamTab'));
const NetworkHealthTab = lazy(() => import('./tabs/FranchiserNetworkHealthTab'));
const ReportTab = lazy(() => import('./tabs/FranchiserReportTab'));

class TabErrorBoundary extends Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          message="Ошибка загрузки вкладки"
          description={
            <>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{this.state.error.message}</pre>
              <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 }}>
                {this.state.error.stack}
              </pre>
            </>
          }
          showIcon
        />
      );
    }
    return this.props.children;
  }
}

interface FranchiserDashboardProps {
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role?: string;
  };
  title?: string;
}

const FranchiserDashboard: React.FC<FranchiserDashboardProps> = ({ user, title }) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('network');

  const {
    summary,
    isLoading,
    fetchSummary,
  } = useFranchiserStore();

  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return; // Не делать запросы, если пользователь уже вышел
    fetchSummary();
    const interval = setInterval(fetchSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSummary, isAuthenticated]);

  const { theme: themeName, toggleTheme } = useThemeMode();
  const isDark = themeName === 'dark';
  const headerStyle = isDark
    ? { background: '#1f1f1f', borderBottom: '1px solid #303030' }
    : { background: '#fff', borderBottom: '1px solid #f0f0f0' };

  const currentDate = dayjs().format('dddd, D MMMM YYYY');

  const tabsItems = [
    {
      key: 'network',
      label: (
        <span>
          <DashboardOutlined /> Пульт сети
        </span>
      ),
    },
    {
      key: 'team',
      label: (
        <span>
          <TeamOutlined /> Моя команда
        </span>
      ),
    },
    {
      key: 'health',
      label: (
        <span>
          <HeartOutlined /> Здоровье сети
        </span>
      ),
    },
    {
      key: 'report',
      label: (
        <span>
          <FileTextOutlined /> Отчёт для B2B
        </span>
      ),
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'network':
        return <NetworkDashboardTab summary={summary} />;
      case 'team':
        return <TeamTab />;
      case 'health':
        return <NetworkHealthTab />;
      case 'report':
        return <ReportTab />;
      default:
        return null;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', background: isDark ? '#141414' : '#f0f2f5' }}>
      <AntHeader style={{ 
        ...headerStyle,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Space align="center">
          <Title level={4} style={{ margin: 0, marginRight: 24 }}>
            Руководитель отдела франчайзинга
          </Title>
          <Text type="secondary">{currentDate}</Text>
        </Space>

        <Space size={24}>
          <Row gutter={16} style={{ flexWrap: 'nowrap', marginTop: 4 }} align="stretch">
            <Col span={4}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Statistic 
                  title="Выполнение плана" 
                  value={summary.planPercent} 
                  suffix="%" 
                  valueStyle={{ fontSize: 20, color: summary.planPercent >= 100 ? '#52c41a' : '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Statistic 
                  title="Прогноз квартала" 
                  value={summary.forecastPercent} 
                  suffix="%" 
                  valueStyle={{ fontSize: 20, color: summary.forecastPercent >= 100 ? '#52c41a' : '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Statistic 
                  title="Активных дилеров" 
                  value={summary.activeDealers} 
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <Statistic 
                  title="Конверсия сети" 
                  value={summary.avgConversion} 
                  suffix="%" 
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ textAlign: 'center', height: '100%' }} bodyStyle={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Statistic 
                  title="Маржинальность" 
                  value={summary.avgMargin} 
                  suffix="%" 
                  valueStyle={{ fontSize: 20, color: summary.avgMargin >= 30 ? '#52c41a' : '#fa8c16' }}
                />
              </Card>
            </Col>
          </Row>

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

      <Content style={{ padding: 24 }}>
        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabsItems}
            style={{ marginBottom: 16 }}
          />
          
          <TabErrorBoundary>
            <Suspense fallback={<Spin tip="Загрузка..." style={{ display: 'block', margin: '40px auto' }} />}>
              {renderTabContent()}
            </Suspense>
          </TabErrorBoundary>
        </Card>
      </Content>
    </Layout>
  );
};

export default FranchiserDashboard;