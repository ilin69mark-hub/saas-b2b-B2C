import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Typography, Button, Modal, Form, Input, Select, Table, Tag, Spin, message, Alert } from 'antd';
import { PlusOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import { useCreateLeadMutation, useGetLeadsQuery, useUpdateLeadStatusMutation } from '@/services/api';
import dayjs from 'dayjs';
import PhoneInput from '@/components/common/PhoneInput';
import { normalizeForApi, formatPhone } from '@/utils/phone';

const { Title, Text } = Typography;
const { Option } = Select;

interface SalonFunnelTabProps {
  user: any;
}

interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  conversion: number;
  sum: number;
}

interface HotDeal {
  id: string;
  client_name: string;
  phone: string;
  amount: number;
  created_at: string;
  days_stalled: number;
  manager_id: string;
  manager_name: string;
}

interface FreshLead {
  id: string;
  source: string;
  client_name: string;
  phone: string;
  created_at: string;
  status: string;
  assigned_to: string | null;
  manager_name: string;
}

interface DashboardFunnelData {
  stages: FunnelStage[];
  hot_deals: HotDeal[];
  fresh_leads: FreshLead[];
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'contact', label: 'Контакт' },
  { value: 'meeting', label: 'Замер' },
  { value: 'wait', label: 'КП' },
  { value: 'sale', label: 'Договор' },
  { value: 'paid', label: 'Оплачен' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  new: 'blue',
  contact: 'orange',
  meeting: 'cyan',
  wait: 'purple',
  sale: 'green',
  paid: 'gold',
};

const getStatusLabel = (status: string) =>
  STATUS_OPTIONS.find(o => o.value === status)?.label || status;

const stageConfig: Record<string, { color: string; icon: string }> = {
  traffic: { color: '#1890ff', icon: '👥' },
  consultation: { color: '#722ed1', icon: '📞' },
  measurement: { color: '#13c2c2', icon: '📏' },
  kp: { color: '#faad14', icon: '📄' },
  contract: { color: '#52c41a', icon: '✍️' },
  payment: { color: '#eb2f96', icon: '💰' },
};

const SalonFunnelTab: React.FC<SalonFunnelTabProps> = ({ user }) => {
  const { data: leads, isLoading: isLeadsLoading, refetch: refetchLeads } = useGetLeadsQuery();
  const [createLead] = useCreateLeadMutation();
  const [updateLeadStatus] = useUpdateLeadStatusMutation();

  const [data, setData] = useState<DashboardFunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    try {
      const date = dayjs().format('YYYY-MM-DD');
      const res = await apiClient.get(`/dashboard/funnel?date=${date}`);
      setData(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatMoney = (val: number) => new Intl.NumberFormat('ru-RU').format(val);

  const handleCreateLead = async (values: any) => {
    try {
      await createLead({
        ...values,
        phone: normalizeForApi(String(values.phone || '')),
        budget: values.budget ? Number(values.budget) : undefined,
      }).unwrap();
      message.success('Лид добавлен');
      setIsModalOpen(false);
      form.resetFields();
      refetchLeads();
      fetchData();
    } catch (e: any) {
      message.error(e?.data?.error || 'Ошибка создания лида');
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      await updateLeadStatus({ id: leadId, status: newStatus }).unwrap();
      message.success('Статус обновлён');
      refetchLeads();
      fetchData();
    } catch {
      message.error('Ошибка обновления статуса');
    }
  };

  const handleAssignLead = async (leadId: string, managerId: string) => {
    try {
      await apiClient.patch(`/leads/${leadId}/assign`, { manager_id: managerId });
      message.success('Ответственный назначен');
      fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Ошибка назначения');
    }
  };

  // Воронка
  const funnelChart = (
    <Row gutter={[8, 8]} style={{ marginBottom: 24 }}>
      {data?.stages.map((stage) => (
        <Col xs={8} md={4} key={stage.stage}>
          <Card
            size="small"
            style={{
              borderRadius: 8,
              borderTop: `3px solid ${stageConfig[stage.stage]?.color || '#999'}`,
              cursor: 'pointer',
              textAlign: 'center',
            }}
            onClick={() => setSelectedStage(stage.stage)}
            hoverable
          >
            <div style={{ fontSize: 20 }}>{stageConfig[stage.stage]?.icon}</div>
            <Title level={4} style={{ margin: '8px 0', color: stageConfig[stage.stage]?.color }}>
              {stage.count}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{stage.label}</Text>
            <div style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: stage.conversion > 50 ? '#52c41a' : '#faad14' }}>
                {stage.conversion}%
              </Text>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );

  // Таблица горячих сделок
  const hotDealsColumns = [
    {
      title: 'Клиент',
      dataIndex: 'client_name',
      key: 'client_name',
      render: (text: string, record: HotDeal) => (
        <a onClick={() => {
          setSelectedLead(record);
          setIsModalOpen(true);
        }}>{text}</a>
      ),
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => <Text strong>{formatMoney(val)} ₽</Text>,
    },
    {
      title: 'Дата КП',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => dayjs(val).format('DD.MM.YYYY'),
      sorter: (a: HotDeal, b: HotDeal) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
    },
    {
      title: 'Дней без движения',
      dataIndex: 'days_stalled',
      key: 'days_stalled',
      sorter: (a: HotDeal, b: HotDeal) => a.days_stalled - b.days_stalled,
      render: (days: number) => (
        <Tag color={days > 7 ? 'error' : days > 5 ? 'warning' : 'default'}>
          {days} дн.
        </Tag>
      ),
    },
    {
      title: 'Ответственный',
      dataIndex: 'manager_name',
      key: 'manager_name',
      filters: [...new Set((data?.hot_deals || []).map(d => d.manager_name).filter(Boolean))].map(n => ({ text: n, value: n })),
      onFilter: (value: any, record: HotDeal) => record.manager_name === value,
      filterSearch: true,
      render: (name: string) => name || '-',
    },
  ];

  // Таблица свежих лидов
  const freshLeadsColumns = [
    {
      title: 'Источник',
      dataIndex: 'source',
      key: 'source',
      filters: [...new Set((data?.fresh_leads || []).map(d => d.source).filter(Boolean))].map(n => ({ text: n, value: n })),
      onFilter: (value: any, record: FreshLead) => record.source === value,
      filterSearch: true,
    },
    {
      title: 'Клиент',
      dataIndex: 'client_name',
      key: 'client_name',
    },
    {
      title: 'Телефон',
      dataIndex: 'phone',
      key: 'phone',
      render: (val: string) => val ? formatPhone(val) : '-',
    },
    {
      title: 'Время',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => dayjs(val).format('DD.MM.YYYY HH:mm'),
      sorter: (a: FreshLead, b: FreshLead) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Не назначен', value: 'unassigned' },
        { text: 'В работе', value: 'in_progress' },
        { text: 'Обработан', value: 'processed' },
      ],
      onFilter: (value: any, record: FreshLead) => {
        if (value === 'processed') return record.status !== 'unassigned' && record.status !== 'in_progress';
        return record.status === value;
      },
      render: (status: string, record: FreshLead) => {
        const createdTime = dayjs(record.created_at, 'YYYY-MM-DD HH:mm');
        const minutesAgo = dayjs().diff(createdTime, 'minute');

        if (status === 'unassigned') {
          return (
            <Tag color={minutesAgo > 30 ? 'error' : 'warning'} icon={<ExclamationCircleOutlined />}>
              {minutesAgo > 30 ? 'Без ответа > 30 мин' : 'Не назначен'}
            </Tag>
          );
        }
        if (status === 'in_progress') {
          return <Tag color="processing">В работе</Tag>;
        }
        return <Tag color="success">Обработан</Tag>;
      },
    },

  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  if (error) {
    return (
      <Alert
        message="Ошибка"
        description={error}
        type="error"
        showIcon
        action={<a onClick={fetchData}>Повторить</a>}
      />
    );
  }

  // Фильтр сделок по этапу
  const stageMap: Record<string, string[]> = {
    traffic: ['new'],
    consultation: ['contact'],
    measurement: ['meeting'],
    kp: ['wait'],
    contract: ['sale'],
    payment: ['paid'],
  };
  const stageLeads = selectedStage ? leads?.filter(l => {
    return stageMap[selectedStage]?.includes(l.status);
  }) : [];

  return (
    <div>
      {/* Воронка */}
      <Card title="Воронка продаж" style={{ marginBottom: 16, borderRadius: 12 }}>
        {funnelChart}
      </Card>

      {/* Горячие сделки */}
      <Card
        title={
          <span>
            <WarningOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            Горячие сделки (КП &gt; 5 дней)
          </span>
        }
        style={{ marginBottom: 16, borderRadius: 12 }}
      >
        {data?.hot_deals && data.hot_deals.length > 0 ? (
          <Table
            dataSource={data.hot_deals}
            columns={hotDealsColumns}
            rowKey="id"
            pagination={false}
            size="small"
            rowClassName={(record) => record.days_stalled > 7 ? 'bg-red-light' : ''}
          />
        ) : (
          <Text type="secondary">Нет горячих сделок</Text>
        )}
      </Card>

      {/* Свежие лиды */}
      <Card
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
            Свежие лиды (за сегодня)
          </span>
        }
        style={{ marginBottom: 16, borderRadius: 12 }}
      >
        {data?.fresh_leads && data.fresh_leads.length > 0 ? (
          <Table
            dataSource={data.fresh_leads}
            columns={freshLeadsColumns}
            rowKey="id"
            pagination={{ pageSize: 5 }}
            size="small"
          />
        ) : (
          <Text type="secondary">Новых лидов за сегодня нет</Text>
        )}
      </Card>

      {/* Все лиды */}
      <Card
        title="Все лиды"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            Новый лид
          </Button>
        }
        style={{ borderRadius: 12 }}
      >
        <Table
          dataSource={leads}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: 'Клиент',
              dataIndex: 'full_name',
              key: 'full_name',
              render: (text: string, record: any) => (
                <a onClick={() => {
                  setSelectedLead(record);
                  setIsModalOpen(true);
                }}>{text}</a>
              ),
            },
            {
              title: 'Телефон',
              dataIndex: 'phone',
              key: 'phone',
            },
            {
              title: 'Бюджет',
              dataIndex: 'budget',
              key: 'budget',
              render: (val: number) => val ? `${formatMoney(val)} ₽` : '-',
            },
            {
              title: 'Статус',
              dataIndex: 'status',
              key: 'status',
              render: (status: string, record: any) => (
                <Select
                  value={status}
                  size="small"
                  style={{ width: 120 }}
                  onChange={(val) => handleStatusChange(record.id, val)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {STATUS_OPTIONS.map(o => (
                    <Option key={o.value} value={o.value}>
                      <Tag color={STATUS_COLORS[o.value]}>{o.label}</Tag>
                    </Option>
                  ))}
                </Select>
              ),
            },
          ]}
        />
      </Card>

      {/* Модальное окно создания лида */}
      <Modal
        title="Добавить клиента"
        open={isModalOpen && !selectedLead}
        onCancel={() => {
          setIsModalOpen(false);
          setSelectedLead(null);
        }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateLead}>
          <Form.Item name="full_name" label="Имя клиента" rules={[{ required: true }]}>
            <Input placeholder="Иван Иванов" />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <PhoneInput />
          </Form.Item>
          <Form.Item name="interest_product" label="Интерес (Товар)">
            <Input placeholder="Диван" />
          </Form.Item>
          <Form.Item name="budget" label="Бюджет">
            <Input type="number" placeholder="50000" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Модальное окно детальной информации */}
      <Modal
        title="Детали лида"
        open={!!selectedLead}
        onCancel={() => setSelectedLead(null)}
        footer={selectedLead ? [
          <Select
            key="status"
            value={selectedLead.status}
            style={{ width: 150 }}
            onChange={(val) => selectedLead && handleStatusChange(selectedLead.id, val)}
          >
            {STATUS_OPTIONS.map(o => (
              <Option key={o.value} value={o.value}>{o.label}</Option>
            ))}
          </Select>,
        ] : undefined}
        width={500}
      >
        {selectedLead && (
          <div>
            <p><strong>Клиент:</strong> {selectedLead.full_name}</p>
            <p><strong>Телефон:</strong> {formatPhone(selectedLead.phone)}</p>
            <p><strong>Интерес:</strong> {selectedLead.interest_product || 'Не указан'}</p>
            <p><strong>Бюджет:</strong> {selectedLead.budget ? `${formatMoney(selectedLead.budget)} ₽` : 'Не указан'}</p>
            <p><strong>Статус:</strong> {getStatusLabel(selectedLead.status)}</p>
            <p><strong>Дата создания:</strong> {new Date(selectedLead.created_at).toLocaleString('ru-RU')}</p>
          </div>
        )}
      </Modal>

      {/* Модальное окно списка сделок этапа */}
      <Modal
        title={`Сделки: ${stageConfig[selectedStage || '']?.icon} ${data?.stages.find(s => s.stage === selectedStage)?.label || selectedStage}`}
        open={!!selectedStage && !selectedLead}
        onCancel={() => setSelectedStage(null)}
        footer={null}
        width={700}
      >
        {selectedStage && (
          <Table
            dataSource={stageLeads}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Клиент', dataIndex: 'full_name', key: 'full_name' },
              { title: 'Телефон', dataIndex: 'phone', key: 'phone', render: (val: string) => val ? formatPhone(val) : '-' },
              {
                title: 'Бюджет',
                dataIndex: 'budget',
                key: 'budget',
                render: (val: number) => val ? `${formatMoney(val)} ₽` : '-',
              },
              {
                title: 'Статус',
                dataIndex: 'status',
                key: 'status',
                render: (s: string) => <Tag color={STATUS_COLORS[s] || 'default'}>{getStatusLabel(s)}</Tag>,
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
};

export default SalonFunnelTab;