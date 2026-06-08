import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Row, Col, Table, Tag, Select, Typography, Statistic, Space, Button, Empty, Spin, Radio, Tooltip, Alert, message, DatePicker } from 'antd';
import { DownloadOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import apiClient from '@/api/axiosClient';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export type PeriodType = 'month' | 'quarter' | 'year' | 'custom';
export type CategoryType = 'all' | 'kitchens' | 'soft' | 'case' | 'mattresses';

interface InventoryItem {
  id: string;
  collection: string;
  category: string;
  stockWarehouse: number;
  onDisplay: number;
  soldPeriod: number;
  turnoverDays: number;
  totalStockValue: number;
}

interface LostSalesReason {
  reason: string;
  count: number;
  lostRevenue: number;
  percent: number;
}

interface ReturnItem {
  id: string;
  date: string;
  product: string;
  reason: string;
  amount: number;
  status: 'resolved' | 'in_progress' | 'claim_filed';
}

interface SalesDynamics {
  month: string;
  sales: number;
  stock: number;
}

const ProductsStockTab: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [lostSales, setLostSales] = useState<LostSalesReason[]>([]);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [salesDynamics, setSalesDynamics] = useState<SalesDynamics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [category, setCategory] = useState<CategoryType>('all');
  const [salonId, setSalonId] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [salonList, setSalonList] = useState<{id: string; name: string}[]>([]);
  const [customDateRange, setCustomDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, string> = {};
      if (period === 'custom') {
        if (customDateRange?.[0]) params.start_date = customDateRange[0].format('YYYY-MM-DD');
        if (customDateRange?.[1]) params.end_date = customDateRange[1].format('YYYY-MM-DD');
      } else {
        params.period = period;
      }
      if (salonId !== 'all') params.salon_id = salonId;

      const { data } = await apiClient.get('/dealer/products', { params });
      setInventory((data.inventory || []).map((item: any) => ({
        id: item.id,
        collection: item.collection,
        category: item.category || '',
        stockWarehouse: item.stock_warehouse ?? 0,
        onDisplay: item.on_display ?? 0,
        soldPeriod: item.sold_period ?? 0,
        turnoverDays: item.turnover_days ?? 0,
        totalStockValue: item.total_stock_value ?? 0,
      })));
      setLostSales((data.lost_sales || []).map((item: any) => ({
        reason: item.reason,
        count: item.count,
        lostRevenue: item.lost_revenue ?? 0,
        percent: item.percent ?? 0,
      })));
      setReturns((data.returns || []).map((item: any) => ({
        id: item.id,
        date: item.date,
        product: item.product,
        reason: item.reason || '',
        amount: item.amount ?? 0,
        status: item.status,
      })));
      setSalesDynamics((data.sales_dynamics || []).map((item: any) => ({
        month: item.month,
        sales: item.sales ?? 0,
        stock: item.stock ?? 0,
      })));
      if (data.salons) setSalonList(data.salons);
    } catch (e) {
      console.error('Failed to fetch products data', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period, salonId, customDateRange]);

  useEffect(() => {
    if (period === 'custom' && !customDateRange?.[0]) return;
    fetchData();
  }, [period, salonId, customDateRange, fetchData]);

  const categoryMap: Record<CategoryType, string> = {
    all: '',
    kitchens: 'Кухни',
    soft: 'Мягкая',
    case: 'Корпусная',
    mattresses: 'Матрасы',
  };

  const filteredInventory = useMemo(() => {
    if (category === 'all') return inventory;
    const catLabel = categoryMap[category];
    return inventory.filter(i => i.category === catLabel);
  }, [inventory, category]);

  const totalReturns = useMemo(() => returns.length, [returns]);
  const totalReturnsAmount = useMemo(() => returns.reduce((sum, r) => sum + r.amount, 0), [returns]);
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';

  const inventoryColumns = [
    {
      title: 'Название коллекции',
      dataIndex: 'collection',
      key: 'collection',
      fixed: 'left' as const,
      width: 180,
      sorter: (a: InventoryItem, b: InventoryItem) => a.collection.localeCompare(b.collection),
    },
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (val: string) => {
        const colors: Record<string, string> = {
          'Кухни': 'blue',
          'Мягкая': 'green',
          'Корпусная': 'purple',
          'Матрасы': 'orange',
        };
        return <Tag color={colors[val] || 'default'}>{val}</Tag>;
      },
    },
    {
      title: 'Остаток на складах',
      dataIndex: 'stockWarehouse',
      key: 'stockWarehouse',
      width: 130,
      render: (val: number) => <Tag color={val > 10 ? 'green' : val > 0 ? 'orange' : 'red'}>{val} шт</Tag>,
    },
    {
      title: 'На витринах',
      dataIndex: 'onDisplay',
      key: 'onDisplay',
      width: 100,
      render: (val: number) => <Text>{val} шт</Text>,
    },
    {
      title: 'Продано за период',
      dataIndex: 'soldPeriod',
      key: 'soldPeriod',
      width: 120,
      render: (val: number) => <Text strong>{val}</Text>,
    },
    {
      title: 'Оборачиваемость',
      dataIndex: 'turnoverDays',
      key: 'turnoverDays',
      width: 120,
      render: (val: number, record: InventoryItem) => {
        let color = '#52c41a';
        if (val > 90) color = '#ff4d4f';
        else if (val > 60) color = '#fa8c16';
        return (
          <Tag color={color}>
            {val} дн.
          </Tag>
        );
      },
    },
    {
      title: 'Общая стоимость',
      dataIndex: 'totalStockValue',
      key: 'totalStockValue',
      width: 140,
      render: (val: number) => <Text strong>{formatCurrency(val)}</Text>,
    },
  ];

  const lostSalesColumns = [
    {
      title: 'Причина',
      dataIndex: 'reason',
      key: 'reason',
      width: 150,
      render: (val: string) => {
        const colors: Record<string, string> = {
          'Нет в наличии': 'red',
          'Долгий срок': 'orange',
          'Цена': 'gold',
          'Дизайн': 'purple',
          'Другое': 'default',
        };
        return <Tag color={colors[val] || 'default'}>{val}</Tag>;
      },
    },
    {
      title: 'Количество запросов',
      dataIndex: 'count',
      key: 'count',
      width: 150,
      render: (val: number) => <Text strong>{val}</Text>,
    },
    {
      title: 'Потерянная выручка',
      dataIndex: 'lostRevenue',
      key: 'lostRevenue',
      width: 150,
      render: (val: number) => <Text style={{ color: '#ff4d4f' }}>{formatCurrency(val)}</Text>,
    },
    {
      title: '% от общей',
      dataIndex: 'percent',
      key: 'percent',
      width: 100,
      render: (val: number) => <Text>{val.toFixed(1)}%</Text>,
    },
  ];

  const returnsColumns = [
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      width: 100,
    },
    {
      title: 'Товар',
      dataIndex: 'product',
      key: 'product',
      width: 150,
    },
    {
      title: 'Причина',
      dataIndex: 'reason',
      key: 'reason',
      width: 150,
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (val: number) => <Text>{formatCurrency(val)}</Text>,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (val: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          'resolved': { color: 'green', text: 'Урегулировано' },
          'in_progress': { color: 'orange', text: 'В процессе' },
          'claim_filed': { color: 'red', text: 'Претензия фабрике' },
        };
        const status = statusMap[val] || { color: 'default', text: val };
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
  ];

  const getCategoryLabel = (cat: CategoryType) => {
    const labels: Record<CategoryType, string> = {
      all: 'Все',
      kitchens: 'Кухни',
      soft: 'Мягкая мебель',
      case: 'Корпусная мебель',
      mattresses: 'Матрасы',
    };
    return labels[cat];
  };

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
        description="Не удалось загрузить данные по товарам и складу."
        type="error"
        showIcon
        action={<Button icon={<ReloadOutlined />} onClick={fetchData}>Повторить</Button>}
      />
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Space wrap>
            <Radio.Group
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodType)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="month">Месяц</Radio.Button>
              <Radio.Button value="quarter">Квартал</Radio.Button>
              <Radio.Button value="year">Год</Radio.Button>
              <Radio.Button value="custom">Произвольный</Radio.Button>
            </Radio.Group>
            {period === 'custom' && (
              <RangePicker
                value={customDateRange as any}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setCustomDateRange([dates[0] as Dayjs, dates[1] as Dayjs]);
                  }
                }}
              />
            )}
            <Select
              value={salonId}
              onChange={setSalonId}
              style={{ width: 180 }}
            >
              <Option value="all">Все салоны</Option>
              {salonList.map(s => (
                <Option key={s.id} value={s.id}>{s.name}</Option>
              ))}
            </Select>
            <Select
              value={category}
              onChange={setCategory}
              style={{ width: 180 }}
            >
              <Option value="all">Все категории</Option>
              <Option value="kitchens">Кухни</Option>
              <Option value="soft">Мягкая мебель</Option>
              <Option value="case">Корпусная мебель</Option>
              <Option value="mattresses">Матрасы</Option>
            </Select>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card 
            title="📦 ОБОРАЧИВАЕМОСТЬ" 
            extra={
              <Space>
                <Tooltip title="Не-ликвид ( > 90 дней)">
                  <Tag color="red">⚠️ {filteredInventory.filter(i => i.turnoverDays > 90).length}</Tag>
                </Tooltip>
                <Tooltip title="Дефицит (0 на складе + спрос)">
                  <Tag color="gold">⚠️ {filteredInventory.filter(i => i.stockWarehouse === 0 && i.soldPeriod > 0).length}</Tag>
                </Tooltip>
                <Button icon={<DownloadOutlined />} onClick={async () => {
                  try {
                    const params: Record<string, string> = {};
                    if (period === 'custom') {
                      if (customDateRange?.[0]) params.start_date = customDateRange[0].format('YYYY-MM-DD');
                      if (customDateRange?.[1]) params.end_date = customDateRange[1].format('YYYY-MM-DD');
                    } else {
                      params.period = period;
                    }
                    if (salonId !== 'all') params.salon_id = salonId;
                    const res = await apiClient.get('/dealer/products/export', { params, responseType: 'blob' });
                    const url = window.URL.createObjectURL(new Blob([res.data]));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `products-stock-${new Date().toISOString().slice(0, 10)}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (e) {
                    message.error('Ошибка при скачивании отчёта');
                    console.error(e);
                  }
                }}>Скачать</Button>
              </Space>
            }
          >
            {filteredInventory.length > 0 ? (
              <Table
                dataSource={filteredInventory}
                columns={inventoryColumns}
                rowKey="id"
                pagination={{ pageSize: 10, showSizeChanger: true }}
                scroll={{ x: 1000 }}
                locale={{ emptyText: 'Нет данных' }}
                size="small"
                onRow={(record) => ({
                  onClick: () => setSelectedItem(record.id === selectedItem ? null : record.id),
                  style: { cursor: 'pointer', background: record.id === selectedItem ? '#e6f7ff' : undefined },
                })}
              />
            ) : (
              <Empty description="Нет данных о складе" />
            )}
          </Card>
        </Col>
      </Row>

      {selectedItem && salesDynamics.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card title={`📈 Динамика продаж и остатков: ${filteredInventory.find(i => i.id === selectedItem)?.collection}`}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={salesDynamics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <RechartsTooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="sales" stroke="#1890ff" name="Продажи" />
                  <Line yAxisId="right" type="monotone" dataKey="stock" stroke="#52c41a" name="Остаток" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card title="📉 УПУЩЕННАЯ ПРИБЫЛЬ">
            {lostSales.length > 0 ? (
              <>
                <Table
                  dataSource={lostSales}
                  columns={lostSalesColumns}
                  rowKey="reason"
                  pagination={false}
                  size="small"
                  locale={{ emptyText: 'Нет данных' }}
                />
                <div style={{ marginTop: 16, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={lostSales} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="reason" type="category" width={100} />
                      <RechartsTooltip />
                      <Bar dataKey="lostRevenue" fill="#ff4d4f" name="Потерянная выручка" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <Empty description="Нет данных об упущенной прибыли" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="🔄 ВОЗВРАТЫ И РЕКЛАМАЦИИ">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={[16, 8]}>
                <Col span={12}>
                  <Statistic
                    title="Количество возвратов"
                    value={totalReturns}
                    prefix={<ClockCircleOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Сумма возвратов"
                    value={totalReturnsAmount}
                    precision={0}
                    prefix="₽ "
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Col>
              </Row>
            </Space>
          </Card>
          <Card title="Детализация возвратов" style={{ marginTop: 16 }}>
            {returns.length > 0 ? (
              <Table
                dataSource={returns}
                columns={returnsColumns}
                rowKey="id"
                pagination={{ pageSize: 5 }}
                size="small"
                locale={{ emptyText: 'Нет возвратов' }}
                scroll={{ x: 600 }}
              />
            ) : (
              <Empty description="Нет данных о возвратах" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProductsStockTab;
