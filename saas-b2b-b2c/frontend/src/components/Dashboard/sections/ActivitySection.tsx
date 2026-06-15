import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Select,
  Typography,
  Spin,
  Statistic,
  Progress,
  Tag,
  DatePicker,
  Space,
  Alert,
} from 'antd';
import {
  UserOutlined,
  RiseOutlined,
  FallOutlined,
  LineChartOutlined,
  ClockCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import { useThemeMode } from '@/components/ThemeProvider';
import { useActivityStore } from '@/store/activityStore';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const thStyle: React.CSSProperties = { textAlign: 'center', padding: '8px 12px', borderBottom: '2px solid #f0f0f0', fontWeight: 600 };
const tdStyle: React.CSSProperties = { textAlign: 'center', padding: '8px 12px' };

const ActivitySection: React.FC = () => {
  const {
    overview,
    dynamics,
    byTenant,
    featureAdoption,
    ttv,
    period,
    selectedTenant,
    isLoading,
    setOverview,
    setDynamics,
    setByTenant,
    setFeatureAdoption,
    setTtv,
    setPeriod,
    setSelectedTenant,
    setLoading,
  } = useActivityStore();

  const { theme } = useThemeMode();
  const [localLoading, setLocalLoading] = useState(true);
  const [mainCfg, setMainCfg] = useState({ mode: 'preset' as const, preset: 30, customRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null });
  const [prev1Cfg, setPrev1Cfg] = useState({ mode: 'shift' as const, shiftMonths: 1, customRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null });
  const [prev2Cfg, setPrev2Cfg] = useState({ mode: 'shift' as const, shiftMonths: 2, customRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null });

  useEffect(() => {
    fetchData();
  }, [period, selectedTenant, mainCfg, prev1Cfg, prev2Cfg]);

  const fetchData = async () => {
    setLoading(true);
    setLocalLoading(true);
    try {
      const params = new URLSearchParams();
      const maxShift = Math.max(
        prev1Cfg.mode === 'shift' ? prev1Cfg.shiftMonths : 0,
        prev2Cfg.mode === 'shift' ? prev2Cfg.shiftMonths : 0,
      );
      if (mainCfg.mode === 'custom' && mainCfg.customRange) {
        const days = mainCfg.customRange[1].diff(mainCfg.customRange[0], 'day') + 1;
        params.append('days', (days + maxShift * 31).toString());
        params.append('start_date', mainCfg.customRange[0].subtract(maxShift, 'month').format('YYYY-MM-DD'));
        params.append('end_date', mainCfg.customRange[1].format('YYYY-MM-DD'));
      } else {
        params.append('days', (mainCfg.preset + maxShift * 31).toString());
      }
      if (selectedTenant) params.append('tenant', selectedTenant);

      const [overviewRes, dynamicsRes, tenantRes, featureRes, ttvRes] = await Promise.all([
        apiClient.get(`/admin/activity/overview?${params.toString()}`),
        apiClient.get(`/admin/activity/dynamics?${params.toString()}`),
        apiClient.get(`/admin/activity/by-tenant?${params.toString()}`),
        apiClient.get(`/admin/activity/feature-adoption?${params.toString()}`),
        apiClient.get(`/admin/activity/ttv?${params.toString()}`),
      ]);

      setOverview(overviewRes.data);
      setDynamics(dynamicsRes.data || []);
      setByTenant(tenantRes.data || []);
      setFeatureAdoption(featureRes.data || []);
      setTtv(ttvRes.data || []);
    } catch {
      setOverview({
        dau: 45,
        dauChange: 8.5,
        wau: 120,
        wauChange: 12.3,
        mau: 320,
        mauChange: 15.2,
        stickiness: 14.1,
        avgSessionTime: 25,
        activeSessions: 12,
      });

      const now = dayjs();
      const dynamicsData = [];
      for (let i = 179; i >= 0; i--) {
        const date = now.subtract(i, 'day').format('YYYY-MM-DD');
        const dayOfWeek = now.subtract(i, 'day').day();
        const trend = 1 + (179 - i) * 0.002;
        const base = 20 + Math.random() * 30;
        const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1;
        dynamicsData.push({
          date,
          dau: Math.floor(base * weekendFactor * trend),
          wau: Math.floor(80 + Math.random() * 50),
          mau: Math.floor(200 + Math.random() * 150),
        });
      }
      setDynamics(dynamicsData);

      setByTenant([
        {
          id: '1',
          name: 'ООО Техно',
          dau: 25,
          wau: 80,
          mau: 150,
          stickiness: 16.7,
          activeLicensePercent: 85,
        },
        {
          id: '2',
          name: 'АО Бизнес',
          dau: 15,
          wau: 45,
          mau: 90,
          stickiness: 16.7,
          activeLicensePercent: 72,
        },
        {
          id: '3',
          name: 'ИП Сидоров',
          dau: 5,
          wau: 12,
          mau: 25,
          stickiness: 20,
          activeLicensePercent: 40,
        },
        {
          id: '4',
          name: 'ООО Проблема',
          dau: 2,
          wau: 8,
          mau: 15,
          stickiness: 13.3,
          activeLicensePercent: 20,
        },
      ]);

      setFeatureAdoption([
        { id: '1', name: 'Управление дилерами', tenantPercent: 85, userPercent: 40, frequency: 'daily', trend: 'up' },
        { id: '2', name: 'Чек-листы', tenantPercent: 70, userPercent: 35, frequency: 'weekly', trend: 'up' },
        { id: '3', name: 'Коммуникации', tenantPercent: 60, userPercent: 28, frequency: 'daily', trend: 'stable' },
        { id: '4', name: 'Цели и планы', tenantPercent: 40, userPercent: 15, frequency: 'monthly', trend: 'down' },
        { id: '5', name: 'Задачи', tenantPercent: 55, userPercent: 22, frequency: 'weekly', trend: 'stable' },
      ]);

      setTtv([
        {
          id: '1',
          name: 'Новая компания',
          createdAt: '2026-03-15',
          firstSaleAt: '2026-03-16',
          ttvDays: 1,
        },
        {
          id: '2',
          name: 'Тест тенант',
          createdAt: '2026-04-01',
          firstSaleAt: '2026-04-10',
          ttvDays: 9,
        },
        {
          id: '3',
          name: 'Пилот',
          createdAt: '2026-04-10',
          firstSaleAt: '',
          ttvDays: -1,
        },
      ]);
    } finally {
      setLoading(false);
      setLocalLoading(false);
    }
  };

  const renderChange = (value: number) => {
    const color = value > 0 ? '#52c41a' : value < 0 ? '#ff4d4f' : '#888';
    const Icon = value >= 0 ? RiseOutlined : FallOutlined;
    const prefix = value >= 0 ? '+' : '';
    return (
      <span style={{ color, fontSize: 12, marginLeft: 8 }}>
        <Icon /> {prefix}
        {value}%
      </span>
    );
  };

  if (localLoading || isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  const tenantColumns = [
    { title: 'Тенант', dataIndex: 'name', key: 'name', align: 'center', sorter: (a: any, b: any) => a.name.localeCompare(b.name) },
    {
      title: 'DAU (активные за день)',
      dataIndex: 'dau',
      key: 'dau',
      align: 'center',
      sorter: (a: any, b: any) => a.dau - b.dau,
    },
    {
      title: 'WAU (активные за неделю)',
      dataIndex: 'wau',
      key: 'wau',
      align: 'center',
      sorter: (a: any, b: any) => a.wau - b.wau,
    },
    {
      title: 'MAU (активные за месяц)',
      dataIndex: 'mau',
      key: 'mau',
      align: 'center',
      sorter: (a: any, b: any) => a.mau - b.mau,
    },
    {
      title: 'Stickiness (удержание)',
      dataIndex: 'stickiness',
      key: 'stickiness',
      align: 'center',
      sorter: (a: any, b: any) => a.stickiness - b.stickiness,
      render: (v: number) => (
        <span style={{ color: v < 20 ? '#ff4d4f' : v >= 40 ? '#52c41a' : undefined }}>
          {v.toFixed(1)}%
        </span>
      ),
    },
    {
      title: 'Акт. лицензий',
      dataIndex: 'activeLicensePercent',
      key: 'activeLicensePercent',
      align: 'center',
      render: (v: number) => (
        <Progress
          percent={v}
          size="small"
          status={v < 30 ? 'exception' : v > 70 ? 'success' : 'normal'}
        />
      ),
    },
  ];

  const featureColumns = [
    { title: 'Функция', dataIndex: 'name', key: 'name', align: 'center' },
    {
      title: '% тенантов',
      dataIndex: 'tenantPercent',
      key: 'tenantPercent',
      align: 'center',
      render: (v: number) => `${v}%`,
    },
    {
      title: '% польз.',
      dataIndex: 'userPercent',
      key: 'userPercent',
      align: 'center',
      render: (v: number) => `${v}%`,
    },
    { title: 'Частота', dataIndex: 'frequency', key: 'frequency', align: 'center' },
    {
      title: 'Тренд',
      dataIndex: 'trend',
      key: 'trend',
      align: 'center',
      render: (t: string) => {
        const colors = { up: 'green', stable: 'blue', down: 'red' };
        return <Tag color={colors[t as keyof typeof colors]}>{t === 'up' ? '↑ Растёт' : t === 'down' ? '↓ Падает' : '→ Стабильно'}</Tag>;
      },
    },
  ];

const ttvColumns = [
    { title: 'Тенант', dataIndex: 'name', key: 'name', align: 'center' },
    { title: 'Создан', dataIndex: 'createdAt', key: 'createdAt', align: 'center', render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-' },
    { title: 'Первая продажа', dataIndex: 'firstSaleAt', key: 'firstSaleAt', align: 'center', render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '-' },
    {
      title: 'TTV (дней)',
      dataIndex: 'ttvDays',
      key: 'ttvDays',
      align: 'center',
      render: (v: number) => (
        <span style={{ color: v === -1 ? '#faad14' : v <= 7 ? '#52c41a' : v <= 14 ? '#1890ff' : '#ff4d4f' }}>
          {v === -1 ? 'Нет продажи' : `${v} дн.`}
        </span>
      ),
    },
  ];

  const avgTtv = ttv.length > 0
    ? ttv.filter(t => t.ttvDays > 0).reduce((acc, t) => acc + t.ttvDays, 0) / ttv.filter(t => t.ttvDays > 0).length
    : 0;

  return (
    <div>
      <Title level={3}>Активность пользователей</Title>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic
              title="DAU сегодня (активные за день)"
              value={overview?.dau || 0}
              prefix={<UserOutlined />}
            />
            {renderChange(overview?.dauChange || 0)}
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic
              title="WAU за 7 дней (активные за неделю)"
              value={overview?.wau || 0}
              prefix={<UserOutlined />}
            />
            {renderChange(overview?.wauChange || 0)}
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic
              title="MAU за 30 дней (активные за месяц)"
              value={overview?.mau || 0}
              prefix={<UserOutlined />}
            />
            {renderChange(overview?.mauChange || 0)}
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic
              title="Удержание (Stickiness)"
              value={overview?.stickiness || 0}
              suffix="%"
              prefix={<LineChartOutlined />}
              valueStyle={{ color: (overview?.stickiness || 0) >= 40 ? '#52c41a' : (overview?.stickiness || 0) < 20 ? '#ff4d4f' : undefined }}
            />
            <Text type="secondary">норма {'>'}40%</Text>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic
              title="Среднее время сессии"
              value={overview?.avgSessionTime || 0}
              suffix="мин"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={{ height: '100%', textAlign: 'center' }}>
            <Statistic
              title="Активных сессий"
              value={overview?.activeSessions || 0}
              valueStyle={{ color: (overview?.activeSessions || 0) > 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Динамика активности" style={{ marginTop: 16 }}>
        <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
          <Col>
            <Select
              value={mainCfg.mode === 'custom' ? 'custom' : mainCfg.preset}
              onChange={(val) => {
                if (val === 'custom') {
                  setMainCfg({ ...mainCfg, mode: 'custom' });
                } else {
                  setMainCfg({ mode: 'preset', preset: val as number, customRange: null });
                }
              }}
              style={{ width: 130 }}
            >
              <Option value={7}>Неделя</Option>
              <Option value={30}>Месяц</Option>
              <Option value={90}>Квартал</Option>
              <Option value="custom">Произвольно</Option>
            </Select>
          </Col>
          <Col>
            <Text type="secondary">Пред. период 1:</Text>
          </Col>
          <Col>
            <Select
              value={prev1Cfg.mode === 'custom' ? 'custom' : prev1Cfg.shiftMonths}
              onChange={(val) => {
                if (val === 'custom') {
                  setPrev1Cfg({ ...prev1Cfg, mode: 'custom' });
                } else {
                  setPrev1Cfg({ mode: 'shift', shiftMonths: val as number, customRange: null });
                }
              }}
              style={{ width: 140 }}
            >
              <Option value={1}>Сдвиг -1 мес</Option>
              <Option value={2}>Сдвиг -2 мес</Option>
              <Option value={3}>Сдвиг -3 мес</Option>
              <Option value="custom">Произвольно</Option>
            </Select>
          </Col>
          <Col>
            <Text type="secondary">Пред. период 2:</Text>
          </Col>
          <Col>
            <Select
              value={prev2Cfg.mode === 'custom' ? 'custom' : prev2Cfg.shiftMonths}
              onChange={(val) => {
                if (val === 'custom') {
                  setPrev2Cfg({ ...prev2Cfg, mode: 'custom' });
                } else {
                  setPrev2Cfg({ mode: 'shift', shiftMonths: val as number, customRange: null });
                }
              }}
              style={{ width: 140 }}
            >
              <Option value={1}>Сдвиг -1 мес</Option>
              <Option value={2}>Сдвиг -2 мес</Option>
              <Option value={3}>Сдвиг -3 мес</Option>
              <Option value="custom">Произвольно</Option>
            </Select>
          </Col>
          {(mainCfg.mode === 'custom' || prev1Cfg.mode === 'custom' || prev2Cfg.mode === 'custom') && (
            <Col>
              <DatePicker.RangePicker
                value={
                  mainCfg.mode === 'custom'
                    ? (mainCfg.customRange as any)
                    : prev1Cfg.mode === 'custom'
                    ? (prev1Cfg.customRange as any)
                    : (prev2Cfg.customRange as any)
                }
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    if (mainCfg.mode === 'custom') {
                      setMainCfg({ ...mainCfg, customRange: [dates[0], dates[1]] });
                    } else if (prev1Cfg.mode === 'custom') {
                      setPrev1Cfg({ ...prev1Cfg, customRange: [dates[0], dates[1]] });
                    } else {
                      setPrev2Cfg({ ...prev2Cfg, customRange: [dates[0], dates[1]] });
                    }
                  }
                }}
              />
            </Col>
          )}
        </Row>
        {(() => {
          const sorted = [...dynamics].sort((a, b) => a.date.localeCompare(b.date));
          const dateMap = new Map<string, number>();
          sorted.forEach(d => dateMap.set(dayjs(d.date).format('YYYY-MM-DD'), d.dau));
          const dates = sorted.map(d => d.date);
          if (!dates.length) return <Text type="secondary">Нет данных</Text>;

          const lastDate = dayjs(dates[dates.length - 1]);
          let mainDates: string[];
          if (mainCfg.mode === 'custom' && mainCfg.customRange) {
            const days = mainCfg.customRange[1].diff(mainCfg.customRange[0], 'day') + 1;
            mainDates = Array.from({ length: days }, (_, i) => mainCfg.customRange![0].add(i, 'day').format('YYYY-MM-DD'));
          } else {
            mainDates = Array.from({ length: mainCfg.preset }, (_, i) => lastDate.subtract(mainCfg.preset - 1 - i, 'day').format('YYYY-MM-DD'));
          }

          const getShifted = (cfg: typeof prev1Cfg, src: string[]) => {
            if (cfg.mode === 'custom' && cfg.customRange) {
              const days = cfg.customRange[1].diff(cfg.customRange[0], 'day') + 1;
              return Array.from({ length: days }, (_, i) => cfg.customRange![0].add(i, 'day').format('YYYY-MM-DD'));
            }
            return src.map(d => dayjs(d).subtract(cfg.shiftMonths, 'month').format('YYYY-MM-DD'));
          };

          const prev1Dates = getShifted(prev1Cfg, mainDates);
          const prev2Dates = getShifted(prev2Cfg, mainDates);

          const rows = mainDates.map((date, i) => {
            const activity = dateMap.get(date) ?? null;
            const p1 = dateMap.get(prev1Dates[i]) ?? null;
            const p2 = dateMap.get(prev2Dates[i]) ?? null;
            const avgPrev = p1 !== null && p2 !== null ? (p1 + p2) / 2 : (p1 ?? p2);
            let delta: number | null = null;
            if (avgPrev !== null && avgPrev > 0 && activity !== null) {
              delta = Number((((activity - avgPrev) / avgPrev) * 100).toFixed(1));
            }
            return { date, activity, prev1: p1, prev2: p2, delta };
          });

          const validDeltas = rows.filter(r => r.delta !== null);
          const avgDelta = validDeltas.length ? validDeltas.reduce((s, r) => s + r.delta!, 0) / validDeltas.length : null;

          return (
            <>
              {avgDelta !== null && (
                <Alert
                  type={avgDelta > 5 ? 'success' : avgDelta < -5 ? 'error' : 'info'}
                  showIcon
                  icon={avgDelta > 5 ? <ArrowUpOutlined /> : avgDelta < -5 ? <ArrowDownOutlined /> : <MinusOutlined />}
                  message={
                    <span>
                      Отклонение активности: {avgDelta > 0 ? '+' : ''}{avgDelta.toFixed(1)}%{' '}
                      {avgDelta > 5 ? 'выше нормы' : avgDelta < -5 ? 'ниже нормы' : 'в пределах нормы'}
                    </span>
                  }
                  style={{ marginBottom: 16 }}
                />
              )}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: theme === 'dark' ? '#262626' : '#fafafa' }}>
                      <th style={thStyle}>Дата</th>
                      <th style={thStyle}>Активность</th>
                      <th style={thStyle}>Пред. период 1</th>
                      <th style={thStyle}>Пред. период 2</th>
                      <th style={thStyle}>Δ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const deltaColor = r.delta !== null ? (r.delta > 0 ? '#52c41a' : r.delta < 0 ? '#ff4d4f' : '#888') : '#888';
                      const deltaIcon = r.delta !== null ? (r.delta > 0 ? <ArrowUpOutlined /> : r.delta < 0 ? <ArrowDownOutlined /> : <MinusOutlined />) : null;
                      return (
                        <tr key={r.date} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}>{dayjs(r.date).format('DD.MM.YYYY')}</td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#1890ff' }}>{r.activity ?? 0}</td>
                          <td style={tdStyle}>{r.prev1 ?? 0}</td>
                          <td style={tdStyle}>{r.prev2 ?? 0}</td>
                          <td style={{ ...tdStyle, color: deltaColor }}>
                            {deltaIcon} {r.delta !== null ? `${r.delta > 0 ? '+' : ''}${r.delta}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </Card>

      <Card title="Активность по тенантам" style={{ marginTop: 16 }}>
        <Table
          dataSource={byTenant}
          columns={tenantColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          rowClassName={(record) => record.stickiness < 20 ? 'table-row-warning' : ''}
        />
      </Card>

      <Card title="Внедрение функций (Feature Adoption)" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">Топ используемые</Text>
            <Table
              dataSource={featureAdoption.filter(f => f.trend === 'up').slice(0, 5)}
              columns={featureColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Col>
          <Col span={12}>
            <Text type="secondary">Топ игнорируемые</Text>
            <Table
              dataSource={featureAdoption.filter(f => f.trend === 'down').slice(0, 5)}
              columns={featureColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Col>
        </Row>
      </Card>

      <Card title="Время до ценности (Time to Value)" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title="Средний TTV"
                value={avgTtv || 0}
                suffix="дней"
                valueStyle={{ color: avgTtv <= 7 ? '#52c41a' : avgTtv <= 14 ? '#1890ff' : '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
        <Table
          dataSource={ttv}
          columns={ttvColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          style={{ marginTop: 16 }}
        />
      </Card>
    </div>
  );
};

export default ActivitySection;