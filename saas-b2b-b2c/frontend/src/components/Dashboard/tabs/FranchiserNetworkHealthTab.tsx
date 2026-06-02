import React, { useState } from 'react';
import { Row, Col, Card, Table, Tag, Typography, Space, Progress, Statistic, Select, Divider, Spin, DatePicker } from 'antd';
import { 
  ShopOutlined, 
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dynamic from 'next/dynamic';
import dayjs from 'dayjs';
import { useGetDealersHealthQuery, useGetDealersMigrationQuery, useGetSystemIssuesQuery, useGetDealersGeographyQuery, useGetMarketingROIQuery } from '@/services/userApi';
import type { HealthSegmentMember, DealerMigration, SystemIssue, DealerGeographyItem, MarketingROIResponse } from '@/types';

const { Title, Text } = Typography;
const { Option } = Select;

const GeographyMap = dynamic(() => import('./GeographyMap'), { ssr: false });

const getSegmentColor = (segment: string) => {
  const colors: Record<string, string> = { A: '#52c41a', B: '#1890ff', C: '#fa8c16', D: '#ff4d4f' };
  return colors[segment.toUpperCase()] || '#d9d9d9';
};

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

const FranchiserNetworkHealthTab: React.FC = () => {
  const [period, setPeriod] = useState('quarter');
  const [date, setDate] = useState(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    const q = Math.ceil(m / 3);
    return `${y}-Q${q}`;
  });
  const [customDates, setCustomDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

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
    ? { period, start_date: customDates?.[0]?.format('YYYY-MM-DD') ?? '', end_date: customDates?.[1]?.format('YYYY-MM-DD') ?? '' }
    : { period, date };

  const { data: health, isLoading: healthLoading } = useGetDealersHealthQuery(queryParams);
  const { data: migrationData, isLoading: migrationLoading } = useGetDealersMigrationQuery(queryParams);
  const { data: issues, isLoading: issuesLoading } = useGetSystemIssuesQuery({});
  const { data: geography, isLoading: geographyLoading } = useGetDealersGeographyQuery();
  const { data: roiData, isLoading: roiLoading } = useGetMarketingROIQuery(queryParams);

  const segmentation = health?.segments;
  const metrics = health?.metrics;
  const migrations = migrationData?.migrations || [];
  const issuesList = issues || [];

  const totalDealers = metrics?.total_dealers || 0;
  const segmentData = segmentation ? [
    { segment: 'A', name: 'А-дилеры (лидеры)', count: metrics?.segment_counts.a || 0, revenueShare: Math.round(metrics?.segment_revenue_share.a || 0), dynamics: 0 },
    { segment: 'B', name: 'B-дилеры (стабильные)', count: metrics?.segment_counts.b || 0, revenueShare: Math.round(metrics?.segment_revenue_share.b || 0), dynamics: 0 },
    { segment: 'C', name: 'C-дилеры (отстающие)', count: metrics?.segment_counts.c || 0, revenueShare: Math.round(metrics?.segment_revenue_share.c || 0), dynamics: 0 },
    { segment: 'D', name: 'D-дилеры (кандидаты)', count: metrics?.segment_counts.d || 0, revenueShare: Math.round(metrics?.segment_revenue_share.d || 0), dynamics: 0 },
  ] : [];

  const segmentColumns = [
    {
      title: 'Сегмент',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: typeof segmentData[0]) => (
        <Tag color={getSegmentColor(r.segment)}>{name}</Tag>
      ),
    },
    {
      title: 'Количество',
      dataIndex: 'count',
      key: 'count',
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: 'Доля выручки',
      dataIndex: 'revenueShare',
      key: 'revenueShare',
      render: (v: number) => `${v}%`,
    },
    {
      title: 'Визуализация',
      key: 'chart',
      render: (_: any, r: typeof segmentData[0]) => (
        <Progress 
          percent={totalDealers > 0 ? Math.round((r.count / totalDealers) * 100) : 0}
          size="small" 
          strokeColor={getSegmentColor(r.segment)}
          style={{ width: 100 }}
        />
      ),
    },
  ];

  const migrationColumns = [
    { title: 'Из', dataIndex: 'from_segment', key: 'from', render: (s: string) => <Tag color={getSegmentColor(s)}>{s}</Tag> },
    { title: 'В', dataIndex: 'to_segment', key: 'to', render: (s: string) => <Tag color={getSegmentColor(s)}>{s}</Tag> },
    { title: 'Дилер', dataIndex: 'dealer_name', key: 'dealer_name' },
  ];

  const issueColumns = [
    {
      title: 'Проблема',
      dataIndex: 'description',
      key: 'description',
      render: (d: string) => <Text>{d}</Text>,
    },
    {
      title: 'Дилер',
      dataIndex: 'dealer_name',
      key: 'dealer_name',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Потеряно',
      dataIndex: 'lost_revenue',
      key: 'lost_revenue',
      render: (v: number) => <Text type="danger">{Math.round(v).toLocaleString('ru-RU')} ₽</Text>,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag 
          color={s === 'resolved' ? 'green' : s === 'in_progress' ? 'processing' : 'orange'}
          icon={s === 'resolved' ? <CheckCircleOutlined /> : s === 'in_progress' ? <WarningOutlined /> : <CloseCircleOutlined />}
        >
          {s === 'open' ? 'Выявлено' : s === 'in_progress' ? 'Решается' : 'Решено'}
        </Tag>
      ),
    },
  ];

  const whiteSpotColumns = [
    { title: 'Город', dataIndex: 'city', key: 'city' },
    { title: 'Дилеров', dataIndex: 'dealers_count', key: 'dealers_count' },
    { title: 'Салоны', dataIndex: 'salons_count', key: 'salons_count' },
    { title: 'Выручка', dataIndex: 'total_revenue', key: 'total_revenue', render: (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽' },
  ];

  return (
    <div>
      <Title level={4}>Здоровье сети</Title>

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

      <Spin spinning={healthLoading}>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {segmentData.filter(s => s.count > 0).map((sgm) => (
            <Col span={6} key={sgm.segment}>
              <Card size="small">
                <Statistic
                  title={sgm.name}
                  value={sgm.count}
                  suffix={`(${sgm.revenueShare}%)`}
                  valueStyle={{ color: getSegmentColor(sgm.segment), fontSize: 24 }}
                  prefix={<ShopOutlined />}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Spin>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Сегментация" loading={healthLoading}>
            <Table
              dataSource={segmentData}
              columns={segmentColumns}
              rowKey="segment"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title={`Миграция дилеров${period !== 'custom' ? ` (${period === 'month' ? 'Месяц' : period === 'quarter' ? 'Квартал' : 'Год'})` : ''}`} loading={migrationLoading}>
            <Table
              dataSource={migrations}
              columns={migrationColumns}
              rowKey={r => `${r.dealer_id}-${r.from_segment}-${r.to_segment}`}
              pagination={false}
              size="small"
            />
            <Divider />
            <Text type="secondary">Матрица переходов между сегментами</Text>
          </Card>
        </Col>
      </Row>

      <Card title="Системные проблемы" style={{ marginBottom: 24 }} loading={issuesLoading}>
        <Table
          dataSource={issuesList}
          columns={issueColumns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Проблемные дилеры"
              value={totalDealers > 0 ? Math.round((metrics?.segment_counts.d || 0) / totalDealers * 100) : 0}
              suffix="%"
              valueStyle={{ fontSize: 18, color: (metrics?.segment_counts.d || 0) > totalDealers * 0.2 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Активных дилеров"
              value={metrics?.active_dealers || 0}
              suffix={`/ ${totalDealers}`}
              valueStyle={{ fontSize: 18, color: (metrics?.active_dealers || 0) >= totalDealers * 0.7 ? '#52c41a' : '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="A-дилеры"
              value={metrics?.segment_counts.a || 0}
              suffix={`(${metrics?.segment_revenue_share.a ? Math.round(metrics.segment_revenue_share.a) : 0}%)`}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="D-дилеры"
              value={metrics?.segment_counts.d || 0}
              suffix={`(${metrics?.segment_revenue_share.d ? Math.round(metrics.segment_revenue_share.d) : 0}%)`}
              valueStyle={{ fontSize: 18, color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="Средний % плана"
              value={metrics?.avg_plan_percent ?? 0}
              suffix="%"
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small" loading={roiLoading}>
            <Statistic
              title="ROI"
              value={roiData?.roi ? (roiData.roi * 100).toFixed(0) : 0}
              suffix="%"
              valueStyle={{ fontSize: 18, color: (roiData?.roi || 0) >= 1 ? '#52c41a' : '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={16}>
          <Card title="География присутствия" loading={geographyLoading}>
            <GeographyMap geography={geography || []} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Города присутствия" loading={geographyLoading}>
            <Table
              dataSource={geography || []}
              columns={whiteSpotColumns}
              rowKey="city"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      <Card title="Маркетинговая эффективность" loading={roiLoading}>
        <Row gutter={24}>
          <Col span={8}>
            <Statistic
              title="Общая выручка (период)"
              value={Math.round(roiData?.revenue_attributed || 0)}
              suffix="₽"
              valueStyle={{ fontSize: 18 }}
            />
            <Text>Маркетинговый бюджет: {Math.round(roiData?.marketing_spent || 0).toLocaleString('ru-RU')} ₽</Text>
          </Col>
          <Col span={8}>
            <Statistic
              title="Средняя выручка на дилера"
              value={Math.round(roiData?.avg_dealer_revenue || 0)}
              suffix="₽"
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="ROI маркетинга"
                value={roiData?.roi ? (roiData.roi * 100).toFixed(0) : 0}
                suffix="%"
                valueStyle={{ fontSize: 24, color: (roiData?.roi || 0) > 1 ? '#52c41a' : '#fa8c16' }}
              />
              <Text type="secondary">(выручка − бюджет) / бюджет</Text>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default FranchiserNetworkHealthTab;