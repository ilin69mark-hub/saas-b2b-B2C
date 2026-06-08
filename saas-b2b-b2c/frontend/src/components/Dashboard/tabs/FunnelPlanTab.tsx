import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Row, Col, Progress, Typography, Table, Tag, Button, Space, Select, Radio, Collapse, Statistic, Empty, Spin, Alert, DatePicker } from 'antd';
import { TrophyOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import apiClient from '@/api/axiosClient';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export type PeriodType = 'month' | 'quarter' | 'year' | 'custom';
interface SalonPlanData {
  id: string;
  name: string;
  plan: number;
  fact: number;
  percent: number;
  forecast: 'green' | 'yellow' | 'red';
  managerName: string;
  managersCount: number;
  avgCheck: number;
}

interface FunnelStage {
  name: string;
  count: number;
  conversion: number;
}

interface ManagerStats {
  id: string;
  name: string;
  salon: string;
  revenue: number;
  planPercent: number;
  conversion: number;
}

interface BenchmarkPoint {
  date: string;
  dealerConversion: number;
  networkAvgConversion: number;
}

const FunnelPlanTab: React.FC = () => {
  const [salonPlanData, setSalonPlanData] = useState<SalonPlanData[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkPoint[]>([]);
  const [managerStats, setManagerStats] = useState<ManagerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customDateRange, setCustomDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [expandedSalon, setExpandedSalon] = useState<string | null>(null);

  const fetchData = useCallback(async (p: PeriodType, startDate?: string, endDate?: string) => {
    setLoading(true);
    setError(false);
    try {
      let url = `/dealer/funnel?period=${p}`;
      if (startDate && endDate) {
        url = `/dealer/funnel?start_date=${startDate}&end_date=${endDate}`;
      }
      const { data } = await apiClient.get(url);
      const backendStages: { stage: string; label: string; count: number; conversion: number }[] = data.stages || [];
      const mappedStages: FunnelStage[] = backendStages.map((s: any) => ({
        name: s.label || s.stage,
        count: s.count || 0,
        conversion: s.conversion || 0,
      }));
      setStages(mappedStages);

      const backendPlan: any[] = data.salon_plan_data || data.salonPlanData || [];
      const mappedPlan: SalonPlanData[] = backendPlan.map((s: any) => ({
        id: s.id || '',
        name: s.name || '',
        plan: s.plan || 0,
        fact: s.fact || 0,
        percent: s.percent || 0,
        forecast: s.forecast || 'red',
        managerName: s.managerName || '',
        managersCount: s.managersCount || 0,
        avgCheck: s.avgCheck || 0,
      }));
      setSalonPlanData(mappedPlan);
      setBenchmarkData(data.benchmark_data || data.benchmarkData || []);
      setManagerStats(data.manager_stats || data.managerStats || []);
    } catch (e) {
      console.error('Failed to fetch funnel data', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (period === 'custom' && customDateRange?.[0] && customDateRange?.[1]) {
      fetchData('custom',
        customDateRange[0].format('YYYY-MM-DD'),
        customDateRange[1].format('YYYY-MM-DD'));
    } else if (period !== 'custom') {
      fetchData(period);
    }
  }, [period, customDateRange, fetchData]);

  const totalPlan = useMemo(() => salonPlanData.reduce((sum, s) => sum + s.plan, 0), [salonPlanData]);
  const totalFact = useMemo(() => salonPlanData.reduce((sum, s) => sum + s.fact, 0), [salonPlanData]);
  const planPercent = totalPlan > 0 ? Math.min(Math.round((totalFact / totalPlan) * 100), 100) : 0;

  const topManagers = useMemo(() => {
    return [...managerStats].sort((a, b) => b.revenue - a.revenue).slice(0, 3);
  }, [managerStats]);

  const antiTopManagers = useMemo(() => {
    return [...managerStats].sort((a, b) => a.conversion - b.conversion).slice(0, 3);
  }, [managerStats]);

  const getForecastIcon = (forecast: 'green' | 'yellow' | 'red') => {
    const icons = { green: '🟢', yellow: '🟡', red: '🔴' };
    return icons[forecast];
  };

  const salonColumns = [
    {
      title: 'Название салона',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 180,
    },
    {
      title: 'План (руб.)',
      dataIndex: 'plan',
      key: 'plan',
      render: (val: number) => <Text strong>{val.toLocaleString()} ₽</Text>,
    },
    {
      title: 'Факт (руб.)',
      dataIndex: 'fact',
      key: 'fact',
      render: (val: number) => <Text strong>{val.toLocaleString()} ₽</Text>,
    },
    {
      title: '% выполнения',
      dataIndex: 'percent',
      key: 'percent',
      render: (val: number) => (
        <Progress
          percent={val}
          size="small"
          strokeColor={val >= 80 ? '#52c41a' : val >= 50 ? '#faad14' : '#ff4d4f'}
        />
      ),
    },
    {
      title: 'Прогноз',
      dataIndex: 'forecast',
      key: 'forecast',
      render: (_: any, record: SalonPlanData) => (
        <span>
          {getForecastIcon(record.forecast)}{' '}
          {record.forecast === 'green' ? 'выполнит' : record.forecast === 'yellow' ? 'под вопросом' : 'не выполнит'}
        </span>
      ),
    },
  ];

  const managerColumns = [
    {
      title: 'ФИО менеджера',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: 'Салон',
      dataIndex: 'salon',
      key: 'salon',
      width: 150,
    },
    {
      title: 'Выручка',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (val: number) => <Text strong>{val.toLocaleString()} ₽</Text>,
    },
    {
      title: '% плана',
      dataIndex: 'planPercent',
      key: 'planPercent',
      render: (val: number) => (
        <Tag color={val >= 80 ? 'green' : val >= 50 ? 'orange' : 'red'}>
          {val}%
        </Tag>
      ),
    },
    {
      title: 'Конверсия',
      dataIndex: 'conversion',
      key: 'conversion',
      render: (val: number) => <Text>{val.toFixed(1)}%</Text>,
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Ошибка загрузки"
        description="Не удалось загрузить данные по воронке и плану."
        type="error"
        showIcon
        action={<Button icon={<ReloadOutlined />} onClick={() => {
          if (period === 'custom' && customDateRange?.[0] && customDateRange?.[1]) {
            fetchData('custom', customDateRange[0].format('YYYY-MM-DD'), customDateRange[1].format('YYYY-MM-DD'));
          } else {
            fetchData(period);
          }
        }}>Повторить</Button>}
      />
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} style={{ marginBottom: 16 }}>
          <Space>
            <Select
              value={period}
              onChange={(val) => setPeriod(val as PeriodType)}
              style={{ width: 220 }}
            >
              <Select.Option value="month">Месяц</Select.Option>
              <Select.Option value="quarter">Квартал</Select.Option>
              <Select.Option value="year">Год</Select.Option>
              <Select.Option value="custom">Произвольный период</Select.Option>
            </Select>
            {period === 'custom' && (
              <RangePicker
                value={customDateRange as any}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setCustomDateRange([dates[0], dates[1]]);
                  }
                }}
              />
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="📊 ПЛАН-ФАКТ">
            <Row gutter={[0, 16]}>
              <Col span={24}>
                <Statistic
                  title="Общий план"
                  value={totalPlan}
                  precision={0}
                  prefix="₽ "
                  valueStyle={{ fontSize: 20 }}
                />
              </Col>
              <Col span={24}>
                <Statistic
                  title="Факт"
                  value={totalFact}
                  precision={0}
                  prefix="₽ "
                  valueStyle={{ fontSize: 20 }}
                />
              </Col>
              <Col span={24}>
                <Progress
                  percent={planPercent}
                  strokeColor={planPercent >= 80 ? '#52c41a' : planPercent >= 50 ? '#faad14' : '#ff4d4f'}
                  status={planPercent >= 100 ? 'success' : undefined}
                />
                <Text>
                  {planPercent}% выполнения плана
                  {planPercent >= 100 && ' ✅'}
                </Text>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="📈 Воронка сети">
            {stages.length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                {stages.map((stage, idx) => (
                  <div key={stage.name}>
                    <Row>
                      <Col span={14}>
                        <Text type="secondary">{stage.name}</Text>
                      </Col>
                      <Col span={6}>
                        <Tag color="blue">{stage.count}</Tag>
                      </Col>
                      <Col span={4}>
                        <Text>{stage.conversion.toFixed(1)}%</Text>
                      </Col>
                    </Row>
                  </div>
                ))}
              </Space>
            ) : (
              <Empty description="Нет данных о воронке" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="📋 Разбивка плана по салонам">
            {salonPlanData.length > 0 ? (
              <Collapse
                accordion
                onChange={(keys) => setExpandedSalon(keys[0] as string)}
                items={salonPlanData.map((salon) => ({
                  key: salon.id,
                  label: (
                    <Space>
                      <Text strong>{salon.name}</Text>
                      <Tag color={salon.percent >= 80 ? 'green' : salon.percent >= 50 ? 'orange' : 'red'}>
                        {salon.percent}%
                      </Tag>
                    </Space>
                  ),
                  children: (
                    <Row gutter={[16, 8]}>
                      <Col xs={24} sm={8}>
                        <Text type="secondary">Менеджер:</Text>
                        <br />
                        <Text strong>{salon.managerName}</Text>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Text type="secondary">Кол-во менеджеров:</Text>
                        <br />
                        <Text strong>{salon.managersCount}</Text>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Text type="secondary">Средний чек:</Text>
                        <br />
                        <Text strong>{salon.avgCheck.toLocaleString()} ₽</Text>
                      </Col>
                    </Row>
                  ),
                }))}
              />
            ) : (
              <Empty description="Нет данных по салонам" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                Топ-3 менеджеров (по выручке)
              </Space>
            }
          >
            {topManagers.length > 0 ? (
              <Table
                dataSource={topManagers}
                columns={managerColumns}
                rowKey="id"
                pagination={false}
                size="small"
                locale={{ emptyText: 'Нет данных' }}
              />
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: '#ff4d4f' }} />
                Анти-топ-3 (по конверсии)
              </Space>
            }
          >
            {antiTopManagers.length > 0 ? (
              <Table
                dataSource={antiTopManagers}
                columns={managerColumns}
                rowKey="id"
                pagination={false}
                size="small"
                locale={{ emptyText: 'Нет данных' }}
              />
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="📉 Сравнение конверсии с сетью">
            {benchmarkData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={benchmarkData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="dealerConversion" stroke="#1890ff" name="Конверсия дилера" />
                  <Line type="monotone" dataKey="networkAvgConversion" stroke="#52c41a" name="Средняя по сети" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="Нет данных для графика" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default FunnelPlanTab;
