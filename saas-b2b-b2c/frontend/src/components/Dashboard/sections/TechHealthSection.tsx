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
  Tag,
  Button,
  Modal,
  Alert,
  DatePicker,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import { useTechHealthStore } from '@/store/techHealthStore';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const TechHealthSection: React.FC = () => {
  const {
    status,
    performance,
    errors,
    services,
    securityEvents,
    period,
    isLoading,
    setStatus,
    setPerformance,
    setErrors,
    setServices,
    setSecurityEvents,
    setPeriod,
    setLoading,
  } = useTechHealthStore();

  const [localLoading, setLocalLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<any>(null);
  const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  useEffect(() => {
    fetchData();
  }, [period, customDateRange]);

  const fetchData = async () => {
    setLoading(true);
    setLocalLoading(true);
    setFetchError(null);
    try {
      let perfUrl = `/admin/health/performance?period=${period}`;
      if (period === 'custom' && customDateRange) {
        perfUrl = `/admin/health/performance?start_date=${customDateRange[0].format('YYYY-MM-DD')}&end_date=${customDateRange[1].format('YYYY-MM-DD')}`;
      }
      const [statusRes, perfRes, errorsRes, servicesRes, securityRes] = await Promise.all([
        apiClient.get('/admin/health/status'),
        apiClient.get(perfUrl),
        apiClient.get('/admin/health/errors?limit=50'),
        apiClient.get('/admin/health/services'),
        apiClient.get('/admin/health/security-events?hours=24'),
      ]);

      setStatus(statusRes.data);
      setPerformance(perfRes.data || []);
      setErrors(errorsRes.data || []);
      setServices(servicesRes.data || []);
      setSecurityEvents(securityRes.data || []);
    } catch (err: any) {
      setFetchError(err?.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
      setLocalLoading(false);
    }
  };

  const onPeriodChange = (val: string) => {
    setPeriod(val);
    if (val !== 'custom') {
      setCustomDateRange(null);
    }
  };

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99.9) return '#52c41a';
    if (uptime >= 99) return '#faad14';
    return '#ff4d4f';
  };

  const getServiceStatusTag = (s: string) => {
    const config = {
      healthy: { color: 'green', icon: <CheckCircleOutlined />, text: 'OK' },
      degraded: { color: 'gold', icon: <WarningOutlined />, text: 'Degraded' },
      down: { color: 'red', icon: <CloseCircleOutlined />, text: 'Down' },
    };
    const c = config[s as keyof typeof config] || config.healthy;
    return <Tag icon={c.icon} color={c.color}>{c.text}</Tag>;
  };

  const getSecurityTypeTag = (t: string) => {
    const config = {
      failed_login: { color: 'red', text: 'Неудачный вход' },
      unusual_ip: { color: 'orange', text: 'Необычный IP' },
      mass_requests: { color: 'magenta', text: 'Массовые запросы' },
      unauthorized_access: { color: 'red', text: 'Несанкционированный доступ' },
    };
    const c = config[t as keyof typeof config];
    return <Tag color={c?.color}>{c?.text}</Tag>;
  };

  if (localLoading || isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  const errorColumns = [
    { title: 'Время', dataIndex: 'timestamp', key: 'timestamp', align: 'center', render: (d: string) => dayjs(d).format('HH:mm:ss') },
    { title: 'Код', dataIndex: 'code', key: 'code', align: 'center', render: (c: number) => <Tag color={c >= 500 ? 'red' : 'orange'}>{c}</Tag> },
    { title: 'Endpoint', dataIndex: 'endpoint', key: 'endpoint', align: 'center' },
    { title: 'Тенант', dataIndex: 'tenant', key: 'tenant', align: 'center' },
    { title: 'Сообщение', dataIndex: 'message', key: 'message', align: 'center' },
    {
      title: '',
      key: 'actions',
      align: 'center',
      render: (_: any, record: any) => (
        <Button size="small" onClick={() => setSelectedError(record)}>Детали</Button>
      ),
    },
  ];

  const serviceColumns = [
    { title: 'Сервис', dataIndex: 'name', key: 'name', align: 'center' },
    { title: 'Статус', dataIndex: 'status', key: 'status', align: 'center', render: (s: string) => getServiceStatusTag(s) },
    {
      title: 'CPU',
      dataIndex: 'cpu',
      key: 'cpu',
      align: 'center',
      render: (v: number) => (
        <span style={{ color: v > 80 ? '#ff4d4f' : v > 60 ? '#faad14' : undefined }}>
          {v}%
        </span>
      ),
    },
    {
      title: 'Memory',
      dataIndex: 'memory',
      key: 'memory',
      align: 'center',
      render: (v: number) => (
        <span style={{ color: v > 80 ? '#ff4d4f' : v > 60 ? '#faad14' : undefined }}>
          {v}%
        </span>
      ),
    },
    { title: 'Инстансы', dataIndex: 'instances', key: 'instances', align: 'center' },
    { title: 'Версия', dataIndex: 'version', key: 'version', align: 'center' },
    { title: 'Деплой', dataIndex: 'lastDeploy', key: 'lastDeploy', align: 'center' },
  ];

  const securityColumns = [
    { title: 'Время', dataIndex: 'timestamp', key: 'timestamp', align: 'center', render: (d: string) => dayjs(d).format('HH:mm') },
    { title: 'Тип', dataIndex: 'type', key: 'type', align: 'center', render: (t: string) => getSecurityTypeTag(t) },
    { title: 'Тенант', dataIndex: 'tenant', key: 'tenant', align: 'center' },
    { title: 'IP', dataIndex: 'ip', key: 'ip', align: 'center' },
    { title: 'Детали', dataIndex: 'details', key: 'details', align: 'center' },
    { title: 'Кол-во', dataIndex: 'count', key: 'count', align: 'center' },
  ];

  return (
    <div>
      <Title level={3}>Техническое здоровье</Title>

      {fetchError && (
        <Alert
          message="Ошибка загрузки"
          description={fetchError}
          type="error"
          showIcon
          closable
          action={
            <Button size="small" danger onClick={fetchData}>
              Повторить
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8} style={{ display: 'flex' }}>
          <Card style={{ flex: 1 }}>
            <Statistic
              title="Uptime (30 дней)"
              value={status?.uptime || 0}
              suffix="%"
              precision={2}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: getUptimeColor(status?.uptime || 0) }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} style={{ display: 'flex' }}>
          <Card style={{ flex: 1 }}>
            <Statistic
              title="Response Time (среднее)"
              value={status?.avgResponseTime || 0}
              suffix="мс"
              prefix={<ClockCircleOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              p95: {status?.p95ResponseTime}мс / p99: {status?.p99ResponseTime}мс
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={8} style={{ display: 'flex' }}>
          <Card style={{ flex: 1 }}>
            <Statistic
              title="Error Rate (24ч)"
              value={status?.errorRate || 0}
              suffix="%"
              precision={2}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: (status?.errorRate || 0) > 1 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Производительность" style={{ marginTop: 16 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col>
            <Select value={period} onChange={onPeriodChange} style={{ width: 140 }}>
              <Option value="24h">24 часа</Option>
              <Option value="7d">7 дней</Option>
              <Option value="30d">30 дней</Option>
              <Option value="custom">Произвольно</Option>
            </Select>
            {period === 'custom' && (
              <DatePicker.RangePicker
                value={customDateRange}
                onChange={(dates) => setCustomDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                style={{ marginLeft: 12 }}
              />
            )}
          </Col>
        </Row>
        {performance.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Время</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Avg (мс)</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>p95</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>p99</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>RPS</th>
                  <th style={{ textAlign: 'right', padding: 8, color: '#ff4d4f' }}>5xx %</th>
                </tr>
              </thead>
              <tbody>
                {performance.slice(-20).map((p, i) => (
                  <tr key={i}>
                    <td style={{ padding: 8 }}>{dayjs(p.timestamp).format('HH:mm')}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{p.avgResponseTime}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{p.p95ResponseTime}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{p.p99ResponseTime}</td>
                    <td style={{ textAlign: 'right', padding: 8 }}>{p.requestsPerSecond}</td>
                    <td style={{ textAlign: 'right', padding: 8, color: '#ff4d4f' }}>
                      {p.errorRate5xx.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Text type="secondary">Нет данных</Text>
        )}
      </Card>

      <Card title="Последние ошибки" style={{ marginTop: 16 }}>
        <Table
          dataSource={errors}
          columns={errorColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>

      <Card title="Нагрузка по сервисам" style={{ marginTop: 16 }}>
        <Table
          dataSource={services}
          columns={serviceColumns}
          rowKey="id"
          pagination={false}
        />
      </Card>

      <Card title="Подозрительная активность (демо)" style={{ marginTop: 16 }}>
        {securityEvents.length > 0 ? (
          <div>
            <Alert
              message="Внимание"
              description={
                securityEvents.every(e => e.count <= 1)
                  ? 'Пример данных. Реальные события появятся при подозрительной активности в системе.'
                  : 'Обнаружена подозрительная активность за последние 24 часа'
              }
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          </div>
        ) : null}
        <Table
          dataSource={securityEvents}
          columns={securityColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="Детали ошибки"
        open={!!selectedError}
        onCancel={() => setSelectedError(null)}
        footer={null}
      >
        {selectedError && (
          <div>
            <p><strong>Время:</strong> {dayjs(selectedError.timestamp).format('YYYY-MM-DD HH:mm:ss')}</p>
            <p><strong>Код:</strong> {selectedError.code}</p>
            <p><strong>Endpoint:</strong> {selectedError.endpoint}</p>
            <p><strong>Тенант:</strong> {selectedError.tenant || '-'}</p>
            <p><strong>Сообщение:</strong> {selectedError.message}</p>
            {selectedError.stackTrace && (
              <div style={{ marginTop: 16 }}>
                <strong>Stack Trace:</strong>
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: 16, 
                  overflow: 'auto',
                  maxHeight: 300,
                  fontSize: 12 
                }}>
                  {selectedError.stackTrace}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TechHealthSection;