import React, { useState, useMemo, useEffect } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Space, Statistic, Select, List, Collapse, Spin, Empty, Alert, DatePicker } from 'antd';
import { UserAddOutlined, RiseOutlined, FallOutlined, WarningOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { useTerritoryManagerStore } from '@/store/territoryManagerStore';
import dayjs from 'dayjs';

const { Text } = Typography;

interface TerritoryFunnelTabProps {
  loading?: boolean;
}

const STAGE_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#ff4d4f'];

const formatRub = (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽';

const TerritoryFunnelTab: React.FC<TerritoryFunnelTabProps> = ({ loading }) => {
  const { fetchFunnel, error: storeError } = useTerritoryManagerStore();
  const [period, setPeriod] = useState('month');
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [funnelData, setFunnelData] = useState<any>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { RangePicker } = DatePicker;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFunnelLoading(true);
      setFetchError(null);
      try {
        let data;
        if (period === 'custom' && customDateRange?.[0] && customDateRange?.[1]) {
          data = await fetchFunnel('custom', customDateRange[0].format('YYYY-MM-DD'), customDateRange[1].format('YYYY-MM-DD'));
        } else {
          data = await fetchFunnel(period);
        }
        if (!cancelled && data) {
          setFunnelData(data);
        } else if (!cancelled) {
          setFunnelData(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message || 'Ошибка загрузки данных воронки';
          setFetchError(msg);
          setFunnelData(null);
        }
      } finally {
        if (!cancelled) setFunnelLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [period, customDateRange, fetchFunnel]);

  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    if (value !== 'custom') {
      setCustomDateRange(null);
    }
  };

  const handleRangeChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setCustomDateRange([dates[0], dates[1]]);
    }
  };

  const stages = funnelData?.stages || [];
  const totalLeads = funnelData?.total_leads || 0;
  const lostLeads = funnelData?.lost_leads || [];
  const saleCount = stages.find((s: any) => s.stage === 'sale')?.count || 0;
  const saleConv = totalLeads > 0 ? ((saleCount / totalLeads) * 100).toFixed(1) : '0';
  const lostCount = totalLeads - saleCount;

  const funnelChartData = useMemo(() => {
    return stages.map((s: any) => ({
      name: s.label,
      count: s.count,
      conversion: s.conversion,
    }));
  }, [stages]);

  const stageColumns = [
    { title: 'Этап', dataIndex: 'name', key: 'name', render: (name: string) => <Text strong>{name}</Text> },
    { title: 'Количество', dataIndex: 'count', key: 'count', render: (count: number) => count > 0 ? count : '-' },
    { title: 'Конверсия', dataIndex: 'conversion', key: 'conversion', render: (conv: number, _: any, i: number) => i > 0 ? `${conv.toFixed(1)}%` : '100%' },
  ];

  return (
    <div>
      {(fetchError || storeError) && (
        <Alert
          message="Ошибка загрузки"
          description={fetchError || storeError}
          type="error"
          showIcon
          closable
          onClose={() => setFetchError(null)}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select value={period} onChange={handlePeriodChange} style={{ width: 180 }}>
              <Select.Option value="week">Неделя</Select.Option>
              <Select.Option value="month">Месяц</Select.Option>
              <Select.Option value="quarter">Квартал</Select.Option>
              <Select.Option value="year">Год</Select.Option>
              <Select.Option value="custom">Произвольный период</Select.Option>
            </Select>
          </Col>
          {period === 'custom' && (
            <Col>
              <RangePicker value={customDateRange as any} onChange={handleRangeChange} />
            </Col>
          )}
        </Row>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Всего лидов" value={totalLeads} prefix={<UserAddOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Продажи"
              value={saleCount}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Конверсия в продажу"
              value={saleConv}
              suffix="%"
              valueStyle={{ color: Number(saleConv) >= 20 ? '#52c41a' : '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Потеряно на этапах"
              value={lostCount}
              valueStyle={{ color: lostCount > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<FallOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Collapse ghost items={[
            {
              key: 'lost',
              label: <Text type="secondary">⚠ Потерянные лиды: {lostCount} — раскрыть детализацию</Text>,
              children: lostLeads.length > 0 ? (
                <Row gutter={[16, 16]}>
                  {lostLeads.map((stage: any) => (
                    <Col xs={24} sm={12} md={8} key={stage.stage}>
                      <Card size="small" title={
                        <Space>
                          <WarningOutlined style={{ color: '#fa8c16' }} />
                          <Text strong>{stage.label}</Text>
                          <Tag color="orange">{stage.count}</Tag>
                        </Space>
                      }>
                          <List
                            size="small"
                            dataSource={stage.leads}
                            renderItem={(lead: any) => (
                              <List.Item>
                                <div style={{ width: '100%' }}>
                                  <Text>{lead.full_name}</Text>
                                  {lead.disqualify_reason && (
                                    <div style={{ fontSize: 12, marginTop: 2 }}>
                                      <Text type="danger" style={{ fontSize: 12 }}>✕ {lead.disqualify_reason}</Text>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <Text type="secondary">{dayjs(lead.created_at).format('DD.MM.YYYY')}</Text>
                                    <Text>{formatRub(lead.budget)}</Text>
                                  </div>
                                </div>
                              </List.Item>
                            )}
                          />
                      </Card>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Text type="secondary">Нет потерянных лидов</Text>
              ),
            },
          ]} />
        </Col>
      </Row>

      <Card size="small" title="Воронка продаж" style={{ marginBottom: 16 }}>
        {funnelChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={100} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false} activeBar={false}>
                <LabelList dataKey="count" position="insideRight" style={{ fill: '#fff', fontWeight: 'bold', fontSize: 14 }} />
                {funnelChartData.map((_ : any, i: number) => (
                  <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="Нет данных за выбранный период" />
        )}
      </Card>

      <Card size="small" title="Детализация по этапам">
        <Table
          dataSource={funnelChartData}
          columns={stageColumns}
          rowKey="name"
          size="small"
          loading={loading || funnelLoading}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default TerritoryFunnelTab;
