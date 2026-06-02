import React, { useState, useEffect, Suspense, lazy, Component } from 'react';
import { Layout, Row, Col, Card, Typography, Tabs, Badge, Avatar, Dropdown, Space, Spin, Statistic, message, Alert } from 'antd';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { 
  UserOutlined, 
  LogoutOutlined, 
  SettingOutlined, 
  BellOutlined,
  PercentageOutlined,
  RiseOutlined,
  TeamOutlined,
  ShopOutlined,
  DesktopOutlined,
  FileTextOutlined,
  DashboardOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';
import { useDispatch } from 'react-redux';
import { logout } from '@/store/authSlice';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useFranchiserStore, FranchiserSummary } from '@/store/franchiserStore';

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
    alertCount,
    fetchSummary,
  } = useFranchiserStore();

  const dispatch = useDispatch();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return; // Не делать запросы, если пользователь уже вышел
    fetchSummary();
    const interval = setInterval(fetchSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchSummary, isAuthenticated]);

  const handleLogout = () => {
    // Очистить Redux‑state и локальное хранилище
    dispatch(logout());
    // Удаляем токен из localStorage (на всякий случай, уже делается в logout)
    localStorage.removeItem('accessToken');
    // Убираем заголовок Authorization из глобального axios‑клиента
    import('@/api/axiosClient').then(mod => {
      if (mod && mod.default && mod.default.defaults) {
        delete mod.default.defaults.headers.common['Authorization'];
      }
    });
    // Перенаправляем на страницу входа
    router.replace('/login');
  };

  const currentDate = dayjs().format('dddd, D MMMM YYYY');

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Профиль',
      onClick: () => router.push('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
      onClick: () => router.push('/settings'),
    },
    {
      key: 'divider',
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выход',
      danger: true,
      onClick: handleLogout,
    },
  ];

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
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <AntHeader style={{ 
        background: '#fff', 
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
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

          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Badge count={alertCount} size="small">
              <Badge dot={alertCount > 0} color="red">
                <Avatar 
                  icon={<UserOutlined />} 
                  style={{ backgroundColor: '#1890ff', cursor: 'pointer' }}
                />
              </Badge>
            </Badge>
          </Dropdown>
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