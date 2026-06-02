import React, { useState, useEffect, useMemo } from 'react';
import { Row, Col, Card, Statistic, Table, Progress, Tag, Typography, Select, Space, Tooltip, DatePicker } from 'antd';
import { 
  ArrowUpOutlined, 
  ArrowDownOutlined, 
  ShopOutlined, 
  WarningOutlined,
  CheckCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { FranchiserSummary, useFranchiserStore } from '@/store/franchiserStore';
import dynamic from 'next/dynamic';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const SalesChart = dynamic(() => import('./SalesDynamicsChart'), { ssr: false });

interface FranchiserNetworkTabProps {
  summary: FranchiserSummary;
}

interface TerritoryData {
  id: string;
  manager: string;
  territory: string;
  planPercent: number;
  dealersCount: number;
  redDealersPercent: number;
  sla: number;
  dealerGrowth: number;
  forecastPercent: number;
}

const getDateOptions = (period: string) => {
  const y = new Date().getFullYear();
  const years = [y - 1, y, y + 1];

  switch (period) {
    case 'month': {
      const months = [
        'Январь','Февраль','Март','Апрель','Май','Июнь',
        'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
      ];
      return years.flatMap(yy =>
        months.map((m, i) => ({
          value: `${yy}-${String(i + 1).padStart(2, '0')}`,
          label: `${m} ${yy}`,
        }))
      );
    }
    case 'quarter':
      return years.flatMap(yy =>
        [1, 2, 3, 4].map(q => ({
          value: `${yy}-Q${q}`,
          label: `Q${q} ${yy}`,
        }))
      );
    case 'year':
      return years.map(yy => ({
        value: `${yy}`,
        label: `${yy}`,
      }));
    default:
      return [];
  }
};

const FranchiserNetworkTab: React.FC<FranchiserNetworkTabProps> = ({ summary }) => {
  const { fetchNetwork, dealers } = useFranchiserStore();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
  const [customDates, setCustomDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [dynamicsData, setDynamicsData] = useState<any[]>([]);

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      const opts = getDateOptions(newPeriod);
      if (opts.length > 0) {
        setDate(opts[0].value);
      }
      setCustomDates(null);
    } else {
      setCustomDates([dayjs().subtract(30, 'day'), dayjs()]);
    }
  };

  const queryParams = period === 'custom'
    ? { period, date: '', start_date: customDates?.[0]?.format('YYYY-MM-DD') ?? '', end_date: customDates?.[1]?.format('YYYY-MM-DD') ?? '' }
    : { period, date };

  useEffect(() => {
    fetchNetwork(queryParams.period, queryParams.date, queryParams.start_date, queryParams.end_date);
  }, [fetchNetwork, queryParams.period, queryParams.date, queryParams.start_date, queryParams.end_date]);

  useEffect(() => {
    setTeamLoading(true);
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const params = period === 'custom'
      ? `period=${period}&start_date=${customDates?.[0]?.format('YYYY-MM-DD') ?? ''}&end_date=${customDates?.[1]?.format('YYYY-MM-DD') ?? ''}`
      : `period=${period}&date=${date}`;
    fetch(`${baseUrl}/api/v1/franchiser/team?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      if (data?.team_members) setTeamMembers(data.team_members);
    }).catch(() => {}).finally(() => setTeamLoading(false));
  }, [period]);

  useEffect(() => {
    const members = teamMembers;
    if (!members || members.length === 0) return;
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

    Promise.all(members.map((m: any) =>
      fetch(`${baseUrl}/api/v1/franchiser/team/${m.id}/dynamics?months=6`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).catch(() => null)
    )).then(results => {
      const monthMap: Record<string, { plan: number; fact: number }> = {};
      for (const res of results) {
        if (!res?.kpi) continue;
        for (const k of res.kpi) {
          if (!monthMap[k.month]) monthMap[k.month] = { plan: 0, fact: 0 };
          monthMap[k.month].plan += k.plan || 0;
          monthMap[k.month].fact += k.fact || 0;
        }
      }
      setDynamicsData(
        Object.entries(monthMap)
          .filter(([_, v]) => v.plan > 0 || v.fact > 0)
          .map(([month, v]) => ({ month, plan: v.plan, fact: v.fact || null, forecast: null }))
          .sort((a, b) => a.month.localeCompare(b.month))
      );
    }).catch(() => {});
  }, [teamMembers]);

  const chartData = useMemo(() => {
    if (dynamicsData.length > 0) return dynamicsData;
    if (!dealers || dealers.length === 0) return [];
    const totalPlan = dealers.reduce((s, d) => s + (d.plan || 0), 0);
    const totalFact = dealers.reduce((s, d) => s + (d.fact || 0), 0);
    const label = period === 'month' ? 'Текущий месяц' : period === 'quarter' ? 'Текущий квартал' : 'Текущий год';
    return [{ month: label, plan: totalPlan, fact: totalFact || null, forecast: null }];
  }, [dynamicsData, dealers, period]);

  const territories: TerritoryData[] = useMemo(() => {
    return (teamMembers || []).map((m: any) => ({
      id: m.id,
      manager: m.name,
      territory: m.territory || '—',
      planPercent: m.plan_percent ?? 0,
      dealersCount: m.dealers_count ?? 0,
      redDealersPercent: m.red_dealers_pct ?? 0,
      sla: m.sla ?? 0,
      dealerGrowth: m.dealer_growth ?? 0,
      forecastPercent: m.forecast_percent ?? 0,
    }));
  }, [teamMembers]);

  const getHeatmapColor = (status: 'green' | 'yellow' | 'red') => {
    return status === 'green' ? '#52c41a' : status === 'yellow' ? '#fa8c16' : '#ff4d4f';
  };

  const getTerritoryStatus = (t: TerritoryData): 'green' | 'yellow' | 'red' => {
    if (t.planPercent >= 85 && t.redDealersPercent < 20 && t.sla >= 80) return 'green';
    if (t.planPercent < 60 || t.redDealersPercent > 40 || t.sla < 60) return 'red';
    return 'yellow';
  };

  const columns = [
    {
      title: 'Менеджер',
      dataIndex: 'manager',
      key: 'manager',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.manager.localeCompare(b.manager),
      render: (m: string) => (
        <Space>
          <TeamOutlined />
          <Text strong>{m}</Text>
        </Space>
      ),
    },
    {
      title: 'Территория',
      dataIndex: 'territory',
      key: 'territory',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.territory.localeCompare(b.territory),
    },
    {
      title: 'Выполнение плана',
      dataIndex: 'planPercent',
      key: 'planPercent',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.planPercent - b.planPercent,
      render: (v: number) => (
        <Tooltip title={`${v}%`}>
          <Progress 
            percent={v} 
            size="small" 
            strokeColor={v >= 85 ? '#52c41a' : v >= 60 ? '#fa8c16' : '#ff4d4f'}
            style={{ width: 80 }}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Дилеров',
      dataIndex: 'dealersCount',
      key: 'dealersCount',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.dealersCount - b.dealersCount,
    },
    {
      title: 'В красной зоне',
      dataIndex: 'redDealersPercent',
      key: 'redDealersPercent',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.redDealersPercent - b.redDealersPercent,
      render: (v: number) => (
        <Tag color={v < 10 ? 'green' : v < 25 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: <Tooltip title="Уровень обслуживания (Service Level Agreement)">SLA</Tooltip>,
      dataIndex: 'sla',
      key: 'sla',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.sla - b.sla,
      render: (v: number) => (
        <Tag color={v >= 95 ? 'green' : v >= 80 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: 'Прирост',
      dataIndex: 'dealerGrowth',
      key: 'dealerGrowth',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.dealerGrowth - b.dealerGrowth,
      render: (v: number) => (
        <Text type={v > 0 ? 'success' : v < 0 ? 'danger' : 'secondary'}>
          {v > 0 ? <ArrowUpOutlined /> : v < 0 ? <ArrowDownOutlined /> : ''} {Math.abs(v)}%
        </Text>
      ),
    },
    {
      title: 'Прогноз',
      dataIndex: 'forecastPercent',
      key: 'forecastPercent',
      align: 'center',
      sorter: (a: TerritoryData, b: TerritoryData) => a.forecastPercent - b.forecastPercent,
      render: (v: number) => (
        <Tag color={v >= 95 ? 'green' : v >= 85 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: 'Статус',
      key: 'status',
      align: 'center',
      render: (_: any, r: TerritoryData) => {
        const status = getTerritoryStatus(r);
        return (
          <Tag color={status} icon={<CheckCircleOutlined />}>
            {status === 'green' ? 'В норме' : status === 'yellow' ? 'Внимание' : 'Критично'}
          </Tag>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={4}>Пульт сети</Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select value={period} onChange={handlePeriodChange} style={{ width: 140 }}>
          <Option value="month">Месяц</Option>
          <Option value="quarter">Квартал</Option>
          <Option value="year">Год</Option>
          <Option value="custom">Произвольный</Option>
        </Select>

        {period === 'custom' ? (
          <DatePicker.RangePicker
            value={customDates as [dayjs.Dayjs, dayjs.Dayjs]}
            onChange={(dates) => setCustomDates(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            format="DD.MM.YYYY"
            allowClear={false}
          />
        ) : (
          <Select value={date} onChange={setDate} style={{ width: 160 }}>
            {getDateOptions(period).map(opt => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
        )}
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Выполнение плана"
              value={summary.planAmount ?? 0}
              suffix="₽"
              precision={0}
              prefix={<ShopOutlined />}
              valueStyle={{ fontSize: 18 }}
            />
            <Space>
              <Text type="success">{summary.planPercent ?? 0}%</Text>
            </Space>
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title={period === 'month' ? 'Прогноз месяца' : period === 'year' ? 'Прогноз года' : 'Прогноз квартала'}
              value={summary.forecastAmount ?? 0}
              suffix="₽"
              precision={0}
              valueStyle={{ fontSize: 18 }}
            />
            <Tag color={(summary.forecastPercent ?? 0) > 95 ? 'green' : (summary.forecastPercent ?? 0) >= 85 ? 'orange' : 'red'}>
              {summary.forecastPercent ?? 0}%
            </Tag>
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Активных дилеров"
              value={summary.activeDealers ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary">всего в сети</Text>
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Конверсия сети"
              value={summary.avgConversion ?? 0}
              suffix="%"
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary">vs 15% норматив</Text>
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Маржинальность"
              value={summary.avgMargin ?? 0}
              suffix="%"
              valueStyle={{ fontSize: 18, color: (summary.avgMargin ?? 0) >= 30 ? '#52c41a' : '#fa8c16' }}
            />
            <Text type="secondary">без OPEX</Text>
          </Card>
        </Col>

        <Col span={4}>
          <Card size="small">
            <Statistic
              title="В красной зоне"
              value={summary.redZoneDealers ?? 0}
              valueStyle={{ fontSize: 18, color: '#ff4d4f' }}
              prefix={<WarningOutlined />}
            />
            <Text>{dealers.length > 0 ? Math.round(((summary.redZoneDealers ?? 0) / dealers.length) * 100) : 0}% от сети</Text>
          </Card>
        </Col>
      </Row>

      {chartData.length > 0 && (
        <Card title="Динамика продаж сети" style={{ marginBottom: 24 }}>
          <SalesChart data={chartData} />
        </Card>
      )}

      <Card title="Теплокарта территорий">
        <Table
          dataSource={territories}
          columns={columns}
          rowKey="id"
          pagination={false}
          loading={teamLoading}
          onRow={(record: TerritoryData) => ({
            style: { background: getHeatmapColor(getTerritoryStatus(record)) + '20' },
          })}
        />
      </Card>
    </div>
  );
};

export default FranchiserNetworkTab;
