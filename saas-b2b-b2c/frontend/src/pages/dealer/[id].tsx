// src/pages/dealer/[id].tsx
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/router';
import { Layout, Row, Col, Card, Typography, Statistic, Tag, Space, List, Avatar, Spin, Alert, Button, Progress, Divider, Empty } from 'antd';
import {
  UserOutlined,
  ShopOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  ArrowLeftOutlined,
  RiseOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  AlertOutlined,
  FileTextOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { RootState } from '../../store';
import Head from 'next/head';
import Header from '@/components/Dashboard/Header';
import apiClient from '@/api/axiosClient';

const { Content } = Layout;
const { Title, Text } = Typography;

interface DealerDetailSalon {
  id: string;
  name: string;
  address: string;
  sales: number;
  manager_name: string;
}

interface DealerDetailAlert {
  id: string;
  title: string;
  category: string;
  priority: string;
  created_at: string;
}

interface DealerDetails {
  dealer_id: string;
  dealer_name: string;
  email: string;
  phone: string;
  status: string;
  plan: number;
  fact: number;
  plan_percent: number;
  conversion: number;
  avg_check: number;
  margin: number;
  debt: number;
  manager_id: string | null;
  manager_name: string;
  salons: DealerDetailSalon[];
  sales_history: number[];
  plan_history: number[];
  recent_alerts: DealerDetailAlert[];
  task_count: number;
}

const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const formatRub = (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽';

const DealerPreviewPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const [data, setData] = useState<DealerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/franchiser/dealers/${id}/details`);
        if (!cancelled) {
          setData(res.data);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.error || 'Не удалось загрузить данные дилера');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!user) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Head><title>Загрузка...</title></Head>
        <Header />
        <Content />
      </Layout>
    );
  }

  if (user.role === 'super_admin') {
    router.push('/admin');
    return null;
  }
  if (user.role === 'dealer') {
    router.push('/dealer');
    return null;
  }
  if (user.role === 'salon_manager') {
    router.push('/salon-manager');
    return null;
  }

  const handleBack = () => {
    router.push('/franchiser-manager');
  };

  const getStatusColor = (percent: number) => {
    if (percent >= 90) return '#52c41a';
    if (percent >= 70) return '#fa8c16';
    return '#ff4d4f';
  };

  const getStatusLabel = (percent: number) => {
    if (percent >= 90) return { text: 'Норма', color: 'green' };
    if (percent >= 70) return { text: 'Внимание', color: 'orange' };
    return { text: 'Проблема', color: 'red' };
  };

  const chartHeight = 120;

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Head>
        <title>{data?.dealer_name || 'Дилер'} — Просмотр</title>
      </Head>
      <Header />
      <Content style={{ padding: 24 }}>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Назад к карте территории
          </Button>
          {data && (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              <UserOutlined /> Режим менеджера (только просмотр)
            </Tag>
          )}
        </Space>

        {loading && (
          <Card><div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div></Card>
        )}

        {error && !loading && (
          <Alert type="error" message="Ошибка" description={error} showIcon action={
            <Button size="small" onClick={() => router.reload()}>Повторить</Button>
          } />
        )}

        {data && !loading && !error && (
          <>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16} align="middle">
                <Col flex="none">
                  <Avatar size={64} icon={<ShopOutlined />} style={{ backgroundColor: getStatusColor(data.plan_percent) }} />
                </Col>
                <Col flex="auto">
                  <Title level={4} style={{ margin: 0 }}>{data.dealer_name}</Title>
                  <Space size="middle" wrap style={{ marginTop: 4 }}>
                    {data.email && <Text type="secondary"><MailOutlined /> {data.email}</Text>}
                    {data.phone && <Text type="secondary"><PhoneOutlined /> {data.phone}</Text>}
                    {data.manager_name && <Text type="secondary"><TeamOutlined /> Менеджер: {data.manager_name}</Text>}
                    <Tag color={data.status === 'active' ? 'green' : 'default'}>
                      {data.status === 'active' ? 'Активен' : data.status}
                    </Tag>
                  </Space>
                </Col>
                <Col flex="none">
                  <Tag color={getStatusLabel(data.plan_percent).color} style={{ fontSize: 14, padding: '4px 12px' }}>
                    {getStatusLabel(data.plan_percent).text}
                  </Tag>
                </Col>
              </Row>
            </Card>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={8} lg={4}>
                <Card size="small">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Statistic
                      title="Выполнение плана"
                      value={data.plan_percent}
                      suffix="%"
                      valueStyle={{ color: getStatusColor(data.plan_percent) }}
                      style={{ flex: 'none' }}
                    />
                    <Progress
                      percent={Math.min(data.plan_percent, 100)}
                      showInfo={false}
                      strokeColor={getStatusColor(data.plan_percent)}
                      size="small"
                      style={{ flex: 1, marginBottom: 0 }}
                    />
                  </div>
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <Card size="small">
                  <Statistic
                    title="План"
                    value={data.plan}
                    formatter={(v: any) => <span style={{ fontSize: 14 }}>{formatRub(Number(v))}</span>}
                    prefix={<RiseOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <Card size="small">
                  <Statistic
                    title="Факт"
                    value={data.fact}
                    formatter={(v: any) => <span style={{ fontSize: 14, color: data.fact > 0 ? '#52c41a' : undefined }}>{formatRub(Number(v))}</span>}
                    prefix={<RiseOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <Card size="small">
                  <Statistic
                    title="Конверсия"
                    value={data.conversion}
                    suffix="%"
                    precision={1}
                    valueStyle={{ color: data.conversion >= 3 ? '#52c41a' : data.conversion >= 2 ? '#fa8c16' : '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <Card size="small">
                  <Statistic
                    title="Средний чек"
                    value={data.avg_check}
                    formatter={(v: any) => <span style={{ fontSize: 14 }}>{formatRub(Number(v))}</span>}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={4}>
                <Card size="small">
                  <Statistic
                    title="Маржа"
                    value={data.margin}
                    suffix="%"
                    precision={1}
                    valueStyle={{ color: data.margin >= 25 ? '#52c41a' : data.margin >= 20 ? '#fa8c16' : '#ff4d4f' }}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} lg={12}>
                <Card size="small" title={<Space><ShopOutlined />Салоны дилера ({data.salons.length})</Space>}>
                  {data.salons.length > 0 ? (
                    <List
                      size="small"
                      dataSource={data.salons}
                      renderItem={salon => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={<Avatar icon={<ShopOutlined />} style={{ backgroundColor: '#1890ff' }} />}
                            title={salon.name}
                            description={
                              <Space direction="vertical" size={0}>
                                {salon.address && <Text type="secondary"><EnvironmentOutlined /> {salon.address}</Text>}
                                {salon.manager_name && <Text type="secondary"><UserOutlined /> {salon.manager_name}</Text>}
                              </Space>
                            }
                          />
                          <Text strong>{formatRub(salon.sales)}</Text>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="Нет салонов" />
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card size="small" title={<Space><RiseOutlined />Динамика продаж (6 мес)</Space>}>
                  {data.sales_history.length > 0 ? (() => {
                    const history = data.sales_history;
                    const planHist = data.plan_history || [];
                    const maxVal = Math.max(...history, ...planHist, 0.1);
                    const now = new Date();
                    const monthLabels: string[] = [];
                    for (let i = 5; i >= 0; i--) {
                      const m = (now.getMonth() - i + 12) % 12;
                      monthLabels.push(months[m]);
                    }
                    const trend: (number | null)[] = history.map((_, i) => {
                      if (i < 2) return null;
                      return (history[i] + history[i - 1] + history[i - 2]) / 3;
                    });
                    return (
                      <div style={{ position: 'relative', marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', height: chartHeight, gap: 3, position: 'relative' }}>
                          {history.map((v, i) => (
                            <div key={i} style={{
                              flex: 1, display: 'flex', flexDirection: 'column',
                              alignItems: 'center', position: 'relative',
                            }}>
                              <div
                                onMouseEnter={() => setHoveredBar(i)}
                                onMouseLeave={() => setHoveredBar(null)}
                                style={{
                                  width: '100%',
                                  background: i === history.length - 1 ? '#52c41a' : '#1890ff',
                                  height: `${Math.max((v / maxVal) * chartHeight, 4)}px`,
                                  borderRadius: '2px 2px 0 0',
                                  minHeight: 4,
                                  cursor: 'pointer',
                                  position: 'relative',
                                  transition: 'opacity 0.15s',
                                  opacity: hoveredBar !== null && hoveredBar !== i ? 0.6 : 1,
                                }}
                              />
                              {planHist[i] > 0 && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: `${(planHist[i] / maxVal) * chartHeight}px`,
                                  left: 0,
                                  right: 0,
                                  height: 1,
                                  borderTop: '1.5px dashed #ff4d4f',
                                  zIndex: 3,
                                  pointerEvents: 'none',
                                }} />
                              )}
                              <Text style={{ fontSize: 9, marginTop: 3, color: '#888' }}>{monthLabels[i]}</Text>
                              {hoveredBar === i && (
                                <div style={{
                                  position: 'absolute',
                                  bottom: '100%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  background: 'rgba(0,0,0,0.85)',
                                  color: '#fff',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  whiteSpace: 'nowrap',
                                  zIndex: 10,
                                  pointerEvents: 'none',
                                  lineHeight: 1.5,
                                }}>
                                  <div>{monthLabels[i]}: {formatRub(v)}</div>
                                  {planHist[i] > 0 && <div style={{ color: '#ff7875' }}>План: {formatRub(planHist[i])}</div>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {trend.some(t => t !== null) && (
                          <svg style={{
                            position: 'absolute', top: 0, left: 0,
                            width: '100%', height: chartHeight,
                            pointerEvents: 'none', zIndex: 2,
                          }}>
                            {trend.map((t, i) => {
                              if (t === null) return null;
                              const x1Pct = ((i + 0.5) / history.length) * 100;
                              const y1 = chartHeight - (t / maxVal) * chartHeight;
                              const next = trend[i + 1];
                              if (next === null || next === undefined) return null;
                              const x2Pct = ((i + 1.5) / history.length) * 100;
                              const y2 = chartHeight - (next / maxVal) * chartHeight;
                              return (
                                <line key={i} x1={`${x1Pct}%`} y1={y1} x2={`${x2Pct}%`} y2={y2}
                                  stroke="#ff85c0" strokeWidth={2} strokeDasharray="4 2" />
                              );
                            })}
                          </svg>
                        )}
                      </div>
                    );
                  })() : (
                    <Empty description="Нет истории" />
                  )}
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Card size="small" title={<Space><AlertOutlined />Последние алерты</Space>}>
                  {data.recent_alerts.length > 0 ? (
                    <List
                      size="small"
                      dataSource={data.recent_alerts}
                      renderItem={alert => (
                        <List.Item>
                          <Space>
                            <Tag color={alert.priority === 'critical' ? 'red' : alert.priority === 'warning' ? 'orange' : 'blue'}>
                              {alert.priority}
                            </Tag>
                            <Text>{alert.title}</Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <CalendarOutlined /> {alert.created_at}
                          </Text>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="Нет алертов" />
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card size="small" title={<Space><FileTextOutlined />Сводка</Space>}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Активных задач:</Text>
                      <Text strong style={{ color: data.task_count > 0 ? '#fa8c16' : '#52c41a' }}>
                        {data.task_count}
                      </Text>
                    </div>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Дебиторская задолженность:</Text>
                      <Text strong style={{ color: data.debt > 100000 ? '#ff4d4f' : undefined }}>
                        {formatRub(data.debt)}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>Менеджер:</Text>
                      <Text strong>{data.manager_name || '—'}</Text>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Content>
    </Layout>
  );
};

export default DealerPreviewPage;
