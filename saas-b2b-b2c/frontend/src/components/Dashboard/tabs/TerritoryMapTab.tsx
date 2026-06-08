// src/components/Dashboard/tabs/TerritoryMapTab.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Space, Statistic, Input, Collapse, List, Tooltip, Segmented, Spin, Button, Empty, Divider, Alert } from 'antd';
import { ShopOutlined, WarningOutlined, CheckCircleOutlined, SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, RiseOutlined, UserOutlined, AlertOutlined, LinkOutlined } from '@ant-design/icons';
import { useRouter } from 'next/router';
import { useTerritoryManagerStore, DealerMetrics } from '@/store/territoryManagerStore';
import apiClient from '@/api/axiosClient';

const { Text } = Typography;
const { Search } = Input;

interface DealerDetail {
  dealer_id: string;
  dealer_name: string;
  email?: string;
  phone?: string;
  manager_name?: string;
  status?: string;
  plan: number;
  fact: number;
  plan_percent: number;
  conversion: number;
  avg_check: number;
  margin: number;
  debt: number;
  task_count: number;
  salons: { id: string; name: string; address: string; sales: number; manager_name: string }[];
  sales_history: number[];
  plan_history: number[];
  recent_alerts: { id: string; title: string; category: string; priority: string; created_at: string }[];
}

interface TerritoryMapTabProps {
  dealers?: DealerMetrics[];
  loading?: boolean;
}

const TerritoryMapTab: React.FC<TerritoryMapTabProps> = ({ dealers: initialDealers, loading: initialLoading }) => {
  const router = useRouter();
  const { dealers: storeDealers, setDealers, summary, isLoading: storeLoading, error, fetchDealers } = useTerritoryManagerStore();
  const dealers = initialDealers || storeDealers;
  const tableLoading = initialLoading !== undefined ? initialLoading : storeLoading;
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  type StatusFilter = 'all' | 'green' | 'yellow' | 'red' | 'leaders' | 'problem';
  const [expandedDealer, setExpandedDealer] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DealerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  useEffect(() => {
    if (initialDealers) {
      setDealers(initialDealers);
    }
  }, [initialDealers, setDealers]);

  const filteredDealers = useMemo(() => {
    const sf = statusFilter as StatusFilter;
    return dealers.filter(d => {
      const matchesSearch = d.dealerName.toLowerCase().includes(searchText.toLowerCase());
      const matchesStatus = sf === 'all' || sf === 'leaders' || sf === 'problem' || d.status === sf;
      const matchesLeader = sf !== 'leaders' || d.planPercent >= 100;
      const matchesProblem = sf !== 'problem' || d.planPercent < 70;
      return matchesSearch && matchesStatus && matchesLeader && matchesProblem;
    });
  }, [dealers, searchText, statusFilter]);

  const territoryTotals = useMemo(() => {
    const totalPlan = dealers.reduce((s, d) => s + (d.plan || 0), 0);
    const totalFact = dealers.reduce((s, d) => s + (d.fact || 0), 0);
    const avgConversion = dealers.length ? dealers.reduce((s, d) => s + d.conversion, 0) / dealers.length : 0;
    const avgMargin = dealers.length ? dealers.reduce((s, d) => s + (d.margin || 0), 0) / dealers.length : 0;
    const redZoneCount = dealers.filter(d => d.status === 'red').length;
    const totalDebt = dealers.reduce((s, d) => s + (d.debt || 0), 0);
    return { totalPlan, totalFact, avgConversion, avgMargin, redZoneCount, totalDebt };
  }, [dealers]);

  const planCompletionPercent = territoryTotals.totalPlan > 0 ? (territoryTotals.totalFact / territoryTotals.totalPlan) * 100 : 0;
  const forecastPercent = summary?.quarterForecastPercent || 0;
  const formatRub = (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽';

  const fetchDealerDetails = async (dealerId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`/franchiser/dealers/${dealerId}/details`);
      setDetailData(res.data);
    } catch (e) {
      console.error('Error fetching dealer details:', e);
      const fallbackName = dealers.find(d => d.dealerId === dealerId)?.dealerName || '';
      setDetailData({
        dealer_id: dealerId,
        dealer_name: fallbackName,
        plan: dealers.find(d => d.dealerId === dealerId)?.plan || 0,
        fact: dealers.find(d => d.dealerId === dealerId)?.fact || 0,
        plan_percent: dealers.find(d => d.dealerId === dealerId)?.planPercent || 0,
        conversion: dealers.find(d => d.dealerId === dealerId)?.conversion || 0,
        avg_check: dealers.find(d => d.dealerId === dealerId)?.avgCheck || 0,
        margin: dealers.find(d => d.dealerId === dealerId)?.margin || 0,
        debt: dealers.find(d => d.dealerId === dealerId)?.debt || 0,
        task_count: dealers.find(d => d.dealerId === dealerId)?.taskCount || 0,
        salons: [],
        sales_history: [],
        recent_alerts: [],
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExpand = (dealerId: string) => {
    if (expandedDealer === dealerId) {
      setExpandedDealer(null);
      setDetailData(null);
    } else {
      setExpandedDealer(dealerId);
      fetchDealerDetails(dealerId);
    }
  };

  const getStatusColor = (dealer: DealerMetrics) => {
    if (dealer.planPercent >= 90 && dealer.conversion >= 3) return '#52c41a';
    if (dealer.planPercent >= 70 && dealer.conversion >= 2) return '#fa8c16';
    return '#ff4d4f';
  };

  const getRowHeat = (status: 'green' | 'yellow' | 'red') =>
    status === 'green' ? '#52c41a20' : status === 'yellow' ? '#fa8c1620' : '#ff4d4f20';

  const columns = [
    {
      title: 'Дилер',
      dataIndex: 'dealerName',
      key: 'dealerName',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => a.dealerName.localeCompare(b.dealerName),
      render: (name: string, record: DealerMetrics) => (
        <Space>
          <ShopOutlined style={{ color: getStatusColor(record) }} />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'План %',
      dataIndex: 'planPercent',
      key: 'planPercent',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => a.planPercent - b.planPercent,
      render: (percent: number) => (
        <Tag color={percent >= 100 ? 'green' : percent >= 70 ? 'orange' : 'red'}>
          {percent}%
        </Tag>
      ),
    },
    {
      title: 'Конверсия',
      dataIndex: 'conversion',
      key: 'conversion',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => a.conversion - b.conversion,
      render: (conv: number) => <Text>{conv.toFixed(1)}%</Text>,
    },
    {
      title: 'Ср. чек',
      dataIndex: 'avgCheck',
      key: 'avgCheck',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => (a.avgCheck || 0) - (b.avgCheck || 0),
      render: (v: number) => v ? <Text>{(v / 1000).toFixed(0)}k ₽</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Маржа',
      dataIndex: 'margin',
      key: 'margin',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => (a.margin || 0) - (b.margin || 0),
      render: (v: number) => <Text>{v ? `${v.toFixed(1)}%` : '-'}</Text>,
    },
    {
      title: 'Дебиторка',
      dataIndex: 'debt',
      key: 'debt',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => (a.debt || 0) - (b.debt || 0),
      render: (v: number) => (
        <Tooltip title={v > 100000 ? 'Превышен порог!' : ''}>
          <Text style={{ color: v > 100000 ? '#ff4d4f' : undefined }}>
            {v > 0 ? `${(v / 1000).toFixed(0)}k ₽` : '-'}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Задачи',
      dataIndex: 'taskCount',
      key: 'taskCount',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => a.taskCount - b.taskCount,
      render: (count: number) => count > 0 ? <Tag color="blue">{count}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Статус',
      key: 'status',
      align: 'center',
      sorter: (a: DealerMetrics, b: DealerMetrics) => a.status.localeCompare(b.status),
      render: (_: unknown, r: DealerMetrics) => {
        const status = r.status;
        const labels = { green: 'Норма', yellow: 'Внимание', red: 'Проблема' };
        return (
          <Tag color={status} icon={status === 'red' ? <WarningOutlined /> : <CheckCircleOutlined />}>
            {labels[status]}
          </Tag>
        );
      },
    },
  ];

  const redZoneDealers = dealers.filter(d => d.status === 'red');

  const renderDetailPanel = () => {
    if (detailLoading) {
      return <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>;
    }
    if (!detailData) return null;

    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const now = new Date();
    const monthLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = (now.getMonth() - i + 12) % 12;
      monthLabels.push(months[m]);
    }

    const history = detailData.sales_history || [];
    const planHist = detailData.plan_history || [];
    const maxVal = Math.max(...history, ...planHist, 0.1);
    const chartHeight = 120;

    // 3-месячная скользящая средняя для линии тренда
    const trend: (number | null)[] = history.map((_, i) => {
      if (i < 2) return null;
      return (history[i] + history[i - 1] + history[i - 2]) / 3;
    });

    return (
      <Card
        size="small"
        title={`${detailData.dealer_name} — детализация`}
        style={{ marginTop: 8 }}
        extra={
          <Button
            type="link"
            icon={<LinkOutlined />}
            onClick={() => router.push(`/dealer/${detailData.dealer_id}`)}
          >
            Открыть полную карточку
          </Button>
        }
      >
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="План"
              value={detailData.plan}
              formatter={(v: any) => <span style={{ fontSize: 14 }}>{formatRub(Number(v))}</span>}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Факт"
              value={detailData.fact}
              formatter={(v: any) => <span style={{ fontSize: 14, color: detailData.fact > 0 ? '#52c41a' : undefined }}>{formatRub(Number(v))}</span>}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="Выполнение"
              value={detailData.plan_percent}
              suffix="%"
              valueStyle={{ fontSize: 14, color: detailData.plan_percent >= 90 ? '#52c41a' : detailData.plan_percent >= 70 ? '#fa8c16' : '#ff4d4f' }}
            />
          </Col>
        </Row>

        <Divider style={{ margin: '12px 0' }} />

        <Row gutter={16}>
          <Col span={12}>
            <Text strong>Продажи по салонам:</Text>
            {detailData.salons.length > 0 ? (
              <List
                size="small"
                dataSource={detailData.salons}
                style={{ marginTop: 4 }}
                renderItem={item => (
                  <List.Item>
                    <Space direction="vertical" size={0}>
                      <Text>{item.name}</Text>
                      {item.manager_name && <Text type="secondary" style={{ fontSize: 11 }}><UserOutlined /> {item.manager_name}</Text>}
                    </Space>
                    <Text strong>{formatRub(item.sales)}</Text>
                  </List.Item>
                )}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных" />
            )}
          </Col>
          <Col span={12}>
            <Text strong>Динамика (6 мес):</Text>
            {history.length > 0 ? (
              <div style={{ position: 'relative', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', height: chartHeight, gap: 3, position: 'relative' }}>
                  {history.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                      }}
                    >
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
                        <div
                          style={{
                            position: 'absolute',
                            bottom: `${(planHist[i] / maxVal) * chartHeight}px`,
                            left: 0,
                            right: 0,
                            height: 1,
                            borderTop: '1.5px dashed #ff4d4f',
                            zIndex: 3,
                            pointerEvents: 'none',
                          }}
                          title={`План: ${formatRub(planHist[i])}`}
                        />
                      )}
                      <Text style={{ fontSize: 9, marginTop: 3, color: '#888' }}>{monthLabels[i]}</Text>
                      {hoveredBar === i && (
                        <div
                          style={{
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
                          }}
                        >
                          <div>{monthLabels[i]}: {formatRub(v)}</div>
                          {planHist[i] > 0 && <div style={{ color: '#ff7875' }}>План: {formatRub(planHist[i])}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {trend.some(t => t !== null) && (
                  <svg
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: chartHeight,
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  >
                    {trend.map((t, i) => {
                      if (t === null) return null;
                      const x1Pct = ((i + 0.5) / history.length) * 100;
                      const y1 = chartHeight - (t / maxVal) * chartHeight;
                      const next = trend[i + 1];
                      if (next === null || next === undefined) return null;
                      const x2Pct = ((i + 1.5) / history.length) * 100;
                      const y2 = chartHeight - (next / maxVal) * chartHeight;
                      return (
                        <line
                          key={i}
                          x1={`${x1Pct}%`}
                          y1={y1}
                          x2={`${x2Pct}%`}
                          y2={y2}
                          stroke="#ff85c0"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                        />
                      );
                    })}
                  </svg>
                )}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет истории" />
            )}
          </Col>
        </Row>

        {detailData.recent_alerts.length > 0 && (
          <Row style={{ marginTop: 12 }}>
            <Col span={24}>
              <Text strong>Последние алерты:</Text>
              <List
                size="small"
                dataSource={detailData.recent_alerts}
                style={{ marginTop: 4 }}
                renderItem={item => (
                  <List.Item>
                    <Space>
                      <Tag color={item.priority === 'critical' ? 'red' : item.priority === 'warning' ? 'orange' : 'blue'} style={{ marginRight: 0 }}>
                        {item.priority}
                      </Tag>
                      <AlertOutlined style={{ color: '#fa8c16' }} />
                      <Text>{item.title}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{item.created_at}</Text>
                  </List.Item>
                )}
              />
            </Col>
          </Row>
        )}
      </Card>
    );
  };

  return (
    <div>
      {error && (
        <Alert
          message="Ошибка загрузки"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => useTerritoryManagerStore.getState().setError(null)}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => fetchDealers()}>
              Повторить
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }} align="middle">
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Statistic 
              title="Выполнение плана" 
              value={planCompletionPercent} 
              suffix="%"
              precision={1}
              valueStyle={{ fontSize: 18, color: planCompletionPercent >= 90 ? '#52c41a' : planCompletionPercent >= 70 ? '#fa8c16' : '#ff4d4f' }}
            />
            <Text type="secondary">
              {summary?.planCompletionChange !== undefined && (
                <>
                  {summary.planCompletionChange >= 0
                    ? <ArrowUpOutlined style={{ color: '#52c41a' }} />
                    : <ArrowDownOutlined style={{ color: '#ff4d4f' }} />}
                  {' '}{summary.planCompletionChange > 0 ? '+' : ''}{summary.planCompletionChange.toFixed(1)}% к прошлому месяцу
                </>
              )}
            </Text>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Statistic 
              title="Прогноз квартала" 
              value={forecastPercent} 
              suffix="%"
              prefix={<RiseOutlined />}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary">Run Rate</Text>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%', cursor: 'pointer' }} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }} onClick={() => setStatusFilter('problem')}>
            <Statistic 
              title="В красной зоне" 
              value={territoryTotals.redZoneCount} 
              valueStyle={{ fontSize: 18, color: territoryTotals.redZoneCount > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<WarningOutlined />}
            />
            <Text type="secondary">&lt; 70% плана</Text>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Statistic 
              title="Дебиторская задолженность" 
              value={territoryTotals.totalDebt} 
              formatter={(v: any) => <span style={{ fontSize: 18, color: Number(v) > 500000 ? '#ff4d4f' : undefined }}>{formatRub(Number(v))}</span>}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Statistic 
              title="Конверсия средняя" 
              value={territoryTotals.avgConversion} 
              suffix="%"
              precision={1}
              valueStyle={{ fontSize: 18 }}
            />
            <Text type="secondary">норма: 3%</Text>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }} bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
            <Statistic 
              title="Маржинальность" 
              value={territoryTotals.avgMargin} 
              suffix="%"
              precision={1}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
      </Row>

      {redZoneDealers.length > 0 && expandedDealer === null && (
        <Collapse style={{ marginBottom: 16 }}>
          <Collapse.Panel header={`⚠️ Дилеры в красной зоне (${redZoneDealers.length})`} key="red">
            <List
              size="small"
              dataSource={redZoneDealers}
              renderItem={d => (
                <List.Item>
                  <Space>
                    <WarningOutlined style={{ color: '#ff4d4f' }} />
                    <Text>{d.dealerName}</Text>
                    <Tag color="red">{d.planPercent}% плана</Tag>
                    <Button size="small" onClick={() => handleExpand(d.dealerId)}>Детали</Button>
                  </Space>
                </List.Item>
              )}
            />
          </Collapse.Panel>
        </Collapse>
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col flex="auto">
            <Search placeholder="Поиск дилера..." allowClear onChange={e => setSearchText(e.target.value)} />
          </Col>
          <Col>
            <Segmented value={statusFilter} onChange={setStatusFilter} options={[
              { label: 'Все', value: 'all' },
              { label: 'Проблемные', value: 'problem' },
              { label: 'Лидеры', value: 'leaders' },
            ]} />
          </Col>
        </Row>
      </Card>

      <Card title="Теплокарта дилеров">
        <Table
          dataSource={filteredDealers}
          columns={columns}
          rowKey="dealerId"
          loading={tableLoading}
          pagination={false}
          onRow={(record: DealerMetrics) => ({
            style: { background: getRowHeat(record.status) },
          })}
          locale={{ emptyText: <Empty description="Нет дилеров в территории" /> }}
          expandable={{
            expandedRowRender: () => renderDetailPanel(),
            rowExpandable: () => true,
            expandRowByClick: true,
          }}
          expandedRowKeys={expandedDealer ? [expandedDealer] : []}
          onExpand={(_expanded, record) => handleExpand(record.dealerId)}
        />
      </Card>
    </div>
  );
};

export default TerritoryMapTab;