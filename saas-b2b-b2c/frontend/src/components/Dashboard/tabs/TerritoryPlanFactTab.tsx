import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Space, Statistic, Select, Button, Form, Input, Empty, message, DatePicker } from 'antd';
import { ShopOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { useTerritoryManagerStore } from '@/store/territoryManagerStore';
import apiClient from '@/api/axiosClient';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface DeviationRow {
  dealerId: string;
  dealerName: string;
  plan: number;
  fact: number;
  deviation: number;
  deviationPercent: number;
  reason?: string;
  forecast: number;
  actions?: string;
}

interface ContributionData {
  dealerName: string;
  plan: number;
  fact: number;
}

interface TerritoryPlanFactTabProps {
  loading?: boolean;
}

const DEVIATION_REASONS = [
  { value: 'traffic_drop', label: 'Падение трафика' },
  { value: 'low_conversion', label: 'Низкая конверсия' },
  { value: 'goods_deficit', label: 'Дефицит товара' },
  { value: 'staff_issue', label: 'Кадровая проблема' },
  { value: 'seasonal', label: 'Сезонный спад' },
  { value: 'other', label: 'Прочее' },
];

const TerritoryPlanFactTab: React.FC<TerritoryPlanFactTabProps> = ({ loading }) => {
  const { fetchPlanFact } = useTerritoryManagerStore();
  const [period, setPeriod] = useState('month');
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [planfactData, setPlanfactData] = useState<any>(null);
  const [pfLoading, setPfLoading] = useState(false);
  const [deviationReasons, setDeviationReasons] = useState<Record<string, string>>({});
  const [deviationActions, setDeviationActions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      debounceTimers.current = {};
    };
  }, []);

  const loadData = useCallback(async (p: string, dates?: [dayjs.Dayjs, dayjs.Dayjs]) => {
    setPfLoading(true);
    const data = dates
      ? await fetchPlanFact('custom', dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'))
      : await fetchPlanFact(p);
    if (data) {
      setPlanfactData(data);
      const reasons: Record<string, string> = {};
      const actions: Record<string, string> = {};
      (data.dealers || []).forEach((d: any) => {
        if (d.reason) reasons[d.id] = d.reason;
        if (d.actions) actions[d.id] = d.actions;
      });
      setDeviationReasons(reasons);
      setDeviationActions(actions);
    }
    setPfLoading(false);
  }, [fetchPlanFact]);

  useEffect(() => {
    if (period === 'custom' && customDateRange) {
      loadData('custom', customDateRange);
    } else if (period !== 'custom') {
      loadData(period);
    }
  }, [period, customDateRange, loadData]);

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

  const saveDeviation = useCallback(async (dealerId: string) => {
    setSaving(prev => ({ ...prev, [dealerId]: true }));
    try {
      await apiClient.put('/territory/planfact/deviation', {
        dealer_id: dealerId,
        period,
        reason: deviationReasons[dealerId] || '',
        actions: deviationActions[dealerId] || '',
      });
    } catch {
      message.error('Ошибка сохранения');
    } finally {
      setSaving(prev => ({ ...prev, [dealerId]: false }));
    }
  }, [period, deviationReasons, deviationActions]);

  const debouncedSave = useCallback((dealerId: string) => {
    if (debounceTimers.current[dealerId]) {
      clearTimeout(debounceTimers.current[dealerId]);
    }
    debounceTimers.current[dealerId] = setTimeout(() => {
      saveDeviation(dealerId);
    }, 1500);
  }, [saveDeviation]);

  const rawDealers = planfactData?.dealers || [];
  const totalPlan = planfactData?.total_plan || 0;
  const totalFact = planfactData?.total_fact || 0;

  const dealersData = useMemo(() => {
    return rawDealers.map((d: any) => ({
      dealerId: d.id,
      dealerName: d.dealer_name,
      plan: d.plan || 0,
      fact: d.fact || 0,
      forecast: d.forecast || d.fact || 0,
    }));
  }, [rawDealers]);

  const planCompletionPercent = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;

  const contributionData = useMemo((): ContributionData[] => {
    return [...dealersData]
      .sort((a, b) => b.plan - a.plan)
      .map(d => ({ dealerName: d.dealerName, plan: d.plan, fact: d.fact }));
  }, [dealersData]);

  const top3Dealers = useMemo(() => {
    const sorted = [...dealersData].sort((a, b) => b.fact - a.fact);
    const top3 = sorted.slice(0, 3);
    return top3.reduce((s, d) => s + d.fact, 0);
  }, [dealersData]);

  const deviationData = useMemo((): DeviationRow[] => {
    return dealersData.map(d => ({
      dealerId: d.dealerId,
      dealerName: d.dealerName,
      plan: d.plan,
      fact: d.fact,
      deviation: d.fact - d.plan,
      deviationPercent: d.plan > 0 ? ((d.fact - d.plan) / d.plan) * 100 : 0,
      forecast: d.forecast,
      reason: deviationReasons[d.dealerId] || '',
      actions: deviationActions[d.dealerId] || '',
    }));
  }, [dealersData, deviationReasons, deviationActions]);

  const deviationText = useMemo(() => {
    const deviations = dealersData.filter(d => d.fact < d.plan).sort((a, b) => (a.fact - a.plan) - (b.fact - b.plan));
    if (deviations.length === 0) return 'Все дилеры выполняют план';
    const totalGap = deviations.reduce((s, d) => s + d.plan - d.fact, 0);
    const list = deviations.slice(0, 3).map(d => `${d.dealerName} (-${((d.plan - d.fact) / 1000000).toFixed(1)} млн)`).join(', ');
    return `Отставание от плана ${(totalGap / 1000000).toFixed(1)} млн руб. сформировано из-за ${list}`;
  }, [dealersData]);

  const handleReasonChange = (dealerId: string, reason: string) => {
    setDeviationReasons(prev => ({ ...prev, [dealerId]: reason }));
    debouncedSave(dealerId);
  };

  const handleActionsChange = (dealerId: string, actions: string) => {
    setDeviationActions(prev => ({ ...prev, [dealerId]: actions }));
    debouncedSave(dealerId);
  };

  const fmt = (v: number) => Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v);
  const deviationColumns = [
    { title: 'Дилер', dataIndex: 'dealerName', key: 'dealerName', align: 'center', render: (n: string, r: DeviationRow) => <Space><ShopOutlined style={{ color: r.deviation >= 0 ? '#52c41a' : '#ff4d4f' }} />{n}</Space> },
    { title: 'План', dataIndex: 'plan', key: 'plan', align: 'center', render: (v: number) => fmt(v) + ' ₽' },
    { title: 'Факт', dataIndex: 'fact', key: 'fact', align: 'center', render: (v: number) => fmt(v) + ' ₽' },
    { title: 'Отклонение', key: 'deviation', align: 'center', render: (_: any, r: DeviationRow) => (
      <Tag color={r.deviation >= 0 ? 'green' : 'red'}>
        {fmt(r.deviation)} ₽ ({r.deviationPercent.toFixed(0)}%)
      </Tag>
    )},
    { title: 'Причина', key: 'reason', align: 'center', render: (_: any, r: DeviationRow) => (
      <Select
        value={deviationReasons[r.dealerId]}
        onChange={(v) => handleReasonChange(r.dealerId, v)}
        style={{ width: 200 }}
        placeholder="Выберите"
        popupMatchSelectWidth={false}
      >
        {DEVIATION_REASONS.map(reason => (
          <Select.Option key={reason.value} value={reason.value}>{reason.label}</Select.Option>
        ))}
      </Select>
    )},
    { title: 'Прогноз', dataIndex: 'forecast', key: 'forecast', align: 'center', render: (v: number) => fmt(v) + ' ₽' },
    { title: 'Действия', key: 'actions', align: 'center', render: (_: any, r: DeviationRow) => (
      <Space>
        <Input.TextArea
          value={deviationActions[r.dealerId]}
          onChange={(e) => handleActionsChange(r.dealerId, e.target.value)}
          placeholder="План мероприятий"
          rows={1}
          style={{ width: 180 }}
        />
        {saving[r.dealerId] && <Text type="secondary" style={{ fontSize: 11 }}>···</Text>}
      </Space>
    )},
  ];

  const getBarColor = (fact: number, plan: number) => {
    if (plan === 0) return '#d9d9d9';
    return fact >= plan ? '#52c41a' : '#ff4d4f';
  };

  const handleDownloadPdf = async () => {
    try {
      let url = `/territory/planfact/pdf?period=${period}`;
      if (period === 'custom' && customDateRange) {
        url = `/territory/planfact/pdf?start_date=${customDateRange[0].format('YYYY-MM-DD')}&end_date=${customDateRange[1].format('YYYY-MM-DD')}`;
      }
      const res = await apiClient.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `planfact-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      message.error('Ошибка генерации PDF');
    }
  };

  const periodLabel = period === 'quarter' ? 'Квартал' : period === 'custom' ? 'Произвольный период' : period === 'week' ? 'Неделя' : 'Месяц';

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select value={period} onChange={handlePeriodChange} style={{ width: 160 }}>
              <Select.Option value="week">Неделя</Select.Option>
              <Select.Option value="month">Месяц</Select.Option>
              <Select.Option value="quarter">Квартал</Select.Option>
              <Select.Option value="custom">Произвольный период</Select.Option>
            </Select>
          </Col>
          {period === 'custom' && (
            <Col>
              <RangePicker value={customDateRange as any} onChange={handleRangeChange} />
            </Col>
          )}
          <Col>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={handleDownloadPdf}>
              PDF
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small" styles={{ body: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 90 } }}>
            <div style={{ textAlign: 'center' }}>
              <Statistic
                title="Общий план"
                value={totalPlan}
                suffix="₽"
                formatter={(v) => Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(v))}
              />
              <div style={{ height: 22 }} />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small" styles={{ body: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 90 } }}>
            <div style={{ textAlign: 'center' }}>
              <Statistic
                title="Общий факт"
                value={totalFact}
                suffix="₽"
                valueStyle={{ color: planCompletionPercent >= 80 ? '#52c41a' : '#ff4d4f' }}
                formatter={(v) => Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(v))}
              />
              <Text type="secondary">{planCompletionPercent}% выполнения</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {dealersData.length > 0 && (
        <Text>{deviationText}</Text>
      )}

      <Card size="small" title={`Вклад дилеров в план — ${periodLabel}`} style={{ marginTop: 16, marginBottom: 16 }}>
        {contributionData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={contributionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="dealerName" width={120} />
                <Legend content={(props: any) => {
                  const { payload } = props;
                  return (
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '8px 0' }}>
                      {payload?.map((entry: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {entry.value === 'Факт' ? (
                            <span style={{ display: 'inline-block', width: 14, height: 14, background: 'linear-gradient(90deg, #52c41a 50%, #ff4d4f 50%)', borderRadius: 2 }} />
                          ) : (
                            <span style={{ display: 'inline-block', width: 14, height: 14, background: entry.color, borderRadius: 2 }} />
                          )}
                          <span>{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                }} />
                <Bar dataKey="plan" fill="#1890ff" name="План" radius={[4, 4, 0, 0]} isAnimationActive={false} activeBar={false}>
                  <LabelList dataKey="plan" position="insideRight" formatter={(v: number) => Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(v))} style={{ fill: '#fff', fontWeight: 'bold', fontSize: 12 }} />
                </Bar>
                <Bar dataKey="fact" name="Факт" radius={[4, 4, 0, 0]} isAnimationActive={false} activeBar={false}>
                  <LabelList dataKey="fact" position="insideRight" formatter={(v: number) => Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(v))} style={{ fill: '#fff', fontWeight: 'bold', fontSize: 12 }} />
                  {contributionData.map((d, i) => (
                    <Cell key={i} fill={getBarColor(d.fact, d.plan)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {top3Dealers > 0 && totalPlan > 0 && (
              <Tag color="gold" style={{ marginTop: 8 }}>Топ-3 дилера дают {((top3Dealers / totalPlan) * 100).toFixed(0)}% плана</Tag>
            )}
          </>
        ) : (
          <Empty description="Нет данных за выбранный период" />
        )}
      </Card>

      <Card size="small" title="Детализация отклонений">
        <Table
          dataSource={deviationData}
          columns={deviationColumns}
          rowKey="dealerId"
          size="small"
          loading={loading || pfLoading}
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default TerritoryPlanFactTab;
